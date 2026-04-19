import { describe, it, expect, vi } from "vitest";
import {
	startCancellableRAF,
	cancelAllHandles,
	fadeNodeAlphaCancellable,
	type RAFApi,
	type RAFHandle,
} from "../../src/views/animation-controller";

// --- Fake rAF driver ---------------------------------------------------------
// Injected via the RAFApi parameter — no global stubs needed. Tests control
// frame timing explicitly via flushOne(timestamp).
function makeFakeRAF(): {
	api: RAFApi;
	flushOne: (atTime: number) => void;
	pendingCount: () => number;
} {
	let nextId = 1;
	const pending = new Map<number, (t: number) => void>();
	return {
		api: {
			request: (cb) => {
				const id = nextId++;
				pending.set(id, cb);
				return id;
			},
			cancel: (id) => {
				pending.delete(id);
			},
		},
		flushOne(atTime: number) {
			const batch = Array.from(pending.entries());
			pending.clear();
			for (const [, cb] of batch) cb(atTime);
		},
		pendingCount: () => pending.size,
	};
}

describe("startCancellableRAF", () => {
	it("calls step each frame and reschedules while step returns true", () => {
		const rf = makeFakeRAF();
		const step = vi.fn(() => true);
		startCancellableRAF(step, rf.api);

		expect(rf.pendingCount()).toBe(1);
		rf.flushOne(16);
		expect(step).toHaveBeenCalledTimes(1);
		expect(rf.pendingCount()).toBe(1);
		rf.flushOne(32);
		expect(step).toHaveBeenCalledTimes(2);
	});

	it("stops automatically when step returns false", () => {
		const rf = makeFakeRAF();
		let n = 0;
		const step = vi.fn(() => {
			n++;
			return n < 2;
		});
		startCancellableRAF(step, rf.api);
		rf.flushOne(16);
		expect(rf.pendingCount()).toBe(1);
		rf.flushOne(32);
		expect(step).toHaveBeenCalledTimes(2);
		expect(rf.pendingCount()).toBe(0);
	});

	it("does not call step after cancel()", () => {
		const rf = makeFakeRAF();
		const step = vi.fn(() => true);
		const handle = startCancellableRAF(step, rf.api);
		handle.cancel();
		rf.flushOne(16);
		expect(step).not.toHaveBeenCalled();
		expect(rf.pendingCount()).toBe(0);
	});

	it("cancel() is idempotent and does not double-cancel rAF", () => {
		const cancelSpy = vi.fn();
		const api: RAFApi = {
			request: () => 42,
			cancel: cancelSpy,
		};
		const handle = startCancellableRAF(() => true, api);
		handle.cancel();
		handle.cancel();
		handle.cancel();
		expect(cancelSpy).toHaveBeenCalledTimes(1);
	});

	it("cancel during step execution prevents further scheduling", () => {
		const rf = makeFakeRAF();
		let handle: RAFHandle | null = null;
		const step = vi.fn(() => {
			handle?.cancel();
			return true; // would normally reschedule
		});
		handle = startCancellableRAF(step, rf.api);
		rf.flushOne(16);
		expect(step).toHaveBeenCalledTimes(1);
		// step returned true but cancel was called inside — must not reschedule
		expect(rf.pendingCount()).toBe(0);
	});
});

describe("cancelAllHandles", () => {
	it("cancels every handle and clears the set", () => {
		const c1 = vi.fn();
		const c2 = vi.fn();
		const c3 = vi.fn();
		const handles = new Set<RAFHandle>([
			{ cancel: c1 },
			{ cancel: c2 },
			{ cancel: c3 },
		]);
		cancelAllHandles(handles);
		expect(c1).toHaveBeenCalledTimes(1);
		expect(c2).toHaveBeenCalledTimes(1);
		expect(c3).toHaveBeenCalledTimes(1);
		expect(handles.size).toBe(0);
	});

	it("is safe on empty sets", () => {
		const handles = new Set<RAFHandle>();
		expect(() => cancelAllHandles(handles)).not.toThrow();
		expect(handles.size).toBe(0);
	});
});

describe("fadeNodeAlphaCancellable", () => {
	it("cancels prior fade when called again with same key", () => {
		const rf = makeFakeRAF();
		const node = { gfx: { alpha: 0 } };
		const activeMap = new Map<string, RAFHandle>();

		fadeNodeAlphaCancellable(node, 1, 100, activeMap, "n1", rf.api);
		const first = activeMap.get("n1")!;
		const cancelSpy = vi.spyOn(first, "cancel");

		fadeNodeAlphaCancellable(node, 0.5, 100, activeMap, "n1", rf.api);

		expect(cancelSpy).toHaveBeenCalledTimes(1);
		expect(activeMap.get("n1")).not.toBe(first);
	});

	it("removes handle from activeMap when fade completes", () => {
		const rf = makeFakeRAF();
		const node = { gfx: { alpha: 0 } };
		const activeMap = new Map<string, RAFHandle>();

		fadeNodeAlphaCancellable(node, 1, 100, activeMap, "n1", rf.api);
		expect(activeMap.has("n1")).toBe(true);

		rf.flushOne(0); // initialise startTime, t=0
		rf.flushOne(50); // t=0.5
		expect(activeMap.has("n1")).toBe(true);

		rf.flushOne(100); // t=1, completes
		expect(activeMap.has("n1")).toBe(false);
		expect(node.gfx.alpha).toBe(1);
	});

	it("linearly interpolates alpha across the duration", () => {
		const rf = makeFakeRAF();
		const node = { gfx: { alpha: 0 } };
		const activeMap = new Map<string, RAFHandle>();

		fadeNodeAlphaCancellable(node, 1, 100, activeMap, "n1", rf.api);
		rf.flushOne(0);
		expect(node.gfx.alpha).toBe(0);
		rf.flushOne(25);
		expect(node.gfx.alpha).toBeCloseTo(0.25);
		rf.flushOne(50);
		expect(node.gfx.alpha).toBeCloseTo(0.5);
		rf.flushOne(150);
		expect(node.gfx.alpha).toBe(1);
	});

	it("is a no-op fast-path when already at target alpha", () => {
		const rf = makeFakeRAF();
		const node = { gfx: { alpha: 1 } };
		const activeMap = new Map<string, RAFHandle>();

		fadeNodeAlphaCancellable(node, 1, 100, activeMap, "n1", rf.api);
		expect(rf.pendingCount()).toBe(0);
		expect(activeMap.has("n1")).toBe(false);
		expect(node.gfx.alpha).toBe(1);
	});

	it("fast-paths when durationMs is zero, snapping to target", () => {
		const rf = makeFakeRAF();
		const node = { gfx: { alpha: 0 } };
		const activeMap = new Map<string, RAFHandle>();

		fadeNodeAlphaCancellable(node, 0.8, 0, activeMap, "n1", rf.api);
		expect(rf.pendingCount()).toBe(0);
		expect(node.gfx.alpha).toBe(0.8);
		expect(activeMap.has("n1")).toBe(false);
	});

	it("invokes onTick for each frame while fading", () => {
		const rf = makeFakeRAF();
		const node = { gfx: { alpha: 0 } };
		const activeMap = new Map<string, RAFHandle>();
		const onTick = vi.fn();

		fadeNodeAlphaCancellable(node, 1, 100, activeMap, "n1", rf.api, onTick);
		rf.flushOne(0);
		rf.flushOne(50);
		rf.flushOne(100);
		expect(onTick).toHaveBeenCalledTimes(3);
	});

	it("cancelled fade does not leak into activeMap cleanup of newer fade", () => {
		const rf = makeFakeRAF();
		const node = { gfx: { alpha: 0 } };
		const activeMap = new Map<string, RAFHandle>();

		fadeNodeAlphaCancellable(node, 1, 100, activeMap, "n1", rf.api);
		fadeNodeAlphaCancellable(node, 0.5, 200, activeMap, "n1", rf.api);
		const second = activeMap.get("n1");

		// Drain frames — the first fade was cancelled so its step never runs.
		// The second fade should still own the map entry mid-flight.
		rf.flushOne(0);
		rf.flushOne(50);
		expect(activeMap.get("n1")).toBe(second);
	});
});
