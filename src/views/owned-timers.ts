/**
 * Keyed timer registry. Each key holds at most one pending timer;
 * scheduling a new one cancels the prior. Long-lived components
 * (RenderPipeline, etc.) call clearAll() during teardown so deferred
 * work cannot outlive the host instance.
 */
export class OwnedTimers {
	private timers = new Map<string, ReturnType<typeof setTimeout>>();

	schedule(key: string, fn: () => void, ms: number): void {
		const prev = this.timers.get(key);
		if (prev !== undefined) clearTimeout(prev);
		const id = setTimeout(() => {
			this.timers.delete(key);
			fn();
		}, ms);
		this.timers.set(key, id);
	}

	cancel(key: string): void {
		const id = this.timers.get(key);
		if (id !== undefined) {
			clearTimeout(id);
			this.timers.delete(key);
		}
	}

	clearAll(): void {
		for (const id of this.timers.values()) clearTimeout(id);
		this.timers.clear();
	}
}
