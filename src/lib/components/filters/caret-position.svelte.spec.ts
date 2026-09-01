import { describe, expect, it, afterEach } from 'vitest';
import { caretOffsetX, charIndexAtOffset, measureCharacterOffsets } from './caret-position.js';

function makeInput(value: string): HTMLInputElement {
	const input = document.createElement('input');
	input.style.font = '14px monospace';
	input.style.padding = '8px';
	input.style.border = '1px solid black';
	input.value = value;
	document.body.appendChild(input);
	return input;
}

describe('caretOffsetX', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('offset at index 0 is exactly the border + padding, regardless of content', () => {
		const input = makeInput('color:red or type:unit');
		const style = getComputedStyle(input);
		const expected = parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
		expect(caretOffsetX(input, 0)).toBeCloseTo(expected, 1);
	});

	it('offset strictly increases as the index advances through non-empty text', () => {
		const input = makeInput('cost>=2 cost<=4');
		const offsets = Array.from({ length: input.value.length + 1 }, (_, i) =>
			caretOffsetX(input, i)
		);
		for (let i = 1; i < offsets.length; i++) {
			expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
		}
	});

	it('accounts for horizontal scroll — a scrolled input reports a smaller offset for the same index', () => {
		const input = makeInput('a very long query that overflows a narrow box entirely');
		input.style.width = '40px';
		const unscrolled = caretOffsetX(input, 20);
		input.scrollLeft = 30;
		const scrolled = caretOffsetX(input, 20);
		expect(scrolled).toBeCloseTo(unscrolled - 30, 1);
	});
});

describe('measureCharacterOffsets', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('agrees with caretOffsetX at every index', () => {
		const input = makeInput('cost>=2 cost<=4');
		const offsets = measureCharacterOffsets(input, input.value);
		expect(offsets).toHaveLength(input.value.length + 1);
		for (let i = 0; i <= input.value.length; i++) {
			expect(offsets[i]).toBeCloseTo(caretOffsetX(input, i), 1);
		}
	});

	it('measures the text passed in, not necessarily input.value', () => {
		const input = makeInput('color:red');
		const offsets = measureCharacterOffsets(input, 'a much longer string entirely');
		expect(offsets).toHaveLength('a much longer string entirely'.length + 1);
	});
});

describe('charIndexAtOffset', () => {
	it('finds the character whose span contains the target offset', () => {
		const offsets = [0, 10, 20, 30, 40];
		expect(charIndexAtOffset(offsets, 0)).toBe(0);
		expect(charIndexAtOffset(offsets, 15)).toBe(1);
		expect(charIndexAtOffset(offsets, 25)).toBe(2);
		expect(charIndexAtOffset(offsets, 39)).toBe(3);
	});

	it('clamps to the last index for an offset past the end', () => {
		const offsets = [0, 10, 20];
		expect(charIndexAtOffset(offsets, 999)).toBe(2);
	});

	it('clamps to the first index for a negative offset', () => {
		const offsets = [0, 10, 20];
		expect(charIndexAtOffset(offsets, -50)).toBe(0);
	});
});
