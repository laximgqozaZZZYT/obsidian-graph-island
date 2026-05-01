/**
 * Centralized setTimeout registry. Callers register one-shot timers via
 * `setTimeout()`; `clearAll()` releases every pending timer in one call so a
 * `destroy()` / plugin reload path cannot leak fired-after-unmount handlers.
 *
 * Auto-cleanup: the wrapper passed to window.setTimeout deletes the id from
 * the internal Set immediately after the handler runs, so `size` reflects
 * only still-pending timers. Calling `clearTimeout(id)` also removes the id.
 *
 * NOTE: GraphViewContainer and other views use the richer `ManagedTimers`
 * (which adds setInterval support) for the same leak-prevention guarantee.
 * TimerRegistry is the timeout-only subset preserved for callers that don't
 * need interval handles.
 */
export class TimerRegistry {
	private readonly _ids = new Set<number>();

	setTimeout(handler: () => void, ms: number): number {
		let id = 0;
		id = window.setTimeout(() => {
			handler();
			this._ids.delete(id);
		}, ms) as unknown as number;
		this._ids.add(id);
		return id;
	}

	clearTimeout(id: number): void {
		window.clearTimeout(id);
		this._ids.delete(id);
	}

	clearAll(): void {
		for (const id of this._ids) {
			window.clearTimeout(id);
		}
		this._ids.clear();
	}

	get size(): number {
		return this._ids.size;
	}
}
