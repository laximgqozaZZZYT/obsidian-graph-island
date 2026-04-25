import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ManagedTimers } from "../../src/utils/managed-timers";

describe("ManagedTimers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("clearAll cancels every tracked setTimeout before it fires", () => {
		const mt = new ManagedTimers();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		mt.setTimeout(fn1, 100);
		mt.setTimeout(fn2, 200);
		expect(mt.size).toBe(2);

		mt.clearAll();
		expect(mt.size).toBe(0);

		vi.advanceTimersByTime(500);
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
	});

	it("clearAll cancels setInterval so it stops ticking", () => {
		const mt = new ManagedTimers();
		const fn = vi.fn();
		mt.setInterval(fn, 50);

		vi.advanceTimersByTime(120);
		expect(fn).toHaveBeenCalledTimes(2); // ticks at t=50, t=100
		expect(mt.size).toBe(1);

		mt.clearAll();
		expect(mt.size).toBe(0);

		vi.advanceTimersByTime(500);
		expect(fn).toHaveBeenCalledTimes(2); // no further ticks
	});

	it("setTimeout handle auto-untracks after firing (size returns to 0)", () => {
		const mt = new ManagedTimers();
		const fn = vi.fn();
		mt.setTimeout(fn, 100);
		expect(mt.size).toBe(1);

		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(mt.size).toBe(0);
	});

	it("clear(handle) cancels a single timer without affecting siblings", () => {
		const mt = new ManagedTimers();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		const h1 = mt.setTimeout(fn1, 100);
		mt.setTimeout(fn2, 100);
		expect(mt.size).toBe(2);

		mt.clear(h1);
		expect(mt.size).toBe(1);

		vi.advanceTimersByTime(100);
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).toHaveBeenCalledTimes(1);
	});
});
