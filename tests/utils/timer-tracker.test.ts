import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTimerTracker } from "../../src/utils/timer-tracker";

// Vitest runs in Node env (no `window`), so bridge `window.setTimeout` /
// `window.clearTimeout` to the fake timers vi.useFakeTimers() installs on
// globalThis. Same pattern as tests/utils/timer-registry.test.ts.
describe("createTimerTracker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("window", {
			setTimeout: (cb: () => void, ms: number) => globalThis.setTimeout(cb, ms),
			clearTimeout: (id: number) => globalThis.clearTimeout(id),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	it("auto-cleanup: handle is removed from internal set after firing", () => {
		const t = createTimerTracker();
		const handler = vi.fn();
		const id = t.setTimeout(handler, 100);
		vi.advanceTimersByTime(100);
		expect(handler).toHaveBeenCalledTimes(1);
		// After firing, calling clearTimeout with the same id is a no-op because
		// the wrapper has already removed it from the set.
		const spy = vi.spyOn(window, "clearTimeout");
		t.clearTimeout(id);
		expect(spy).not.toHaveBeenCalled();
	});

	it("auto-cleanup: multiple timers each remove themselves on fire", () => {
		const t = createTimerTracker();
		const a = vi.fn();
		const b = vi.fn();
		const idA = t.setTimeout(a, 50);
		const idB = t.setTimeout(b, 100);
		vi.advanceTimersByTime(50);
		expect(a).toHaveBeenCalledTimes(1);
		// idA is now self-removed; clearTimeout(idA) must be a no-op.
		const spy = vi.spyOn(window, "clearTimeout");
		t.clearTimeout(idA);
		expect(spy).not.toHaveBeenCalled();
		// idB still pending; clearTimeout(idB) must reach window.clearTimeout.
		t.clearTimeout(idB);
		expect(spy).toHaveBeenCalledWith(idB);
		vi.advanceTimersByTime(50);
		expect(b).not.toHaveBeenCalled();
	});

	it("clearAll() cancels every pending timer in one call", () => {
		const t = createTimerTracker();
		const a = vi.fn();
		const b = vi.fn();
		const c = vi.fn();
		t.setTimeout(a, 50);
		t.setTimeout(b, 100);
		t.setTimeout(c, 200);
		t.clearAll();
		vi.advanceTimersByTime(500);
		expect(a).not.toHaveBeenCalled();
		expect(b).not.toHaveBeenCalled();
		expect(c).not.toHaveBeenCalled();
	});

	it("no double-clear: clearAll() after a timer fires does not re-clear it", () => {
		const t = createTimerTracker();
		const handler = vi.fn();
		t.setTimeout(handler, 50);
		vi.advanceTimersByTime(50);
		expect(handler).toHaveBeenCalledTimes(1);
		// At this point the fired id should already have been removed from the
		// internal set by the wrapper. clearAll() must walk an empty set and
		// never call window.clearTimeout for the already-fired handle.
		const spy = vi.spyOn(window, "clearTimeout");
		t.clearAll();
		expect(spy).not.toHaveBeenCalled();
	});
});
