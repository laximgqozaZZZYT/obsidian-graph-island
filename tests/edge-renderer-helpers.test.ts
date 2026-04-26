import { describe, it, expect } from "vitest";
import { computeGraphCenter, computeGroupBBox, findNearestGap, findGapBetween } from "../src/views/EdgeRenderer";

// ---------------------------------------------------------------------------
// computeGraphCenter
// ---------------------------------------------------------------------------
describe("computeGraphCenter", () => {
	it("empty centroids → origin", () => {
		expect(computeGraphCenter(new Map())).toEqual({ x: 0, y: 0 });
	});

	it("single centroid → that point", () => {
		const c = new Map([["g1", { x: 10, y: 20 }]]);
		expect(computeGraphCenter(c)).toEqual({ x: 10, y: 20 });
	});

	it("multiple centroids → average", () => {
		const c = new Map([
			["g1", { x: 0, y: 0 }],
			["g2", { x: 10, y: 20 }],
			["g3", { x: 20, y: 40 }],
		]);
		expect(computeGraphCenter(c)).toEqual({ x: 10, y: 20 });
	});

	it("negative coordinates work", () => {
		const c = new Map([
			["a", { x: -10, y: -20 }],
			["b", { x: 10, y: 20 }],
		]);
		expect(computeGraphCenter(c)).toEqual({ x: 0, y: 0 });
	});
});

// ---------------------------------------------------------------------------
// computeGroupBBox
// ---------------------------------------------------------------------------
describe("computeGroupBBox", () => {
	const posMap = new Map([
		["n1", { x: 10, y: 20 }],
		["n2", { x: 50, y: 60 }],
		["n3", { x: 30, y: 40 }],
	]);
	const resolvePos = (id: string | object) => posMap.get(id as string) as any;
	const clusterMap = new Map([
		["n1", "A"],
		["n2", "A"],
		["n3", "B"],
	]);

	it("returns bbox for group with margin", () => {
		const bbox = computeGroupBBox("A", resolvePos, clusterMap, 5);
		expect(bbox).not.toBeNull();
		expect(bbox!.minX).toBe(10 - 5);
		expect(bbox!.minY).toBe(20 - 5);
		expect(bbox!.maxX).toBe(50 + 5);
		expect(bbox!.maxY).toBe(60 + 5);
	});

	it("single-node group returns bbox with margin", () => {
		const bbox = computeGroupBBox("B", resolvePos, clusterMap, 10);
		expect(bbox).not.toBeNull();
		expect(bbox!.minX).toBe(30 - 10);
		expect(bbox!.maxX).toBe(30 + 10);
	});

	it("non-existent group returns null", () => {
		expect(computeGroupBBox("Z", resolvePos, clusterMap, 5)).toBeNull();
	});

	it("margin=0 returns tight bbox", () => {
		const bbox = computeGroupBBox("A", resolvePos, clusterMap, 0);
		expect(bbox!.minX).toBe(10);
		expect(bbox!.maxX).toBe(50);
	});
});

// ---------------------------------------------------------------------------
// findNearestGap
// ---------------------------------------------------------------------------
describe("findNearestGap", () => {
	it("empty gaps → null", () => {
		expect(findNearestGap([], 5)).toBeNull();
	});

	it("single gap → returns it", () => {
		expect(findNearestGap([10], 50)).toBe(10);
	});

	it("returns closest gap", () => {
		expect(findNearestGap([10, 30, 50], 28)).toBe(30);
	});

	it("exact match", () => {
		expect(findNearestGap([10, 20, 30], 20)).toBe(20);
	});

	it("equidistant → returns first encountered", () => {
		// 15 is equidistant from 10 and 20; iteration order returns 10
		const result = findNearestGap([10, 20], 15);
		expect(result === 10 || result === 20).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// findGapBetween
// ---------------------------------------------------------------------------
describe("findGapBetween", () => {
	it("empty gaps → null", () => {
		expect(findGapBetween([], 0, 100)).toBeNull();
	});

	it("gap strictly between a and b → returns it", () => {
		expect(findGapBetween([5, 15, 25, 35], 10, 30)).toBe(15);
	});

	it("prefers gap closest to midpoint", () => {
		// midpoint of 10-30 is 20; 19 is closer than 25
		expect(findGapBetween([19, 25], 10, 30)).toBe(19);
	});

	it("no gap strictly between → falls back to nearest overall", () => {
		// gaps at 5 and 35; nothing between 10-30 (strict +1/-1 check)
		const result = findGapBetween([5, 35], 10, 30);
		expect(result).not.toBeNull();
		// Falls back to findNearestGap(gaps, midpoint=20) → 5 is closer than 35
		expect(result).toBe(5);
	});

	it("order of a and b doesn't matter", () => {
		const r1 = findGapBetween([15, 25], 10, 30);
		const r2 = findGapBetween([15, 25], 30, 10);
		expect(r1).toBe(r2);
	});
});
