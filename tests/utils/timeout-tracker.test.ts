import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimeoutTracker, registerComponentTimeout } from "../../src/utils/timeout-tracker";

describe("TimeoutTracker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("clearAll prevents pending timeouts from firing", () => {
		const tracker = new TimeoutTracker();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		tracker.setTimeout(fn1, 100);
		tracker.setTimeout(fn2, 200);

		tracker.clearAll();
		vi.advanceTimersByTime(500);

		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
	});

	it("clearTimeout cancels only the targeted id", () => {
		const tracker = new TimeoutTracker();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		const id1 = tracker.setTimeout(fn1, 100);
		tracker.setTimeout(fn2, 200);

		tracker.clearTimeout(id1);
		vi.advanceTimersByTime(500);

		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).toHaveBeenCalledTimes(1);
	});

	it("removes id from internal set after the handler runs", () => {
		const tracker = new TimeoutTracker();
		const internalIds = (tracker as unknown as { ids: Set<number> }).ids;

		const fn = vi.fn();
		tracker.setTimeout(fn, 100);
		expect(internalIds.size).toBe(1);

		vi.advanceTimersByTime(150);

		expect(fn).toHaveBeenCalledTimes(1);
		expect(internalIds.size).toBe(0);
	});

	it("destroy() clears all pending timeouts (alias for clearAll)", () => {
		const tracker = new TimeoutTracker();
		const fn = vi.fn();
		tracker.setTimeout(fn, 100);

		tracker.destroy();
		vi.advanceTimersByTime(500);

		expect(fn).not.toHaveBeenCalled();
	});

	it("clearTimeout with an unknown id is a no-op", () => {
		const tracker = new TimeoutTracker();
		const fn = vi.fn();
		tracker.setTimeout(fn, 100);

		// Calling with an id that was never tracked must not throw and must
		// leave the existing timeout intact.
		expect(() => tracker.clearTimeout(99999)).not.toThrow();
		vi.advanceTimersByTime(150);
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

describe("registerComponentTimeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("clears the pending timeout when the component teardown callback fires", () => {
		const teardowns: Array<() => unknown> = [];
		const fakeComponent = {
			register: (cb: () => unknown) => {
				teardowns.push(cb);
			},
		} as unknown as Parameters<typeof registerComponentTimeout>[0];

		const fn = vi.fn();
		registerComponentTimeout(fakeComponent, fn, 100);
		expect(teardowns).toHaveLength(1);

		// Simulate the Component being unloaded.
		for (const cb of teardowns) cb();
		vi.advanceTimersByTime(500);

		expect(fn).not.toHaveBeenCalled();
	});

	it("fires normally when the component is never torn down", () => {
		const register = vi.fn();
		const fakeComponent = { register } as unknown as Parameters<typeof registerComponentTimeout>[0];

		const fn = vi.fn();
		registerComponentTimeout(fakeComponent, fn, 100);

		vi.advanceTimersByTime(150);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(register).toHaveBeenCalledTimes(1);
		expect(typeof register.mock.calls[0][0]).toBe("function");
	});
});
