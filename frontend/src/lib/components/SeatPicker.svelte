<script lang="ts">
	import { t } from '$lib/i18n';
	import type { SeatPick, Seating } from '$lib/types';

	interface Props {
		seating: Seating;
		ticketCount: number;
		picks: SeatPick[];
		onChange: (picks: SeatPick[]) => void;
		onRefresh: () => Promise<void>;
	}

	let { seating, ticketCount, picks, onChange, onRefresh }: Props = $props();

	let refreshing = $state(false);

	function isSelected(tableId: string, n: number): boolean {
		return picks.some((p) => p.seat_table_id === tableId && p.seat_number === n);
	}

	function isTaken(taken: number[], n: number): boolean {
		return taken.includes(n);
	}

	function toggle(tableId: string, n: number, taken: number[]) {
		if (isTaken(taken, n)) return;
		const exists = picks.findIndex((p) => p.seat_table_id === tableId && p.seat_number === n);
		if (exists >= 0) {
			onChange(picks.filter((_, i) => i !== exists));
			return;
		}
		if (picks.length >= ticketCount) return;
		onChange([...picks, { seat_table_id: tableId, seat_number: n }]);
	}

	async function refresh() {
		refreshing = true;
		try {
			await onRefresh();
		} finally {
			refreshing = false;
		}
	}

	// Distribute N seats around a circle so the rounded-table metaphor is clear.
	// The center label sits at (50,50); seat buttons go on a radius of 38 (of 100).
	function seatPosition(index: number, total: number): { x: number; y: number } {
		const angle = (2 * Math.PI * index) / total - Math.PI / 2;
		return {
			x: 50 + 38 * Math.cos(angle),
			y: 50 + 38 * Math.sin(angle)
		};
	}
</script>

<div class="seat-picker stack">
	<div class="header">
		<h3>{t('event.pickSeats')}</h3>
		<button class="secondary small" onclick={refresh} disabled={refreshing}>
			{t('event.refreshAvailability')}
		</button>
	</div>
	<p class="muted small">
		{t('event.seatsSelected', { selected: picks.length, total: ticketCount })}
	</p>

	{#if seating.tables.length === 0}
		<p class="muted">{t('event.noSeatTables')}</p>
	{:else}
		<div class="tables">
			{#each seating.tables as tbl (tbl.id)}
				<div class="table-wrap">
					<div class="table-name">{tbl.name}</div>
					<div class="round-table">
						{#each Array(seating.seats_per_table) as _, i}
							{@const n = i + 1}
							{@const pos = seatPosition(i, seating.seats_per_table)}
							{@const taken = isTaken(tbl.taken_seats, n)}
							{@const selected = isSelected(tbl.id, n)}
							<button
								type="button"
								class="seat"
								class:taken
								class:selected
								disabled={taken}
								title={taken
									? t('event.seatTaken')
									: t('event.seat', { n })}
								style="left: {pos.x}%; top: {pos.y}%;"
								onclick={() => toggle(tbl.id, n, tbl.taken_seats)}
							>
								{n}
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.seat-picker {
		gap: 0.75rem;
	}
	.header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.75rem;
	}
	.small {
		font-size: 0.85rem;
	}
	.tables {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
	}
	.table-wrap {
		display: grid;
		gap: 0.4rem;
	}
	.table-name {
		text-align: center;
		font-weight: 600;
	}
	.round-table {
		position: relative;
		width: 100%;
		aspect-ratio: 1 / 1;
		border-radius: 50%;
		background: var(--surface-2, #eee);
		border: 2px solid var(--border, #ccc);
	}
	.seat {
		position: absolute;
		width: 28px;
		height: 28px;
		margin-left: -14px;
		margin-top: -14px;
		border-radius: 50%;
		border: 1px solid var(--border, #888);
		background: var(--surface, #fff);
		color: var(--text, #222);
		font-size: 0.7rem;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.seat:hover:not(:disabled) {
		border-color: var(--primary, #2255cc);
	}
	.seat.taken {
		background: #888;
		color: #ddd;
		cursor: not-allowed;
		text-decoration: line-through;
	}
	.seat.selected {
		background: var(--primary, #2255cc);
		color: #fff;
		border-color: var(--primary, #2255cc);
	}
</style>
