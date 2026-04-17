import { describe, it, expect } from "vitest";
import {
	convexHull,
	computeBoundingBox,
	computeBBoxWithCentroid,
	clamp,
	rectsOverlap,
	magnitude,
	hitTestAggregateRegions,
	computeGroupMemberBounds,
} from "../src/utils/geometry";
import type { AggregateHitRegion } from "../src/utils/geometry";

describe("convexHull", () => {
	it("returns empty for no points", () => {
		expect(convexHull([])).toEqual([]);
	});

	it("returns single point unchanged", () => {
		expect(convexHull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
	});

	it("returns two points unchanged", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
		];
		expect(convexHull(pts)).toEqual(pts);
	});

	it("computes triangle hull", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 2, y: 3 },
		];
		const hull = convexHull(pts);
		expect(hull).toHaveLength(3);
		// All input points should be on the hull
		for (const p of pts) {
			expect(hull).toContainEqual(p);
		}
	});

	it("excludes interior points", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 4 },
			{ x: 0, y: 4 },
			{ x: 2, y: 2 }, // interior
		];
		const hull = convexHull(pts);
		expect(hull).toHaveLength(4);
		expect(hull).not.toContainEqual({ x: 2, y: 2 });
	});

	it("handles collinear points", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 2, y: 0 },
		];
		const hull = convexHull(pts);
		expect(hull.length).toBeLessThanOrEqual(3);
		expect(hull).toContainEqual({ x: 0, y: 0 });
		expect(hull).toContainEqual({ x: 2, y: 0 });
	});

	it("handles duplicate points", () => {
		const pts = [
			{ x: 1, y: 1 },
			{ x: 1, y: 1 },
			{ x: 3, y: 3 },
			{ x: 3, y: 3 },
		];
		const hull = convexHull(pts);
		expect(hull.length).toBeGreaterThanOrEqual(2);
	});
});

describe("computeBoundingBox", () => {
	it("computes bbox for multiple points", () => {
		const pts = [
			{ x: 1, y: 5 },
			{ x: -3, y: 2 },
			{ x: 4, y: -1 },
		];
		const bb = computeBoundingBox(pts);
		expect(bb).toEqual({ minX: -3, minY: -1, maxX: 4, maxY: 5 });
	});

	it("returns Infinity bounds for empty input", () => {
		const bb = computeBoundingBox([]);
		expect(bb.minX).toBe(Infinity);
		expect(bb.maxX).toBe(-Infinity);
	});

	it("handles single point", () => {
		const bb = computeBoundingBox([{ x: 7, y: 3 }]);
		expect(bb).toEqual({ minX: 7, minY: 3, maxX: 7, maxY: 3 });
	});
});

describe("computeBBoxWithCentroid", () => {
	it("computes bbox, centroid, and count", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 4, y: 0 },
			{ x: 4, y: 4 },
			{ x: 0, y: 4 },
		];
		const bb = computeBBoxWithCentroid(pts);
		expect(bb.minX).toBe(0);
		expect(bb.maxX).toBe(4);
		expect(bb.minY).toBe(0);
		expect(bb.maxY).toBe(4);
		expect(bb.cx).toBe(2);
		expect(bb.cy).toBe(2);
		expect(bb.count).toBe(4);
	});

	it("returns zero centroid for empty input", () => {
		const bb = computeBBoxWithCentroid([]);
		expect(bb.cx).toBe(0);
		expect(bb.cy).toBe(0);
		expect(bb.count).toBe(0);
	});
});

describe("clamp", () => {
	it("returns value when within range", () => {
		expect(clamp(5, 0, 10)).toBe(5);
	});

	it("clamps to min", () => {
		expect(clamp(-3, 0, 10)).toBe(0);
	});

	it("clamps to max", () => {
		expect(clamp(15, 0, 10)).toBe(10);
	});

	it("handles equal min and max", () => {
		expect(clamp(5, 3, 3)).toBe(3);
	});

	it("handles negative ranges", () => {
		expect(clamp(-5, -10, -2)).toBe(-5);
		expect(clamp(-15, -10, -2)).toBe(-10);
		expect(clamp(0, -10, -2)).toBe(-2);
	});
});

describe("convexHull — large scale", () => {
	it("computes hull for 1000 random points in <50ms", () => {
		const pts = Array.from({ length: 1000 }, () => ({
			x: Math.random() * 10000 - 5000,
			y: Math.random() * 10000 - 5000,
		}));
		const t0 = performance.now();
		const hull = convexHull(pts);
		const elapsed = performance.now() - t0;
		expect(elapsed).toBeLessThan(50);
		// Hull should be smaller than input
		expect(hull.length).toBeLessThanOrEqual(pts.length);
		expect(hull.length).toBeGreaterThanOrEqual(3);
	});

	it("hull vertices are in counter-clockwise order", () => {
		const pts = Array.from({ length: 200 }, (_, i) => ({
			x: Math.cos(i * 0.1) * 100 + Math.random() * 50,
			y: Math.sin(i * 0.1) * 100 + Math.random() * 50,
		}));
		const hull = convexHull(pts);
		// Shoelace formula: positive area = counter-clockwise
		let area = 0;
		for (let i = 0; i < hull.length; i++) {
			const j = (i + 1) % hull.length;
			area += hull[i].x * hull[j].y - hull[j].x * hull[i].y;
		}
		expect(area).toBeGreaterThanOrEqual(0); // CCW = positive
	});

	it("all input points are inside or on the hull", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 10, y: 0 },
			{ x: 10, y: 10 },
			{ x: 0, y: 10 },
			{ x: 5, y: 5 },
			{ x: 3, y: 7 },
			{ x: 8, y: 2 },
		];
		const hull = convexHull(pts);
		// All 4 corner points should be on hull
		expect(hull).toContainEqual({ x: 0, y: 0 });
		expect(hull).toContainEqual({ x: 10, y: 0 });
		expect(hull).toContainEqual({ x: 10, y: 10 });
		expect(hull).toContainEqual({ x: 0, y: 10 });
		// Interior points should NOT be on hull
		expect(hull).not.toContainEqual({ x: 5, y: 5 });
	});

	it("handles all-same-point input", () => {
		const pts = Array.from({ length: 50 }, () => ({ x: 7, y: 3 }));
		const hull = convexHull(pts);
		expect(hull.length).toBeLessThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// rectsOverlap — AABB collision detection
// ---------------------------------------------------------------------------
describe("rectsOverlap", () => {
	it("detects overlapping rectangles", () => {
		const a = { x: 0, y: 0, w: 10, h: 10 };
		const b = { x: 5, y: 5, w: 10, h: 10 };
		expect(rectsOverlap(a, b)).toBe(true);
	});

	it("returns false for non-overlapping (side by side)", () => {
		const a = { x: 0, y: 0, w: 10, h: 10 };
		const b = { x: 20, y: 0, w: 10, h: 10 };
		expect(rectsOverlap(a, b)).toBe(false);
	});

	it("returns false for non-overlapping (above/below)", () => {
		const a = { x: 0, y: 0, w: 10, h: 10 };
		const b = { x: 0, y: 20, w: 10, h: 10 };
		expect(rectsOverlap(a, b)).toBe(false);
	});

	it("returns false for touching edges (not overlapping)", () => {
		const a = { x: 0, y: 0, w: 10, h: 10 };
		const b = { x: 10, y: 0, w: 10, h: 10 }; // touching at x=10
		expect(rectsOverlap(a, b)).toBe(false);
	});

	it("detects containment (one inside the other)", () => {
		const outer = { x: 0, y: 0, w: 100, h: 100 };
		const inner = { x: 10, y: 10, w: 5, h: 5 };
		expect(rectsOverlap(outer, inner)).toBe(true);
		expect(rectsOverlap(inner, outer)).toBe(true);
	});

	it("zero-size rect inside another counts as overlap (degenerate point)", () => {
		const a = { x: 5, y: 5, w: 0, h: 0 };
		const b = { x: 0, y: 0, w: 10, h: 10 };
		expect(rectsOverlap(a, b)).toBe(true); // point at (5,5) inside b
	});

	it("zero-size rect outside another does not overlap", () => {
		const a = { x: 15, y: 15, w: 0, h: 0 };
		const b = { x: 0, y: 0, w: 10, h: 10 };
		expect(rectsOverlap(a, b)).toBe(false);
	});

	it("handles negative coordinates", () => {
		const a = { x: -10, y: -10, w: 15, h: 15 };
		const b = { x: -5, y: -5, w: 10, h: 10 };
		expect(rectsOverlap(a, b)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// magnitude — Euclidean distance
// ---------------------------------------------------------------------------
describe("magnitude", () => {
	it("returns 0 for zero vector", () => {
		expect(magnitude(0, 0)).toBe(0);
	});

	it("returns correct value for 3-4-5 triangle", () => {
		expect(magnitude(3, 4)).toBe(5);
	});

	it("handles negative deltas", () => {
		expect(magnitude(-3, -4)).toBe(5);
	});

	it("handles axis-aligned vectors", () => {
		expect(magnitude(7, 0)).toBe(7);
		expect(magnitude(0, 13)).toBe(13);
	});

	it("returns correct value for unit diagonal", () => {
		expect(magnitude(1, 1)).toBeCloseTo(Math.SQRT2, 10);
	});
});

// ---------------------------------------------------------------------------
// computeBBoxWithCentroid — additional edge cases
// ---------------------------------------------------------------------------
describe("computeBBoxWithCentroid edge cases", () => {
	it("single point: centroid equals point, count = 1", () => {
		const bb = computeBBoxWithCentroid([{ x: 42, y: -7 }]);
		expect(bb.cx).toBe(42);
		expect(bb.cy).toBe(-7);
		expect(bb.count).toBe(1);
		expect(bb.minX).toBe(42);
		expect(bb.maxX).toBe(42);
	});

	it("negative coordinates produce correct bounds", () => {
		const pts = [
			{ x: -10, y: -20 },
			{ x: -5, y: -3 },
		];
		const bb = computeBBoxWithCentroid(pts);
		expect(bb.minX).toBe(-10);
		expect(bb.minY).toBe(-20);
		expect(bb.maxX).toBe(-5);
		expect(bb.maxY).toBe(-3);
		expect(bb.cx).toBe(-7.5);
		expect(bb.cy).toBe(-11.5);
	});
});

// ---------------------------------------------------------------------------
// convexHull — concave shape
// ---------------------------------------------------------------------------
describe("convexHull concave shape", () => {
	it("L-shaped points: interior concave vertex removed", () => {
		// L-shape: (0,0), (2,0), (2,1), (1,1), (1,2), (0,2)
		// The concave vertex (1,1) should NOT be on the hull
		const pts = [
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
			{ x: 2, y: 1 },
			{ x: 1, y: 1 },
			{ x: 1, y: 2 },
			{ x: 0, y: 2 },
		];
		const hull = convexHull(pts);
		// Hull should be the rectangle (0,0)-(2,0)-(2,1) extended to cover (1,2)-(0,2)
		expect(hull.length).toBeLessThanOrEqual(5);
		// Interior point (1,1) should be excluded from hull
		const has11 = hull.some((p) => p.x === 1 && p.y === 1);
		expect(has11).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// clamp — NaN and Infinity edge cases
// ---------------------------------------------------------------------------
describe("clamp edge cases", () => {
	it("NaN value returns NaN (not silently clamped)", () => {
		expect(clamp(NaN, 0, 10)).toBeNaN();
	});

	it("Infinity is clamped to max", () => {
		expect(clamp(Infinity, 0, 10)).toBe(10);
	});

	it("-Infinity is clamped to min", () => {
		expect(clamp(-Infinity, 0, 10)).toBe(0);
	});
});

// =========================================================================
// convexHull — collinear + degenerate
// =========================================================================
describe("convexHull collinear points", () => {
	it("collinear horizontal points return endpoints", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 5, y: 0 },
			{ x: 10, y: 0 },
		];
		const hull = convexHull(pts);
		expect(hull.length).toBeLessThanOrEqual(3);
		expect(hull.length).toBeGreaterThanOrEqual(2);
	});

	it("collinear vertical points return endpoints", () => {
		const pts = [
			{ x: 0, y: 0 },
			{ x: 0, y: 5 },
			{ x: 0, y: 10 },
		];
		const hull = convexHull(pts);
		expect(hull.length).toBeGreaterThanOrEqual(2);
	});

	it("duplicate points produce valid hull", () => {
		const pts = [
			{ x: 5, y: 5 },
			{ x: 5, y: 5 },
			{ x: 5, y: 5 },
		];
		const hull = convexHull(pts);
		expect(hull.length).toBeGreaterThanOrEqual(1);
	});

	it("single point returns single point", () => {
		const hull = convexHull([{ x: 42, y: 99 }]);
		expect(hull).toHaveLength(1);
		expect(hull[0].x).toBe(42);
	});

	it("two points return both", () => {
		const hull = convexHull([
			{ x: 0, y: 0 },
			{ x: 10, y: 10 },
		]);
		expect(hull).toHaveLength(2);
	});
});

// =========================================================================
// magnitude edge cases
// =========================================================================
describe("magnitude edge cases", () => {
	it("zero vector = 0", () => {
		expect(magnitude(0, 0)).toBe(0);
	});

	it("unit vectors", () => {
		expect(magnitude(1, 0)).toBe(1);
		expect(magnitude(0, 1)).toBe(1);
	});

	it("3-4-5 triangle", () => {
		expect(magnitude(3, 4)).toBe(5);
	});

	it("negative components", () => {
		expect(magnitude(-3, -4)).toBe(5);
	});
});

// =========================================================================
// rectsOverlap edge cases
// =========================================================================
describe("rectsOverlap edge cases", () => {
	it("identical rects overlap", () => {
		const r = { x: 0, y: 0, w: 10, h: 10 };
		expect(rectsOverlap(r, r)).toBe(true);
	});

	it("zero-width rect does not overlap adjacent", () => {
		const a = { x: 0, y: 0, w: 0, h: 10 };
		const b = { x: 1, y: 0, w: 10, h: 10 };
		expect(rectsOverlap(a, b)).toBe(false);
	});
});

// =========================================================================
// hitTestAggregateRegions
// =========================================================================
describe("hitTestAggregateRegions", () => {
	const regions: AggregateHitRegion[] = [
		{ x: 0, y: 0, w: 100, h: 50, cx: 50, cy: 25, r: 30 },
		{ x: 200, y: 200, w: 80, h: 40, cx: 240, cy: 220, r: 25 },
	];

	it("returns null for empty regions", () => {
		expect(hitTestAggregateRegions(50, 25, [])).toBeNull();
	});

	it("matches point inside rectangular label area", () => {
		const hit = hitTestAggregateRegions(10, 10, regions);
		expect(hit).toBe(regions[0]);
	});

	it("matches point inside circular area but outside rect", () => {
		// Circle center (50,25) r=30 → point (50, 52) is outside rect (h=50) but inside circle
		const hit = hitTestAggregateRegions(50, 52, regions);
		expect(hit).toBe(regions[0]);
	});

	it("returns null for point outside all regions", () => {
		expect(hitTestAggregateRegions(150, 150, regions)).toBeNull();
	});

	it("returns first matching region when multiple could match", () => {
		const overlapping: AggregateHitRegion[] = [
			{ x: 0, y: 0, w: 100, h: 100, cx: 50, cy: 50, r: 60 },
			{ x: 0, y: 0, w: 100, h: 100, cx: 50, cy: 50, r: 60 },
		];
		const hit = hitTestAggregateRegions(50, 50, overlapping);
		expect(hit).toBe(overlapping[0]);
	});

	it("matches second region correctly", () => {
		const hit = hitTestAggregateRegions(210, 210, regions);
		expect(hit).toBe(regions[1]);
	});

	it("point on rect edge is inside", () => {
		// x=0 is >= hr.x(0) and <= hr.x+hr.w(100), y=0 same
		const hit = hitTestAggregateRegions(0, 0, regions);
		expect(hit).toBe(regions[0]);
	});

	it("point on circle boundary is inside", () => {
		// cx=50, cy=25, r=30. Point (80,25) → dx=30, dy=0 → 900 <= 900
		const hit = hitTestAggregateRegions(80, 25, regions);
		expect(hit).toBe(regions[0]);
	});
});

// =========================================================================
// computeGroupMemberBounds
// =========================================================================
describe("computeGroupMemberBounds", () => {
	const nodes = [
		{ data: { filePath: "folder/a.md", id: "folder/a.md", x: 10, y: 20 } },
		{ data: { filePath: "folder/b.md", id: "folder/b.md", x: 50, y: 60 } },
		{ data: { filePath: "other/c.md", id: "other/c.md", x: 100, y: 200 } },
		{ data: { filePath: "folder/sub/d.md", id: "folder/sub/d.md", x: 30, y: 40 } },
	];

	it("returns null when no members match", () => {
		expect(computeGroupMemberBounds(nodes, "nonexistent/", 50)).toBeNull();
	});

	it("computes padded bounds for matching members", () => {
		const bounds = computeGroupMemberBounds(nodes, "folder/", 50);
		expect(bounds).not.toBeNull();
		// members: (10,20), (50,60), (30,40) → bbox (10,20)-(50,60) + pad 50
		expect(bounds!.x).toBe(10 - 50);
		expect(bounds!.y).toBe(20 - 50);
		expect(bounds!.w).toBe(50 - 10 + 100);
		expect(bounds!.h).toBe(60 - 20 + 100);
	});

	it("single member produces point bbox with padding", () => {
		const bounds = computeGroupMemberBounds(nodes, "other/", 25);
		expect(bounds).not.toBeNull();
		expect(bounds!.x).toBe(100 - 25);
		expect(bounds!.y).toBe(200 - 25);
		expect(bounds!.w).toBe(50); // 0 + 2*25
		expect(bounds!.h).toBe(50);
	});

	it("matches by id prefix when filePath is undefined", () => {
		const nodesNoPath = [{ data: { id: "tag:foo", x: 5, y: 5 } }, { data: { id: "tag:bar", x: 15, y: 15 } }];
		const bounds = computeGroupMemberBounds(nodesNoPath, "tag:", 10);
		expect(bounds).not.toBeNull();
		expect(bounds!.x).toBe(-5);
		expect(bounds!.y).toBe(-5);
	});

	it("zero padding returns exact bounds", () => {
		const bounds = computeGroupMemberBounds(nodes, "folder/", 0);
		expect(bounds).not.toBeNull();
		expect(bounds!.x).toBe(10);
		expect(bounds!.y).toBe(20);
		expect(bounds!.w).toBe(40); // 50-10
		expect(bounds!.h).toBe(40); // 60-20
	});

	it("handles empty node list", () => {
		expect(computeGroupMemberBounds([], "folder/", 50)).toBeNull();
	});
});
