import { describe, it, expect } from "vitest";
import {
	evaluateExpr,
	parseQueryExpr,
	buildSearchHopSet,
} from "../../src/utils/query-expr";
import type { GraphNode } from "../../src/types";

function makeNode(overrides?: Partial<GraphNode>): GraphNode {
	return {
		id: "n1",
		label: "Alice",
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		tags: [],
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// buildSearchHopSet — exported pure function, previously untested
// ---------------------------------------------------------------------------
describe("buildSearchHopSet", () => {
	it("returns null when no hop directives present", () => {
		const nodes = [{ id: "a", label: "Alpha" }];
		const adj = new Map<string, Set<string>>();
		expect(buildSearchHopSet("tag:foo", nodes, adj)).toBeNull();
		expect(buildSearchHopSet("", nodes, adj)).toBeNull();
		expect(buildSearchHopSet("no directive here", nodes, adj)).toBeNull();
	});

	it("includes origin node even at hop=0", () => {
		const nodes = [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		];
		const adj = new Map<string, Set<string>>([["a", new Set(["b"])]]);
		const set = buildSearchHopSet("hop:alpha:0", nodes, adj);
		expect(set).not.toBeNull();
		expect(set!.has("a")).toBe(true);
		expect(set!.has("b")).toBe(false);
	});

	it("expands BFS to specified depth", () => {
		// chain: a -- b -- c -- d
		const nodes = [
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Bravo" },
			{ id: "c", label: "Charlie" },
			{ id: "d", label: "Delta" },
		];
		const adj = new Map<string, Set<string>>([
			["a", new Set(["b"])],
			["b", new Set(["a", "c"])],
			["c", new Set(["b", "d"])],
			["d", new Set(["c"])],
		]);
		const set = buildSearchHopSet("hop:alpha:2", nodes, adj);
		expect(set).not.toBeNull();
		expect(set!.has("a")).toBe(true); // origin
		expect(set!.has("b")).toBe(true); // hop 1
		expect(set!.has("c")).toBe(true); // hop 2
		expect(set!.has("d")).toBe(false); // hop 3 (excluded)
	});

	it("case-insensitive origin matching across multi-origin label hits", () => {
		const nodes = [
			{ id: "alice-1", label: "Alice the First" },
			{ id: "alice-2", label: "aliceWonder" },
			{ id: "bob", label: "Bob" },
		];
		// alice-1 -- bob ; alice-2 isolated
		const adj = new Map<string, Set<string>>([
			["alice-1", new Set(["bob"])],
			["bob", new Set(["alice-1"])],
		]);
		const set = buildSearchHopSet("hop:ALICE:1", nodes, adj);
		expect(set).not.toBeNull();
		expect(set!.has("alice-1")).toBe(true);
		expect(set!.has("alice-2")).toBe(true); // matched by label
		expect(set!.has("bob")).toBe(true); // hop 1 from alice-1
	});

	it("handles nodes without adjacency entries (isolated origin)", () => {
		const nodes = [{ id: "lonely", label: "Lonely" }];
		const adj = new Map<string, Set<string>>();
		const set = buildSearchHopSet("hop:lonely:5", nodes, adj);
		expect(set).not.toBeNull();
		expect(set!.size).toBe(1);
		expect(set!.has("lonely")).toBe(true);
	});

	it("combines multiple hop directives into single set", () => {
		const nodes = [
			{ id: "x", label: "Xray" },
			{ id: "y", label: "Yankee" },
			{ id: "z", label: "Zulu" },
		];
		const adj = new Map<string, Set<string>>([
			["x", new Set(["y"])],
			["y", new Set(["x"])],
		]);
		const set = buildSearchHopSet("hop:xray:1 hop:zulu:0", nodes, adj);
		expect(set).not.toBeNull();
		expect(set!.has("x")).toBe(true);
		expect(set!.has("y")).toBe(true);
		expect(set!.has("z")).toBe(true);
	});

	it("no label match yields empty set (not null)", () => {
		const nodes = [{ id: "a", label: "Alpha" }];
		const adj = new Map<string, Set<string>>();
		const set = buildSearchHopSet("hop:nonexistent:3", nodes, adj);
		expect(set).not.toBeNull();
		expect(set!.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// fuzzyMatch — long query sliding window path (via ~query evaluateExpr)
// ---------------------------------------------------------------------------
describe("fuzzyMatch long-query sliding window", () => {
	it("matches substring in long label for long query (>5 chars)", () => {
		// Query "abcdefgh" (len=8, threshold=floor(8*0.3)=2) should match within label
		// Label contains an exact substring "abcdefgh" → substring shortcut
		const expr = parseQueryExpr("~abcdefgh")!;
		const node = makeNode({ label: "prefix abcdefgh suffix" });
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("sliding window allows small edits in long query", () => {
		// Query "character" (len=9, threshold=floor(9*0.3)=2)
		// Label "chararter" (2 edits: swap c-t, insert) — within threshold via window
		const expr = parseQueryExpr("~character")!;
		const node = makeNode({ label: "chararter" });
		// target.length (9) - query.length (9) = 0 → single-position window compare
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("rejects long query with too many edits", () => {
		// Query "character" vs "completely unrelated text xxxxx"
		// No window position yields ≤ 2 edits
		const expr = parseQueryExpr("~character")!;
		const node = makeNode({ label: "completely unrelated xxxxx" });
		expect(evaluateExpr(expr, node)).toBe(false);
	});

	it("target shorter than query → no window iteration (returns false)", () => {
		// target.length < query.length → loop skipped, returns false
		const expr = parseQueryExpr("~verylongquery")!;
		const node = makeNode({ label: "ab" });
		expect(evaluateExpr(expr, node)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// resolveMetaValue — dot-notation nested paths & array values
// ---------------------------------------------------------------------------
describe("resolveMetaValue via meta field queries", () => {
	it("resolves nested dot-notation path (2 levels deep)", () => {
		const expr = parseQueryExpr("power.attack:100")!;
		const node = makeNode({ label: "warrior" });
		(node as any).meta = { power: { attack: 100 } };
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("missing intermediate key in dot path returns false", () => {
		const expr = parseQueryExpr("power.defense:50")!;
		const node = makeNode({ label: "mage" });
		(node as any).meta = { power: { attack: 100 } }; // no defense
		expect(evaluateExpr(expr, node)).toBe(false);
	});

	it("non-object mid-path returns false (bails out of traversal)", () => {
		const expr = parseQueryExpr("power.attack:100")!;
		const node = makeNode({ label: "warrior" });
		(node as any).meta = { power: "strong" }; // string, not object
		expect(evaluateExpr(expr, node)).toBe(false);
	});

	it("array value: matches if any element equals query", () => {
		const expr = parseQueryExpr("aliases:hero")!;
		const node = makeNode({ label: "main" });
		(node as any).meta = { aliases: ["hero", "champion", "warrior"] };
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("numeric meta value is stringified for matching", () => {
		const expr = parseQueryExpr("level:42")!;
		const node = makeNode({ label: "char" });
		(node as any).meta = { level: 42 };
		expect(evaluateExpr(expr, node)).toBe(true);
	});

	it("undefined meta returns empty values → no match", () => {
		const expr = parseQueryExpr("custom_field:anything")!;
		const node = makeNode({ label: "x" });
		// no meta at all
		expect(evaluateExpr(expr, node)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// matchValue — regex special char escaping in glob patterns
// ---------------------------------------------------------------------------
describe("matchValue regex-special chars (via tag queries)", () => {
	it("escapes dot so '.' matches literal dot only", () => {
		const expr = parseQueryExpr("tag:a.*b")!;
		// "a.xb" → literal "a.xb" doesn't match (the . is literal, * is glob → "a." + anything + "b")
		expect(evaluateExpr(expr, makeNode({ tags: ["a.xb"] }))).toBe(true);
		// "axxb" should NOT match because dot is literal
		expect(evaluateExpr(expr, makeNode({ tags: ["axxb"] }))).toBe(false);
	});

	it("escapes plus so '+' matches literal plus", () => {
		// "a+*" should literally require 'a+' prefix, not 'one or more a'
		const expr = parseQueryExpr("tag:a+*")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["a+x"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["aaa"] }))).toBe(false);
	});

	it("escapes caret and dollar sign in pattern", () => {
		// "^foo*" — '^' anchors in regex but should be literal here
		const expr = parseQueryExpr("tag:^foo*")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["^foobar"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["foobar"] }))).toBe(false);
	});
});
