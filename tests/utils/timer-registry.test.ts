import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TimerRegistry } from "../../src/utils/timer-registry";

describe("TimerRegistry", () => {
	let registry: TimerRegistry;

	beforeEach(() => {
		vi.useFakeTimers();
		registry = new TimerRegistry();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts empty", () => {
		expect(registry.size()).toBe(0);
	});

	it("increments size when a timer is registered", () => {
		registry.setTimeout(() => {}, 100);
		expect(registry.size()).toBe(1);

		registry.setTimeout(() => {}, 200);
		expect(registry.size()).toBe(2);
	});

	it("decrements size when a timer fires naturally", () => {
		const fn = vi.fn();
		registry.setTimeout(fn, 100);
		expect(registry.size()).toBe(1);

		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledTimes(1);
		expect(registry.size()).toBe(0);
	});

	it("only the matured timer is removed; others remain pending", () => {
		registry.setTimeout(() => {}, 50);
		registry.setTimeout(() => {}, 200);
		expect(registry.size()).toBe(2);

		vi.advanceTimersByTime(50);
		expect(registry.size()).toBe(1);

		vi.advanceTimersByTime(150);
		expect(registry.size()).toBe(0);
	});

	it("clear(handle) cancels a specific pending timer", () => {
		const fn = vi.fn();
		const handle = registry.setTimeout(fn, 100);
		expect(registry.size()).toBe(1);

		registry.clear(handle);
		expect(registry.size()).toBe(0);

		vi.advanceTimersByTime(100);
		expect(fn).not.toHaveBeenCalled();
	});

	it("clear(handle) leaves other timers untouched", () => {
		const fnA = vi.fn();
		const fnB = vi.fn();
		const handleA = registry.setTimeout(fnA, 100);
		registry.setTimeout(fnB, 100);

		registry.clear(handleA);
		vi.advanceTimersByTime(100);

		expect(fnA).not.toHaveBeenCalled();
		expect(fnB).toHaveBeenCalledTimes(1);
		expect(registry.size()).toBe(0);
	});

	it("clear(handle) on an already-fired handle is a no-op", () => {
		const handle = registry.setTimeout(() => {}, 100);
		vi.advanceTimersByTime(100);
		expect(registry.size()).toBe(0);

		expect(() => registry.clear(handle)).not.toThrow();
		expect(registry.size()).toBe(0);
	});

	it("clearAll() cancels all pending timers", () => {
		const fnA = vi.fn();
		const fnB = vi.fn();
		const fnC = vi.fn();
		registry.setTimeout(fnA, 50);
		registry.setTimeout(fnB, 100);
		registry.setTimeout(fnC, 200);
		expect(registry.size()).toBe(3);

		registry.clearAll();
		expect(registry.size()).toBe(0);

		vi.advanceTimersByTime(500);
		expect(fnA).not.toHaveBeenCalled();
		expect(fnB).not.toHaveBeenCalled();
		expect(fnC).not.toHaveBeenCalled();
	});

	it("clearAll() on an empty registry is a no-op", () => {
		expect(() => registry.clearAll()).not.toThrow();
		expect(registry.size()).toBe(0);
	});

	it("setTimeout works after clearAll()", () => {
		registry.setTimeout(() => {}, 100);
		registry.clearAll();

		const fn = vi.fn();
		registry.setTimeout(fn, 50);
		expect(registry.size()).toBe(1);

		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(registry.size()).toBe(0);
	});

	it("returns a handle that can be passed back to clear()", () => {
		const fn = vi.fn();
		const handle = registry.setTimeout(fn, 100);
		expect(handle).toBeDefined();

		registry.clear(handle);
		vi.advanceTimersByTime(100);
		expect(fn).not.toHaveBeenCalled();
	});
});
