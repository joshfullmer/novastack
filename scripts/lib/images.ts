/**
 * Image mirroring and derivative generation.
 *
 * **Never hotlink.** `image_url` is a CloudFront signed URL with a 24-hour TTL, re-minted per
 * request; it must be used immediately and stored nowhere. `source_image_url` is the stable
 * identity and returns 403 — it is what invalidation diffs on, not what we fetch.
 *
 * Three tiers are emitted, not two: at 2–3 columns a tile renders up to 609px, where both
 * smaller tiers visibly upscale, and large-format browsing is a supported use.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import { IMAGE_WIDTHS } from '../../src/lib/cards/vocabulary.ts';
import { fetchBinary, pool, type RetryOptions } from './http.ts';

export const MIRROR_DIR = 'mirror';
export const DERIVATIVE_DIR = path.join('static', 'card-art');

const MANIFEST_PATH = path.join(MIRROR_DIR, 'manifest.json');

/** ThumbHash requires an input no larger than 100×100. */
const THUMBHASH_MAX = 100;

const WEBP_QUALITY = 82;

export type PrintingImage = {
	id: string;
	/** Signed, short-lived. Used here and never stored. */
	imageUrl: string;
	/** Stable. Stored, and diffed to decide whether the art changed. */
	sourceImageUrl: string;
};

type ManifestEntry = { sourceImageUrl: string; thumbhash: string };
type Manifest = Record<string, ManifestEntry>;

async function readManifest(): Promise<Manifest> {
	try {
		const parsed: unknown = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
		return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
	} catch {
		return {};
	}
}

const originalPath = (id: string) => path.join(MIRROR_DIR, `${id}.webp`);
const derivativePath = (id: string, width: number) =>
	path.join(DERIVATIVE_DIR, id, `${width}.webp`);

/**
 * A printing is up to date only when the manifest, the original, *and* every derivative are
 * all present. Checking the manifest alone would silently skip a printing whose derivatives
 * were never written — the failure mode where the site 404s an image the data promises.
 */
function isUpToDate(printing: PrintingImage, manifest: Manifest): boolean {
	const entry = manifest[printing.id];
	if (entry === undefined || entry.sourceImageUrl !== printing.sourceImageUrl) return false;
	if (entry.thumbhash === '') return false;
	if (!existsSync(originalPath(printing.id))) return false;
	return IMAGE_WIDTHS.every((width) => existsSync(derivativePath(printing.id, width)));
}

async function deriveTiers(id: string, original: Buffer): Promise<void> {
	await mkdir(path.join(DERIVATIVE_DIR, id), { recursive: true });
	for (const width of IMAGE_WIDTHS) {
		await sharp(original)
			.resize({ width })
			.webp({ quality: WEBP_QUALITY })
			.toFile(derivativePath(id, width));
	}
}

/**
 * ThumbHash rather than BlurHash: every card image carries an alpha channel for its rounded
 * corners, and BlurHash cannot encode alpha — it would bleed an opaque rectangle past the card
 * silhouette on every tile.
 */
async function computeThumbhash(original: Buffer): Promise<string> {
	const { data, info } = await sharp(original)
		.resize(THUMBHASH_MAX, THUMBHASH_MAX, { fit: 'inside' })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64');
}

/** Removes mirrored files and derivatives for printings the API no longer lists. */
async function pruneDelisted(live: ReadonlySet<string>): Promise<number> {
	let pruned = 0;

	if (existsSync(DERIVATIVE_DIR)) {
		for (const entry of await readdir(DERIVATIVE_DIR, { withFileTypes: true })) {
			if (!entry.isDirectory() || live.has(entry.name)) continue;
			await rm(path.join(DERIVATIVE_DIR, entry.name), { recursive: true, force: true });
			pruned += 1;
		}
	}

	if (existsSync(MIRROR_DIR)) {
		for (const entry of await readdir(MIRROR_DIR, { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith('.webp')) continue;
			if (live.has(entry.name.replace(/\.webp$/, ''))) continue;
			await rm(path.join(MIRROR_DIR, entry.name), { force: true });
		}
	}

	return pruned;
}

export type MirrorReport = {
	/** Printing id → ThumbHash, for every live printing. */
	thumbhashes: Map<string, string>;
	fetched: number;
	upToDate: number;
	pruned: number;
};

export async function mirrorImages(
	printings: readonly PrintingImage[],
	options: RetryOptions & {
		concurrency?: number;
		onProgress?: (done: number, total: number) => void;
	} = {}
): Promise<MirrorReport> {
	await mkdir(MIRROR_DIR, { recursive: true });
	await mkdir(DERIVATIVE_DIR, { recursive: true });

	const manifest = await readManifest();
	const stale = printings.filter((printing) => !isUpToDate(printing, manifest));
	let done = 0;

	const results = await pool(stale, options.concurrency ?? 8, async (printing) => {
		const original = await fetchBinary(printing.imageUrl, options);
		await writeFile(originalPath(printing.id), original);
		await deriveTiers(printing.id, original);
		const thumbhash = await computeThumbhash(original);
		done += 1;
		options.onProgress?.(done, stale.length);
		return { id: printing.id, sourceImageUrl: printing.sourceImageUrl, thumbhash };
	});

	for (const result of results) {
		manifest[result.id] = { sourceImageUrl: result.sourceImageUrl, thumbhash: result.thumbhash };
	}

	const live = new Set(printings.map((printing) => printing.id));
	const pruned = await pruneDelisted(live);
	for (const id of Object.keys(manifest)) if (!live.has(id)) delete manifest[id];

	await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, '\t')}\n`);

	const thumbhashes = new Map<string, string>();
	for (const printing of printings) {
		const entry = manifest[printing.id];
		if (entry !== undefined) thumbhashes.set(printing.id, entry.thumbhash);
	}

	return { thumbhashes, fetched: stale.length, upToDate: printings.length - stale.length, pruned };
}

/** Reads the manifest's ThumbHashes without touching the network. */
export async function readMirroredThumbhashes(): Promise<Map<string, string>> {
	const manifest = await readManifest();
	return new Map(Object.entries(manifest).map(([id, entry]) => [id, entry.thumbhash]));
}
