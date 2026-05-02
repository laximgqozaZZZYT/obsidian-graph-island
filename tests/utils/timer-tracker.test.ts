import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerTracker } from "../../src/utils/timer-tracker";

describe("TimerTracker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("increments size by 1 after registering a setTimeout", () => {
		const tracker = new TimerTracker();
		expect(tracker.size()).toBe(0);
		tracker.setTimeout(() => {}, 100);
		expect(tracker.size()).toBe(1);
	});

	it("returns size to 0 after the timer fires", () => {
		const tracker = new TimerTracker();
		const fn = vi.fn();
		tracker.setTimeout(fn, 100);
		expect(tracker.size()).toBe(1);
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(tracker.size()).toBe(0);
	});

	it("clears all pending timers and resets size to 0 on clearAll()", () => {
		const tracker = new TimerTracker();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		const fn3 = vi.fn();
		tracker.setTimeout(fn1, 100);
		tracker.setTimeout(fn2, 200);
		tracker.setTimeout(fn3, 300);
		expect(tracker.size()).toBe(3);

		tracker.clearAll();
		expect(tracker.size()).toBe(0);

		vi.advanceTimersByTime(500);
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
		expect(fn3).not.toHaveBeenCalled();
	});

	it("does not throw when clearAll() is called twice", () => {
		const tracker = new TimerTracker();
		tracker.setTimeout(() => {}, 100);
		tracker.clearAll();
		expect(() => tracker.clearAll()).not.toThrow();
		expect(tracker.size()).toBe(0);
	});
});
