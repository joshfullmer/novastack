/**
 * `pnpm ingest` — the only thing in this project that touches the network.
 *
 * ```
 * enumerate slugs → fetch detail per card → v.parse(NetdeckCardSchema)
 *   → assert the API's shape        (checkRawInvariants)
 *   → mirror images, derive tiers + ThumbHashes
 *   → normalize                     (the flattened printing fields are discarded here)
 *   → assert our model              (checkModelInvariants, checkSlugStability)
 *   → v.parse(SnapshotSchema) → write cards.json + landing.json
 * ```
 *
 * Image mirroring lives inside ingest rather than beside it because `image_url` is signed with
 * a 24-hour TTL and re-minted per request: the only moment it is usable is the moment the
 * record is fetched. Splitting the two would mean fetching every card twice.
 *
 * Run on demand. The build never touches the network — it reads the committed snapshot.
 */
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import * as v from 'valibot';
import {
	checkModelInvariants,
	checkRawInvariants,
	checkSlugStability,
	formatViolations,
	type Violation
} from '../src/lib/cards/assertions.ts';
import {
	baseSetSequence,
	cardTypeRunsWithinColors,
	deriveRamPerLegend,
	deriveSets,
	runOrder,
	setExclusiveSlugs
} from '../src/lib/cards/derive.ts';
import { HEROES, type HeroChoice } from '../src/lib/cards/hero.ts';
import { normalizeCards } from '../src/lib/cards/normalize.ts';
import {
	LandingSchema,
	SnapshotSchema,
	type Card,
	type Printing,
	type Snapshot
} from '../src/lib/cards/schema.ts';
import { mirrorImages, readMirroredThumbhashes } from './lib/images.ts';
import { enumerateSlugs, fetchCardDetails } from './lib/netdeck.ts';
import { stableStringify } from './lib/stable-json.ts';

const CARDS_PATH = path.join('src', 'lib', 'cards', 'cards.json');
const LANDING_PATH = path.join('src', 'lib', 'cards', 'landing.json');

/**
 * `--check` is a read-only run: fetch, assert, normalize, then report what *would* change and
 * write nothing. It implies `--skip-images`, because downloading 47 MB of art to answer "is there
 * anything new?" is the wrong shape of question. Exits 1 when the snapshot would move, so it is
 * usable as a scripted signal rather than only as something to read.
 */
const check = process.argv.includes('--check');
const skipImages = check || process.argv.includes('--skip-images');

const log = (message: string) => console.log(message);
const onRetry = ({
	url,
	attempt,
	delayMs,
	reason
}: {
	url: string;
	attempt: number;
	delayMs: number;
	reason: string;
}) => console.warn(`  ↻ retry ${attempt} in ${delayMs}ms — ${reason}\n    ${url}`);

function fail(stage: string, violations: readonly Violation[]): never {
	console.error(
		`\n✗ ${stage} failed ${violations.length} assertion(s):\n${formatViolations(violations)}\n`
	);
	console.error(
		'These are assumptions about an undocumented API that has been observed changing within\n' +
			'hours. A failure here means a decision needs revisiting, not that a check needs relaxing.\n'
	);
	process.exit(1);
}

/** The committed snapshot, or `null` on a first run. Read tolerantly on purpose: an unreadable
 * old snapshot must not block a fresh one. */
async function committedSnapshot(): Promise<Snapshot | null> {
	try {
		const parsed = v.safeParse(SnapshotSchema, JSON.parse(await readFile(CARDS_PATH, 'utf8')));
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}

/** Previous slugs, read tolerantly: an unreadable old snapshot must not block a fresh one. */
async function previousSlugs(): Promise<string[]> {
	const shape = v.object({ cards: v.array(v.object({ slug: v.string() })) });
	try {
		const parsed = v.safeParse(shape, JSON.parse(await readFile(CARDS_PATH, 'utf8')));
		return parsed.success ? parsed.output.cards.map((card) => card.slug) : [];
	} catch {
		return [];
	}
}

/**
 * What a check run reports.
 *
 * Compared per card on the *serialised* form, so a change anywhere in the model counts — a
 * reworded rules text, a new classification, a re-rendered art URL. Thumbhashes are taken from
 * the committed snapshot where a printing already exists, so a stale local mirror cannot fake a
 * change that is not there.
 */
function describeChanges(previous: Snapshot, next: Snapshot): string[] {
	const lines: string[] = [];

	const bySlug = (snapshot: Snapshot) => new Map(snapshot.cards.map((card) => [card.slug, card]));
	const before = bySlug(previous);
	const after = bySlug(next);

	const added = [...after.keys()].filter((slug) => !before.has(slug));
	const removed = [...before.keys()].filter((slug) => !after.has(slug));
	const changed = [...after.keys()].filter(
		(slug) =>
			before.has(slug) && stableStringify(before.get(slug)) !== stableStringify(after.get(slug))
	);

	const printingKeys = (snapshot: Snapshot) =>
		new Set(snapshot.cards.flatMap((card) => card.printings.map((printing) => printing.key)));
	const beforeKeys = printingKeys(previous);
	const afterKeys = printingKeys(next);
	const newPrintings = [...afterKeys].filter((key) => !beforeKeys.has(key));
	const gonePrintings = [...beforeKeys].filter((key) => !afterKeys.has(key));

	const list = (label: string, values: readonly string[]) => {
		if (values.length === 0) return;
		const shown = values.slice(0, 10).join(', ');
		lines.push(
			`  ${label}: ${values.length}${values.length > 0 ? ` — ${shown}` : ''}` +
				(values.length > 10 ? `, and ${values.length - 10} more` : '')
		);
	};

	list('new cards', added);
	list('removed cards', removed);
	list('changed cards', changed);
	list('new printings', newPrintings);
	list('removed printings', gonePrintings);

	if (
		previous.stats.cards !== next.stats.cards ||
		previous.stats.printings !== next.stats.printings
	)
		lines.push(
			`  counts: ${previous.stats.cards} → ${next.stats.cards} cards, ` +
				`${previous.stats.printings} → ${next.stats.printings} printings`
		);

	const setIds = (snapshot: Snapshot) => snapshot.sets.map((set) => set.id).join(',');
	if (setIds(previous) !== setIds(next)) lines.push('  sets: the curated set list changed');

	if (previous.ramPerLegend !== next.ramPerLegend)
		lines.push(`  RAM per Legend: ${previous.ramPerLegend} → ${next.ramPerLegend}`);

	return lines;
}

/**
 * `generatedAt` means "when the data last **changed**", not "when ingest last ran".
 *
 * If it tracked the run, every weekly ingest would rewrite the file and open a pull request even
 * when nothing moved — and a PR that says "nothing changed" every Monday is a PR nobody reads.
 * So an unchanged snapshot keeps its previous timestamp and stays byte-identical.
 */
async function timestampFor(snapshot: Snapshot): Promise<string> {
	const shape = v.object({ generatedAt: v.string() });
	try {
		const previousText = await readFile(CARDS_PATH, 'utf8');
		const previous = v.safeParse(shape, JSON.parse(previousText));
		if (!previous.success) return snapshot.generatedAt;

		const asPrevious = stableStringify({ ...snapshot, generatedAt: previous.output.generatedAt });
		return asPrevious === previousText ? previous.output.generatedAt : snapshot.generatedAt;
	} catch {
		return snapshot.generatedAt;
	}
}

async function main(): Promise<void> {
	const previous = await committedSnapshot();

	log('→ enumerating slugs');
	const slugs = await enumerateSlugs({ onRetry });
	log(`  ${slugs.length} slug(s)`);

	log('→ fetching card detail (the list endpoint strips printings[])');
	const raw = await fetchCardDetails(slugs, {
		onRetry,
		onProgress: (done, total) => {
			if (done % 25 === 0 || done === total) log(`  ${done}/${total}`);
		}
	});

	log('→ asserting the API’s shape');
	const rawViolations = checkRawInvariants(raw);
	if (rawViolations.length > 0) fail('Source API shape', rawViolations);

	const printings = raw.flatMap((card) =>
		card.printings.map((printing) => ({
			id: printing.id,
			imageUrl: printing.image_url,
			sourceImageUrl: printing.source_image_url
		}))
	);

	let thumbhashes: Map<string, string>;
	if (skipImages) {
		log(
			check
				? '→ check run: not touching images'
				: '→ skipping images (--skip-images); reusing mirrored ThumbHashes'
		);
		thumbhashes = await readMirroredThumbhashes();

		// Prefer the committed snapshot's hash wherever a printing already exists: a stale or
		// missing local mirror would otherwise read as a data change that is not there. A printing
		// with no hash anywhere is genuinely new, and gets a placeholder so normalization can finish
		// rather than throwing halfway through a read-only run.
		for (const card of previous?.cards ?? [])
			for (const printing of card.printings) thumbhashes.set(printing.id, printing.thumbhash);
		for (const printing of printings)
			if (!thumbhashes.has(printing.id)) thumbhashes.set(printing.id, 'PENDING');
	} else {
		log(`→ mirroring ${printings.length} printing image(s)`);
		const report = await mirrorImages(printings, {
			onRetry,
			onProgress: (done, total) => {
				if (done % 25 === 0 || done === total) log(`  ${done}/${total}`);
			}
		});
		thumbhashes = report.thumbhashes;
		log(
			`  ${report.fetched} fetched, ${report.upToDate} already current` +
				(report.pruned > 0 ? `, ${report.pruned} delisted printing(s) pruned` : '')
		);
	}

	log('→ normalizing');
	const cards = normalizeCards(raw, thumbhashes);

	log('→ deriving orderings and counts');
	const sequence = baseSetSequence(cards);
	const colors = runOrder(sequence.map((entry) => entry.color));
	const cardTypes = cardTypeRunsWithinColors(sequence);
	const ram = deriveRamPerLegend(cards);
	const sets = deriveSets(cards);

	log('→ asserting our model');
	const modelViolations = [
		...checkModelInvariants(cards),
		...checkSlugStability(
			await previousSlugs(),
			cards.map((card) => card.slug)
		)
	];
	if (modelViolations.length > 0) fail('Normalized model', modelViolations);

	const [firstColor, ...restColors] = colors.order;
	const [firstType, ...restTypes] = cardTypes.order;
	if (firstColor === undefined || firstType === undefined) {
		fail('Derived orderings', [
			{ check: 'derived-order-non-empty', detail: 'the Base Set sequence produced no entries' }
		]);
	}

	const snapshot: Snapshot = v.parse(SnapshotSchema, {
		generatedAt: new Date().toISOString(),
		colorOrder: [firstColor, ...restColors],
		cardTypeOrder: [firstType, ...restTypes],
		ramPerLegend: ram.value,
		sets,
		stats: {
			cards: cards.length,
			printings: cards.reduce((total, card) => total + card.printings.length, 0),
			// Genuine releases only. The other seven printed identifiers are derivative products.
			sets: sets.filter((set) => set.kind === 'base').length
		},
		cards
	} satisfies Snapshot);

	if (check) {
		if (previous === null) {
			log('\n✓ no committed snapshot to compare against — a full ingest would create one');
			process.exit(1);
		}

		const stamped: Snapshot = { ...snapshot, generatedAt: previous.generatedAt };
		if (stableStringify(stamped) === stableStringify(previous)) {
			log('\n✓ no card data updates — the committed snapshot is current');
			process.exit(0);
		}

		log('\n! card data has changed:');
		for (const line of describeChanges(previous, stamped)) log(line);
		log('\nRun `pnpm ingest` to apply it, art included.');
		process.exit(1);
	}

	const dated: Snapshot = { ...snapshot, generatedAt: await timestampFor(snapshot) };
	const unchanged = dated.generatedAt !== snapshot.generatedAt;

	await writeFile(CARDS_PATH, stableStringify(dated));
	await writeFile(LANDING_PATH, stableStringify(buildLanding(dated)));

	log(unchanged ? '\n✓ snapshot unchanged' : '\n✓ snapshot written');
	log(`  ${CARDS_PATH}`);
	log(`  ${LANDING_PATH}`);
	const setNoun = snapshot.stats.sets === 1 ? 'set' : 'sets';
	log(
		`  ${snapshot.stats.cards} cards · ${snapshot.stats.printings} printings · ` +
			`${snapshot.stats.sets} ${setNoun} (of ${snapshot.sets.length} printed identifiers)`
	);
	log(`  color order    ${snapshot.colorOrder.join(' → ')}`);
	log(`  card-type order ${snapshot.cardTypeOrder.join(' → ')}`);
	log(`  RAM per Legend  ${snapshot.ramPerLegend}`);
	log(`  set-exclusive   ${setExclusiveSlugs(cards).length} card(s)`);
}

/**
 * Resolves a hero's printing selector against a card.
 *
 * Failing loudly matters here: a hero is chosen for its *art*, so silently falling back to the
 * Default Printing would swap the landing page's composition without telling anyone. The error
 * lists what the card actually has, which is the information needed to fix it.
 */
function resolveHeroPrinting(card: Card, choice: HeroChoice): Printing {
	if (choice.printing === undefined) return card.printings[0];

	const { rarity, setId } = choice.printing;
	const matches = card.printings.filter(
		(printing) =>
			(rarity === undefined || printing.rarity === rarity) &&
			(setId === undefined || printing.setId === setId)
	);

	const [first] = matches;
	if (first === undefined) {
		const asked = [rarity, setId].filter((part) => part !== undefined).join(' + ');
		const available = card.printings
			.map((printing) => `${printing.key} (${printing.rarity})`)
			.join(', ');
		throw new Error(
			`No printing of "${card.name}" matches ${asked}. Available: ${available}. ` +
				`Update HEROES in src/lib/cards/hero.ts.`
		);
	}

	// Prefer retail over its beta twin: same art, same rarity, differing only by the β prefix.
	return matches.find((printing) => !printing.collectorNumber.startsWith('β')) ?? first;
}

/** `/` cannot import the dataset, so its seven hero cards and stats line ship separately. */
function buildLanding(snapshot: Snapshot) {
	const bySlug = new Map<string, Card>(snapshot.cards.map((card) => [card.slug, card]));

	const heroes = HEROES.map((choice) => {
		const card = bySlug.get(choice.slug);
		if (card === undefined) {
			throw new Error(
				`Hero slug "${choice.slug}" is not in the dataset. Update HEROES in src/lib/cards/hero.ts.`
			);
		}

		const printing = resolveHeroPrinting(card, choice);
		return {
			slug: card.slug,
			name: card.name,
			color: card.color,
			printingId: printing.id,
			thumbhash: printing.thumbhash
		};
	});

	return v.parse(LandingSchema, { stats: snapshot.stats, heroes });
}

await main();
