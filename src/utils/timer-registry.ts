/**
 * Centralized setTimeout registry. Callers register one-shot timers via
 * `setTimeout()`; `clearAll()` releases every pending timer in one call so a
 * `destroy()` / plugin reload path cannot leak fired-after-unmount handlers.
 *
 * Auto-cleanup: the wrapper passed to setTimeout deletes the id from the
 * internal Set immediately after the handler runs, so `size` reflects only
 * still-pending timers.
 *
 * Lifecycle: call `dispose()` at teardown to clear pending timers and mark
 * the registry as unusable; subsequent `setTimeout()` calls throw to surface
 * use-after-dispose bugs early.
 */
export class TimerRegistry {
	private _ids: Set<number> | null = new Set<number>();

	setTimeout(fn: () => void, ms: number): number {
		const ids = this._ids;
		if (ids === null) {
			throw new Error("TimerRegistry: setTimeout called after dispose()");
		}
		let id = 0;
		id = window.setTimeout(() => {
			fn();
			// Re-read because dispose() may have nulled `_ids` between schedule and fire.
			this._ids?.delete(id);
		}, ms) as unknown as number;
		ids.add(id);
		return id;
	}

	clear(id: number): void {
		window.clearTimeout(id);
		this._ids?.delete(id);
	}

	clearAll(): void {
		const ids = this._ids;
		if (ids === null) return;
		for (const id of ids) {
			window.clearTimeout(id);
		}
		ids.clear();
	}

	dispose(): void {
		this.clearAll();
		this._ids = null;
	}

	get size(): number {
		return this._ids?.size ?? 0;
	}
}
