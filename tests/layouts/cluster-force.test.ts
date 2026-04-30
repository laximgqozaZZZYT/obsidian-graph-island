import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	estimateGroupRadius,
	getSpacing,
	computeEffectiveColumnSpacing,
	computeGroupGap,
	pairwiseGap,
	estimateLabelExtent,
	nodeRadius,
	effectiveRadius,
	estimateLabelWidth,
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
	it("uses the larger radius as reference", () => {
		// max(3, 5) * 2 * 1.0 = 10
		expect(pairwiseGap(3, 5, 1.0)).toBe(10);
		// Asymmetric inputs should yield identical output (commutative on max)
		expect(pairwiseGap(5, 3, 1.0)).toBe(10);
	});

	it("scales linearly with spacing factor", () => {
		expect(pairwiseGap(4, 4, 2.0)).toBe(16);
		expect(pairwiseGap(4, 4, 0.5)).toBe(4);
	});

	it("returns 0 when both radii are 0 (degenerate input)", () => {
		expect(pairwiseGap(0, 0, 1.5)).toBe(0);
	});
});

describe("computeGroupGap", () => {
	it("equals pairwiseGap with uniform nodeSize and max(spacing, groupScale)", () => {
		// pairwiseGap(8, 8, max(1.0, 2.0)) = 8 * 2 * 2.0 = 32
		expect(computeGroupGap(8, 1.0, 2.0)).toBe(32);
	});

	it("picks nodeSpacing when it dominates groupScale", () => {
		// pairwiseGap(8, 8, max(3.0, 1.0)) = 8 * 2 * 3.0 = 48
		expect(computeGroupGap(8, 3.0, 1.0)).toBe(48);
	});

	it("returns 0 when nodeSize is 0", () => {
		expect(computeGroupGap(0, 2.0, 2.0)).toBe(0);
	});
});

describe("estimateLabelExtent", () => {
	function make(label: string, overrides?: Partial<GraphNode>): GraphNode {
		return { id: label, label, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
	}

	it("returns 0 when labelSpacingFactor is 0 (disabled)", () => {
		expect(estimateLabelExtent(make("hello"), 10, 5, 10, 0)).toBe(0);
	});

	it("returns 0 for a node with empty label", () => {
		expect(estimateLabelExtent(make(""), 10, 5, 10, 1.0)).toBe(0);
	});

	it("uses superFontSize and super pad for collapsed-group nodes", () => {
		// fontSize=13, charW=13*0.6=7.8, padX=10 (super)
		// rawWidth = 4*7.8 + 10*2 = 51.2 → factor 1.0 → 51.2
		const sup = make("test", { collapsedMembers: ["x"] });
		expect(estimateLabelExtent(sup, 10, 0, 0, 1.0)).toBeCloseTo(51.2, 5);
	});

	it("uses regular pad for non-super nodes and scales by factor", () => {
		// degree=0, maxDeg=10 → importance=0 → fontSize=fontMin=11
		// charW=11*0.6=6.6, padX=8, rawWidth = 5*6.6 + 16 = 49 → *2 = 98
		expect(estimateLabelExtent(make("hello"), 10, 0, 10, 2.0, 11, 14)).toBeCloseTo(98, 5);
	});

	it("uses fontMax when degree equals maxDeg (importance = 1)", () => {
		// importance=1 → fontSize = round(11 + 1*(14-11)) = 14
		// charW=14*0.6=8.4, padX=8, rawWidth = 3*8.4 + 16 = 41.2 → *1 = 41.2
		expect(estimateLabelExtent(make("abc"), 10, 10, 10, 1.0, 11, 14)).toBeCloseTo(41.2, 5);
	});

	it("guards against maxDeg=0 by treating importance as 0", () => {
		// fontSize=fontMin=11, charW=6.6, padX=8 → 5*6.6+16 = 49
		expect(estimateLabelExtent(make("hello"), 10, 5, 0, 1.0, 11, 14)).toBeCloseTo(49, 5);
	});
});

describe("nodeRadius", () => {
	it("enforces minNodeRadius floor when nodeSize is below floor", () => {
		expect(nodeRadius(5, 0, 18)).toBe(18);
	});

	it("returns nodeSize when above minNodeRadius (sizeByDegree off)", () => {
		expect(nodeRadius(30, 100, 18, 100, false)).toBe(30);
	});

	it("falls back to minNodeRadius for non-finite nodeSize", () => {
		expect(nodeRadius(NaN, 0, 18)).toBe(18);
		expect(nodeRadius(Infinity, 0, 18)).toBe(18);
		expect(nodeRadius(-5, 0, 18)).toBe(18);
	});

	it("scales by sqrt(degree/maxDegree) when sizeByDegree=true", () => {
		// t = sqrt(100/100) = 1; baseR(20) * (0.7 + 1*1.3) = 20 * 2.0 = 40
		expect(nodeRadius(20, 100, 18, 100, true)).toBe(40);
		// t = sqrt(0/100) = 0; 20 * 0.7 = 14, but floored to 18 by max(safeSize, minNodeRadius)
		// Actually: baseR = max(20, 18) = 20; degree=0 → returns baseR (skip if branch when degree<=0)
		expect(nodeRadius(20, 0, 18, 100, true)).toBe(20);
	});

	it("ignores sizeByDegree when maxDegree is 0", () => {
		expect(nodeRadius(20, 5, 18, 0, true)).toBe(20);
	});
});

describe("effectiveRadius", () => {
	function make(id: string, overrides?: Partial<GraphNode>): GraphNode {
		return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
	}

	it("returns plain baseR for a regular node within cap", () => {
		// baseR = max(20, 18) = 20; cap=60; floor=18 → 20
		expect(effectiveRadius(make("a"), 20, 0)).toBe(20);
	});

	it("clamps to maxNodeRadius cap", () => {
		// baseR = 100; cap=60 → 60
		expect(effectiveRadius(make("a"), 100, 0, 60, 18)).toBe(60);
	});

	it("enforces minNodeRadius floor", () => {
		// baseR = max(5, 18) = 18 → 18 (floor)
		expect(effectiveRadius(make("a"), 5, 0, 60, 18)).toBe(18);
	});

	it("treats maxNodeRadius=0 as no cap (Infinity)", () => {
		// baseR = 200; cap=Infinity → 200
		expect(effectiveRadius(make("a"), 200, 0, 0, 18)).toBe(200);
	});

	it("inflates radius for super nodes by sqrt(memberCount)", () => {
		// 4 members: baseR * (1 + sqrt(4) * 0.5) = baseR * 2
		// baseR = max(20, 18) = 20 → 20 * 2 = 40 (within cap=60)
		const sup = make("a", { collapsedMembers: ["x", "y", "z", "w"] });
		expect(effectiveRadius(sup, 20, 0, 60, 18)).toBe(40);
	});

	it("caps super-node inflation at maxNodeRadius", () => {
		// 100 members: baseR * (1 + 10 * 0.5) = 6 * baseR; cap=60
		const sup = make("a", { collapsedMembers: new Array(100).fill("x") });
		expect(effectiveRadius(sup, 20, 0, 60, 18)).toBe(60);
	});

	it("applies log-based content scale boost when configured", () => {
		// bodyLength=10, maxBodyLength=100, cardContentScale=1
		// t = log(11)/log(101) ≈ 0.5193... ; baseR = 20 * (1 + 1*t)
		const r = effectiveRadius(make("a"), 20, 0, 100, 18, 0, false, 10, 100, 1);
		const t = Math.log(11) / Math.log(101);
		expect(r).toBeCloseTo(20 * (1 + t), 5);
	});

	it("ignores content scale when maxBodyLength is 0 (no nodes have body)", () => {
		expect(effectiveRadius(make("a"), 20, 0, 100, 18, 0, false, 50, 0, 1.0)).toBe(20);
	});
});

describe("estimateLabelWidth", () => {
	function make(id: string, overrides?: Partial<GraphNode>): GraphNode {
		return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
	}

	it("uses label.length * 7 for plain nodes", () => {
		expect(estimateLabelWidth(make("hello"))).toBe(35);
	});

	it("falls back to id when label is empty string", () => {
		// label "" is falsy → uses id "myid" (4 chars * 7 = 28)
		expect(estimateLabelWidth(make("myid", { label: "" }))).toBe(28);
	});

	it("appends ' (N)' suffix width for super nodes", () => {
		// label "g" (1) + " (3)" (4) = 5 → 35
		const sup = make("g", { collapsedMembers: ["a", "b", "c"] });
		expect(estimateLabelWidth(sup)).toBe(35);
	});

	it("counts an empty collapsedMembers array as ' (0)' (4 char) suffix", () => {
		// label "x" (1) + " (0)" (4) = 5 → 35
		const sup = make("x", { collapsedMembers: [] });
		expect(estimateLabelWidth(sup)).toBe(35);
	});
});

describe("partitionNodes", () => {
	function make(id: string, overrides?: Partial<GraphNode>): GraphNode {
		return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
	}

	it("groups by backlink degree buckets", () => {
		const nodes = [make("a"), make("b"), make("c")];
		const degrees = new Map([
			["a", 0],
			["b", 4],
			["c", 20],
		]);
		const groups = partitionNodes(nodes, "backlinks", degrees);
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("3-5")?.map((n) => n.id)).toEqual(["b"]);
		expect(groups.get("11+")?.map((n) => n.id)).toEqual(["c"]);
	});

	it("groups tag nodes under 'tag' bucket via node_type", () => {
		const nodes = [make("a", { isTag: true }), make("b", { category: "Person" }), make("c")];
		const groups = partitionNodes(nodes, "node_type", new Map());
		expect(groups.get("tag")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("Person")?.map((n) => n.id)).toEqual(["b"]);
		// Falls back to "file" when no category
		expect(groups.get("file")?.map((n) => n.id)).toEqual(["c"]);
	});

	it("collapses everything to '__all__' under 'none'", () => {
		const nodes = [make("a"), make("b"), make("c")];
		const groups = partitionNodes(nodes, "none", new Map());
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.map((n) => n.id)).toEqual(["a", "b", "c"]);
	});

	it("groups by tag using getNodeFieldValues (first tag wins)", () => {
		const nodes = [make("a", { tags: ["x", "y"] }), make("b", { tags: ["x"] }), make("c", { tags: [] })];
		const groups = partitionNodes(nodes, "tag", new Map());
		// "x" first for both a and b; c has empty tags → __no_tag__ key
		expect(groups.get("x")?.map((n) => n.id)).toEqual(["a", "b"]);
		expect(groups.get("__no_tag__")?.map((n) => n.id)).toEqual(["c"]);
	});

	it("strips trailing ':?' from groupBy field name (optional-marker syntax)", () => {
		// "category:?" should resolve to field "category"
		const nodes = [make("a", { category: "Item" }), make("b")];
		const groups = partitionNodes(nodes, "category:?", new Map());
		expect(groups.get("Item")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("__no_category__")?.map((n) => n.id)).toEqual(["b"]);
	});
});
