import { describe, it, expect } from "vitest";
import {
	minimapDotRadius,
	clampViewportRect,
	MINIMAP_WIDTH,
	MINIMAP_HEIGHT,
	MINIMAP_LARGE_GRAPH_THRESHOLD,
	MINIMAP_MEDIUM_GRAPH_THRESHOLD,
	MINIMAP_DOT_SCALE_LARGE,
	MINIMAP_DOT_SCALE_MEDIUM,
	MINIMAP_VIEWPORT_MIN_SIZE,
} from "../src/views/Minimap";

// ---------------------------------------------------------------------------
// minimapDotRadius — pure function, three-tier scale based on node count
// ---------------------------------------------------------------------------

describe("minimapDotRadius", () => {
	const baseR = 2.5;

	it("returns base radius for small graphs (≤ medium threshold)", () => {
		expect(minimapDotRadius(0, baseR)).toBe(baseR);
		expect(minimapDotRadius(100, baseR)).toBe(baseR);
		expect(minimapDotRadius(MINIMAP_MEDIUM_GRAPH_THRESHOLD, baseR)).toBe(baseR);
	});

	it("scales down by medium multiplier just above the medium threshold", () => {
		const r = minimapDotRadius(MINIMAP_MEDIUM_GRAPH_THRESHOLD + 1, baseR);
		expect(r).toBeCloseTo(baseR * MINIMAP_DOT_SCALE_MEDIUM);
	});

	it("uses medium scale for graphs between medium and large thresholds", () => {
		const r = minimapDotRadius(1500, baseR);
		expect(r).toBeCloseTo(baseR * MINIMAP_DOT_SCALE_MEDIUM);
	});

	it("returns medium-scaled radius at the large threshold (boundary is exclusive)", () => {
		const r = minimapDotRadius(MINIMAP_LARGE_GRAPH_THRESHOLD, baseR);
		expect(r).toBeCloseTo(baseR * MINIMAP_DOT_SCALE_MEDIUM);
	});

	it("scales down by large multiplier just above the large threshold", () => {
		const r = minimapDotRadius(MINIMAP_LARGE_GRAPH_THRESHOLD + 1, baseR);
		expect(r).toBeCloseTo(baseR * MINIMAP_DOT_SCALE_LARGE);
	});

	it("uses large scale for very large graphs", () => {
		const r = minimapDotRadius(10_000, baseR);
		expect(r).toBeCloseTo(baseR * MINIMAP_DOT_SCALE_LARGE);
	});

	it("preserves the multiplicative relationship for arbitrary base radii", () => {
		expect(minimapDotRadius(50_000, 4)).toBeCloseTo(4 * MINIMAP_DOT_SCALE_LARGE);
		expect(minimapDotRadius(750, 4)).toBeCloseTo(4 * MINIMAP_DOT_SCALE_MEDIUM);
		expect(minimapDotRadius(50, 4)).toBe(4);
	});

	it("returns zero when base radius is zero", () => {
		expect(minimapDotRadius(50_000, 0)).toBe(0);
		expect(minimapDotRadius(0, 0)).toBe(0);
	});

	it("orders the tiers so larger graphs always shrink dots", () => {
		const small = minimapDotRadius(10, baseR);
		const med = minimapDotRadius(1000, baseR);
		const large = minimapDotRadius(5000, baseR);
		expect(small).toBeGreaterThanOrEqual(med);
		expect(med).toBeGreaterThanOrEqual(large);
	});
});

// ---------------------------------------------------------------------------
// clampViewportRect — viewport rectangle clamping + visibility predicate
// ---------------------------------------------------------------------------

/**
 * Build identity-style projection helpers so the world-coordinate inputs
 * map directly to minimap pixel positions for predictable assertions.
 */
function identityProjection(scale = 1) {
	return {
		toMx: (wx: number) => wx * scale,
		toMy: (wy: number) => wy * scale,
		scale,
	};
}

describe("clampViewportRect", () => {
	it("returns the unmodified rect when fully inside the minimap", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(20, 20, 40, 30, toMx, toMy, scale);
		expect(r).toEqual({ rx: 20, ry: 20, rw: 40, rh: 30 });
	});

	it("clamps the left edge when the viewport extends off the left side", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(-10, 20, 40, 30, toMx, toMy, scale);
		expect(r).not.toBeNull();
		expect(r!.rx).toBe(0);
		expect(r!.rw).toBe(30); // 40 + (-10)
	});

	it("clamps the top edge when the viewport extends off the top", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(20, -10, 40, 30, toMx, toMy, scale);
		expect(r).not.toBeNull();
		expect(r!.ry).toBe(0);
		expect(r!.rh).toBe(20); // 30 + (-10)
	});

	it("clamps the right edge when the viewport overflows to the right", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(MINIMAP_WIDTH - 10, 20, 50, 30, toMx, toMy, scale);
		expect(r).not.toBeNull();
		expect(r!.rx).toBe(MINIMAP_WIDTH - 10);
		expect(r!.rw).toBe(10);
	});

	it("clamps the bottom edge when the viewport overflows downward", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(20, MINIMAP_HEIGHT - 10, 30, 50, toMx, toMy, scale);
		expect(r).not.toBeNull();
		expect(r!.ry).toBe(MINIMAP_HEIGHT - 10);
		expect(r!.rh).toBe(10);
	});

	it("clamps simultaneously on all four sides for an oversized viewport", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(-50, -50, MINIMAP_WIDTH + 100, MINIMAP_HEIGHT + 100, toMx, toMy, scale);
		// When viewport covers the entire minimap with margins on all sides,
		// the function returns null because the rectangle would cover everything.
		expect(r).toBeNull();
	});

	it("returns null when the clamped width is below the visibility floor", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(20, 20, MINIMAP_VIEWPORT_MIN_SIZE - 0.5, 30, toMx, toMy, scale);
		expect(r).toBeNull();
	});

	it("returns null when the clamped height is below the visibility floor", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(20, 20, 30, MINIMAP_VIEWPORT_MIN_SIZE - 0.5, toMx, toMy, scale);
		expect(r).toBeNull();
	});

	it("returns null when the viewport exactly covers the entire minimap", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT, toMx, toMy, scale);
		expect(r).toBeNull();
	});

	it("returns a rect when the viewport is full-width but shorter than the minimap", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(0, 20, MINIMAP_WIDTH, 40, toMx, toMy, scale);
		expect(r).not.toBeNull();
		expect(r!.rw).toBe(MINIMAP_WIDTH);
		expect(r!.rh).toBe(40);
	});

	it("returns a rect when the viewport is full-height but narrower than the minimap", () => {
		const { toMx, toMy, scale } = identityProjection();
		const r = clampViewportRect(20, 0, 40, MINIMAP_HEIGHT, toMx, toMy, scale);
		expect(r).not.toBeNull();
		expect(r!.rh).toBe(MINIMAP_HEIGHT);
		expect(r!.rw).toBe(40);
	});

	it("scales viewport dimensions by the provided scale factor", () => {
		const { toMx, toMy, scale } = identityProjection(2); // world × 2 pixels
		// World viewport (5,5,30,20) → pixel (10,10,60,40)
		const r = clampViewportRect(5, 5, 30, 20, toMx, toMy, scale);
		expect(r).not.toBeNull();
		expect(r!.rx).toBe(10);
		expect(r!.ry).toBe(10);
		expect(r!.rw).toBe(60);
		expect(r!.rh).toBe(40);
	});

	it("uses world→minimap projection helpers (not raw inputs) for position", () => {
		// Projection adds a constant offset to verify rx/ry come from toMx/toMy,
		// not directly from world coordinates.
		const offsetX = 7;
		const offsetY = 9;
		const toMx = (wx: number) => wx + offsetX;
		const toMy = (wy: number) => wy + offsetY;
		const r = clampViewportRect(10, 10, 40, 30, toMx, toMy, 1);
		expect(r).not.toBeNull();
		expect(r!.rx).toBe(10 + offsetX);
		expect(r!.ry).toBe(10 + offsetY);
		expect(r!.rw).toBe(40);
		expect(r!.rh).toBe(30);
	});
});
