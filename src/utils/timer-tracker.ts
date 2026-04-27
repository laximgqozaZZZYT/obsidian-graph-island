/**
 * Lightweight setTimeout tracker exposed as a factory function.
 *
 * Returns a fresh `{ setTimeout, clearTimeout, clearAll }` triple whose
 * methods are pre-bound — callers can safely destructure them
 * (`const { setTimeout } = createTimerTracker()`) without losing context.
 *
 * Pending handles live in an internal `Set<number>`. The wrapper passed
 * to `window.setTimeout` deletes its own id from the set the moment the
 * handler runs, so `clearAll()` at teardown only walks still-pending
 * timers and never double-clears a fired handle.
 */
export interface TimerTracker {
	setTimeout: (handler: () => void, ms: number) => number;
	clearTimeout: (id: number) => void;
	clearAll: () => void;
}

export function createTimerTracker(): TimerTracker {
	const ids = new Set<number>();

	const set = (handler: () => void, ms: number): number => {
		let id = 0;
		id = window.setTimeout(() => {
			ids.delete(id);
			handler();
		}, ms) as unknown as number;
		ids.add(id);
		return id;
	};

	const clear = (id: number): void => {
		if (!ids.has(id)) return;
		window.clearTimeout(id);
		ids.delete(id);
	};

	const clearAll = (): void => {
		for (const id of ids) {
			window.clearTimeout(id);
		}
		ids.clear();
	};

	return {
		setTimeout: set,
		clearTimeout: clear,
		clearAll,
	};
}
