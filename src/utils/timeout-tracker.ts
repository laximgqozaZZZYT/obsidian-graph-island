// ---------------------------------------------------------------------------
// timeout-tracker — collective teardown for setTimeout ids.
//
// Long-lived views accumulate stray timers that fire after the view is gone,
// which leaks memory and races against detached DOM. TimeoutTracker collects
// every id and lets the owner cancel them in one call. registerComponentTimeout
// wires the same cleanup into Obsidian's Component lifecycle so callers don't
// have to remember the id at all.
// ---------------------------------------------------------------------------
import type { Component } from "obsidian";

export class TimeoutTracker {
	private readonly ids = new Set<number>();

	setTimeout(fn: () => void, ms: number): number {
		const id = setTimeout(() => {
			this.ids.delete(id);
			fn();
		}, ms) as unknown as number;
		this.ids.add(id);
		return id;
	}

	clearTimeout(id: number): void {
		if (this.ids.delete(id)) {
			clearTimeout(id);
		}
	}

	clearAll(): void {
		for (const id of this.ids) {
			clearTimeout(id);
		}
		this.ids.clear();
	}

	destroy(): void {
		this.clearAll();
	}
}

/**
 * Schedule a one-shot timeout that auto-clears when the component unloads.
 * The cleanup is registered via Component.register so callers don't have to
 * track the id themselves.
 */
export function registerComponentTimeout(component: Component, fn: () => void, ms: number): number {
	const id = setTimeout(fn, ms) as unknown as number;
	component.register(() => clearTimeout(id));
	return id;
}
