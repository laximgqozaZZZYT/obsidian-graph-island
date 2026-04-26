// =============================================================================
// TimerRegistry — track one-shot timers so they can be cleared on cleanup.
// -----------------------------------------------------------------------------
// Use `schedule(fn, ms)` instead of bare setTimeout inside class lifecycles,
// then call `clearAll()` from your dispose / detach / onClose hook.
//
// Why: detached components whose pending timers fire keep `this` alive
// (preventing GC) and re-touch DOM that no longer exists, causing memory
// leaks and "view is null" errors.
// =============================================================================

export type TimerId = ReturnType<typeof setTimeout>;

export class TimerRegistry {
	private ids = new Set<TimerId>();

	/** Schedule a one-shot timer. Auto-removes itself from the registry on fire. */
	schedule(fn: () => void, ms: number): TimerId {
		const id = setTimeout(() => {
			this.ids.delete(id);
			fn();
		}, ms);
		this.ids.add(id);
		return id;
	}

	/** Cancel a single tracked timer. No-op if id is null/undefined or already fired. */
	cancel(id: TimerId | null | undefined): void {
		if (id == null) return;
		if (this.ids.delete(id)) clearTimeout(id);
	}

	/** Cancel all pending timers. Call from dispose/detach/onClose. */
	clearAll(): void {
		for (const id of this.ids) clearTimeout(id);
		this.ids.clear();
	}

	get size(): number {
		return this.ids.size;
	}
}
