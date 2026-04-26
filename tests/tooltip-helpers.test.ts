import { describe, it, expect } from "vitest";
import { edgeTypeSummary, collapsedGroupSummary, truncateBreadcrumb } from "../src/utils/graph-helpers";

// ---------------------------------------------------------------------------
// edgeTypeSummary
// ---------------------------------------------------------------------------
describe("edgeTypeSummary", () => {
	it("empty edges → empty map", () => {
		expect(edgeTypeSummary([], "a").size).toBe(0);
	});

	it("counts edges connected to node", () => {
		const edges = [
			{ source: "a", target: "b", type: "link" },
			{ source: "a", target: "c", type: "tag" },
			{ source: "d", target: "a", type: "link" },
			{ source: "b", target: "c", type: "link" }, // not connected to "a"
		];
		const counts = edgeTypeSummary(edges, "a");
		expect(counts.get("link")).toBe(2);
		expect(counts.get("tag")).toBe(1);
		expect(counts.size).toBe(2);
	});

	it("undefined type defaults to 'link'", () => {
		const edges = [{ source: "a", target: "b" }];
		const counts = edgeTypeSummary(edges, "a");
		expect(counts.get("link")).toBe(1);
	});

	it("node with no connections → empty map", () => {
		const edges = [{ source: "b", target: "c", type: "link" }];
		expect(edgeTypeSummary(edges, "a").size).toBe(0);
	});

	it("self-loop counted once (single edge match)", () => {
		const edges = [{ source: "a", target: "a", type: "link" }];
		// source=a matches the OR condition → counts as 1 edge
		const counts = edgeTypeSummary(edges, "a");
		expect(counts.get("link")).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// collapsedGroupSummary
// ---------------------------------------------------------------------------
describe("collapsedGroupSummary", () => {
	it("empty members → empty string", () => {
		expect(collapsedGroupSummary([])).toBe("");
	});

	it("single member", () => {
		const text = collapsedGroupSummary(["note.md"]);
		expect(text).toContain("[1 nodes]");
		expect(text).toContain("note");
		expect(text).not.toContain(".md");
	});

	it("3 members shown in full", () => {
		const text = collapsedGroupSummary(["a.md", "b.md", "c.md"]);
		expect(text).toContain("[3 nodes]");
		expect(text).toContain("a, b, c");
		expect(text).not.toContain("+");
	});

	it("4+ members truncated with +N", () => {
		const text = collapsedGroupSummary(["a.md", "b.md", "c.md", "d.md", "e.md"]);
		expect(text).toContain("[5 nodes]");
		expect(text).toContain("a, b, c");
		expect(text).toContain("+2");
	});

	it("strips .md extension", () => {
		const text = collapsedGroupSummary(["folder/note.md"]);
		expect(text).not.toContain(".md");
		expect(text).toContain("folder/note");
	});

	it("members without .md extension preserved", () => {
		const text = collapsedGroupSummary(["tag:test"]);
		expect(text).toContain("tag:test");
	});
});

// ---------------------------------------------------------------------------
// truncateBreadcrumb
// ---------------------------------------------------------------------------
describe("truncateBreadcrumb", () => {
	it("short path (≤5) returned as-is", () => {
		expect(truncateBreadcrumb(["a", "b", "c"])).toEqual(["a", "b", "c"]);
		expect(truncateBreadcrumb(["a", "b", "c", "d", "e"])).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("exactly 5 elements returned as-is", () => {
		const path = ["a", "b", "c", "d", "e"];
		expect(truncateBreadcrumb(path)).toHaveLength(5);
	});

	it("6+ elements truncated to first 2 + … + last 2", () => {
		const path = ["a", "b", "c", "d", "e", "f"];
		expect(truncateBreadcrumb(path)).toEqual(["a", "b", "…", "e", "f"]);
	});

	it("long path (10 elements) keeps start and end", () => {
		const path = Array.from({ length: 10 }, (_, i) => `n${i}`);
		const result = truncateBreadcrumb(path);
		expect(result).toHaveLength(5);
		expect(result[0]).toBe("n0");
		expect(result[1]).toBe("n1");
		expect(result[2]).toBe("…");
		expect(result[3]).toBe("n8");
		expect(result[4]).toBe("n9");
	});

	it("empty path", () => {
		expect(truncateBreadcrumb([])).toEqual([]);
	});

	it("single element", () => {
		expect(truncateBreadcrumb(["a"])).toEqual(["a"]);
	});
});
