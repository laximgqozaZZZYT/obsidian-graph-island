type TimerId = ReturnType<typeof setTimeout>;

export class TimerTracker {
	private readonly ids = new Set<TimerId>();

	setTimeout(fn: () => void, ms: number): TimerId {
		let id!: TimerId;
		id = setTimeout(() => {
			this.ids.delete(id);
			fn();
		}, ms);
		this.ids.add(id);
		return id;
	}

	clearAll(): void {
		for (const id of this.ids) {
			clearTimeout(id);
		}
		this.ids.clear();
	}

	size(): number {
		return this.ids.size;
	}
}
