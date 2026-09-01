/**
 * Moves `node` to be a direct child of `target` (default `document.body`) once mounted.
 *
 * Why this exists: `QueryEditor`'s warning tooltip and autocomplete popup are visually anchored
 * to the input, but the input sits inside `FilterBar`'s sticky row (`z-20`), which sits inside
 * the page — and `Nav` above it is `z-30`. A child's `z-index` only competes against its
 * *siblings within the same stacking context*; nested inside the `z-20` row, no `z-index` this
 * component gives its own tooltip can ever out-rank `Nav`, since the whole row loses to `Nav`
 * before the tooltip's own `z-index` is even considered. Portaling out to `<body>` escapes that
 * ancestor stacking context entirely, so a plain high `z-index` there means what it says.
 */
export function portal(node: HTMLElement, target: string | HTMLElement = 'body') {
	const targetEl = typeof target === 'string' ? document.querySelector(target) : target;
	targetEl?.appendChild(node);

	return {
		destroy() {
			node.remove();
		}
	};
}
