import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	estimateGroupRadius,
	getSpacing,
	computeEffectiveColumnSpacing,
	computeGroupGap,
	pairwiseGap,
	nodeRadius,
	effectiveRadius,
	estimateLabelExtent,
	estimateLabelWidth,
	partitionNodes,
	analyzeOverlap,
	computeAutoOptimize,
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

describe("pairwiseGap", () => {
	it("uses the larger of r1/r2 as reference radius", () => {
		// max(3, 8) * 2 * 1 = 16
		expect(pairwiseGap(3, 8, 1)).toBe(16);
		expect(pairwiseGap(8, 3, 1)).toBe(16);
	});

	it("scales linearly with spacing factor", () => {
		expect(pairwiseGap(5, 5, 2)).toBe(20);
		expect(pairwiseGap(5, 5, 0.5)).toBe(5);
	});

	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 5)).toBe(0);
	});

	it("returns 0 when spacing is 0 (degenerate but valid)", () => {
		expect(pairwiseGap(10, 10, 0)).toBe(0);
	});
});

describe("computeGroupGap", () => {
	it("uses max(nodeSpacing, groupScale) as the spacing factor", () => {
		// max(2, 5) = 5; 8 * 2 * 5 = 80
		expect(computeGroupGap(8, 2, 5)).toBe(80);
	});

	it("equivalent to pairwiseGap(size, size, max(spacing, scale))", () => {
		const ns = 6;
		const sp = 3;
		const gs = 4;
		expect(computeGroupGap(ns, sp, gs)).toBe(pairwiseGap(ns, ns, Math.max(sp, gs)));
	});

	it("returns 0 when nodeSize is 0", () => {
		expect(computeGroupGap(0, 5, 5)).toBe(0);
	});
});

describe("nodeRadius", () => {
	it("returns minNodeRadius floor when nodeSize is below floor", () => {
		// safeSize=10, baseR=max(10, 18)=18
		expect(nodeRadius(10, 0, 18)).toBe(18);
	});

	it("returns nodeSize when above the floor and sizeByDegree=false", () => {
		expect(nodeRadius(30, 5, 18)).toBe(30);
	});

	it("falls back to minNodeRadius when nodeSize is non-finite", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
	});

	it("falls back to minNodeRadius for non-positive nodeSize", () => {
		expect(nodeRadius(0, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
	});

	it("scales with sqrt(degree/maxDegree) when sizeByDegree=true", () => {
		// baseR=20; t=sqrt(10/10)=1; return 20 * (0.7 + 1.3) = 40
		expect(nodeRadius(20, 10, 18, 10, true)).toBeCloseTo(40, 5);
		// baseR=20; t=0; return 20 * 0.7 = 14 — but floor=18; degree=0 disables branch entirely → 20
		expect(nodeRadius(20, 0, 18, 10, true)).toBe(20);
	});
});

describe("effectiveRadius", () => {
	it("returns plain nodeRadius for non-super nodes", () => {
		const n = makeNode("a");
		expect(effectiveRadius(n, 30, 0, 60, 18)).toBe(30);
	});

	it("inflates radius for super nodes by sqrt(memberCount)*0.5", () => {
		const n = makeNode("g", { collapsedMembers: ["a", "b", "c", "d"] });
		// baseR=20; super factor = 1 + sqrt(4)*0.5 = 2.0; result = min(40, cap=60) = 40
		expect(effectiveRadius(n, 20, 0, 60, 18)).toBe(40);
	});

	it("caps at maxNodeRadius for huge super nodes", () => {
		const n = makeNode("g", { collapsedMembers: new Array(100).fill("x") });
		// super factor would yield 20 * (1 + 5) = 120 — capped at 60
		expect(effectiveRadius(n, 20, 0, 60, 18)).toBe(60);
	});

	it("treats maxNodeRadius=0 as Infinity (no cap)", () => {
		const n = makeNode("g", { collapsedMembers: new Array(100).fill("x") });
		// no cap → 20 * (1 + sqrt(100)*0.5) = 20 * 6 = 120
		expect(effectiveRadius(n, 20, 0, 0, 18)).toBe(120);
	});

	it("enforces minNodeRadius floor even when cap is below it", () => {
		const n = makeNode("a");
		// cap=10 would yield 10, but floor=18 wins
		expect(effectiveRadius(n, 30, 0, 10, 18)).toBe(18);
	});

	it("applies cardContentScale only when both maxBodyLength and bodyLength are positive", () => {
		const n = makeNode("a");
		// no body data → no scale
		expect(effectiveRadius(n, 30, 0, 60, 18, 0, false, 0, 0, 1.0)).toBe(30);
		// max=0 → no scale
		expect(effectiveRadius(n, 30, 0, 60, 18, 0, false, 50, 0, 1.0)).toBe(30);
		// scaling kicks in: t = ln(51)/ln(101) ≈ 0.852; r = 30 * (1 + 1*0.852) ≈ 55.6
		const scaled = effectiveRadius(n, 30, 0, 60, 18, 0, false, 50, 100, 1.0);
		expect(scaled).toBeGreaterThan(30);
		expect(scaled).toBeLessThanOrEqual(60);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor <= 0", () => {
		expect(estimateLabelExtent(makeNode("abc"), 8, 0, 0, 0)).toBe(0);
		expect(estimateLabelExtent(makeNode("abc"), 8, 0, 0, -1)).toBe(0);
	});

	it("returns 0 when label is empty", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 8, 0, 0, 1.0)).toBe(0);
	});

	it("uses super-node font/padding for collapsed groups", () => {
		const n = makeNode("g", { label: "hi", collapsedMembers: ["a", "b"] });
		// fontSize=13, charW=13*0.6=7.8, padX=10 → 2*7.8 + 20 = 35.6
		expect(estimateLabelExtent(n, 8, 0, 0, 1.0, 11, 14, 13)).toBeCloseTo(35.6, 5);
	});

	it("interpolates fontSize between fontMin and fontMax based on degree/maxDeg", () => {
		const n = makeNode("ab");
		// importance=1 → fontSize=14, charW=14*0.6=8.4, padX=8 → 2*8.4+16 = 32.8
		expect(estimateLabelExtent(n, 8, 10, 10, 1.0, 11, 14)).toBeCloseTo(32.8, 5);
		// importance=0 → fontSize=11, charW=11*0.6=6.6, padX=8 → 2*6.6+16 = 29.2
		expect(estimateLabelExtent(n, 8, 0, 10, 1.0, 11, 14)).toBeCloseTo(29.2, 5);
	});

	it("multiplies result by labelSpacingFactor", () => {
		const n = makeNode("a");
		const a = estimateLabelExtent(n, 8, 0, 0, 1.0, 11, 14);
		const b = estimateLabelExtent(n, 8, 0, 0, 2.0, 11, 14);
		expect(b).toBeCloseTo(a * 2, 5);
	});
});

describe("estimateLabelWidth", () => {
	it("uses label.length * 7 for plain nodes", () => {
		expect(estimateLabelWidth(makeNode("a", { label: "abc" }))).toBe(21);
	});

	it("falls back to id when label is missing/empty", () => {
		expect(estimateLabelWidth(makeNode("xyz", { label: "" }))).toBe(21);
	});

	it("appends ' (N)' suffix length for super nodes", () => {
		const n = makeNode("g", { label: "abc", collapsedMembers: ["x", "y"] });
		// 'abc' (3) + ' (2)' (4) = 7 chars → 49
		expect(estimateLabelWidth(n)).toBe(49);
	});
});

describe("partitionNodes", () => {
	it("groups all into __all__ when groupBy is 'none'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.length).toBe(3);
	});

	it("buckets by degree for groupBy='backlinks'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const degs = new Map([
			["a", 0],
			["b", 4],
			["c", 12],
		]);
		const groups = partitionNodes(nodes, "backlinks", degs);
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("3-5")?.map((n) => n.id)).toEqual(["b"]);
		expect(groups.get("11+")?.map((n) => n.id)).toEqual(["c"]);
	});

	it("groups by node_type — tags vs files vs categorized", () => {
		const tag = makeNode("t1", { isTag: true });
		const cat = makeNode("c1", { category: "Person" });
		const plain = makeNode("p1");
		const groups = partitionNodes([tag, cat, plain], "node_type", new Map());
		expect(groups.get("tag")?.[0].id).toBe("t1");
		expect(groups.get("Person")?.[0].id).toBe("c1");
		expect(groups.get("file")?.[0].id).toBe("p1");
	});

	it("groups by folder using top-level folder of filePath", () => {
		const nodes = [
			makeNode("a", { filePath: "characters/alice.md" }),
			makeNode("b", { filePath: "characters/bob.md" }),
			makeNode("c", { filePath: "episodes/ep1.md" }),
		];
		const groups = partitionNodes(nodes, "folder", new Map());
		expect(groups.get("characters")?.length).toBe(2);
		expect(groups.get("episodes")?.length).toBe(1);
	});

	it("falls back to '__no_<field>__' when field is missing", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const groups = partitionNodes(nodes, "folder", new Map());
		expect(groups.get("__no_folder__")?.length).toBe(2);
	});

	it("strips ':?' suffix before resolving the field name", () => {
		const nodes = [makeNode("a", { filePath: "characters/x.md" })];
		const groups = partitionNodes(nodes, "folder:?", new Map());
		expect(groups.get("characters")?.length).toBe(1);
	});
});

describe("analyzeOverlap", () => {
	it("returns zero metrics for fewer than 2 nodes", () => {
		const result = analyzeOverlap([], new Map(), 3);
		expect(result.overlapPairs).toBe(0);
		expect(result.closePairs).toBe(0);
		expect(result.overlapRatio).toBe(0);
	});

	it("counts overlap when two nodes are within combined radius", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 5, y: 0 },
		];
		const radii = new Map([
			["a", 4],
			["b", 4],
		]);
		// dist=5, combined radius=8 → overlap. closeThreshold = 4 * 3 = 12 → close.
		const result = analyzeOverlap(nodes, radii, 3);
		expect(result.overlapPairs).toBe(1);
		expect(result.closePairs).toBe(1);
		expect(result.overlapRatio).toBe(1);
	});

	it("counts as close but not overlapping when distance is between radii sum and threshold", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 10, y: 0 },
		];
		const radii = new Map([
			["a", 4],
			["b", 4],
		]);
		// dist=10, combined radius=8 → NOT overlap. closeThreshold = 4*3 = 12 → close.
		const result = analyzeOverlap(nodes, radii, 3);
		expect(result.closePairs).toBe(1);
		expect(result.overlapPairs).toBe(0);
		expect(result.overlapRatio).toBe(0);
	});

	it("returns zero close pairs when nodes are far apart relative to threshold", () => {
		const nodes = [
			{ id: "a", x: 0, y: 0 },
			{ id: "b", x: 1000, y: 0 },
		];
		const radii = new Map([
			["a", 4],
			["b", 4],
		]);
		const result = analyzeOverlap(nodes, radii, 3);
		expect(result.closePairs).toBe(0);
		expect(result.overlapPairs).toBe(0);
	});
});

describe("computeAutoOptimize", () => {
	const baseCfg = {
		overlapThreshold: 0.1,
		padIncrement: 5,
		padMax: 20,
		repelScale: 1.5,
		linkScale: 1.2,
	};

	it("returns needsMore=false and unchanged values when overlapRatio is at or below threshold", () => {
		const result = computeAutoOptimize(0.05, 10, { _overlapPad: 0 }, 100, 50, baseCfg);
		expect(result.needsMore).toBe(false);
		expect(result.constants._overlapPad).toBe(0);
		expect(result.repelForce).toBe(100);
		expect(result.linkDistance).toBe(50);
	});

	it("increments pad and scales forces when overlapRatio exceeds threshold", () => {
		const result = computeAutoOptimize(0.5, 10, { _overlapPad: 2 }, 100, 50, baseCfg);
		expect(result.needsMore).toBe(true);
		// pad: min(2 + 5, 20) = 7
		expect(result.constants._overlapPad).toBe(7);
		// minGap: max(0, 10*0.5) = 5
		expect(result.constants._minGap).toBe(5);
		expect(result.repelForce).toBe(150);
		expect(result.linkDistance).toBe(60);
	});

	it("caps pad at padMax", () => {
		const result = computeAutoOptimize(0.5, 10, { _overlapPad: 18 }, 100, 50, baseCfg);
		// 18 + 5 = 23 → capped to 20
		expect(result.constants._overlapPad).toBe(20);
	});

	it("preserves a larger pre-existing minGap if avgRadius*0.5 is smaller", () => {
		const result = computeAutoOptimize(0.5, 4, { _overlapPad: 0, _minGap: 50 }, 100, 50, baseCfg);
		// avgRadius*0.5 = 2 — pre-existing 50 wins
		expect(result.constants._minGap).toBe(50);
	});

	it("does not mutate the input constants record", () => {
		const input = { _overlapPad: 0, foo: 42 };
		computeAutoOptimize(0.5, 10, input, 100, 50, baseCfg);
		expect(input).toEqual({ _overlapPad: 0, foo: 42 });
	});
});
