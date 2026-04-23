import { describe, it, expect } from "vitest";
import { matchesFilter } from "../src/utils/filter-match";
import type { GraphNode } from "../src/types";

function makeNode(overrides?: Partial<GraphNode>): GraphNode {
	return {
		id: "n1",
		label: "Alice",
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		tags: ["character", "protagonist"],
		category: "person",
		filePath: "characters/alice.md",
		...overrides,
	};
}

describe("matchesFilter", () => {
	it("returns true for wildcard '*' regardless of node", () => {
		expect(matchesFilter(makeNode(), "*")).toBe(true);
		expect(matchesFilter(makeNode({ tags: [], category: undefined, label: "" }), "*")).toBe(true);
	});

	describe("tag: prefix", () => {
		it("matches when node has the tag", () => {
			expect(matchesFilter(makeNode(), "tag:character")).toBe(true);
			expect(matchesFilter(makeNode(), "tag:protagonist")).toBe(true);
		});

		it("does not match when node lacks the tag", () => {
			expect(matchesFilter(makeNode({ tags: ["location"] }), "tag:character")).toBe(false);
			expect(matchesFilter(makeNode({ tags: [] }), "tag:character")).toBe(false);
			expect(matchesFilter(makeNode({ tags: undefined }), "tag:character")).toBe(false);
		});
	});

	describe("category: prefix", () => {
		it("matches on node.category (exact, case-insensitive)", () => {
			expect(matchesFilter(makeNode(), "category:person")).toBe(true);
			expect(matchesFilter(makeNode({ category: "Person" }), "category:person")).toBe(true);
		});

		it("does not match a different category", () => {
			expect(matchesFilter(makeNode({ category: "location" }), "category:person")).toBe(false);
			expect(matchesFilter(makeNode({ category: undefined }), "category:person")).toBe(false);
		});
	});

	describe("label: prefix", () => {
		it("performs substring match on node.label", () => {
			expect(matchesFilter(makeNode({ label: "Alice Wonderland" }), "label:wonder")).toBe(true);
			expect(matchesFilter(makeNode({ label: "Alice" }), "label:ali")).toBe(true);
		});

		it("does not match when substring absent", () => {
			expect(matchesFilter(makeNode({ label: "Bob" }), "label:wonder")).toBe(false);
		});
	});

	describe("isTag bare keyword", () => {
		it("matches virtual tag nodes", () => {
			expect(matchesFilter(makeNode({ isTag: true }), "isTag")).toBe(true);
		});

		it("does not match regular nodes", () => {
			expect(matchesFilter(makeNode({ isTag: false }), "isTag")).toBe(false);
			expect(matchesFilter(makeNode({ isTag: undefined }), "isTag")).toBe(false);
		});
	});

	describe("bare (unknown) filter string", () => {
		it("is interpreted as a label substring match", () => {
			// parseQueryExpr treats a bare token as { field: "label", value: tok }
			expect(matchesFilter(makeNode({ label: "Alice" }), "ali")).toBe(true);
			expect(matchesFilter(makeNode({ label: "Bob" }), "ali")).toBe(false);
		});
	});

	describe("fallback for empty / unparseable input", () => {
		it("returns true for empty string (parse returns null)", () => {
			expect(matchesFilter(makeNode(), "")).toBe(true);
		});

		it("returns true for whitespace-only string", () => {
			expect(matchesFilter(makeNode(), "   ")).toBe(true);
			expect(matchesFilter(makeNode(), "\t\t")).toBe(true);
		});
	});

	describe("internal _exprCache", () => {
		it("returns identical results across repeated calls (cache hit path)", () => {
			const node = makeNode();
			const first = matchesFilter(node, "tag:character");
			const second = matchesFilter(node, "tag:character");
			const third = matchesFilter(node, "tag:character");
			expect(first).toBe(true);
			expect(second).toBe(true);
			expect(third).toBe(true);
		});

		it("stays correct after cache capacity (64) is exceeded and cleared", () => {
			// Cache clears entirely once size >= 64. Fill it with 65 unique filters,
			// then re-query the first one — result must still be correct after re-parse.
			const node = makeNode();
			for (let i = 0; i < 65; i++) {
				matchesFilter(node, `tag:unique_tag_${i}`);
			}
			// Original filter: was evicted, will be re-parsed — result unchanged.
			expect(matchesFilter(node, "tag:character")).toBe(true);
			expect(matchesFilter(node, "tag:nonexistent")).toBe(false);
		});
	});
});
