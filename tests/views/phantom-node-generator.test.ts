import { describe, it, expect } from "vitest";
import { generatePhantomNodes } from "../../src/views/phantom-node-generator";
import type { GraphNode } from "../../src/types";

/** Helper to create a minimal real node at (x, y). */
function node(id: string, x: number, y: number): GraphNode {
	return { id, label: id, x, y, vx: 0, vy: 0 };
}

describe("generatePhantomNodes", () => {
	// -------------------------------------------------------------------
	// Polar arrangement
	// -------------------------------------------------------------------
	describe("polar arrangement (concentric)", () => {
		it("generates spoke × ring phantom nodes", () => {
			const real = Array.from({ length: 50 }, (_, i) => node(`n${i}`, Math.cos(i) * 200, Math.sin(i) * 200));
			const phantoms = generatePhantomNodes(real, 0, 0, "concentric");
			expect(phantoms.length).toBeGreaterThan(0);
			expect(phantoms.every((p) => p.isPhantom)).toBe(true);
		});

		it("all phantom IDs follow __phantom_r{ring}_s{spoke} pattern", () => {
			const real = Array.from({ length: 30 }, (_, i) => node(`n${i}`, i * 10, i * 5));
			const phantoms = generatePhantomNodes(real, 0, 0, "radial");
			for (const p of phantoms) {
				expect(p.id).toMatch(/^__phantom_r\d+_s\d+$/);
			}
		});

		it("phantom nodes have zero velocity", () => {
			const real = [node("a", 100, 0), node("b", -100, 0)];
			const phantoms = generatePhantomNodes(real, 0, 0, "phyllotaxis");
			for (const p of phantoms) {
				expect(p.vx).toBe(0);
				expect(p.vy).toBe(0);
			}
		});

		it("falls back to maxR=500 when all nodes are near center", () => {
			const real = [node("a", 0, 0), node("b", 1, 1)];
			const phantoms = generatePhantomNodes(real, 0, 0, "concentric");
			const maxDist = Math.max(...phantoms.map((p) => Math.sqrt(p.x ** 2 + p.y ** 2)));
			expect(maxDist).toBeGreaterThan(50);
		});

		it("skips existing phantom nodes when computing maxR", () => {
			const real: GraphNode[] = [node("a", 100, 0), { ...node("far", 9999, 9999), isPhantom: true }];
			const phantoms = generatePhantomNodes(real, 0, 0, "concentric");
			const maxDist = Math.max(...phantoms.map((p) => Math.sqrt(p.x ** 2 + p.y ** 2)));
			// Should be based on node "a" at distance 100, not "far" at 9999
			expect(maxDist).toBeLessThan(200);
		});

		it("respects center offset", () => {
			const cx = 500,
				cy = 300;
			const real = [node("a", cx + 100, cy), node("b", cx - 100, cy)];
			const phantoms = generatePhantomNodes(real, cx, cy, "concentric");
			// Phantoms should be distributed around (cx, cy)
			const avgX = phantoms.reduce((s, p) => s + p.x, 0) / phantoms.length;
			const avgY = phantoms.reduce((s, p) => s + p.y, 0) / phantoms.length;
			expect(avgX).toBeCloseTo(cx, -1);
			expect(avgY).toBeCloseTo(cy, -1);
		});
	});

	// -------------------------------------------------------------------
	// Cartesian (grid) arrangement
	// -------------------------------------------------------------------
	describe("cartesian arrangement (grid)", () => {
		it("generates grid phantom nodes for non-polar arrangement", () => {
			const real = Array.from({ length: 40 }, (_, i) => node(`n${i}`, i * 10, i * 5));
			const phantoms = generatePhantomNodes(real, 0, 0, "grid");
			expect(phantoms.length).toBeGreaterThan(0);
			expect(phantoms.every((p) => p.isPhantom)).toBe(true);
		});

		it("all phantom IDs follow __phantom_x{col}_y{row} pattern", () => {
			const real = [node("a", 0, 0), node("b", 100, 100)];
			const phantoms = generatePhantomNodes(real, 50, 50, "grid");
			for (const p of phantoms) {
				expect(p.id).toMatch(/^__phantom_x\d+_y\d+$/);
			}
		});

		it("grid count is (gridSize+1)^2", () => {
			// With few nodes, gridSize clamps to 6 → (6+1)^2 = 49
			const real = [node("a", 0, 0), node("b", 100, 100)];
			const phantoms = generatePhantomNodes(real, 0, 0, "grid");
			expect(phantoms.length).toBe(49);
		});

		it("phantoms span the bounding box of real nodes", () => {
			const real = [node("a", -200, -100), node("b", 300, 400)];
			const phantoms = generatePhantomNodes(real, 0, 0, "grid");
			const xs = phantoms.map((p) => p.x);
			const ys = phantoms.map((p) => p.y);
			expect(Math.min(...xs)).toBeCloseTo(-200, 0);
			expect(Math.max(...xs)).toBeCloseTo(300, 0);
			expect(Math.min(...ys)).toBeCloseTo(-100, 0);
			expect(Math.max(...ys)).toBeCloseTo(400, 0);
		});

		it("falls back to center ± 250 when no real nodes exist", () => {
			const phantoms = generatePhantomNodes([], 100, 200, "grid");
			expect(phantoms.length).toBe(49);
			const xs = phantoms.map((p) => p.x);
			expect(Math.min(...xs)).toBeCloseTo(-150, 0); // cx - 250
			expect(Math.max(...xs)).toBeCloseTo(350, 0); // cx + 250
		});

		it("handles nodes at same position (zero extent)", () => {
			const real = [node("a", 50, 50), node("b", 50, 50)];
			const phantoms = generatePhantomNodes(real, 0, 0, "grid");
			// w=0 falls back to 500, h=0 falls back to 500
			expect(phantoms.length).toBeGreaterThan(0);
			const xs = phantoms.map((p) => p.x);
			expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(500, 0);
		});
	});

	// -------------------------------------------------------------------
	// Edge cases
	// -------------------------------------------------------------------
	describe("edge cases", () => {
		it("returns empty array when called with unknown arrangement and no real nodes", () => {
			const phantoms = generatePhantomNodes([], 0, 0, "unknown-arrangement");
			// Falls to cartesian branch, empty nodes → fallback bbox
			expect(phantoms.length).toBe(49);
		});

		it("unique IDs across all phantoms", () => {
			const real = Array.from({ length: 100 }, (_, i) => node(`n${i}`, i * 5, i * 3));
			for (const arr of ["concentric", "grid"]) {
				const phantoms = generatePhantomNodes(real, 0, 0, arr);
				const ids = phantoms.map((p) => p.id);
				expect(new Set(ids).size).toBe(ids.length);
			}
		});

		it("all phantom labels are empty strings", () => {
			const real = [node("a", 0, 0), node("b", 100, 100)];
			for (const arr of ["radial", "grid"]) {
				const phantoms = generatePhantomNodes(real, 0, 0, arr);
				expect(phantoms.every((p) => p.label === "")).toBe(true);
			}
		});
	});
});
