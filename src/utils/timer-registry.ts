/**
 * Centralized setTimeout registry. Callers register one-shot timers via
 * `set()`; `clearAll()` releases every pending timer in one call so a
 * `destroy()` / plugin reload path cannot leak fired-after-unmount handlers.
 *
 * Auto-cleanup: the wrapper passed to setTimeout deletes the id from the
 * internal Set immediately after the handler runs, so `size` reflects only
 * still-pending timers.
 */
export class TimerRegistry {
	private readonly _ids = new Set<number>();

	set(handler: () => void, ms: number): number {
		let id = 0;
		id = window.setTimeout(() => {
			handler();
			this._ids.delete(id);
		}, ms) as unknown as number;
		this._ids.add(id);
		return id;
	}

	clear(id: number): void {
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
