import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PanInertiaController } from "../../src/views/pan-inertia-controller";

// --- Fake rAF driver ---------------------------------------------------------
// Manual-frame rAF control. `cancelled` set drops callbacks whose id was
// cancelAnimationFrame'd, preventing stale post-cancel onStep invocations.
// NOTE: vi.useFakeTimers() also stubs rAF by default, so we (re)install our
// stubs INSIDE beforeEach AFTER useFakeTimers() to win the override race.
let rafQueue: Array<() => void> = [];
let nextRafId = 1;
const cancelled = new Set<number>();
const cancelSpy = vi.fn((id: number) => {
	cancelled.add(id);
});

function advanceOneFrame(): void {
	const batch = rafQueue;
	rafQueue = [];
	for (const cb of batch) cb();
}

function flushRaf(maxFrames = 500): number {
	let frames = 0;
	while (rafQueue.length > 0 && frames < maxFrames) {
		advanceOneFrame();
		frames++;
	}
	return frames;
}

describe("PanInertiaController", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		rafQueue = [];
		nextRafId = 1;
		cancelled.clear();
		cancelSpy.mockClear();
		vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
			const id = nextRafId++;
			rafQueue.push(() => {
				if (!cancelled.has(id)) cb();
			});
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", cancelSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	// --- case 1 -----------------------------------------------------------------
	it("case 1: start() makes isActive() true", () => {
		const ctrl = new PanInertiaController();
		expect(ctrl.isActive()).toBe(false);
		ctrl.start(10, 5, vi.fn());
		expect(ctrl.isActive()).toBe(true);
	});

	// --- case 2 -----------------------------------------------------------------
	// velocity *= friction each frame → onStep dx/dy monotonically decreasing
	// with ratio ≈ friction (exponential decay).
	it("case 2: friction decays velocity exponentially (onStep dx/dy monotonic)", () => {
		const ctrl = new PanInertiaController();
		const onStep = vi.fn();
		const friction = 0.92;
		ctrl.start(10, 10, onStep, friction, 0.1);

		advanceOneFrame();
		advanceOneFrame();
		advanceOneFrame();

		expect(onStep).toHaveBeenCalledTimes(3);
		const [dx1, dy1] = onStep.mock.calls[0] as [number, number];
		const [dx2, dy2] = onStep.mock.calls[1] as [number, number];
		const [dx3, dy3] = onStep.mock.calls[2] as [number, number];
		expect(Math.abs(dx2)).toBeLessThan(Math.abs(dx1));
		expect(Math.abs(dx3)).toBeLessThan(Math.abs(dx2));
		expect(Math.abs(dy2)).toBeLessThan(Math.abs(dy1));
		expect(Math.abs(dy3)).toBeLessThan(Math.abs(dy2));
		// Exponential decay: consecutive ratio equals friction.
		expect(dx2 / dx1).toBeCloseTo(friction, 6);
		expect(dx3 / dx2).toBeCloseTo(friction, 6);
	});

	// --- case 3 -----------------------------------------------------------------
	// Initial velocity below minSpeed → first tick decays further and stops.
	it("case 3: |velocity| < minSpeed auto-stops and isActive() becomes false", () => {
		const ctrl = new PanInertiaController();
		const onStep = vi.fn();
		ctrl.start(0.05, 0.05, onStep, 0.92, 0.1);
		expect(ctrl.isActive()).toBe(true);

		flushRaf();

		expect(ctrl.isActive()).toBe(false);
		// Settled frame must not invoke onStep (settle happens before onStep).
		expect(onStep).not.toHaveBeenCalled();
	});

	// --- case 4 -----------------------------------------------------------------
	// Repeated start() cancels previous rafId via cancelAnimationFrame spy,
	// and the old onStep must not fire after the dedup.
	it("case 4: repeated start() cancels prior rafId (no duplicate launch)", () => {
		const ctrl = new PanInertiaController();
		const onStepOld = vi.fn();
		ctrl.start(10, 0, onStepOld, 0.92, 0.1);
		// First rafId was the id returned by the mock during the first start().
		const firstRafId = nextRafId - 1;
		expect(cancelSpy).not.toHaveBeenCalled();

		const onStepNew = vi.fn();
		ctrl.start(20, 0, onStepNew, 0.92, 0.1);

		expect(cancelSpy).toHaveBeenCalledTimes(1);
		expect(cancelSpy).toHaveBeenCalledWith(firstRafId);
		expect(ctrl.isActive()).toBe(true);

		// Advance one frame — only the new onStep fires. The stale callback
		// for the cancelled id is dropped.
		advanceOneFrame();
		expect(onStepOld).not.toHaveBeenCalled();
		expect(onStepNew).toHaveBeenCalledTimes(1);
		// New velocity (20 * 0.92 = 18.4) confirms the second start took over.
		const [dxNew] = onStepNew.mock.calls[0] as [number, number];
		expect(dxNew).toBeCloseTo(20 * 0.92, 6);
	});

	// --- case 5 -----------------------------------------------------------------
	// cancel() → isActive() false + velocity reset to 0.
	it("case 5: cancel() deactivates and resets velocity to zero", () => {
		const ctrl = new PanInertiaController();
		const onStep = vi.fn();
		ctrl.start(50, 40, onStep, 0.92, 0.1);
		expect(ctrl.isActive()).toBe(true);

		ctrl.cancel();

		expect(cancelSpy).toHaveBeenCalledTimes(1);
		expect(ctrl.isActive()).toBe(false);

		// Private velocity field reset — verified via behavior: pending rAF is
		// dropped so onStep stays un-invoked after cancel.
		flushRaf();
		expect(onStep).not.toHaveBeenCalled();

		// Structural check on the private velocity field (test-only introspection).
		const velocity = (
			ctrl as unknown as { velocity: { x: number; y: number } }
		).velocity;
		expect(velocity).toEqual({ x: 0, y: 0 });
	});

	// --- case 6 -----------------------------------------------------------------
	// After start() → cancel(), a subsequent start() runs inertia cleanly.
	it("case 6: start() → cancel() → start() again runs inertia correctly", () => {
		const ctrl = new PanInertiaController();
		ctrl.start(50, 0, vi.fn(), 0.92, 0.1);
		ctrl.cancel();
		expect(ctrl.isActive()).toBe(false);

		const onStep2 = vi.fn();
		ctrl.start(30, 0, onStep2, 0.92, 0.1);
		expect(ctrl.isActive()).toBe(true);

		advanceOneFrame();
		advanceOneFrame();

		expect(onStep2).toHaveBeenCalledTimes(2);
		const [dx1] = onStep2.mock.calls[0] as [number, number];
		const [dx2] = onStep2.mock.calls[1] as [number, number];
		expect(Math.abs(dx2)).toBeLessThan(Math.abs(dx1));
		// Decay ratio consistent with the passed friction.
		expect(dx2 / dx1).toBeCloseTo(0.92, 6);
	});
});
