import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	computeGroupGap,
	effectiveRadius,
	estimateGroupRadius,
	estimateLabelExtent,
	estimateLabelWidth,
	getSpacing,
	nodeRadius,
	pairwiseGap,
	computeEffectiveColumnSpacing,
} from "../../src/layouts/cluster-force";
import type { GraphNode } from "../../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

describe("backlinkBucket", () => {
	it("returns '0' for deg=0", () => {
		expect(backlinkBucket(0)).toBe("0");
	});

	it("returns '1-2' for deg=1 (low degree boundary)", () => {
		expect(backlinkBucket(1)).toBe("1-2");
		expect(backlinkBucket(2)).toBe("1-2");
	});

	it("returns '3-5' for deg=5 (upper boundary of mid bucket)", () => {
		expect(backlinkBucket(3)).toBe("3-5");
		expect(backlinkBucket(5)).toBe("3-5");
	});

	it("returns '6-10' for deg within 6-10 range", () => {
		expect(backlinkBucket(6)).toBe("6-10");
		expect(backlinkBucket(10)).toBe("6-10");
	});

	it("returns '11+' for deg=20 (high-degree bucket)", () => {
		expect(backlinkBucket(11)).toBe("11+");
		expect(backlinkBucket(20)).toBe("11+");
	});

	it("handles negative deg by falling into '1-2' bucket (documents current behavior)", () => {
		// Negative values fail `deg === 0` but satisfy `deg <= 2`, landing in "1-2".
		expect(backlinkBucket(-1)).toBe("1-2");
		expect(backlinkBucket(-100)).toBe("1-2");
	});
});

describe("getSpacing", () => {
	it("returns 1.0 fallback when map is undefined", () => {
		expect(getSpacing("node-a", undefined)).toBe(1.0);
	});

	it("returns 1.0 fallback when map is empty", () => {
		expect(getSpacing("node-a", new Map())).toBe(1.0);
	});

	it("returns the mapped value for a valid key", () => {
		const map = new Map<string, number>([["node-a", 2.5]]);
		expect(getSpacing("node-a", map)).toBe(2.5);
	});

	it("returns 1.0 fallback for an invalid (missing) key", () => {
		const map = new Map<string, number>([["node-a", 2.5]]);
		expect(getSpacing("node-b", map)).toBe(1.0);
	});
});

describe("estimateGroupRadius", () => {
	it("returns 0 for an empty group (memberCount=0)", () => {
		// gap * sqrt(0) / 2 = 0, no super-node bonus
		expect(estimateGroupRadius(0, 8, 3, 3)).toBe(0);
	});

	it("returns a positive radius for a single node group", () => {
		const r = estimateGroupRadius(1, 8, 3, 3);
		// gap = 8*2*max(3,3) = 48, radius = 48*1/2 = 24
		expect(r).toBe(24);
	});

	it("grows monotonically with member count", () => {
		const r1 = estimateGroupRadius(1, 8, 3, 3);
		const r4 = estimateGroupRadius(4, 8, 3, 3);
		const r16 = estimateGroupRadius(16, 8, 3, 3);
		expect(r4).toBeGreaterThan(r1);
		expect(r16).toBeGreaterThan(r4);
	});

	it("inflates radius when super node (collapsedMembers) present", () => {
		const plain = makeNode("a");
		const superNode = makeNode("b", { collapsedMembers: ["x", "y", "z", "w"] });
		const rPlain = estimateGroupRadius(3, 8, 3, 3, undefined, [plain, plain, plain]);
		const rSuper = estimateGroupRadius(3, 8, 3, 3, undefined, [plain, plain, superNode]);
		expect(rSuper).toBeGreaterThan(rPlain);
	});
});

describe("pairwiseGap", () => {
	it("uses the larger radius as reference (r1 > r2)", () => {
		// max(20, 10) * 2 * 1.5 = 60
		expect(pairwiseGap(20, 10, 1.5)).toBe(60);
	});

	it("uses the larger radius as reference (r2 > r1)", () => {
		// max(10, 20) * 2 * 1.5 = 60 — symmetric in r1/r2
		expect(pairwiseGap(10, 20, 1.5)).toBe(60);
	});

	it("returns 0 when spacing is 0", () => {
		expect(pairwiseGap(15, 15, 0)).toBe(0);
	});

	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 2)).toBe(0);
	});

	it("scales linearly with spacing factor", () => {
		const a = pairwiseGap(10, 10, 1);
		const b = pairwiseGap(10, 10, 2);
		expect(b).toBeCloseTo(a * 2, 6);
	});
});

describe("computeGroupGap", () => {
	it("picks max(nodeSpacing, groupScale) — nodeSpacing wins", () => {
		// max(10,10) * 2 * max(3, 2) = 60
		expect(computeGroupGap(10, 3, 2)).toBe(60);
	});

	it("picks max(nodeSpacing, groupScale) — groupScale wins", () => {
		expect(computeGroupGap(10, 2, 3)).toBe(60);
	});

	it("equals pairwiseGap with uniform sizes", () => {
		expect(computeGroupGap(8, 3, 2)).toBe(pairwiseGap(8, 8, 3));
	});

	it("returns 0 when nodeSize is 0", () => {
		expect(computeGroupGap(0, 5, 5)).toBe(0);
	});
});

describe("nodeRadius", () => {
	it("returns minNodeRadius when nodeSize is below floor", () => {
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("returns nodeSize when above floor and sizeByDegree disabled", () => {
		expect(nodeRadius(30, 50, 18)).toBe(30);
	});

	it("uses minNodeRadius fallback for non-finite nodeSize", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
	});

	it("uses minNodeRadius fallback for non-positive nodeSize", () => {
		expect(nodeRadius(0, 0, 22)).toBe(22);
		expect(nodeRadius(-5, 0, 22)).toBe(22);
	});

	it("returns base radius when sizeByDegree is true but maxDegree is 0", () => {
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});

	it("returns base radius * 0.7 when sizeByDegree is true and degree is 0", () => {
		// degree=0 fails `degree > 0` guard, so scaling skipped → returns baseR
		expect(nodeRadius(20, 0, 18, 10, true)).toBe(20);
	});

	it("scales up with degree when sizeByDegree is true (max-degree node ≈ baseR * 2)", () => {
		// At degree=maxDegree, t=1, factor = 0.7 + 1 * 1.3 = 2.0
		expect(nodeRadius(20, 10, 18, 10, true)).toBeCloseTo(40, 6);
	});

	it("yields a value between 0.7×baseR and 2.0×baseR for non-trivial degrees", () => {
		const r = nodeRadius(20, 4, 18, 10, true);
		expect(r).toBeGreaterThan(20 * 0.7);
		expect(r).toBeLessThan(20 * 2.0);
	});
});

describe("effectiveRadius", () => {
	it("returns nodeRadius for plain nodes (no super, no content scale)", () => {
		const n = makeNode("a");
		expect(effectiveRadius(n, 25, 0)).toBe(25);
	});

	it("enforces minNodeRadius floor", () => {
		const n = makeNode("a");
		// nodeSize 5 below floor 18 → baseR = 18
		expect(effectiveRadius(n, 5, 0, 60, 18)).toBe(18);
	});

	it("inflates radius for super nodes proportional to sqrt(memberCount)", () => {
		const plain = makeNode("a");
		const superNode = makeNode("b", { collapsedMembers: ["x", "y", "z", "w"] });
		const rPlain = effectiveRadius(plain, 25, 0);
		const rSuper = effectiveRadius(superNode, 25, 0);
		// 25 * (1 + sqrt(4) * 0.5) = 25 * 2 = 50
		expect(rSuper).toBeCloseTo(50, 6);
		expect(rSuper).toBeGreaterThan(rPlain);
	});

	it("caps super-node radius at maxNodeRadius", () => {
		const huge = makeNode("h", { collapsedMembers: new Array(1000).fill("x") });
		// uncapped would be 25 * (1 + sqrt(1000) * 0.5) ≈ 420 — should be clamped to 60
		expect(effectiveRadius(huge, 25, 0, 60)).toBe(60);
	});

	it("treats maxNodeRadius=0 as Infinity (no cap)", () => {
		const huge = makeNode("h", { collapsedMembers: new Array(100).fill("x") });
		const capped = effectiveRadius(huge, 25, 0, 60);
		const uncapped = effectiveRadius(huge, 25, 0, 0);
		expect(uncapped).toBeGreaterThan(capped);
	});

	it("applies log-based content scale when cardContentScale > 0", () => {
		const n = makeNode("a", { bodyLength: 1000 });
		const flat = effectiveRadius(n, 25, 0, 200, 18, 0, false, 1000, 1000, 0);
		const scaled = effectiveRadius(n, 25, 0, 200, 18, 0, false, 1000, 1000, 1.0);
		// At bodyLength = maxBodyLength, t=1 → baseR *= 2
		expect(scaled).toBeCloseTo(flat * 2, 6);
	});

	it("ignores content scale when bodyLength is 0", () => {
		const n = makeNode("a", { bodyLength: 0 });
		const r = effectiveRadius(n, 25, 0, 200, 18, 0, false, 0, 1000, 1.0);
		expect(r).toBe(25);
	});

	it("enforces minNodeRadius floor for super nodes too", () => {
		const tiny = makeNode("t", { collapsedMembers: ["x"] });
		// Even after super-node multiplier, must stay >= minNodeRadius
		const r = effectiveRadius(tiny, 1, 0, 60, 30);
		expect(r).toBeGreaterThanOrEqual(30);
	});
});

describe("estimateLabelWidth", () => {
	it("uses label * 7px", () => {
		const n = makeNode("a", { label: "hello" });
		expect(estimateLabelWidth(n)).toBe(5 * 7);
	});

	it("falls back to id when label is empty string", () => {
		const n = makeNode("longish-id", { label: "" });
		expect(estimateLabelWidth(n)).toBe("longish-id".length * 7);
	});

	it("appends ' (N)' suffix length for super nodes", () => {
		const n = makeNode("a", { label: "x", collapsedMembers: ["m1", "m2", "m3"] });
		// "x".length + " (3)".length = 1 + 4 = 5; 5*7 = 35
		expect(estimateLabelWidth(n)).toBe(35);
	});

	it("super-node suffix grows with member-count digit count", () => {
		const small = makeNode("a", { label: "x", collapsedMembers: new Array(9).fill("m") });
		const big = makeNode("a", { label: "x", collapsedMembers: new Array(100).fill("m") });
		// " (9)" = 4 chars vs " (100)" = 6 chars → big - small = 2 chars × 7 = 14
		expect(estimateLabelWidth(big) - estimateLabelWidth(small)).toBe(14);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor is 0", () => {
		const n = makeNode("a", { label: "hello" });
		expect(estimateLabelExtent(n, 25, 5, 10, 0)).toBe(0);
	});

	it("returns 0 when labelSpacingFactor is negative", () => {
		const n = makeNode("a", { label: "hello" });
		expect(estimateLabelExtent(n, 25, 5, 10, -1)).toBe(0);
	});

	it("returns 0 when label is empty (after id fallback nullish)", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 25, 5, 10, 1)).toBe(0);
	});

	it("scales linearly with labelSpacingFactor", () => {
		const n = makeNode("a", { label: "hello" });
		const w1 = estimateLabelExtent(n, 25, 5, 10, 1);
		const w2 = estimateLabelExtent(n, 25, 5, 10, 2);
		expect(w2).toBeCloseTo(w1 * 2, 6);
	});

	it("maxDeg=0 yields fontMin font size (no importance scaling)", () => {
		const n = makeNode("a", { label: "x" });
		// importance = 0, fontSize = round(11 + 0*3) = 11
		// charW = 11 * 0.6 = 6.6, padX = 8, raw = 1*6.6 + 16 = 22.6, * 1 = 22.6
		expect(estimateLabelExtent(n, 25, 5, 0, 1, 11, 14)).toBeCloseTo(22.6, 6);
	});

	it("uses fontMax when degree equals maxDeg (importance=1)", () => {
		const n = makeNode("a", { label: "x" });
		// importance = 1, fontSize = round(11 + 1*3) = 14
		// charW = 14 * 0.6 = 8.4, padX = 8, raw = 1*8.4 + 16 = 24.4
		expect(estimateLabelExtent(n, 25, 10, 10, 1, 11, 14)).toBeCloseTo(24.4, 6);
	});

	it("uses superFontSize and wider padding for super nodes", () => {
		const plain = makeNode("a", { label: "x" });
		const superNode = makeNode("b", { label: "x", collapsedMembers: ["m"] });
		// super: fontSize=13, charW=7.8, padX=10 → raw = 7.8 + 20 = 27.8
		// plain at importance=0, fontSize=11, charW=6.6, padX=8 → raw = 6.6 + 16 = 22.6
		expect(estimateLabelExtent(superNode, 25, 0, 10, 1, 11, 14, 13)).toBeCloseTo(27.8, 6);
		expect(estimateLabelExtent(plain, 25, 0, 10, 1, 11, 14, 13)).toBeCloseTo(22.6, 6);
	});

	it("longer labels produce proportionally larger extents", () => {
		const short = makeNode("a", { label: "ab" });
		const long = makeNode("b", { label: "abcdefghij" });
		const ws = estimateLabelExtent(short, 25, 5, 10, 1);
		const wl = estimateLabelExtent(long, 25, 5, 10, 1);
		// padX is constant; difference comes from char count × charW
		expect(wl).toBeGreaterThan(ws);
		// difference = (10 - 2) * charW * factor (positive, regardless of font)
		expect(wl - ws).toBeGreaterThan(0);
	});
});

describe("computeEffectiveColumnSpacing", () => {
	it("returns nodeSize*2 when fewer than 2 unique columns", () => {
		const offsets = new Map([["a", { dx: 0, dy: 0 }]]);
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(20);
	});

	it("returns even spacing from dx range across multiple columns", () => {
		const offsets = new Map([
			["a", { dx: 0, dy: 0 }],
			["b", { dx: 50, dy: 0 }],
			["c", { dx: 100, dy: 0 }],
		]);
		// (100 - 0) / (3 - 1) = 50
		expect(computeEffectiveColumnSpacing(offsets, 10)).toBe(50);
	});
});
