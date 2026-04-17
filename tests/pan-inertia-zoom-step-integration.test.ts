import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fake rAF driver: we control tick timing manually via flushRaf().
// NOTE: vi.useFakeTimers() in vitest >=4 auto-stubs rAF and would override
// this mock. We rely solely on stubGlobal here, per the task spec of
// "mock rAF で rAF ループを制御".
let rafQueue: Array<() => void> = [];
let nextRafId = 1;
const cancelled = new Set<number>();
vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
	const id = nextRafId++;
	rafQueue.push(() => {
		if (!cancelled.has(id)) cb();
	});
	return id;
});
vi.stubGlobal("cancelAnimationFrame", (id: number) => {
	cancelled.add(id);
});

function flushRaf(maxFrames = 500): number {
	let frames = 0;
	while (rafQueue.length > 0 && frames < maxFrames) {
		const batch = rafQueue;
		rafQueue = [];
		for (const cb of batch) cb();
		frames++;
	}
	return frames;
}

import {
	computeZoomFactor,
	clampScale,
	ZOOM_SCALE_MIN,
	ZOOM_SCALE_MAX,
} from "../src/views/InteractionManager";
import { InertiaPan, FRICTION } from "../src/views/inertia-pan";

describe("pan-inertia / zoom-step integration (subtask-1..3 behavioural contract)", () => {
	beforeEach(() => {
		rafQueue = [];
		nextRafId = 1;
		cancelled.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// -------------------------------------------------------------------------
	// wheel handler: deltaY=100 → next scale matches computeZoomFactor × clamp
	// -------------------------------------------------------------------------
	describe("wheel → scale update", () => {
		it("deltaY=100 zooms out (scale shrinks) to computeZoomFactor expected value", () => {
			const currentScale = 1.0;
			const deltaY = 100;
			const expected = clampScale(currentScale * computeZoomFactor(deltaY));
			expect(expected).toBeLessThan(currentScale);
			expect(expected).toBeGreaterThan(0);
			// Sanity: same pure inputs → deterministic output
			expect(
				clampScale(currentScale * computeZoomFactor(deltaY)),
			).toBe(expected);
		});

		it("deltaY=-100 zooms in (scale grows)", () => {
			const expected = clampScale(1.0 * computeZoomFactor(-100));
			expect(expected).toBeGreaterThan(1.0);
		});

		it("clamps at ZOOM_SCALE_MAX for repeated zoom-ins", () => {
			let scale = 1.0;
			for (let i = 0; i < 100; i++) {
				scale = clampScale(scale * computeZoomFactor(-100));
			}
			expect(scale).toBe(ZOOM_SCALE_MAX);
		});

		it("clamps at ZOOM_SCALE_MIN for repeated zoom-outs", () => {
			let scale = 1.0;
			for (let i = 0; i < 200; i++) {
				scale = clampScale(scale * computeZoomFactor(100));
			}
			expect(scale).toBe(ZOOM_SCALE_MIN);
		});
	});

	// -------------------------------------------------------------------------
	// pointermove: 2 samples → velocity in expected range
	// -------------------------------------------------------------------------
	describe("pointermove → pan velocity", () => {
		it("two samples give velocity proportional to (dx,dy)/dt × msPerFrame", () => {
			const pan = new InertiaPan(true, () => {});
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(60, 30, 50); // 50ms between samples
			const vel = pan.release();
			const msPerFrame = 1000 / 60;
			expect(vel.vx).toBeCloseTo((60 / 50) * msPerFrame, 5);
			expect(vel.vy).toBeCloseTo((30 / 50) * msPerFrame, 5);
			// Expected range sanity: velocity magnitude within reasonable bounds
			expect(Math.abs(vel.vx)).toBeGreaterThan(0.5);
			expect(Math.abs(vel.vx)).toBeLessThan(100);
		});

		it("single sample yields zero velocity (no inertia with < 2 samples)", () => {
			const pan = new InertiaPan(true, () => {});
			pan.trackPointer(0, 0, 0);
			const vel = pan.release();
			expect(vel.vx).toBe(0);
			expect(vel.vy).toBe(0);
		});
	});

	// -------------------------------------------------------------------------
	// pointerup: velocity > threshold → rAF loop runs until settled
	// -------------------------------------------------------------------------
	describe("pointerup → rAF inertia loop", () => {
		it("launches rAF loop and settles after velocity decays below threshold", () => {
			const deltas: Array<{ dx: number; dy: number }> = [];
			const pan = new InertiaPan(true, (dx, dy) => deltas.push({ dx, dy }));
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 50, 50);
			const vel = pan.release();
			expect(Math.abs(vel.vx)).toBeGreaterThan(0.5); // above MIN_VELOCITY

			// Simulate the pointerup handler: drive InertiaPan via rAF until settled.
			let settled = false;
			const loop = () => {
				const running = pan.tick();
				if (!running) {
					settled = true;
					return;
				}
				requestAnimationFrame(loop);
			};
			requestAnimationFrame(loop);

			const frames = flushRaf();
			expect(settled).toBe(true);
			expect(frames).toBeGreaterThan(1);
			expect(deltas.length).toBeGreaterThan(0);
			// tick() decays velocity by FRICTION each frame before applyDelta,
			// so consecutive deltas differ by exactly FRICTION.
			expect(deltas[1].dx).toBeCloseTo(deltas[0].dx * FRICTION, 5);
		});

		it("velocity below MIN_VELOCITY never ticks (settled immediately)", () => {
			const pan = new InertiaPan(true, () => {});
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(0.01, 0, 50); // tiny delta → below threshold after first decay
			pan.release();
			let ticks = 0;
			const loop = () => {
				ticks++;
				if (pan.tick()) requestAnimationFrame(loop);
			};
			requestAnimationFrame(loop);
			flushRaf();
			// Should terminate quickly — not run forever
			expect(ticks).toBeLessThan(200);
			expect(pan.isActive()).toBe(false);
		});

		it("pointerdown during inertia cancels active rAF loop (no double-application)", () => {
			const deltas: Array<{ dx: number; dy: number }> = [];
			const pan = new InertiaPan(true, (dx, dy) => deltas.push({ dx, dy }));
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(200, 0, 50);
			pan.release();

			let rafId: number | null = null;
			const loop = () => {
				if (!pan.tick()) return;
				rafId = requestAnimationFrame(loop);
			};
			rafId = requestAnimationFrame(loop);

			// Advance one frame so at least one applyDelta has fired.
			const batch = rafQueue;
			rafQueue = [];
			for (const cb of batch) cb();
			expect(deltas.length).toBeGreaterThan(0);

			// Simulate pointerdown cancelling inertia.
			const deltaCountAtCancel = deltas.length;
			pan.cancel();
			if (rafId !== null) cancelAnimationFrame(rafId);

			// After cancel(), pending rAF callbacks must not fire applyDelta again.
			flushRaf();
			expect(pan.isActive()).toBe(false);
			expect(deltas.length).toBe(deltaCountAtCancel);
		});
	});
});
