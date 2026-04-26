/**
 * Tracks `setTimeout` ids so a host class can cancel any still-pending
 * callbacks at teardown. The wrapper installed by `track()` auto-removes
 * the id from the internal Set when the callback fires, keeping the Set
 * bounded during normal operation. `clearAll()` is the safety net invoked
 * during host destroy / detach to guarantee no callbacks fire after
 * cleanup.
 */
export class TimeoutTracker {
	private pending = new Set<ReturnType<typeof setTimeout>>();

	/** Schedule a tracked timeout. Returned id may be passed to clearTimeout. */
	track(cb: () => void, ms: number): ReturnType<typeof setTimeout> {
		const id = setTimeout(() => {
			this.pending.delete(id);
			cb();
		}, ms);
		this.pending.add(id);
		return id;
	}

	/** Cancel a single tracked timeout by id (id may be null for convenience). */
	cancel(id: ReturnType<typeof setTimeout> | null): void {
		if (id === null) return;
		clearTimeout(id);
		this.pending.delete(id);
	}

	/** Cancel and forget every tracked timeout. Call from destroy/detach. */
	clearAll(): void {
		for (const id of this.pending) clearTimeout(id);
		this.pending.clear();
	}
}
