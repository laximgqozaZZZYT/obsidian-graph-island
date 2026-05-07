import { describe, it, expect } from "vitest";
import { SpatialHashGrid, type Rect } from "../src/utils/spatial-grid";

function r(x: number, y: number, w: number, h: number): Rect {
	return { x, y, w, h };
}

describe("SpatialHashGrid", () => {
	// --- insert + checkOverlap ---
	it("empty grid has no overlaps", () => {
		const g = new SpatialHashGrid();
		expect(g.checkOverlap(r(0, 0, 10, 10))).toBe(false);
	});

	it("detects overlap between two rects", () => {
		const g = new SpatialHashGrid();
		g.insert(r(0, 0, 50, 50));
		expect(g.checkOverlap(r(25, 25, 50, 50))).toBe(true);
	});

	it("non-overlapping rects return false", () => {
		const g = new SpatialHashGrid();
		g.insert(r(0, 0, 10, 10));
		expect(g.checkOverlap(r(100, 100, 10, 10))).toBe(false);
	});

	it("adjacent rects (touching edge) return false", () => {
		const g = new SpatialHashGrid();
		g.insert(r(0, 0, 10, 10));
		// rect starts exactly where first one ends
		expect(g.checkOverlap(r(10, 0, 10, 10))).toBe(false);
	});

	it("margin extends overlap detection", () => {
		const g = new SpatialHashGrid(200, 5);
		g.insert(r(0, 0, 10, 10));
		// Without margin: no overlap (gap of 2px). With 5px margin: overlap
		expect(g.checkOverlap(r(12, 0, 10, 10))).toBe(true);
	});

	// --- multiple rects ---
	it("handles many rects without false negatives", () => {
		const g = new SpatialHashGrid(50);
		// Insert 10 non-overlapping rects
		for (let i = 0; i < 10; i++) {
			g.insert(r(i * 100, 0, 50, 50));
		}
		// Check overlap at position of rect #5
		expect(g.checkOverlap(r(500, 0, 50, 50))).toBe(true);
		// Check no overlap at empty position
		expect(g.checkOverlap(r(550, 100, 10, 10))).toBe(false);
	});

	// --- forEachNear ---
	it("forEachNear finds rects within radius", () => {
		const g = new SpatialHashGrid(100);
		g.insert(r(50, 50, 10, 10));
		g.insert(r(500, 500, 10, 10));
		const found: Rect[] = [];
		g.forEachNear(55, 55, 50, (rect) => found.push(rect));
		expect(found).toHaveLength(1);
		expect(found[0].x).toBe(50);
	});

	it("forEachNear returns empty for distant point", () => {
		const g = new SpatialHashGrid(100);
		g.insert(r(0, 0, 10, 10));
		const found: Rect[] = [];
		g.forEachNear(1000, 1000, 50, (rect) => found.push(rect));
		expect(found).toHaveLength(0);
	});

	it("forEachNear deduplicates rects spanning multiple cells", () => {
		const g = new SpatialHashGrid(50);
		// Large rect spans multiple cells
		g.insert(r(0, 0, 200, 200));
		const found: Rect[] = [];
		g.forEachNear(100, 100, 200, (rect) => found.push(rect));
		// Should only appear once despite spanning many cells
		expect(found).toHaveLength(1);
	});

	// --- clear ---
	it("clear removes all rects", () => {
		const g = new SpatialHashGrid();
		g.insert(r(0, 0, 10, 10));
		expect(g.checkOverlap(r(5, 5, 10, 10))).toBe(true);
		g.clear();
		expect(g.checkOverlap(r(5, 5, 10, 10))).toBe(false);
		expect(g.cellCount).toBe(0);
	});

	// --- cellCount ---
	it("cellCount reflects inserted rects", () => {
		const g = new SpatialHashGrid(100);
		expect(g.cellCount).toBe(0);
		g.insert(r(0, 0, 10, 10));
		expect(g.cellCount).toBeGreaterThan(0);
	});

	// --- edge cases ---
	it("handles zero-size rects (no AABB overlap)", () => {
		const g = new SpatialHashGrid();
		g.insert(r(50, 50, 0, 0));
		// Zero-size rects have no area, so AABB overlap is false
		expect(g.checkOverlap(r(50, 50, 0, 0))).toBe(false);
		// But with margin, they overlap
		const g2 = new SpatialHashGrid(200, 1);
		g2.insert(r(50, 50, 0, 0));
		expect(g2.checkOverlap(r(50, 50, 0, 0))).toBe(true);
	});

	it("handles negative coordinates", () => {
		const g = new SpatialHashGrid(100);
		g.insert(r(-500, -500, 10, 10));
		expect(g.checkOverlap(r(-500, -500, 10, 10))).toBe(true);
		expect(g.checkOverlap(r(0, 0, 10, 10))).toBe(false);
	});

	it("handles very large coordinates", () => {
		const g = new SpatialHashGrid(100);
		g.insert(r(100000, 100000, 10, 10));
		expect(g.checkOverlap(r(100005, 100005, 10, 10))).toBe(true);
	});

	// --- defensive insert guards ---
	describe("insert guards against pathological rects", () => {
		it("skips rects with NaN width or height", () => {
			const g = new SpatialHashGrid();
			g.insert(r(0, 0, NaN, 10));
			g.insert(r(0, 0, 10, NaN));
			expect(g.cellCount).toBe(0);
		});

		it("skips rects with Infinity width or height", () => {
			const g = new SpatialHashGrid();
			g.insert(r(0, 0, Infinity, 10));
			g.insert(r(0, 0, 10, Infinity));
			expect(g.cellCount).toBe(0);
		});

		it("skips rects spanning > MAX_CELLS_PER_INSERT cells (would overflow Map)", () => {
			const g = new SpatialHashGrid(200);
			// 1,000,000 px square / 200 cellSize = 5000 cells per dim → 25M cells
			// Without the guard this would call Map.set 25M times and likely OOM.
			g.insert(r(0, 0, 1_000_000, 1_000_000));
			expect(g.cellCount).toBe(0);
		});

		it("still accepts large but bounded rects within the cap", () => {
			const g = new SpatialHashGrid(200);
			// 10000×10000 px / 200 = 50×50 cells = 2500 cells, well under cap
			g.insert(r(0, 0, 10000, 10000));
			expect(g.cellCount).toBeGreaterThan(0);
		});
	});
});
