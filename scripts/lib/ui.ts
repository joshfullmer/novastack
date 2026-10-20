/**
 * Terminal output for the pipeline scripts: a colour palette, `stage()`, `banner()` and `box()`.
 *
 * `stage()` turns each step of a run into one line. While it works the line is alive — a spinner,
 * a live clock and, when the step can count its work, a gradient progress bar with throughput and
 * an ETA. Once done it settles into `✓ title  detail · 1.2s`. Stages may run concurrently: every
 * running stage keeps its own line in one live block at the bottom of the terminal, and finished
 * lines scroll up above it.
 *
 * Two audiences, one code path. On a TTY the live block redraws in place; anywhere else (CI, a
 * pipe) a stage prints plain, append-only lines and reports progress at quarter marks, so a log
 * never fills with carriage returns. Colour is `styleText`'s call: it drops the escapes on a
 * non-TTY and honours `NO_COLOR`.
 */
import { stripVTControlCharacters, styleText } from 'node:util';

export const paint = {
	ok: (text: string) => styleText(['green', 'bold'], text),
	add: (text: string) => styleText('green', text),
	remove: (text: string) => styleText('red', text),
	change: (text: string) => styleText('yellow', text),
	info: (text: string) => styleText('cyan', text),
	bold: (text: string) => styleText('bold', text),
	dim: (text: string) => styleText('dim', text)
};

const interactive = process.stdout.isTTY === true;
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_MS = 80;
const TITLE_WIDTH = 24;
/** Left-eighth blocks: a bar that fills in 1/8-cell steps rather than lurching a whole cell. */
const EIGHTHS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];

const visibleWidth = (text: string) => stripVTControlCharacters(text).length;
const columns = () => process.stdout.columns || 80;

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** `styleText` has no RGB, so gradients are raw escapes — gated on the terminal saying it can. */
const truecolor =
	interactive && process.env.NO_COLOR === undefined && process.stdout.getColorDepth() >= 24;

type Rgb = readonly [number, number, number];
const CYAN: Rgb = [34, 211, 238];
const VIOLET: Rgb = [192, 132, 252];

function rgb([r, g, b]: Rgb, text: string): string {
	return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** The colour `fraction` of the way from cyan to violet. */
function along(fraction: number): Rgb {
	const mix = (from: number, to: number) => Math.round(from + (to - from) * fraction);
	return [mix(CYAN[0], VIOLET[0]), mix(CYAN[1], VIOLET[1]), mix(CYAN[2], VIOLET[2])];
}

/** Text washed cyan → violet, one colour per character. Plain `cyan` where truecolor is absent. */
export function gradient(text: string): string {
	if (!truecolor) return paint.info(text);
	const chars = [...text];
	return chars
		.map((char, index) => rgb(along(index / Math.max(chars.length - 1, 1)), char))
		.join('');
}

// ---------------------------------------------------------------------------
// The live block
// ---------------------------------------------------------------------------

/** One renderer per running stage, in the order the stages started. */
const running: Array<() => string> = [];
/** Lines of live block currently on screen. The cursor rests at the end of the last one. */
let drawn = 0;
let timer: NodeJS.Timeout | undefined;
let cursorHidden = false;

function clearBlock(): void {
	if (drawn === 0) return;
	// Back to the first line of the block, then wipe from there down.
	process.stdout.write(`${drawn > 1 ? `\x1b[${drawn - 1}A` : ''}\r\x1b[0J`);
	drawn = 0;
}

function drawBlock(): void {
	if (running.length === 0) return;
	const block = running.map((render) => render()).join('\n');
	process.stdout.write(block);
	// A stage may render more than one line (a bar and its ticker), so count the text, not stages.
	drawn = block.split('\n').length;
}

function hideCursor(): void {
	if (cursorHidden) return;
	cursorHidden = true;
	process.stdout.write('\x1b[?25l');
	// A hidden cursor must never outlive the process. `exit` covers normal and `process.exit`
	// paths; a SIGINT terminates without emitting it, so it needs its own handler.
	process.once('exit', () => process.stdout.write('\x1b[?25h'));
	process.once('SIGINT', () => {
		process.stdout.write('\x1b[?25h');
		process.exit(130);
	});
}

function print(line: string, stream: 'log' | 'warn' | 'error'): void {
	clearBlock();
	console[stream](line);
	drawBlock();
}

/** Output that may arrive mid-stage (retries, assertion failures) without tearing the live block. */
export const ui = {
	log: (message = '') => print(message, 'log'),
	warn: (message: string) => print(message, 'warn'),
	error: (message: string) => print(message, 'error')
};

function start(render: () => string): void {
	hideCursor();
	clearBlock();
	running.push(render);
	drawBlock();
	timer ??= setInterval(() => {
		clearBlock();
		drawBlock();
	}, FRAME_MS);
}

/** Removes a stage's line, then prints `line` in its place. */
function stop(render: () => string, line: string, stream: 'log' | 'error' = 'log'): void {
	clearBlock();
	running.splice(running.indexOf(render), 1);
	if (running.length === 0) {
		clearInterval(timer);
		timer = undefined;
	}
	console[stream](line);
	drawBlock();
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

export function formatDuration(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function bar(fraction: number, width: number): string {
	const eighths = Math.round(Math.min(Math.max(fraction, 0), 1) * width * 8);
	const full = Math.floor(eighths / 8);
	const cell = (index: number, char: string) =>
		truecolor ? rgb(along(index / Math.max(width - 1, 1)), char) : paint.info(char);

	let filled = '';
	for (let index = 0; index < full; index += 1) filled += cell(index, '█');
	if (full < width && eighths % 8 > 0) filled += cell(full, EIGHTHS[eighths % 8]);

	return filled + paint.dim('─'.repeat(width - visibleWidth(filled)));
}

/** Cuts `text` to `max` visible characters, ending in `…` if it had to. */
function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, Math.max(max - 1, 0))}…`;
}

export interface Stage {
	/** Reports `done` of `total`. Cheap to call per item. */
	progress(done: number, total: number): void;
	/** A transient line under the bar — what the stage is working on right now. Plain text. */
	detail(text: string): void;
	/** The detail shown beside the title once the stage completes. */
	note(text: string): void;
}

/** Runs one step of the pipeline, reporting it as it goes. Failures rethrow after marking `✗`. */
export async function stage<T>(title: string, run: (stage: Stage) => T | Promise<T>): Promise<T> {
	const started = performance.now();
	let note = '';
	let done = 0;
	let total = 0;
	let lastQuarter = 0;
	let detail = '';

	const elapsed = () => performance.now() - started;

	const render = (): string => {
		const frame = paint.info(FRAMES[Math.floor(elapsed() / FRAME_MS) % FRAMES.length]);
		const head = `${frame} ${title.padEnd(TITLE_WIDTH)}`;
		if (total === 0) return `${head} ${paint.dim(formatDuration(elapsed()))}`;

		const percent = `${Math.floor((done / total) * 100)}%`.padStart(4);
		const seconds = elapsed() / 1000;
		const rate = done > 0 && seconds >= 1 ? ` · ${(done / seconds).toFixed(1)}/s` : '';
		const eta =
			done > 0 && done < total && seconds >= 1
				? ` · eta ${formatDuration((elapsed() / done) * (total - done))}`
				: '';
		const tail = paint.dim(
			`${done}/${total} ${percent} · ${formatDuration(elapsed())}${rate}${eta}`
		);
		// Never let the line wrap: the live block is redrawn by counting lines.
		const width = Math.min(Math.max(columns() - TITLE_WIDTH - visibleWidth(tail) - 6, 8), 32);
		const line = `${head} ${bar(done / total, width)} ${tail}`;
		// The ticker is indented under the bar and, like the bar, must never wrap.
		return detail === ''
			? line
			: `${line}\n${paint.dim(`    ↳ ${truncate(detail, columns() - 7)}`)}`;
	};

	const handle: Stage = {
		detail: (text) => {
			detail = text;
		},
		note: (text) => {
			note = text;
		},
		progress: (completed, count) => {
			[done, total] = [completed, count];
			if (interactive || total === 0) return;
			const quarter = Math.floor((done / total) * 4);
			if (quarter > lastQuarter) {
				lastQuarter = quarter;
				ui.log(paint.dim(`  ${title}: ${done}/${total}`));
			}
		}
	};

	if (interactive) start(render);

	const finish = (line: string, stream: 'log' | 'error' = 'log') =>
		interactive ? stop(render, line, stream) : console[stream](line);

	try {
		const result = await run(handle);
		const detail = [note, formatDuration(elapsed())].filter(Boolean).join(' · ');
		finish(`${paint.add('✓')} ${title.padEnd(TITLE_WIDTH)} ${paint.dim(detail)}`);
		return result;
	} catch (error) {
		finish(`${paint.remove('✗')} ${title}`, 'error');
		throw error;
	}
}

/** A step that did not run, said out loud so its absence is never a mystery. */
export function skipped(title: string, reason: string): void {
	ui.log(paint.dim(`○ ${title.padEnd(TITLE_WIDTH)} ${reason}`));
}

// ---------------------------------------------------------------------------
// Static furniture
// ---------------------------------------------------------------------------

/** The opening line of a run: what it is, and what flavour of it this is. */
export function banner(name: string, mode: string): void {
	ui.log(`\n${gradient(`◆ ${name}`)} ${paint.dim(`· ${mode}`)}\n`);
}

/**
 * Rows in a rounded frame, with an optional title set into the top edge. Falls back to plain
 * indented rows when the frame would not fit the terminal — a wrapped border is worse than none.
 */
export function box(title: string, rows: readonly string[]): string[] {
	const inner = Math.max(visibleWidth(title) + 2, ...rows.map(visibleWidth));
	if (inner + 4 > columns()) return [title, ...rows.map((row) => `  ${row}`)];

	const edge = paint.dim;
	const pad = (text: string) => text + ' '.repeat(inner - visibleWidth(text));
	return [
		edge('╭─ ') + title + edge(` ${'─'.repeat(inner - visibleWidth(title) - 1)}╮`),
		...rows.map((row) => `${edge('│')} ${pad(row)} ${edge('│')}`),
		edge(`╰${'─'.repeat(inner + 2)}╯`)
	];
}
