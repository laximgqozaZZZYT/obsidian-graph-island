import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimerTracker } from "../../src/utils/timer-tracker";

describe("TimerTracker", () => {
	let tracker: TimerTracker;

	beforeEach(() => {
		vi.useFakeTimers();
		tracker = new TimerTracker();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("setTimeout 登録後 size() が 1 増える", () => {
		expect(tracker.size()).toBe(0);
		tracker.setTimeout(() => {}, 100);
		expect(tracker.size()).toBe(1);
	});

	it("発火後 size() が 0 に戻る", () => {
		const fn = vi.fn();
		tracker.setTimeout(fn, 100);
		expect(tracker.size()).toBe(1);
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(tracker.size()).toBe(0);
	});

	it("clearAll() 呼び出しで全タイマーがクリアされ size() が 0", () => {
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		const fn3 = vi.fn();
		tracker.setTimeout(fn1, 100);
		tracker.setTimeout(fn2, 200);
		tracker.setTimeout(fn3, 300);
		expect(tracker.size()).toBe(3);

		tracker.clearAll();
		expect(tracker.size()).toBe(0);

		vi.advanceTimersByTime(1000);
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
		expect(fn3).not.toHaveBeenCalled();
	});

	it("同じ ID を二重 clear しても例外を投げない", () => {
		tracker.setTimeout(() => {}, 100);
		tracker.setTimeout(() => {}, 200);

		expect(() => {
			tracker.clearAll();
			tracker.clearAll();
		}).not.toThrow();
		expect(tracker.size()).toBe(0);
	});
});
