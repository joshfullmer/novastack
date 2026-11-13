/**
 * The Guide (`CONTEXT.md`) — an author's Markdown about playing one Deck, shown on its public page.
 *
 * **User content on a public page, so the renderer is restrictive by construction rather than by
 * a sanitizing pass afterwards.** markdown-it with `html: false` never emits author-written HTML —
 * a `<script>` in the source comes out as escaped text — so there is nothing to strip, and no DOM
 * is needed to do it (which matters: this renders in a Worker). Three further restrictions:
 *
 * - **No images.** A Guide is prose. An `![](…)` is also a tracking pixel and a hotlink, and this
 *   project does not hotlink — it renders as its alt text.
 * - **Link schemes are markdown-it's own allow-list** — `javascript:`, `vbscript:`, `file:` and
 *   `data:` are refused and the text is left unlinked.
 * - **Every link opens elsewhere with `noopener noreferrer nofollow ugc`**: it is a stranger's link
 *   on our page, and `ugc` tells search engines so.
 */
import MarkdownIt from 'markdown-it';

/** Characters, not bytes. Generous for matchups and a mulligan plan; it also bounds what a public
 * page will render for one deck. */
export const GUIDE_MAX_LENGTH = 5000;

const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
// Not `md.disable('image')`: that makes `![alt](url)` fall back to a stray `!` and a live link. An
// image is shown as its alt text — the words survive, the fetch doesn't.
md.renderer.rules.image = (tokens, index) => md.utils.escapeHtml(tokens[index].content);

const renderLinkOpen = md.renderer.rules.link_open;
md.renderer.rules.link_open = (tokens, index, options, env, self) => {
	tokens[index].attrSet('target', '_blank');
	tokens[index].attrSet('rel', 'noopener noreferrer nofollow ugc');
	return renderLinkOpen
		? renderLinkOpen(tokens, index, options, env, self)
		: self.renderToken(tokens, index, options);
};

/** Safe to hand to `{@html}`. Empty for an empty Guide. */
export function renderGuide(source: string): string {
	return source.trim() === '' ? '' : md.render(source);
}
