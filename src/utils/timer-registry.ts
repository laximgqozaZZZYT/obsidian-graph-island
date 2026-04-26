export type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * Tracks pending setTimeout handles so callers can cancel them in bulk
 * (e.g. on view dispose). Handles are auto-removed when the timer fires
 * naturally, so the Set never grows beyond the number of pending timers.
 */
export class TimerRegistry {
	private readonly handles = new Set<TimerHandle>();

	setTimeout(fn: () => void, ms: number): TimerHandle {
		const handle: TimerHandle = setTimeout(() => {
			this.handles.delete(handle);
			fn();
		}, ms);
		this.handles.add(handle);
		return handle;
	}

	clear(handle: TimerHandle): void {
		if (this.handles.delete(handle)) {
			clearTimeout(handle);
		}
	}

	clearAll(): void {
		for (const handle of this.handles) {
			clearTimeout(handle);
		}
		this.handles.clear();
	}

	size(): number {
		return this.handles.size;
	}
}
