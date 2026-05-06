import { describe, it, expect } from "vitest";
import { buildHierarchyTree, collectOntologyBackbone } from "../src/utils/graph-helpers";
import type { GraphEdge } from "../src/types";

const mkEdge = (id: string, source: string, target: string, fields: Partial<GraphEdge> = {}): GraphEdge => ({
	id,
	source,
	target,
	...fields,
});

describe("buildHierarchyTree", () => {
	it("returns empty map when root has no matching edges", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "a", "b", { type: "link" })];
		const tree = buildHierarchyTree("a", new Set(["inheritance"]), edges);
		expect(tree.size).toBe(0);
	});

	it("returns empty map when edges array is empty", () => {
		const tree = buildHierarchyTree("root", new Set(["is-a"]), []);
		expect(tree.size).toBe(0);
	});

	it("walks one-level hierarchy via type match", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "child", "root", { type: "inheritance" }),
			mkEdge("e2", "child2", "root", { type: "inheritance" }),
		];
		const tree = buildHierarchyTree("root", new Set(["inheritance"]), edges);
		expect(tree.size).toBe(2);
		expect(tree.get("child")).toBe("root");
		expect(tree.get("child2")).toBe("root");
	});

	it("walks one-level hierarchy via relation match", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "child", "root", { relation: "is-a" })];
		const tree = buildHierarchyTree("root", new Set(["is-a"]), edges);
		expect(tree.get("child")).toBe("root");
	});

	it("walks multi-level hierarchy (BFS)", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "b", "a", { type: "inheritance" }),
			mkEdge("e2", "c", "b", { type: "inheritance" }),
			mkEdge("e3", "d", "c", { type: "inheritance" }),
		];
		const tree = buildHierarchyTree("a", new Set(["inheritance"]), edges);
		expect(tree.get("b")).toBe("a");
		expect(tree.get("c")).toBe("b");
		expect(tree.get("d")).toBe("c");
	});

	it("treats edges as undirected (either endpoint can be parent)", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "root", "child", { type: "inheritance" })];
		const tree = buildHierarchyTree("root", new Set(["inheritance"]), edges);
		expect(tree.get("child")).toBe("root");
	});

	it("respects maxDepth bound", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "lvl1", "root", { type: "inheritance" }),
			mkEdge("e2", "lvl2", "lvl1", { type: "inheritance" }),
			mkEdge("e3", "lvl3", "lvl2", { type: "inheritance" }),
		];
		const tree = buildHierarchyTree("root", new Set(["inheritance"]), edges, 1);
		expect(tree.get("lvl1")).toBe("root");
		expect(tree.has("lvl2")).toBe(false);
		expect(tree.has("lvl3")).toBe(false);
	});

	it("does not revisit already-seen nodes (avoids cycles)", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "a", "b", { type: "inheritance" }),
			mkEdge("e2", "b", "a", { type: "inheritance" }),
		];
		const tree = buildHierarchyTree("a", new Set(["inheritance"]), edges);
		expect(tree.size).toBe(1);
		expect(tree.get("b")).toBe("a");
	});

	it("does not include the root in the tree", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "child", "root", { type: "inheritance" })];
		const tree = buildHierarchyTree("root", new Set(["inheritance"]), edges);
		expect(tree.has("root")).toBe(false);
	});

	it("ignores edges whose type/relation are not in relTypes", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "x", "root", { type: "link" }),
			mkEdge("e2", "y", "root", { relation: "Author" }),
			mkEdge("e3", "z", "root", { type: "inheritance" }),
		];
		const tree = buildHierarchyTree("root", new Set(["inheritance"]), edges);
		expect(tree.size).toBe(1);
		expect(tree.has("x")).toBe(false);
		expect(tree.has("y")).toBe(false);
		expect(tree.has("z")).toBe(true);
	});

	it("supports multiple relTypes simultaneously", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "a1", "root", { type: "inheritance" }),
			mkEdge("e2", "a2", "root", { relation: "is-a" }),
			mkEdge("e3", "a3", "root", { relation: "has-a" }),
		];
		const tree = buildHierarchyTree("root", new Set(["inheritance", "is-a", "has-a"]), edges);
		expect(tree.size).toBe(3);
	});
});

describe("collectOntologyBackbone", () => {
	it("returns empty array when no edges", () => {
		expect(collectOntologyBackbone([])).toEqual([]);
	});

	it("returns empty array when no matching edges", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "a", "b", { type: "link" })];
		expect(collectOntologyBackbone(edges)).toEqual([]);
	});

	it("collects edges with type=inheritance", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "child", "parent", { type: "inheritance" })];
		expect(collectOntologyBackbone(edges)).toEqual([{ from: "child", to: "parent" }]);
	});

	it("collects edges with relation=is-a", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "Dog", "Animal", { relation: "is-a" })];
		expect(collectOntologyBackbone(edges)).toEqual([{ from: "Dog", to: "Animal" }]);
	});

	it("collects edges with relation=parent", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "kid", "father", { relation: "parent" })];
		expect(collectOntologyBackbone(edges)).toEqual([{ from: "kid", to: "father" }]);
	});

	it("preserves source/target direction in from/to", () => {
		const edges: GraphEdge[] = [mkEdge("e1", "X", "Y", { type: "inheritance" })];
		const [first] = collectOntologyBackbone(edges);
		expect(first.from).toBe("X");
		expect(first.to).toBe("Y");
	});

	it("ignores non-ontology edges in mixed list", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "a", "b", { type: "link" }),
			mkEdge("e2", "c", "d", { type: "inheritance" }),
			mkEdge("e3", "e", "f", { relation: "Author" }),
			mkEdge("e4", "g", "h", { relation: "is-a" }),
		];
		const out = collectOntologyBackbone(edges);
		expect(out).toHaveLength(2);
		expect(out).toContainEqual({ from: "c", to: "d" });
		expect(out).toContainEqual({ from: "g", to: "h" });
	});

	it("preserves input edge order", () => {
		const edges: GraphEdge[] = [
			mkEdge("e1", "a", "b", { type: "inheritance" }),
			mkEdge("e2", "c", "d", { relation: "is-a" }),
			mkEdge("e3", "e", "f", { relation: "parent" }),
		];
		const out = collectOntologyBackbone(edges);
		expect(out).toEqual([
			{ from: "a", to: "b" },
			{ from: "c", to: "d" },
			{ from: "e", to: "f" },
		]);
	});
});
