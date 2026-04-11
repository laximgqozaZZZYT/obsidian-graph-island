import { describe, it, expect, vi } from "vitest";
import { InertiaPan, FRICTION } from "../../src/views/inertia-pan";

describe("InertiaPan", () => {
	const noop = () => {};

	describe("trackPointer + release", () => {
		it("computes velocity vector from pointer history", () => {
			const pan = new InertiaPan(true, noop);
			pan.trackPointer(100, 200, 0);
			pan.trackPointer(160, 230, 50);
			const vel = pan.release();
			const msPerFrame = 1000 / 60;
			expect(vel.vx).toBeCloseTo((60 / 50) * msPerFrame, 5);
			expect(vel.vy).toBeCloseTo((30 / 50) * msPerFrame, 5);
		});

		it("returns zero velocity with fewer than 2 samples", () => {
			const pan = new InertiaPan(true, noop);
			pan.trackPointer(100, 200, 0);
			const vel = pan.release();
			expect(vel.vx).toBe(0);
			expect(vel.vy).toBe(0);
		});

		it("returns zero velocity with zero time delta", () => {
			const pan = new InertiaPan(true, noop);
			pan.trackPointer(100, 200, 50);
			pan.trackPointer(160, 230, 50);
			const vel = pan.release();
			expect(vel.vx).toBe(0);
			expect(vel.vy).toBe(0);
		});

		it("discards samples older than 100ms", () => {
			const pan = new InertiaPan(true, noop);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 0, 50);
			pan.trackPointer(200, 0, 150);
			const vel = pan.release();
			const msPerFrame = 1000 / 60;
			expect(vel.vx).toBeCloseTo((100 / 100) * msPerFrame, 5);
		});
	});

	describe("tick", () => {
		it("decays velocity by FRICTION each tick", () => {
			const deltas: { dx: number; dy: number }[] = [];
			const pan = new InertiaPan(true, (dx, dy) => deltas.push({ dx, dy }));
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 0, 50);
			pan.release();

			pan.tick(1);
			const firstDx = deltas[0].dx;
			pan.tick(1);
			const secondDx = deltas[1].dx;
			expect(secondDx).toBeCloseTo(firstDx * FRICTION, 5);
		});

		it("returns true while velocity is above threshold", () => {
			const pan = new InertiaPan(true, noop);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 0, 50);
			pan.release();
			expect(pan.tick(1)).toBe(true);
		});

		it("returns false when velocity drops below MIN_VELOCITY", () => {
			const pan = new InertiaPan(true, noop);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(0.1, 0, 50);
			pan.release();
			let running = true;
			let iterations = 0;
			while (running && iterations < 200) {
				running = pan.tick(1);
				iterations++;
			}
			expect(running).toBe(false);
		});

		it("returns false when not active", () => {
			const pan = new InertiaPan(true, noop);
			expect(pan.tick(1)).toBe(false);
		});

		it("calls applyDelta with current velocity", () => {
			const applyDelta = vi.fn();
			const pan = new InertiaPan(true, applyDelta);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 50, 50);
			pan.release();
			pan.tick(1);
			expect(applyDelta).toHaveBeenCalledTimes(1);
			expect(applyDelta.mock.calls[0][0]).not.toBe(0);
			expect(applyDelta.mock.calls[0][1]).not.toBe(0);
		});
	});

	describe("cancel", () => {
		it("stops inertia immediately", () => {
			const applyDelta = vi.fn();
			const pan = new InertiaPan(true, applyDelta);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 0, 50);
			pan.release();
			pan.cancel();
			expect(pan.tick(1)).toBe(false);
			expect(pan.isActive()).toBe(false);
		});
	});

	describe("enableInertia=false", () => {
		it("release returns zero velocity", () => {
			const pan = new InertiaPan(false, noop);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 0, 50);
			const vel = pan.release();
			expect(vel.vx).toBe(0);
			expect(vel.vy).toBe(0);
		});

		it("tick returns false after release", () => {
			const pan = new InertiaPan(false, noop);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(100, 0, 50);
			pan.release();
			expect(pan.tick(1)).toBe(false);
		});
	});

	describe("convergence", () => {
		it("eventually stops after enough ticks", () => {
			const pan = new InertiaPan(true, noop);
			pan.trackPointer(0, 0, 0);
			pan.trackPointer(500, 300, 50);
			pan.release();
			let count = 0;
			while (pan.tick(1)) count++;
			expect(count).toBeGreaterThan(0);
			expect(count).toBeLessThan(300);
			expect(pan.isActive()).toBe(false);
		});
	});
});
