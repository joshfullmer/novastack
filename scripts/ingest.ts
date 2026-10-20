/**
 * `pnpm ingest` — the only thing in this project that touches the network.
 *
 * ```
 * enumerate slugs → fetch detail per card → v.parse(NetdeckCardSchema)
 *                 → fetch every FAQ         (a sibling resource, not nested under card detail)
 *   → assert the API's shape        (checkRawInvariants, checkFaqInvariants)
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
	checkFaqInvariants,
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
	printTreatment,
	runOrder,
	setExclusiveSlugs
} from '../src/lib/cards/derive.ts';
import { groupFaqsByCardSlug, normalizeGeneralFaqs } from '../src/lib/cards/faq.ts';
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
import { enumerateSlugs, fetchCardDetails, fetchFaqs } from './lib/netdeck.ts';
import { renderChanges, renderComposition, tintColor } from './lib/report.ts';
import { stableStringify } from './lib/stable-json.ts';
import { banner, box, formatDuration, paint, skipped, stage, ui } from './lib/ui.ts';

const CARDS_PATH = path.join('src', 'lib', 'cards', 'cards.json');
const LANDING_PATH = path.join('src', 'lib', 'cards', 'landing.json');

/**
 * `--check` is a read-only run: fetch, assert, normalize, then report what *would* change and
 * write nothing. It implies `--skip-images`, because downloading 47 MB of art to answer "is there
 * anything new?" is the wrong shape of question.
 *
 * Exit codes are the interface, so a caller can branch on them:
 *
 * - `0` — the committed snapshot is current
 * - `1` — the snapshot would move (a normal answer, not a failure)
 * - `2` — an assertion was violated, or the run could not complete
 */
const check = process.argv.includes('--check');
const skipImages = check || process.argv.includes('--skip-images');

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
}) =>
	ui.warn(
		paint.change(`  ↻ retry ${attempt} in ${delayMs}ms — ${reason}`) + paint.dim(`\n    ${url}`)
	);

function fail(stage: string, violations: readonly Violation[]): never {
	ui.error(
		`\n${paint.remove(`✗ ${stage} failed ${violations.length} assertion(s):`)}\n${formatViolations(violations)}\n`
	);
	ui.error(
		paint.dim(
			'These are assumptions about an undocumented API that has been observed changing within\n' +
				'hours. A failure here means a decision needs revisiting, not that a check needs relaxing.\n'
		)
	);
	// Exit 2, not 1. A check run uses 1 for "the snapshot would move", which is a normal answer;
	// a violated assertion is a different kind of event and callers need to tell them apart. Any
	// non-zero still fails CI, so nothing downstream is weakened by the distinction.
	process.exit(2);
}

const startedAt = performance.now();

/** Every exit of a check run goes through here, so the run always ends on its duration. */
function finish(code: 0 | 1): never {
	ui.log(paint.dim(`\n  done in ${formatDuration(performance.now() - startedAt)}`));
	process.exit(code);
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
	banner(
		'ingest',
		check ? 'check · read-only' : skipImages ? 'data only · art untouched' : 'full · data + art'
	);
	const previous = await committedSnapshot();

	// The FAQs are a sibling resource, independent of the card list, so they fetch alongside it.
	const [raw, rawFaqs] = await Promise.all([
		stage('Enumerating slugs', async (step) => {
			const found = await enumerateSlugs({ onRetry });
			step.note(`${found.length} cards listed`);
			return found;
		}).then((slugs) =>
			// The list endpoint strips printings[], so every card is fetched on its own.
			stage('Fetching card detail', async (step) => {
				const cards = await fetchCardDetails(slugs, { onRetry, onProgress: step.progress });
				step.note(`${cards.length} cards`);
				return cards;
			})
		),
		stage('Fetching FAQs', async (step) => {
			const faqs = await fetchFaqs({ onRetry });
			step.note(`${faqs.length} FAQs`);
			return faqs;
		})
	]);

	await stage('Checking API shape', () => {
		const violations = [
			...checkRawInvariants(raw),
			...checkFaqInvariants(rawFaqs, new Set(raw.map((card) => card.slug)))
		];
		if (violations.length > 0) fail('Source API shape', violations);
	});

	const printings = raw.flatMap((card) =>
		card.printings.map((printing) => ({
			id: printing.id,
			imageUrl: printing.image_url,
			sourceImageUrl: printing.source_image_url,
			label: `${card.display_name} · ${printing.set.code} #${printing.collector_number}`
		}))
	);

	let thumbhashes: Map<string, string>;
	if (skipImages) {
		skipped('Mirroring art', check ? 'check run' : '--skip-images');
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
		thumbhashes = await stage('Mirroring art', async (step) => {
			let bytes = 0;
			const started = performance.now();
			const report = await mirrorImages(printings, {
				onRetry,
				onProgress: (done, total, update) => {
					bytes += update.bytes;
					const rate = bytes / 1_048_576 / Math.max((performance.now() - started) / 1000, 0.001);
					step.progress(done, total);
					step.detail(`${update.reason} · ${rate.toFixed(1)} MB/s · ${update.label}`);
				}
			});
			step.note(
				[
					`${report.fetched} fetched${bytes > 0 ? ` (${(bytes / 1_048_576).toFixed(1)} MB)` : ''}`,
					`${report.upToDate} current`,
					...(report.adopted > 0 ? [`${report.adopted} newly hashed`] : []),
					...(report.pruned > 0 ? [`${report.pruned} delisted pruned`] : [])
				].join(' · ')
			);
			return report.thumbhashes;
		});
	}

	const { cards, generalFaqs } = await stage('Normalizing', (step) => {
		const normalized = {
			cards: normalizeCards(raw, thumbhashes, groupFaqsByCardSlug(rawFaqs)),
			generalFaqs: normalizeGeneralFaqs(rawFaqs)
		};
		step.note(`${normalized.cards.length} cards`);
		return normalized;
	});

	const { colors, cardTypes, ram, sets } = await stage('Deriving orderings', () => {
		const sequence = baseSetSequence(cards);
		return {
			colors: runOrder(sequence.map((entry) => entry.color)),
			cardTypes: cardTypeRunsWithinColors(sequence),
			ram: deriveRamPerLegend(cards),
			sets: deriveSets(cards)
		};
	});

	await stage('Checking our model', async () => {
		const violations = [
			...checkModelInvariants(cards),
			...checkSlugStability(
				await previousSlugs(),
				cards.map((card) => card.slug)
			)
		];
		if (violations.length > 0) fail('Normalized model', violations);
	});

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
			// Genuine releases only. The other nine printed identifiers are derivative products.
			sets: sets.filter((set) => set.kind === 'base').length
		},
		cards,
		generalFaqs
	} satisfies Snapshot);

	if (check) {
		if (previous === null) {
			ui.log(
				paint.change(
					'\n! no committed snapshot to compare against — a full ingest would create one'
				)
			);
			finish(1);
		}

		const stamped: Snapshot = { ...snapshot, generatedAt: previous.generatedAt };
		if (stableStringify(stamped) === stableStringify(previous)) {
			ui.log(paint.ok('\n✓ no card data updates — the committed snapshot is current'));
			finish(0);
		}

		ui.log('');
		for (const line of renderChanges(previous, stamped)) ui.log(line);
		ui.log(paint.dim('\n  Run `pnpm ingest` to apply it, art included.'));
		finish(1);
	}

	const dated: Snapshot = { ...snapshot, generatedAt: await timestampFor(snapshot) };
	const unchanged = dated.generatedAt !== snapshot.generatedAt;

	await stage('Writing snapshot', async (step) => {
		await writeFile(CARDS_PATH, stableStringify(dated));
		await writeFile(LANDING_PATH, stableStringify(buildLanding(dated)));
		step.note(unchanged ? 'byte-identical' : 'cards.json + landing.json');
	});

	if (previous !== null && !unchanged) {
		ui.log('');
		for (const line of renderChanges(previous, dated)) ui.log(line);
	}

	const fact = (label: string, value: string | number) => `${paint.dim(label.padEnd(16))}${value}`;
	const cardFaqCount = cards.reduce((total, card) => total + card.faqs.length, 0);
	ui.log('');
	for (const line of box(paint.ok(unchanged ? '✓ snapshot unchanged' : '✓ snapshot written'), [
		fact(
			'dataset',
			`${snapshot.stats.cards} cards · ${snapshot.stats.printings} printings · ` +
				`${snapshot.stats.sets} ${snapshot.stats.sets === 1 ? 'set' : 'sets'} ${paint.dim(`(of ${snapshot.sets.length} printed identifiers)`)}`
		),
		fact('colors', renderComposition(cards, snapshot.colorOrder)),
		fact('color order', snapshot.colorOrder.map(tintColor).join(paint.dim(' → '))),
		fact('card-type order', snapshot.cardTypeOrder.join(' → ')),
		fact('RAM per Legend', snapshot.ramPerLegend),
		fact('set-exclusive', `${setExclusiveSlugs(cards).length} cards`),
		fact('FAQs', `${cardFaqCount} card-specific · ${snapshot.generalFaqs.length} general`)
	]))
		ui.log(line);
	ui.log(paint.dim(`\n  done in ${formatDuration(performance.now() - startedAt)}`));
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

	const { rarity, setId, treatment } = choice.printing;
	const matches = card.printings.filter(
		(printing) =>
			(rarity === undefined || printing.rarity === rarity) &&
			(setId === undefined || printing.setId === setId) &&
			(treatment === undefined || printTreatment(printing) === treatment)
	);

	const [first] = matches;
	if (first === undefined) {
		const asked = [rarity, setId, treatment].filter((part) => part !== undefined).join(' + ');
		const available = card.printings
			.map((printing) => `${printing.key} (${printing.rarity})`)
			.join(', ');
		throw new Error(
			`No printing of "${card.name}" matches ${asked}. Available: ${available}. ` +
				`Update HEROES in src/lib/cards/hero.ts.`
		);
	}

	// An explicit `treatment` has already picked the side of the retail/beta pair; only the
	// unset case needs a tiebreak, and it prefers retail — same art, same rarity, differing only
	// by the β prefix.
	if (treatment !== undefined) return first;
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
