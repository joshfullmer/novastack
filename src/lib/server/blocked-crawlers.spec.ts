import { describe, expect, it } from 'vitest';
import { isBlockedCrawler } from './blocked-crawlers.ts';

const AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))';

describe('isBlockedCrawler', () => {
	it('turns Meta’s AI crawler away from Meta pages', () => {
		expect(isBlockedCrawler(AGENT, '/meta')).toBe(true);
		expect(isBlockedCrawler(AGENT, '/meta/decks/abc')).toBe(true);
		expect(isBlockedCrawler(AGENT.toUpperCase(), '/meta/matchups')).toBe(true);
	});

	it('leaves it the rest of the site, including robots.txt', () => {
		expect(isBlockedCrawler(AGENT, '/robots.txt')).toBe(false);
		expect(isBlockedCrawler(AGENT, '/cards/reboot-optics')).toBe(false);
		expect(isBlockedCrawler(AGENT, '/meta-old')).toBe(false);
	});

	it('leaves other agents alone, link previews included', () => {
		expect(isBlockedCrawler('Mozilla/5.0 (compatible; meta-webindexer/1.1)', '/meta/decks')).toBe(
			false
		);
		expect(isBlockedCrawler('Mozilla/5.0 Firefox/147.0', '/meta')).toBe(false);
		expect(isBlockedCrawler(null, '/meta')).toBe(false);
	});
});
