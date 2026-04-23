import { describe, it, expect } from "vitest";
import { buildMultiSortComparator, type SortMetrics } from "../../src/utils/sort";
import type { GraphNode, SortRule } from "../../src/types";

function mkNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

/**
 * Branch-coverage complements for buildMultiSortComparator.
 * Focus: cascade tiebreakers, undefined field fallbacks, Unicode labels,
 * partial metrics, and the all-tie fallthrough in the rule loop.
 * These paths are not exercised by tests/sort.test.ts.
 */
describe("buildMultiSortComparator — branch coverage boundaries", () => {
	it("returns 0 when all multi-rule comparators tie (loop fallthrough)", () => {
		const a = mkNode("a", { label: "Same", category: "x", tags: ["t"] });
		const b = mkNode("b", { label: "Same", category: "x", tags: ["t"] });
		const rules: SortRule[] = [
			{ key: "label", order: "asc" },
			{ key: "category", order: "asc" },
			{ key: "tag", order: "desc" },
		];
		const cmp = buildMultiSortComparator(rules, {});
		expect(cmp(a, b)).toBe(0);
	});

	it("cascades through 3 rules when earlier rules tie (mid rule breaks)", () => {
		const nodes = [
			mkNode("a", { label: "Same", category: "z", tags: ["x"] }),
			mkNode("b", { label: "Same", category: "m", tags: ["x"] }),
			mkNode("c", { label: "Same", category: "a", tags: ["x"] }),
		];
		// rule1: label asc → all tie
		// rule2: category asc → a, m, z (c, b, a)
		// rule3: tag → never consulted
		const rules: SortRule[] = [
			{ key: "label", order: "asc" },
			{ key: "category", order: "asc" },
			{ key: "tag", order: "asc" },
		];
		const cmp = buildMultiSortComparator(rules, {});
		const sorted = [...nodes].sort(cmp);
		expect(sorted.map((n) => n.id)).toEqual(["c", "b", "a"]);
	});

	it("falls back to 0 for nodes whose category field is undefined", () => {
		const a = mkNode("a"); // no category
		const b = mkNode("b", { category: "alpha" });
		const rules: SortRule[] = [{ key: "category", order: "asc" }];
		const cmp = buildMultiSortComparator(rules, {});
		// "" localeCompare "alpha" → negative → a before b
		expect(cmp(a, b)).toBeLessThan(0);
	});

	it("empty tags array falls back to empty-string comparison", () => {
		const a = mkNode("a", { tags: [] });
		const b = mkNode("b", { tags: ["zulu"] });
		const rules: SortRule[] = [{ key: "tag", order: "asc" }];
		const cmp = buildMultiSortComparator(rules, {});
		// "" vs "zulu" → a < b
		expect(cmp(a, b)).toBeLessThan(0);
	});

	it("only the first tag is consulted for tag comparator", () => {
		const a = mkNode("a", { tags: ["beta", "alpha"] });
		const b = mkNode("b", { tags: ["beta", "zebra"] });
		const rules: SortRule[] = [{ key: "tag", order: "asc" }];
		const cmp = buildMultiSortComparator(rules, {});
		// both start with "beta" → tie, not consulting second element
		expect(cmp(a, b)).toBe(0);
	});

	it("desc order flips sign for non-numeric (label) comparator", () => {
		const a = mkNode("a", { label: "Alpha" });
		const b = mkNode("b", { label: "Zulu" });
		const rulesAsc: SortRule[] = [{ key: "label", order: "asc" }];
		const rulesDesc: SortRule[] = [{ key: "label", order: "desc" }];
		const cmpAsc = buildMultiSortComparator(rulesAsc, {});
		const cmpDesc = buildMultiSortComparator(rulesDesc, {});
		expect(Math.sign(cmpAsc(a, b))).toBe(-Math.sign(cmpDesc(a, b)));
	});

	it("handles partial metrics (only degrees set, others undefined)", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const partial: SortMetrics = { degrees: new Map([["b", 5]]) };
		const rules: SortRule[] = [{ key: "degree", order: "desc" }];
		const cmp = buildMultiSortComparator(rules, partial);
		const sorted = [...nodes].sort(cmp);
		// b has degree 5, others missing → 0. b sorts first in desc.
		expect(sorted[0].id).toBe("b");
	});

	it("in-degree with undefined inDegrees map uses 0 fallback", () => {
		const a = mkNode("a");
		const b = mkNode("b");
		const rules: SortRule[] = [{ key: "in-degree", order: "asc" }];
		// intentionally omit inDegrees
		const cmp = buildMultiSortComparator(rules, { degrees: new Map() });
		expect(cmp(a, b)).toBe(0);
	});

	it("unknown SortKey returns 0 for any node pair (default branch)", () => {
		const a = mkNode("a", { label: "A", category: "x" });
		const b = mkNode("b", { label: "Z", category: "y" });
		const rules: SortRule[] = [{ key: "__invalid__" as SortRule["key"], order: "desc" }];
		const cmp = buildMultiSortComparator(rules, {});
		expect(cmp(a, b)).toBe(0);
		// desc should still be 0 because 0 * -1 = 0 (but actually -0) — both directions tie
		expect(cmp(b, a)).toBe(0);
	});

	it("locale-aware label sort handles diacritics/unicode correctly", () => {
		const a = mkNode("a", { label: "Äpfel" });
		const b = mkNode("b", { label: "Zebra" });
		const c = mkNode("c", { label: "日本" });
		const rules: SortRule[] = [{ key: "label", order: "asc" }];
		const cmp = buildMultiSortComparator(rules, {});
		// ä sorts near a (before z) in most locales; 日本 sorts after latin in en
		expect(cmp(a, b)).toBeLessThan(0);
		expect(cmp(a, c)).not.toBe(0); // non-trivial comparison
	});

	it("comparator reports 0 when comparing a node to itself", () => {
		const n = mkNode("self", {
			label: "self",
			category: "cat",
			tags: ["t"],
		});
		const rules: SortRule[] = [
			{ key: "degree", order: "desc" },
			{ key: "label", order: "asc" },
			{ key: "category", order: "desc" },
		];
		const cmp = buildMultiSortComparator(rules, {
			degrees: new Map([["self", 42]]),
		});
		expect(cmp(n, n)).toBe(0);
	});

	it("desc on importance flips ordering compared to asc", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const metrics: SortMetrics = {
			importance: new Map([
				["a", 1],
				["b", 2],
				["c", 3],
			]),
		};
		const asc = buildMultiSortComparator([{ key: "importance", order: "asc" }], metrics);
		const desc = buildMultiSortComparator([{ key: "importance", order: "desc" }], metrics);
		const sortedAsc = [...nodes].sort(asc).map((n) => n.id);
		const sortedDesc = [...nodes].sort(desc).map((n) => n.id);
		expect(sortedAsc).toEqual(["a", "b", "c"]);
		expect(sortedDesc).toEqual(["c", "b", "a"]);
	});
});
