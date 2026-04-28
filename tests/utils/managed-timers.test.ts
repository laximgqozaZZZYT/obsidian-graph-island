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

	it("clear(handle) is a safe no-op for an already-fired timeout handle", () => {
		const mt = new ManagedTimers();
		const fn = vi.fn();
		const h = mt.setTimeout(fn, 100);

		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(mt.size).toBe(0);

		expect(() => mt.clear(h)).not.toThrow();
		expect(mt.size).toBe(0);
	});

	it("clearAll is idempotent and leaves the registry reusable", () => {
		const mt = new ManagedTimers();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		mt.setTimeout(fn1, 100);
		mt.clearAll();
		expect(() => mt.clearAll()).not.toThrow();
		expect(mt.size).toBe(0);

		mt.setTimeout(fn2, 100);
		expect(mt.size).toBe(1);
		vi.advanceTimersByTime(100);
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).toHaveBeenCalledTimes(1);
	});

	it("clearAll cancels mixed setTimeout and setInterval handles together", () => {
		const mt = new ManagedTimers();
		const tFn = vi.fn();
		const iFn = vi.fn();
		mt.setTimeout(tFn, 100);
		mt.setInterval(iFn, 50);
		expect(mt.size).toBe(2);

		mt.clearAll();
		expect(mt.size).toBe(0);

		vi.advanceTimersByTime(500);
		expect(tFn).not.toHaveBeenCalled();
		expect(iFn).not.toHaveBeenCalled();
	});
});

// Mirrors the Obsidian Component teardown contract: a host object owns a
// ManagedTimers instance and calls clearAll() inside its onunload() hook.
// After teardown, callbacks scheduled before unload must not fire.
describe("ManagedTimers lifecycle cleanup (Component onunload pattern)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	class FakeComponent {
		readonly timers = new ManagedTimers();
		private unloaded = false;

		schedule(fn: () => void, ms: number): void {
			if (this.unloaded) return;
			this.timers.setTimeout(fn, ms);
		}

		onunload(): void {
			this.unloaded = true;
			this.timers.clearAll();
		}
	}

	it("callbacks scheduled before onunload do not fire after onunload", () => {
		const cmp = new FakeComponent();
		const fn1 = vi.fn();
		const fn2 = vi.fn();
		cmp.schedule(fn1, 50);
		cmp.schedule(fn2, 200);
		expect(cmp.timers.size).toBe(2);

		cmp.onunload();
		expect(cmp.timers.size).toBe(0);

		vi.advanceTimersByTime(1000);
		expect(fn1).not.toHaveBeenCalled();
		expect(fn2).not.toHaveBeenCalled();
	});

	it("an already-fired callback that ran before onunload stays observed", () => {
		const cmp = new FakeComponent();
		const earlyFn = vi.fn();
		const lateFn = vi.fn();
		cmp.schedule(earlyFn, 30);
		cmp.schedule(lateFn, 300);

		vi.advanceTimersByTime(30);
		expect(earlyFn).toHaveBeenCalledTimes(1);

		cmp.onunload();
		vi.advanceTimersByTime(1000);
		expect(lateFn).not.toHaveBeenCalled();
		expect(earlyFn).toHaveBeenCalledTimes(1);
	});
});
