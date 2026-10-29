<script lang="ts">
	/**
	 * A QR code as a vector path, drawn synchronously from the module matrix: no canvas and no await,
	 * so it renders on the server and prints crisp at any size. (`deck-image-canvas.ts` draws its QR to
	 * a canvas because that one is exported as a PNG.)
	 *
	 * Black on white, the white including the four-module quiet zone scanners need, so it keeps its
	 * contrast on any background. Size it with a class — it is square.
	 */
	import QRCode from 'qrcode';

	let { url, class: className = '' }: { url: string; class?: string } = $props();

	const QUIET = 4;

	const qr = $derived(QRCode.create(url, { errorCorrectionLevel: 'M' }).modules);
	const path = $derived(
		Array.from({ length: qr.size * qr.size }, (_, i) => [i % qr.size, Math.floor(i / qr.size)])
			.filter(([x, y]) => qr.get(x, y))
			.map(([x, y]) => `M${x + QUIET} ${y + QUIET}h1v1h-1z`)
			.join('')
	);
	const side = $derived(qr.size + QUIET * 2);
</script>

<svg
	viewBox="0 0 {side} {side}"
	class={className}
	role="img"
	aria-label="QR code for {url}"
	shape-rendering="crispEdges"
>
	<rect width={side} height={side} fill="#fff" />
	<path d={path} fill="#000" />
</svg>
