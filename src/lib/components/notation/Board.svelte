<script lang="ts">
	/**
	 * Both players' dice at one moment: the Fixer (dice not yet rolled) and the Gigs (rolled dice,
	 * with their values) — the picture a Transcript describes.
	 *
	 * WE is the accent colour and THEY is a Colour-identity red, because the two sides must be
	 * tellable at a glance and the notation's own prime already marks them in text. A die is drawn
	 * in its **owner's** colour wherever it currently sits, so a stolen die reads as stolen.
	 *
	 * Pass `prev` — the board a step earlier — to ring the Gigs that are new or changed since,
	 * which is what makes stepping through a game teach rather than just redraw.
	 */
	import { PLAYER_LABEL, formatDie, sameDie } from '#lib/notation/index.js';
	import type { Die, GameState, Gig, Owner } from '#lib/notation/index.js';

	let { state, prev }: { state: GameState; prev?: GameState } = $props();

	const players: Owner[] = ['w', 't'];

	const theme: Record<Owner, { text: string; border: string; fill: string }> = {
		w: { text: 'text-neon', border: 'border-neon/50', fill: 'bg-neon/10' },
		t: { text: 'text-card-red', border: 'border-card-red/50', fill: 'bg-card-red/10' }
	};

	const label = (die: Die) => `d${die.sides}${die.owner === 't' ? '’' : ''}`;

	function fresh(holder: Owner, gig: Gig): boolean {
		if (!prev) return false;
		return !prev[holder].gigs.some((g) => sameDie(g, gig) && g.value === gig.value);
	}
</script>

<div class="space-y-3">
	{#each players as key (key)}
		{@const player = state[key]}
		<div class="rounded-lg border border-edge bg-surface">
			<div class="flex items-center justify-between border-b border-edge px-3 py-2">
				<span class="font-mono text-sm font-semibold tracking-widest {theme[key].text}"
					>{PLAYER_LABEL[key]}</span
				>
				<span class="font-mono text-xs text-muted"
					>{player.gigs.length} {player.gigs.length === 1 ? 'gig' : 'gigs'}</span
				>
			</div>
			<div class="space-y-2 px-3 py-3">
				<div class="flex items-start gap-3">
					<span class="w-12 shrink-0 pt-1 font-mono text-[0.65rem] tracking-widest text-muted"
						>FIXER</span
					>
					<div class="flex flex-wrap gap-1.5">
						{#each player.fixer as die (formatDie(die))}
							<span
								class="rounded border border-edge px-1.5 py-0.5 font-mono text-xs text-muted"
								title={formatDie(die)}>{label(die)}</span
							>
						{:else}
							<span class="pt-0.5 font-mono text-xs text-muted/60">empty</span>
						{/each}
					</div>
				</div>
				<div class="flex items-start gap-3">
					<span class="w-12 shrink-0 pt-2 font-mono text-[0.65rem] tracking-widest text-muted"
						>GIGS</span
					>
					<div class="flex min-h-11 flex-wrap gap-1.5">
						{#each player.gigs as gig (formatDie(gig))}
							{@const own = theme[gig.owner]}
							<span
								class="flex min-w-10 flex-col items-center rounded border px-2 py-1 transition-colors {own.border} {fresh(
									key,
									gig
								)
									? `${own.fill} ring-1 ring-bright/60`
									: ''}"
								title={formatDie(gig)}
							>
								<span class="font-mono text-[0.6rem] leading-tight text-muted">{label(gig)}</span>
								<span class="font-mono text-lg leading-tight font-semibold {own.text}"
									>{gig.value}</span
								>
							</span>
						{:else}
							<span class="pt-2 font-mono text-xs text-muted/60">none</span>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
