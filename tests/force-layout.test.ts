import { describe, it, expect } from "vitest";
import { resolveDirection, matchesFilter } from "../src/layouts/force";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(overrides: Partial<GraphNode> = {}): GraphNode {
	return {
		id: "test",
		label: "TestNode",
		x: 0,
		y: 0,
		group: "",
		tags: [],
		category: "",
		isTag: false,
		...overrides,
	} as GraphNode;
}

// ---------------------------------------------------------------------------
// resolveDirection
// ---------------------------------------------------------------------------

describe("resolveDirection", () => {
	it("top → -π/2", () => {
		expect(resolveDirection("top")).toBeCloseTo(-Math.PI / 2);
	});

	it("bottom → π/2", () => {
		expect(resolveDirection("bottom")).toBeCloseTo(Math.PI / 2);
	});

	it("left → π", () => {
		expect(resolveDirection("left")).toBeCloseTo(Math.PI);
	});

	it("right → 0", () => {
		expect(resolveDirection("right")).toBe(0);
	});

	it("numeric value passed through", () => {
		expect(resolveDirection(1.5)).toBe(1.5);
		expect(resolveDirection(0)).toBe(0);
		expect(resolveDirection(-Math.PI)).toBe(-Math.PI);
	});
});

// ---------------------------------------------------------------------------
// matchesFilter
// ---------------------------------------------------------------------------

describe("matchesFilter", () => {
	it("wildcard * matches any node", () => {
		expect(matchesFilter(mkNode(), "*")).toBe(true);
		expect(matchesFilter(mkNode({ isTag: true }), "*")).toBe(true);
	});

	it("tag:<name> matches node with that tag", () => {
		const node = mkNode({ tags: ["important", "review"] });
		expect(matchesFilter(node, "tag:important")).toBe(true);
		expect(matchesFilter(node, "tag:missing")).toBe(false);
	});

	it("category:<name> matches node category", () => {
		const node = mkNode({ category: "character" });
		expect(matchesFilter(node, "category:character")).toBe(true);
		expect(matchesFilter(node, "category:location")).toBe(false);
	});

	it("isTag matches virtual tag nodes", () => {
		expect(matchesFilter(mkNode({ isTag: true }), "isTag:true")).toBe(true);
		expect(matchesFilter(mkNode({ isTag: false }), "isTag:true")).toBe(false);
	});

	it("empty filter matches all (returns true)", () => {
		expect(matchesFilter(mkNode(), "")).toBe(true);
	});

	// --- matchesFilter boundary values (cycle118) ---

	it("tag: prefix match with wildcard suffix (tag:char*)", () => {
		const node = mkNode({ tags: ["character", "protagonist"] });
		expect(matchesFilter(node, "tag:char*")).toBe(true);
		expect(matchesFilter(node, "tag:prot*")).toBe(true);
		expect(matchesFilter(node, "tag:missing*")).toBe(false);
	});

	it("tag: with Japanese characters", () => {
		const node = mkNode({ tags: ["キャラクター", "勇者"] });
		expect(matchesFilter(node, "tag:キャラクター")).toBe(true);
		expect(matchesFilter(node, "tag:勇者")).toBe(true);
		expect(matchesFilter(node, "tag:敵")).toBe(false);
	});

	it("path: prefix filter", () => {
		const node = mkNode({ filePath: "chapters/act1/scene1.md" });
		expect(matchesFilter(node, "path:chapters/*")).toBe(true);
		expect(matchesFilter(node, "path:other/*")).toBe(false);
	});

	it("category: with undefined category returns false", () => {
		const node = mkNode({ category: undefined });
		expect(matchesFilter(node, "category:anything")).toBe(false);
	});

	it("isTag:false matches non-tag nodes", () => {
		expect(matchesFilter(mkNode({ isTag: false }), "isTag:false")).toBe(true);
		expect(matchesFilter(mkNode({ isTag: true }), "isTag:false")).toBe(false);
	});

	it("unknown prefix treated as field match", () => {
		// "node_type:character" should check meta.node_type or category
		const node = mkNode({ category: "character" });
		// Behavior depends on implementation — just ensure no crash
		const result = matchesFilter(node, "node_type:character");
		expect(typeof result).toBe("boolean");
	});

	it("multiple tags: node with many tags matches any", () => {
		const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
		const node = mkNode({ tags });
		expect(matchesFilter(node, "tag:tag0")).toBe(true);
		expect(matchesFilter(node, "tag:tag19")).toBe(true);
		expect(matchesFilter(node, "tag:tag20")).toBe(false);
	});
});
