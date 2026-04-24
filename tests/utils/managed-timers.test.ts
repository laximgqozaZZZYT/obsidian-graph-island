import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ManagedTimers } from "../../src/utils/managed-timers";

describe("ManagedTimers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("tracks setTimeout handles and clears all pending on clearAll", () => {
		const timers = new ManagedTimers();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		const fn3 = vi.fn();
		timers.setTimeout(fn1, 100);
		timers.setTimeout(fn2, 200);
		timers.setTimeout(fn3, 300);
		expect(timers.size).toBe(3);
		timers.clearAll();
		expect(timers.size).toBe(0);
		vi.advanceTimersByTime(1000);
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
		expect(fn3).not.toHaveBeenCalled();
	});

	it("tracks setInterval handles and stops ticks after clearAll", () => {
		const timers = new ManagedTimers();
		const tick = vi.fn();
		timers.setInterval(tick, 50);
		vi.advanceTimersByTime(200);
		expect(tick).toHaveBeenCalledTimes(4);
		timers.clearAll();
		vi.advanceTimersByTime(500);
		expect(tick).toHaveBeenCalledTimes(4);
		expect(timers.size).toBe(0);
	});

	it("deregisters setTimeout handle automatically after firing", () => {
		const timers = new ManagedTimers();
		const fn = vi.fn();
		timers.setTimeout(fn, 100);
		expect(timers.size).toBe(1);
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(timers.size).toBe(0);
	});

	it("clears a single timeout by handle without affecting others", () => {
		const timers = new ManagedTimers();
		const keep = vi.fn();
		const drop = vi.fn();
		timers.setTimeout(keep, 100);
		const handle = timers.setTimeout(drop, 100);
		expect(timers.size).toBe(2);
		timers.clear(handle);
		expect(timers.size).toBe(1);
		vi.advanceTimersByTime(100);
		expect(keep).toHaveBeenCalledTimes(1);
		expect(drop).not.toHaveBeenCalled();
	});

	it("clear() is a no-op for null/undefined handles", () => {
		const timers = new ManagedTimers();
		expect(() => timers.clear(null)).not.toThrow();
		expect(() => timers.clear(undefined)).not.toThrow();
		expect(timers.size).toBe(0);
	});

	it("clear() by interval handle stops ticks", () => {
		const timers = new ManagedTimers();
		const tick = vi.fn();
		const id = timers.setInterval(tick, 50);
		vi.advanceTimersByTime(100);
		expect(tick).toHaveBeenCalledTimes(2);
		timers.clear(id);
		vi.advanceTimersByTime(500);
		expect(tick).toHaveBeenCalledTimes(2);
		expect(timers.size).toBe(0);
	});
});
