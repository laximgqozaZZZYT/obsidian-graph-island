/**
 * ManagedTimers — lifecycle-bound timer tracker.
 *
 * Wraps `setTimeout` / `setInterval` so every handle is registered in an
 * internal set. `clearAll()` cancels every outstanding timer in one call,
 * which is the canonical way to clean up inside a plugin's `onunload()`.
 *
 * `setTimeout` handles are auto-removed from tracking once the callback
 * fires, so fire-and-forget scheduling does not leak handles.
 */
export type TimerHandle = ReturnType<typeof setTimeout>;

export class ManagedTimers {
	private readonly timeouts = new Set<TimerHandle>();
	private readonly intervals = new Set<TimerHandle>();

	setTimeout(fn: () => void, ms: number): TimerHandle {
		const handle = globalThis.setTimeout(() => {
			this.timeouts.delete(handle);
			fn();
		}, ms) as TimerHandle;
		this.timeouts.add(handle);
		return handle;
	}

	setInterval(fn: () => void, ms: number): TimerHandle {
		const handle = globalThis.setInterval(fn, ms) as TimerHandle;
		this.intervals.add(handle);
		return handle;
	}

	clear(handle: TimerHandle): void {
		if (this.timeouts.delete(handle)) {
			globalThis.clearTimeout(handle);
			return;
		}
		if (this.intervals.delete(handle)) {
			globalThis.clearInterval(handle);
		}
	}

	clearAll(): void {
		for (const h of this.timeouts) globalThis.clearTimeout(h);
		for (const h of this.intervals) globalThis.clearInterval(h);
		this.timeouts.clear();
		this.intervals.clear();
	}

	get size(): number {
		return this.timeouts.size + this.intervals.size;
	}
}
