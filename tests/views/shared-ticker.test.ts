import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock requestAnimationFrame/cancelAnimationFrame
let rafCallback: (() => void) | null = null;
let rafId = 1;
vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
	rafCallback = cb;
	return rafId++;
});
vi.stubGlobal("cancelAnimationFrame", (_id: number) => {
	rafCallback = null;
});

import { Ticker } from "../../src/views/shared-ticker";

describe("Ticker", () => {
	let ticker: Ticker;

	beforeEach(() => {
		ticker = new Ticker();
		rafCallback = null;
	});

	afterEach(() => {
		ticker.destroy();
	});

	it("adds and calls callbacks", () => {
		const fn = vi.fn();
		ticker.add(fn);
		expect(rafCallback).not.toBeNull();
		rafCallback!();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("does not add duplicate callback", () => {
		const fn = vi.fn();
		const ctx = {};
		ticker.add(fn, ctx);
		ticker.add(fn, ctx);
		rafCallback!();
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("removes callback", () => {
		const fn = vi.fn();
		ticker.add(fn);
		ticker.remove(fn);
		// After remove, if no callbacks left, stops
		expect(rafCallback).toBeNull();
	});

	it("destroy stops and clears all callbacks", () => {
		const fn = vi.fn();
		ticker.add(fn);
		ticker.destroy();
		expect(rafCallback).toBeNull();
	});
});
