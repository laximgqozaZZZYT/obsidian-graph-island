type TimeoutHandle = ReturnType<typeof setTimeout>;
type TimerKind = "timeout" | "interval";

/**
 * Tracks `setTimeout` / `setInterval` handles so callers can guarantee
 * cancellation on teardown without bookkeeping at every call-site.
 *
 * `setTimeout` handles auto-untrack themselves after firing so single-shot
 * timers do not leak entries indefinitely.
 */
export class ManagedTimers {
	private readonly handles = new Map<TimeoutHandle, TimerKind>();

	get size(): number {
		return this.handles.size;
	}

	setTimeout(fn: () => void, ms: number): TimeoutHandle {
		// Forward-reference: the wrapper closure needs to know its own handle,
		// but the handle is only returned after `setTimeout` is invoked. Wrap
		// it in a mutable slot so the closure can read it post-assignment.
		const slot: { handle: TimeoutHandle | null } = { handle: null };
		slot.handle = globalThis.setTimeout(() => {
			try {
				fn();
			} finally {
				if (slot.handle !== null) {
					this.handles.delete(slot.handle);
				}
			}
		}, ms);
		this.handles.set(slot.handle, "timeout");
		return slot.handle;
	}

	setInterval(fn: () => void, ms: number): TimeoutHandle {
		const handle = globalThis.setInterval(fn, ms);
		this.handles.set(handle, "interval");
		return handle;
	}

	clear(handle: TimeoutHandle): void {
		const kind = this.handles.get(handle);
		if (kind === undefined) return;
		if (kind === "interval") {
			globalThis.clearInterval(handle);
		} else {
			globalThis.clearTimeout(handle);
		}
		this.handles.delete(handle);
	}

	clearAll(): void {
		for (const [handle, kind] of this.handles) {
			if (kind === "interval") {
				globalThis.clearInterval(handle);
			} else {
				globalThis.clearTimeout(handle);
			}
		}
		this.handles.clear();
	}
}
