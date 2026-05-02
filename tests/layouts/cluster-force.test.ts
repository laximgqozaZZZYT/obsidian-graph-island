import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	computeGroupGap,
	effectiveRadius,
	estimateGroupRadius,
	estimateLabelExtent,
	getSpacing,
	computeEffectiveColumnSpacing,
	nodeRadius,
	pairwiseGap,
	partitionNodes,
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
	it("uses the larger radius as reference when r1 > r2", () => {
		// max(20, 5) * 2 * 1.5 = 60
		expect(pairwiseGap(20, 5, 1.5)).toBe(60);
	});

	it("uses the larger radius as reference when r2 > r1", () => {
		// Symmetry: same result regardless of argument order
		expect(pairwiseGap(5, 20, 1.5)).toBe(60);
	});

	it("returns 0 when spacing is 0", () => {
		expect(pairwiseGap(10, 10, 0)).toBe(0);
	});

	it("scales linearly with spacing", () => {
		const a = pairwiseGap(10, 10, 1);
		const b = pairwiseGap(10, 10, 3);
		expect(b).toBe(a * 3);
	});
});

describe("computeGroupGap", () => {
	it("delegates to pairwiseGap with max(nodeSpacing, groupScale)", () => {
		// nodeSize=8, max(2, 5)=5 → 8 * 2 * 5 = 80
		expect(computeGroupGap(8, 2, 5)).toBe(80);
	});

	it("picks nodeSpacing when it exceeds groupScale", () => {
		// max(7, 3)=7 → 10 * 2 * 7 = 140
		expect(computeGroupGap(10, 7, 3)).toBe(140);
	});

	it("matches pairwiseGap with uniform nodeSize", () => {
		expect(computeGroupGap(12, 3, 4)).toBe(pairwiseGap(12, 12, Math.max(3, 4)));
	});
});

describe("nodeRadius", () => {
	it("returns base radius when sizeByDegree is false", () => {
		// max(20, 18) = 20
		expect(nodeRadius(20, 5, 18, 100, false)).toBe(20);
	});

	it("enforces minNodeRadius floor when nodeSize is below it", () => {
		// nodeSize=5 < min=18 → floor to 18
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("falls back to minNodeRadius for non-finite or non-positive nodeSize", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
	});

	it("scales by sqrt(degree/maxDegree) when sizeByDegree=true", () => {
		// baseR=20, t=sqrt(1)=1, factor=0.7+1*1.3=2.0 → 40
		expect(nodeRadius(20, 100, 18, 100, true)).toBeCloseTo(40, 5);
	});

	it("returns base when sizeByDegree=true but degree=0", () => {
		// degree=0 hits the early return path
		expect(nodeRadius(20, 0, 18, 100, true)).toBe(20);
	});

	it("returns base when sizeByDegree=true but maxDegree=0", () => {
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});

	it("monotonically increases with degree under sizeByDegree", () => {
		const a = nodeRadius(20, 1, 18, 100, true);
		const b = nodeRadius(20, 25, 18, 100, true);
		const c = nodeRadius(20, 100, 18, 100, true);
		expect(b).toBeGreaterThan(a);
		expect(c).toBeGreaterThan(b);
	});
});

describe("effectiveRadius", () => {
	it("returns base radius for a plain node within the cap", () => {
		const n = makeNode("a");
		// nodeSize=20 > min=18, no super, no content boost → 20
		expect(effectiveRadius(n, 20, 0, 60, 18)).toBe(20);
	});

	it("inflates super nodes by sqrt(memberCount)*0.5", () => {
		const plain = makeNode("a");
		const superN = makeNode("b", { collapsedMembers: ["x", "y", "z", "w"] });
		const rPlain = effectiveRadius(plain, 20, 0, 60, 18);
		const rSuper = effectiveRadius(superN, 20, 0, 60, 18);
		// 20 * (1 + sqrt(4)*0.5) = 20 * 2 = 40
		expect(rSuper).toBeCloseTo(40, 5);
		expect(rSuper).toBeGreaterThan(rPlain);
	});

	it("caps the result at maxNodeRadius", () => {
		const n = makeNode("a", { collapsedMembers: new Array(100).fill("x") });
		// Without cap, super-radius would explode; cap to 60
		expect(effectiveRadius(n, 20, 0, 60, 18)).toBe(60);
	});

	it("treats maxNodeRadius<=0 as Infinity (no cap)", () => {
		const n = makeNode("a", { collapsedMembers: new Array(16).fill("x") });
		// 20 * (1 + sqrt(16)*0.5) = 20 * 3 = 60; maxNodeRadius=0 → uncapped
		expect(effectiveRadius(n, 20, 0, 0, 18)).toBeCloseTo(60, 5);
	});

	it("enforces minNodeRadius floor when base is small", () => {
		const n = makeNode("a");
		expect(effectiveRadius(n, 5, 0, 60, 18)).toBe(18);
	});

	it("applies content scale boost when cardContentScale>0", () => {
		const n = makeNode("a");
		const noBoost = effectiveRadius(n, 20, 0, 60, 18, 0, false, 100, 100, 0);
		const withBoost = effectiveRadius(n, 20, 0, 60, 18, 0, false, 100, 100, 0.5);
		// log(101)/log(101)=1 → baseR *= 1.5 → 30
		expect(withBoost).toBeCloseTo(30, 5);
		expect(withBoost).toBeGreaterThan(noBoost);
	});

	it("ignores content boost when bodyLength is zero", () => {
		const n = makeNode("a");
		const r = effectiveRadius(n, 20, 0, 60, 18, 0, false, 0, 100, 0.5);
		expect(r).toBe(20);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor <= 0", () => {
		const n = makeNode("hello");
		expect(estimateLabelExtent(n, 20, 0, 100, 0)).toBe(0);
		expect(estimateLabelExtent(n, 20, 0, 100, -1)).toBe(0);
	});

	it("returns 0 for a node with empty label", () => {
		const n = makeNode("a", { label: "" });
		expect(estimateLabelExtent(n, 20, 0, 100, 1)).toBe(0);
	});

	it("computes width using fontMin when degree=0 (no importance)", () => {
		const n = makeNode("abcd"); // 4 chars
		// importance=0, fontSize=fontMin=11, charW=11*0.6=6.6, padX=8 → 4*6.6 + 16 = 42.4
		expect(estimateLabelExtent(n, 20, 0, 100, 1, 11, 14)).toBeCloseTo(42.4, 5);
	});

	it("uses fontMax interpolation when at maxDeg", () => {
		const n = makeNode("abcd");
		// importance=1, fontSize=fontMax=14, charW=14*0.6=8.4, padX=8 → 4*8.4 + 16 = 49.6
		expect(estimateLabelExtent(n, 20, 100, 100, 1, 11, 14)).toBeCloseTo(49.6, 5);
	});

	it("scales output linearly with labelSpacingFactor", () => {
		const n = makeNode("hello");
		const a = estimateLabelExtent(n, 20, 0, 100, 1);
		const b = estimateLabelExtent(n, 20, 0, 100, 2);
		expect(b).toBeCloseTo(a * 2, 5);
	});

	it("uses superFontSize and larger padding for super nodes", () => {
		const plain = makeNode("hello");
		const superN = makeNode("hello", { collapsedMembers: ["x", "y"] });
		// Plain at degree=0 uses fontMin=11, padX=8: 5*6.6 + 16 = 49
		// Super uses superFontSize=13, padX=10: 5*7.8 + 20 = 59
		expect(estimateLabelExtent(plain, 20, 0, 100, 1, 11, 14, 13)).toBeCloseTo(49, 5);
		expect(estimateLabelExtent(superN, 20, 0, 100, 1, 11, 14, 13)).toBeCloseTo(59, 5);
	});

	it("treats maxDeg=0 as zero importance regardless of degree", () => {
		const n = makeNode("abcd");
		// Same as the degree=0 case: importance forced to 0
		expect(estimateLabelExtent(n, 20, 100, 0, 1, 11, 14)).toBeCloseTo(42.4, 5);
	});
});

describe("partitionNodes", () => {
	it("returns a single '__all__' bucket for groupBy='none'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const result = partitionNodes(nodes, "none", new Map());
		expect(result.size).toBe(1);
		expect(result.get("__all__")?.length).toBe(3);
	});

	it("buckets by degree under groupBy='backlinks'", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const degrees = new Map([
			["a", 0],
			["b", 4],
			["c", 12],
		]);
		const result = partitionNodes(nodes, "backlinks", degrees);
		// Buckets: "0", "3-5", "11+"
		expect(result.size).toBe(3);
		expect(result.get("0")?.[0]?.id).toBe("a");
		expect(result.get("3-5")?.[0]?.id).toBe("b");
		expect(result.get("11+")?.[0]?.id).toBe("c");
	});

	it("splits tags from files under groupBy='node_type'", () => {
		const nodes = [
			makeNode("file1", { isTag: false, category: "note" }),
			makeNode("tag1", { isTag: true }),
			makeNode("file2", { isTag: false }), // no category → "file"
		];
		const result = partitionNodes(nodes, "node_type", new Map());
		expect(result.get("tag")?.length).toBe(1);
		expect(result.get("note")?.length).toBe(1);
		expect(result.get("file")?.length).toBe(1);
	});

	it("strips trailing ':?' from groupBy before field lookup", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		// "none:?" should behave identically to "none" after stripping
		const result = partitionNodes(nodes, "none:?", new Map());
		expect(result.size).toBe(1);
		expect(result.get("__all__")?.length).toBe(2);
	});

	it("falls back to '__no_<field>__' bucket when field lookup yields no values", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		// Unknown field "xyz" — getNodeFieldValues returns []
		const result = partitionNodes(nodes, "xyz", new Map());
		expect(result.has("__no_xyz__")).toBe(true);
		expect(result.get("__no_xyz__")?.length).toBe(2);
	});
});
