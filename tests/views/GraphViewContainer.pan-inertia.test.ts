import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InertiaPan } from "../../src/views/inertia-pan";

// --- Fake rAF driver ---------------------------------------------------------
// Manual frame control via flushRaf(). Same pattern as
// tests/pan-inertia-zoom-step-integration.test.ts.
let rafQueue: Array<() => void> = [];
let nextRafId = 1;
const cancelled = new Set<number>();
const cancelSpy = vi.fn((id: number) => {
	cancelled.add(id);
});

vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
	const id = nextRafId++;
	rafQueue.push(() => {
		if (!cancelled.has(id)) cb();
	});
	return id;
});
vi.stubGlobal("cancelAnimationFrame", cancelSpy);

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

// --- Minimal harness -----------------------------------------------------------
// Mirrors the planned GraphViewContainer pointerup/pointerdown rAF contract
// (see task 485-477). Uses InertiaPan as the pure applyPanInertia function
// and tracks _panInertiaRafId lifecycle. GraphViewContainer.ts is not modified
// (God Object Policy).
class PanInertiaHarness {
	panX = 0;
	panY = 0;
	_panInertiaRafId: number | null = null;
	scheduleRender = vi.fn();
	pan: InertiaPan;

	constructor(enableInertia = true) {
		this.pan = new InertiaPan(enableInertia, (dx, dy) => {
			this.panX += dx;
			this.panY += dy;
		});
	}

	pointerup(): void {
		const loop = () => {
			const running = this.pan.tick();
			this.scheduleRender("pan-inertia");
			if (!running) {
				if (this._panInertiaRafId !== null) {
					cancelAnimationFrame(this._panInertiaRafId);
					this._panInertiaRafId = null;
				}
				return;
			}
			this._panInertiaRafId = requestAnimationFrame(loop);
		};
		this._panInertiaRafId = requestAnimationFrame(loop);
	}

	pointerdown(): void {
		if (this._panInertiaRafId !== null) {
			cancelAnimationFrame(this._panInertiaRafId);
			this._panInertiaRafId = null;
		}
		this.pan.cancel();
	}
}

describe("GraphViewContainer pan-inertia rAF loop", () => {
	beforeEach(() => {
		rafQueue = [];
		nextRafId = 1;
		cancelled.clear();
		cancelSpy.mockClear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// --- subtask-2: case 4 ----------------------------------------------------
	// rAF loop calls applyPanInertia each frame and panX/panY update.
	it("case 4: panX/panY update on each rAF frame (multi-frame progression)", () => {
		const h = new PanInertiaHarness(true);
		h.pan.trackPointer(0, 0, 0);
		h.pan.trackPointer(100, 50, 50);
		h.pan.release();
		h.pointerup();

		// Advance one frame — first applyDelta fires.
		const before = { x: h.panX, y: h.panY };
		const b1 = rafQueue;
		rafQueue = [];
		for (const cb of b1) cb();
		expect(h.panX).not.toBe(before.x);
		expect(h.panY).not.toBe(before.y);

		// Advance another frame — deltas continue (velocity decays by FRICTION).
		const afterF1 = { x: h.panX, y: h.panY };
		const b2 = rafQueue;
		rafQueue = [];
		for (const cb of b2) cb();
		expect(h.panX).not.toBe(afterF1.x);
		expect(h.panY).not.toBe(afterF1.y);

		// Frame-to-frame dx monotonically shrinks (FRICTION < 1).
		const dx1 = afterF1.x - before.x;
		const dx2 = h.panX - afterF1.x;
		expect(Math.abs(dx2)).toBeLessThan(Math.abs(dx1));
	});

	// --- subtask-2: case 5 ----------------------------------------------------
	// settled===true (tick returns false) → cancelAnimationFrame invoked and
	// _panInertiaRafId returns to null.
	it("case 5: on settle, cancelAnimationFrame fires and _panInertiaRafId is null", () => {
		const h = new PanInertiaHarness(true);
		h.pan.trackPointer(0, 0, 0);
		// tiny delta → first tick decays below MIN_VELOCITY → settles immediately.
		h.pan.trackPointer(0.01, 0, 50);
		h.pan.release();
		h.pointerup();
		expect(h._panInertiaRafId).not.toBeNull();

		flushRaf();

		expect(cancelSpy).toHaveBeenCalled();
		expect(h._panInertiaRafId).toBeNull();
		expect(h.pan.isActive()).toBe(false);
	});

	// --- subtask-2: case 6 ----------------------------------------------------
	// Next pointerdown cancels in-progress rAF (duplicate-launch prevention):
	// old rafId is passed to cancelAnimationFrame and a subsequent new rAF
	// launch gets a different id.
	it("case 6: next pointerdown cancels in-flight rAF; a new rAF gets a fresh id", () => {
		const h = new PanInertiaHarness(true);
		h.pan.trackPointer(0, 0, 0);
		h.pan.trackPointer(200, 0, 50);
		h.pan.release();
		h.pointerup();
		const firstRafId = h._panInertiaRafId;
		expect(firstRafId).not.toBeNull();

		// Simulate next pointerdown — cancel in-progress rAF.
		h.pointerdown();
		expect(cancelSpy).toHaveBeenCalledWith(firstRafId);
		expect(h._panInertiaRafId).toBeNull();
		// Pending rAF callbacks from the cancelled id must not re-apply deltas.
		const panXAtCancel = h.panX;
		flushRaf();
		expect(h.panX).toBe(panXAtCancel);

		// New interaction → new rAF id (must differ from the cancelled one).
		h.pan.trackPointer(0, 0, 100);
		h.pan.trackPointer(100, 0, 150);
		h.pan.release();
		h.pointerup();
		expect(h._panInertiaRafId).not.toBe(firstRafId);
		expect(h._panInertiaRafId).not.toBeNull();
	});
});
