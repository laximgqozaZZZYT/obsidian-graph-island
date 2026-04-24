import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ManagedTimers } from "../../src/utils/managed-timers";

describe("ManagedTimers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("tracks setTimeout handles and clearAll() prevents execution", () => {
		const mgr = new ManagedTimers();
		const fnA = vi.fn();
		const fnB = vi.fn();
		mgr.setTimeout(fnA, 100);
		mgr.setTimeout(fnB, 200);
		expect(mgr.size).toBe(2);

		mgr.clearAll();
		expect(mgr.size).toBe(0);

		vi.advanceTimersByTime(1000);
		expect(fnA).not.toHaveBeenCalled();
		expect(fnB).not.toHaveBeenCalled();
	});

	it("tracks setInterval handles and clearAll() stops subsequent ticks", () => {
		const mgr = new ManagedTimers();
		const tick = vi.fn();
		mgr.setInterval(tick, 50);
		expect(mgr.size).toBe(1);

		vi.advanceTimersByTime(120);
		expect(tick).toHaveBeenCalledTimes(2);

		mgr.clearAll();
		expect(mgr.size).toBe(0);

		vi.advanceTimersByTime(500);
		expect(tick).toHaveBeenCalledTimes(2);
	});

	it("auto-removes setTimeout handle from tracking after callback fires", () => {
		const mgr = new ManagedTimers();
		const fn = vi.fn();
		mgr.setTimeout(fn, 100);
		expect(mgr.size).toBe(1);

		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(mgr.size).toBe(0);
	});

	it("clear(handle) cancels a single timeout without touching others", () => {
		const mgr = new ManagedTimers();
		const fnA = vi.fn();
		const fnB = vi.fn();
		const hA = mgr.setTimeout(fnA, 100);
		mgr.setTimeout(fnB, 100);
		expect(mgr.size).toBe(2);

		mgr.clear(hA);
		expect(mgr.size).toBe(1);

		vi.advanceTimersByTime(200);
		expect(fnA).not.toHaveBeenCalled();
		expect(fnB).toHaveBeenCalledTimes(1);
	});

	it("clear(handle) cancels a single interval without touching others", () => {
		const mgr = new ManagedTimers();
		const tickA = vi.fn();
		const tickB = vi.fn();
		const hA = mgr.setInterval(tickA, 50);
		mgr.setInterval(tickB, 50);

		mgr.clear(hA);
		vi.advanceTimersByTime(120);
		expect(tickA).not.toHaveBeenCalled();
		expect(tickB).toHaveBeenCalledTimes(2);
	});

	it("clear() on an already-cleared or unknown handle is a no-op", () => {
		const mgr = new ManagedTimers();
		const fn = vi.fn();
		const h = mgr.setTimeout(fn, 100);

		mgr.clear(h);
		expect(mgr.size).toBe(0);
		expect(() => mgr.clear(h)).not.toThrow();
		expect(mgr.size).toBe(0);
	});
});
