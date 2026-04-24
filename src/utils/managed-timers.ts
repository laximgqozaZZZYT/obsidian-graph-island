/**
 * Tracks one-shot timers and intervals for bulk cancellation on teardown.
 * Owners call `clearAll()` from `onClose` / `onunload` to prevent leaks when
 * scheduled callbacks would otherwise fire after DOM/plugin teardown.
 *
 * `setTimeout` self-deregisters after firing so fire-and-forget handles do
 * not accumulate in the tracking Set.
 */
export type TimeoutHandle = ReturnType<typeof setTimeout>;
export type IntervalHandle = ReturnType<typeof setInterval>;

export class ManagedTimers {
	private _timeoutHandles = new Set<TimeoutHandle>();
	private _intervalHandles = new Set<IntervalHandle>();

	setTimeout(cb: () => void, ms: number): TimeoutHandle {
		const id = setTimeout(() => {
			this._timeoutHandles.delete(id);
			cb();
		}, ms);
		this._timeoutHandles.add(id);
		return id;
	}

	setInterval(cb: () => void, ms: number): IntervalHandle {
		const id = setInterval(cb, ms);
		this._intervalHandles.add(id);
		return id;
	}

	clear(handle: TimeoutHandle | IntervalHandle | null | undefined): void {
		if (handle == null) return;
		if (this._timeoutHandles.has(handle as TimeoutHandle)) {
			clearTimeout(handle as TimeoutHandle);
			this._timeoutHandles.delete(handle as TimeoutHandle);
			return;
		}
		if (this._intervalHandles.has(handle as IntervalHandle)) {
			clearInterval(handle as IntervalHandle);
			this._intervalHandles.delete(handle as IntervalHandle);
		}
	}

	clearAll(): void {
		for (const id of this._timeoutHandles) clearTimeout(id);
		this._timeoutHandles.clear();
		for (const id of this._intervalHandles) clearInterval(id);
		this._intervalHandles.clear();
	}

	get size(): number {
		return this._timeoutHandles.size + this._intervalHandles.size;
	}
}
