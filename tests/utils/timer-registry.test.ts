import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimerRegistry } from "../../src/utils/timer-registry";

// Vitest runs in Node env (no `window`), so bridge `window.setTimeout` /
// `window.clearTimeout` to the fake timers vi.useFakeTimers() installs on
// globalThis. Same pattern as tests/layout-transition.test.ts.
describe("TimerRegistry", () => {
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

	it("setTimeout() fires the handler after ms elapses", () => {
		const reg = new TimerRegistry();
		const handler = vi.fn();
		reg.setTimeout(handler, 100);
		expect(handler).not.toHaveBeenCalled();
		vi.advanceTimersByTime(99);
		expect(handler).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("auto-cleanup: size decreases after each timer fires", () => {
		const reg = new TimerRegistry();
		reg.setTimeout(() => {}, 50);
		reg.setTimeout(() => {}, 100);
		expect(reg.size).toBe(2);
		vi.advanceTimersByTime(50);
		expect(reg.size).toBe(1);
		vi.advanceTimersByTime(50);
		expect(reg.size).toBe(0);
	});

	it("clear(id) prevents the handler from firing and removes from registry", () => {
		const reg = new TimerRegistry();
		const handler = vi.fn();
		const id = reg.setTimeout(handler, 100);
		expect(reg.size).toBe(1);
		reg.clear(id);
		expect(reg.size).toBe(0);
		vi.advanceTimersByTime(500);
		expect(handler).not.toHaveBeenCalled();
	});

	it("clearAll() cancels all registered timers and resets size to 0", () => {
		const reg = new TimerRegistry();
		const a = vi.fn();
		const b = vi.fn();
		const c = vi.fn();
		reg.setTimeout(a, 50);
		reg.setTimeout(b, 100);
		reg.setTimeout(c, 200);
		expect(reg.size).toBe(3);
		reg.clearAll();
		expect(reg.size).toBe(0);
		vi.advanceTimersByTime(500);
		expect(a).not.toHaveBeenCalled();
		expect(b).not.toHaveBeenCalled();
		expect(c).not.toHaveBeenCalled();
	});

	it("dispose() cancels pending timers and reports size 0", () => {
		const reg = new TimerRegistry();
		const handler = vi.fn();
		reg.setTimeout(handler, 100);
		reg.setTimeout(() => {}, 200);
		expect(reg.size).toBe(2);
		reg.dispose();
		expect(reg.size).toBe(0);
		vi.advanceTimersByTime(500);
		expect(handler).not.toHaveBeenCalled();
	});

	it("dispose() makes the registry reject further setTimeout() calls", () => {
		const reg = new TimerRegistry();
		reg.dispose();
		expect(() => reg.setTimeout(() => {}, 10)).toThrow(/dispose/);
	});

	it("dispose() is idempotent (clearAll/clear after dispose is a no-op)", () => {
		const reg = new TimerRegistry();
		const id = reg.setTimeout(() => {}, 100);
		reg.dispose();
		// Neither call should throw.
		reg.clear(id);
		reg.clearAll();
		reg.dispose();
		expect(reg.size).toBe(0);
	});
});
