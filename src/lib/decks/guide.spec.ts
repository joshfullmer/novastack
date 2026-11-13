import { describe, expect, it } from 'vitest';
import { GUIDE_MAX_LENGTH, renderGuide } from './guide.js';

describe('renderGuide', () => {
	it('renders ordinary Markdown', () => {
		const html = renderGuide('## Mulligan\n\nKeep **two** cheap units.\n\n- a\n- b');
		expect(html).toContain('<h2>Mulligan</h2>');
		expect(html).toContain('<strong>two</strong>');
		expect(html).toContain('<li>a</li>');
	});

	it('is empty for an empty Guide', () => {
		expect(renderGuide('')).toBe('');
		expect(renderGuide('  \n ')).toBe('');
	});

	it('keeps single line breaks, as people type them', () => {
		expect(renderGuide('one\ntwo')).toContain('<br>');
	});

	describe('is safe to inject', () => {
		it('never emits author-written HTML', () => {
			const html = renderGuide('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>hi</b>');
			expect(html).not.toContain('<script');
			expect(html).not.toContain('<img');
			expect(html).not.toContain('<b>');
			expect(html).toContain('&lt;script&gt;');
		});

		it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:x', 'data:text/html,hi'])(
			'does not link %s',
			(url) => {
				const html = renderGuide(`[click](${url})`);
				expect(html).not.toContain('<a ');
				expect(html).not.toContain('href=');
			}
		);

		it('drops images — no tracking pixels, no hotlinks — keeping the alt text', () => {
			const html = renderGuide('![the pixel](https://example.com/p.png)');
			expect(html).not.toContain('<img');
			expect(html).not.toContain('<a ');
			expect(html).not.toContain('example.com');
			expect(html).toContain('the pixel');
		});

		it('escapes alt text', () => {
			expect(renderGuide('![<b>x</b>](https://example.com/p.png)')).not.toContain('<b>');
		});

		it('opens every link elsewhere and marks it as user content', () => {
			const html = renderGuide('[a](https://example.com) and https://example.org');
			expect(html.match(/<a /g)).toHaveLength(2);
			expect(html.match(/target="_blank"/g)).toHaveLength(2);
			expect(html.match(/rel="noopener noreferrer nofollow ugc"/g)).toHaveLength(2);
		});
	});
});

describe('GUIDE_MAX_LENGTH', () => {
	it('is a sane, finite ceiling', () => {
		expect(GUIDE_MAX_LENGTH).toBeGreaterThan(0);
		expect(Number.isFinite(GUIDE_MAX_LENGTH)).toBe(true);
	});
});
