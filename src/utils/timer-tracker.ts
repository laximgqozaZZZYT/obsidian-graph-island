export class TimerTracker {
	private readonly timers = new Set<ReturnType<typeof setTimeout>>();

	setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
		const id: ReturnType<typeof setTimeout> = globalThis.setTimeout(() => {
			this.timers.delete(id);
			fn();
		}, ms);
		this.timers.add(id);
		return id;
	}

	clearAll(): void {
		for (const id of this.timers) {
			clearTimeout(id);
		}
		this.timers.clear();
	}

	size(): number {
		return this.timers.size;
	}
}
