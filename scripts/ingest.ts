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
import { HERO_SLUGS } from '../src/lib/cards/hero.ts';
import { normalizeCards } from '../src/lib/cards/normalize.ts';
import {
	LandingSchema,
	SnapshotSchema,
	type Card,
	type Snapshot
} from '../src/lib/cards/schema.ts';
import { mirrorImages, readMirroredThumbhashes } from './lib/images.ts';
import { enumerateSlugs, fetchCardDetails } from './lib/netdeck.ts';
import { stableStringify } from './lib/stable-json.ts';

const CARDS_PATH = path.join('src', 'lib', 'cards', 'cards.json');
const LANDING_PATH = path.join('src', 'lib', 'cards', 'landing.json');

const skipImages = process.argv.includes('--skip-images');

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
		log('→ skipping images (--skip-images); reusing mirrored ThumbHashes');
		thumbhashes = await readMirroredThumbhashes();
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
			sets: sets.length
		},
		cards
	} satisfies Snapshot);

	const dated: Snapshot = { ...snapshot, generatedAt: await timestampFor(snapshot) };
	const unchanged = dated.generatedAt !== snapshot.generatedAt;

	await writeFile(CARDS_PATH, stableStringify(dated));
	await writeFile(LANDING_PATH, stableStringify(buildLanding(dated)));

	log(unchanged ? '\n✓ snapshot unchanged' : '\n✓ snapshot written');
	log(`  ${CARDS_PATH}`);
	log(`  ${LANDING_PATH}`);
	log(
		`  ${snapshot.stats.cards} cards · ${snapshot.stats.printings} printings · ${snapshot.stats.sets} sets`
	);
	log(`  colour order    ${snapshot.colorOrder.join(' → ')}`);
	log(`  card-type order ${snapshot.cardTypeOrder.join(' → ')}`);
	log(`  RAM per Legend  ${snapshot.ramPerLegend}`);
	log(`  set-exclusive   ${setExclusiveSlugs(cards).length} card(s)`);
}

/** `/` cannot import the dataset, so its seven hero cards and stats line ship separately. */
function buildLanding(snapshot: Snapshot) {
	const bySlug = new Map<string, Card>(snapshot.cards.map((card) => [card.slug, card]));

	const heroes = HERO_SLUGS.map((slug) => {
		const card = bySlug.get(slug);
		if (card === undefined) {
			throw new Error(
				`Hero slug "${slug}" is not in the dataset. Update HERO_SLUGS in src/lib/cards/hero.ts.`
			);
		}
		return {
			slug: card.slug,
			name: card.name,
			color: card.color,
			printingId: card.printings[0].id,
			thumbhash: card.printings[0].thumbhash
		};
	});

	return v.parse(LandingSchema, { stats: snapshot.stats, heroes });
}

await main();
