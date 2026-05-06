import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	computeGroupGap,
	effectiveRadius,
	estimateGroupRadius,
	estimateLabelExtent,
	estimateLabelWidth,
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
	it("uses the larger of the two radii as the reference size", () => {
		// max(2, 5) * 2 * 1.0 = 10 — small element gets the same gap as if both were big
		expect(pairwiseGap(2, 5, 1)).toBe(10);
		expect(pairwiseGap(5, 2, 1)).toBe(10);
	});

	it("multiplies by spacing factor", () => {
		expect(pairwiseGap(4, 4, 2)).toBe(16);
		expect(pairwiseGap(4, 4, 0.5)).toBe(4);
	});

	it("returns 0 when both radii are 0", () => {
		expect(pairwiseGap(0, 0, 1)).toBe(0);
	});

	it("returns 0 when spacing is 0 (no gap)", () => {
		expect(pairwiseGap(5, 5, 0)).toBe(0);
	});
});

describe("computeGroupGap", () => {
	it("equals pairwiseGap with uniform nodeSize and max(spacing, scale)", () => {
		// max(3, 5) = 5; pairwiseGap(8, 8, 5) = 8 * 2 * 5 = 80
		expect(computeGroupGap(8, 3, 5)).toBe(80);
	});

	it("picks the larger of nodeSpacing and groupScale", () => {
		expect(computeGroupGap(10, 4, 2)).toBe(computeGroupGap(10, 4, 4)); // smaller scale ignored
		expect(computeGroupGap(10, 1, 7)).toBe(10 * 2 * 7);
	});
});

describe("estimateLabelExtent", () => {
	it("returns 0 when labelSpacingFactor is 0 or negative (label drawing disabled)", () => {
		const node = makeNode("hello");
		expect(estimateLabelExtent(node, 18, 0, 0, 0)).toBe(0);
		expect(estimateLabelExtent(node, 18, 0, 0, -1)).toBe(0);
	});

	it("returns 0 when label is empty", () => {
		const node = makeNode("a", { label: "" });
		expect(estimateLabelExtent(node, 18, 0, 0, 1)).toBe(0);
	});

	it("scales with label length (linear in chars * charW)", () => {
		const short = makeNode("a", { label: "ab" });
		const long = makeNode("a", { label: "abcdefgh" });
		const wShort = estimateLabelExtent(short, 18, 0, 10, 1);
		const wLong = estimateLabelExtent(long, 18, 0, 10, 1);
		expect(wLong).toBeGreaterThan(wShort);
		// long has 6 more chars than short, each contributing fontSize * 0.6
		// at degree=0, fontSize = fontMin = 11; charW = 11 * 0.6 = 6.6
		expect(wLong - wShort).toBeCloseTo(6 * 11 * 0.6, 5);
	});

	it("uses larger font for high-degree nodes (scales label width)", () => {
		const node = makeNode("a", { label: "abcdef" });
		const wLow = estimateLabelExtent(node, 18, 0, 10, 1); // degree 0 → fontMin 11
		const wHigh = estimateLabelExtent(node, 18, 10, 10, 1); // max degree → fontMax 14
		expect(wHigh).toBeGreaterThan(wLow);
	});

	it("treats super nodes (collapsedMembers) with fixed superFontSize and larger pad", () => {
		const node = makeNode("a", { label: "abcdef", collapsedMembers: ["x", "y"] });
		// fontSize = superFontSize (13), padX = 10, charW = 13 * 0.6 = 7.8
		// width = 6 * 7.8 + 20 = 66.8
		const expected = 6 * 13 * 0.6 + 20;
		expect(estimateLabelExtent(node, 18, 0, 10, 1)).toBeCloseTo(expected, 5);
	});

	it("multiplies result by labelSpacingFactor", () => {
		const node = makeNode("a", { label: "abc" });
		const w1 = estimateLabelExtent(node, 18, 0, 10, 1);
		const w2 = estimateLabelExtent(node, 18, 0, 10, 2);
		expect(w2).toBeCloseTo(w1 * 2, 5);
	});
});

describe("nodeRadius", () => {
	it("enforces minNodeRadius floor when nodeSize is smaller", () => {
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("uses nodeSize when above the floor", () => {
		expect(nodeRadius(30, 0, 18)).toBe(30);
	});

	it("falls back to minNodeRadius for invalid nodeSize (NaN/<=0)", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(0, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
	});

	it("scales by degree when sizeByDegree=true", () => {
		// sqrt(degree/maxDegree) * 1.3 + 0.7
		// degree=maxDegree → t=1, factor = 0.7 + 1.3 = 2.0
		expect(nodeRadius(20, 10, 18, 10, true)).toBeCloseTo(20 * 2.0, 5);
		// degree=0 → factor unchanged (no scaling branch since degree>0 required)
		expect(nodeRadius(20, 0, 18, 10, true)).toBe(20);
	});

	it("does not scale by degree when sizeByDegree=false (default)", () => {
		expect(nodeRadius(20, 10, 18, 10, false)).toBe(20);
	});
});

describe("effectiveRadius", () => {
	it("equals nodeRadius for plain non-super nodes without body content", () => {
		const node = makeNode("a");
		expect(effectiveRadius(node, 30, 0)).toBe(30);
	});

	it("inflates radius for super nodes by 1 + sqrt(memberCount) * 0.5", () => {
		const node = makeNode("a", { collapsedMembers: ["x", "y", "z", "w"] }); // 4 members
		// baseR = 30; multiplier = 1 + sqrt(4) * 0.5 = 2.0; super = 60; capped at maxNodeRadius=60
		expect(effectiveRadius(node, 30, 0)).toBe(60);
	});

	it("caps super-node radius at maxNodeRadius", () => {
		const node = makeNode("a", { collapsedMembers: Array(100).fill("x") });
		expect(effectiveRadius(node, 30, 0, 50)).toBe(50);
	});

	it("respects minNodeRadius floor for tiny nodeSize", () => {
		const node = makeNode("a");
		expect(effectiveRadius(node, 1, 0, 60, 18)).toBe(18);
	});

	it("scales by bodyLength when cardContentScale > 0 (HM mode)", () => {
		const node = makeNode("a");
		const noScale = effectiveRadius(node, 30, 0, 60, 18, 0, false, 100, 100, 0);
		const withScale = effectiveRadius(node, 30, 0, 60, 18, 0, false, 100, 100, 0.5);
		// log(101)/log(101) = 1, so baseR *= 1 + 0.5 = 1.5
		expect(withScale).toBeCloseTo(noScale * 1.5, 5);
	});

	it("ignores body scaling when bodyLength or maxBodyLength is 0", () => {
		const node = makeNode("a");
		expect(effectiveRadius(node, 30, 0, 60, 18, 0, false, 0, 100, 0.5)).toBe(30);
		expect(effectiveRadius(node, 30, 0, 60, 18, 0, false, 100, 0, 0.5)).toBe(30);
	});
});

describe("estimateLabelWidth", () => {
	it("uses label.length * 7 for plain nodes", () => {
		const node = makeNode("a", { label: "hello" }); // 5 chars
		expect(estimateLabelWidth(node)).toBe(5 * 7);
	});

	it("falls back to id when label is empty", () => {
		const node = makeNode("abc", { label: "" });
		// label || id → "abc" (3 chars)
		expect(estimateLabelWidth(node)).toBe(3 * 7);
	});

	it("appends ' (N)' suffix for super nodes", () => {
		const node = makeNode("a", { label: "hello", collapsedMembers: ["x", "y", "z"] });
		// label="hello" (5) + " (3)" (4) = 9 chars
		expect(estimateLabelWidth(node)).toBe(9 * 7);
	});
});

describe("partitionNodes", () => {
	it("groups by 'none' into a single __all__ bucket", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.length).toBe(3);
	});

	it("groups by 'backlinks' using degree buckets", () => {
		const degrees = new Map([
			["a", 0], // → "0"
			["b", 1], // → "1-2"
			["c", 4], // → "3-5"
			["d", 4], // → "3-5"
		]);
		const groups = partitionNodes(
			[makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")],
			"backlinks",
			degrees,
		);
		expect(groups.get("0")?.length).toBe(1);
		expect(groups.get("1-2")?.length).toBe(1);
		expect(groups.get("3-5")?.length).toBe(2);
	});

	it("groups by 'node_type' separating tag nodes from category", () => {
		const nodes = [
			makeNode("a", { isTag: true }),
			makeNode("b", { isTag: true }),
			makeNode("c", { category: "note" }),
			makeNode("d"),
		];
		const groups = partitionNodes(nodes, "node_type", new Map());
		expect(groups.get("tag")?.length).toBe(2);
		expect(groups.get("note")?.length).toBe(1);
		expect(groups.get("file")?.length).toBe(1); // no category → "file"
	});

	it("returns an empty map when nodes is empty", () => {
		expect(partitionNodes([], "none", new Map()).size).toBe(0);
	});
});
