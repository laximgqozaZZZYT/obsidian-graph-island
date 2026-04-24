import { describe, it, expect } from "vitest";
import {
	backlinkBucket,
	estimateGroupRadius,
	getSpacing,
	computeEffectiveColumnSpacing,
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

describe("partitionNodes", () => {
	const degrees = new Map<string, number>([
		["a", 0],
		["b", 2],
		["c", 4],
		["d", 11],
	]);

	it("returns empty map for empty nodes regardless of groupBy mode", () => {
		expect(partitionNodes([], "backlinks", degrees).size).toBe(0);
		expect(partitionNodes([], "none", degrees).size).toBe(0);
		expect(partitionNodes([], "category", degrees).size).toBe(0);
	});

	it("groupBy='backlinks' buckets nodes by degree via backlinkBucket", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
		const groups = partitionNodes(nodes, "backlinks", degrees);
		// a:0 → "0", b:2 → "1-2", c:4 → "3-5", d:11 → "11+"
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["a"]);
		expect(groups.get("1-2")?.map((n) => n.id)).toEqual(["b"]);
		expect(groups.get("3-5")?.map((n) => n.id)).toEqual(["c"]);
		expect(groups.get("11+")?.map((n) => n.id)).toEqual(["d"]);
	});

	it("groupBy='backlinks' treats missing degrees as 0", () => {
		const nodes = [makeNode("z")];
		const groups = partitionNodes(nodes, "backlinks", new Map());
		expect(groups.get("0")?.map((n) => n.id)).toEqual(["z"]);
	});

	it("groupBy='node_type' places isTag nodes under 'tag' and file nodes under their category", () => {
		const nodes = [
			makeNode("t1", { isTag: true, category: "ignored" }),
			makeNode("f1", { category: "Fiction" }),
			makeNode("f2", { category: "NonFiction" }),
		];
		const groups = partitionNodes(nodes, "node_type", degrees);
		expect(groups.get("tag")?.map((n) => n.id)).toEqual(["t1"]);
		expect(groups.get("Fiction")?.map((n) => n.id)).toEqual(["f1"]);
		expect(groups.get("NonFiction")?.map((n) => n.id)).toEqual(["f2"]);
	});

	it("groupBy='node_type' falls back to 'file' for non-tag nodes without a category", () => {
		const nodes = [makeNode("a"), makeNode("b")];
		const groups = partitionNodes(nodes, "node_type", degrees);
		expect(groups.size).toBe(1);
		expect(groups.get("file")?.map((n) => n.id)).toEqual(["a", "b"]);
	});

	it("groupBy='none' collapses all nodes into single '__all__' bucket", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", degrees);
		expect(groups.size).toBe(1);
		expect(groups.get("__all__")?.map((n) => n.id)).toEqual(["a", "b", "c"]);
	});

	it("groupBy=arbitrary field uses getNodeFieldValues[0]; missing values fall under '__no_<field>__'", () => {
		const nodes = [
			makeNode("with-folder", { filePath: "folderA/note.md" }),
			makeNode("no-folder"),
			makeNode("also-A", { filePath: "folderA/other.md" }),
		];
		const groups = partitionNodes(nodes, "folder", degrees);
		expect(groups.get("folderA")?.map((n) => n.id)).toEqual(["with-folder", "also-A"]);
		expect(groups.get("__no_folder__")?.map((n) => n.id)).toEqual(["no-folder"]);
	});

	it("groupBy supports ':?' suffix (partial-query syntax) and strips it before field lookup", () => {
		const nodes = [makeNode("n1", { category: "X" }), makeNode("n2", { category: "Y" })];
		const withoutSuffix = partitionNodes(nodes, "category", degrees);
		const withSuffix = partitionNodes(nodes, "category:?", degrees);
		// Both produce identical buckets — ":?" is stripped before field resolution
		expect([...withSuffix.keys()].sort()).toEqual([...withoutSuffix.keys()].sort());
		expect(withSuffix.get("X")?.map((n) => n.id)).toEqual(["n1"]);
		expect(withSuffix.get("Y")?.map((n) => n.id)).toEqual(["n2"]);
	});

	it("preserves insertion order within each group (stable partition)", () => {
		const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
		const groups = partitionNodes(nodes, "none", degrees);
		expect(groups.get("__all__")?.map((n) => n.id)).toEqual(["a", "b", "c"]);
	});

	it("every input node lands in exactly one group (no drops, no duplicates)", () => {
		const nodes = [
			makeNode("a"),
			makeNode("b", { category: "Cat" }),
			makeNode("c", { isTag: true }),
			makeNode("d", { category: "Cat" }),
		];
		const groups = partitionNodes(nodes, "node_type", degrees);
		const total = [...groups.values()].reduce((sum, arr) => sum + arr.length, 0);
		expect(total).toBe(nodes.length);
		const allIds = [...groups.values()].flat().map((n) => n.id);
		expect(new Set(allIds).size).toBe(nodes.length);
	});
});
