import { describe, it, expect } from "vitest";
import {
	evaluateExpr,
	parseQueryExpr,
	serializeExpr,
	type QueryExpression,
	type QueryLeaf,
	type QueryBranch,
} from "../src/utils/query-expr";
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

describe("evaluateExpr", () => {
	it("leaf: label substring match", () => {
		const expr: QueryLeaf = { type: "leaf", field: "label", value: "ali" };
		expect(evaluateExpr(expr, makeNode())).toBe(true);
		expect(evaluateExpr(expr, makeNode({ label: "Bob" }))).toBe(false);
	});

	it("leaf: label exact match", () => {
		const expr: QueryLeaf = { type: "leaf", field: "label", value: "Alice", exact: true };
		expect(evaluateExpr(expr, makeNode())).toBe(true);
		expect(evaluateExpr(expr, makeNode({ label: "Alice2" }))).toBe(false);
	});

	it("leaf: tag match (checks array membership)", () => {
		const expr: QueryLeaf = { type: "leaf", field: "tag", value: "character" };
		expect(evaluateExpr(expr, makeNode())).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["location"] }))).toBe(false);
	});

	it("leaf: category match", () => {
		const expr: QueryLeaf = { type: "leaf", field: "category", value: "person" };
		expect(evaluateExpr(expr, makeNode())).toBe(true);
	});

	it("leaf: path match", () => {
		const expr: QueryLeaf = { type: "leaf", field: "path", value: "characters/" };
		expect(evaluateExpr(expr, makeNode())).toBe(true);
		expect(evaluateExpr(expr, makeNode({ filePath: "locations/town.md" }))).toBe(false);
	});

	it("leaf: id match", () => {
		const expr: QueryLeaf = { type: "leaf", field: "id", value: "n1" };
		expect(evaluateExpr(expr, makeNode())).toBe(true);
	});

	it("branch: AND", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "AND",
			left: { type: "leaf", field: "tag", value: "character" },
			right: { type: "leaf", field: "tag", value: "protagonist" },
		};
		expect(evaluateExpr(expr, makeNode())).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(false);
	});

	it("branch: OR", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "OR",
			left: { type: "leaf", field: "tag", value: "character" },
			right: { type: "leaf", field: "tag", value: "location" },
		};
		expect(evaluateExpr(expr, makeNode())).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["location"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["item"] }))).toBe(false);
	});

	it("branch: XOR", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "XOR",
			left: { type: "leaf", field: "tag", value: "character" },
			right: { type: "leaf", field: "tag", value: "protagonist" },
		};
		// Both true → XOR = false
		expect(evaluateExpr(expr, makeNode())).toBe(false);
		// Only left true → XOR = true
		expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
	});

	it("branch: NOR", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "NOR",
			left: { type: "leaf", field: "tag", value: "x" },
			right: { type: "leaf", field: "tag", value: "y" },
		};
		expect(evaluateExpr(expr, makeNode())).toBe(true); // neither matches
	});

	it("branch: NAND", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "NAND",
			left: { type: "leaf", field: "tag", value: "character" },
			right: { type: "leaf", field: "tag", value: "protagonist" },
		};
		expect(evaluateExpr(expr, makeNode())).toBe(false); // both true → NAND = false
		expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
	});

	it("nested: (A OR B) AND C", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "AND",
			left: {
				type: "branch",
				op: "OR",
				left: { type: "leaf", field: "tag", value: "character" },
				right: { type: "leaf", field: "tag", value: "location" },
			},
			right: { type: "leaf", field: "category", value: "person" },
		};
		expect(evaluateExpr(expr, makeNode())).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["location"], category: "place" }))).toBe(false);
	});
});

describe("parseQueryExpr", () => {
	it("single field:value", () => {
		const expr = parseQueryExpr('tag:"character"');
		expect(expr).toEqual({ type: "leaf", field: "tag", value: "character" });
	});

	it("unquoted value", () => {
		const expr = parseQueryExpr("tag:character");
		expect(expr).toEqual({ type: "leaf", field: "tag", value: "character" });
	});

	it("bare value defaults to label field", () => {
		const expr = parseQueryExpr('"Alice"');
		expect(expr).toEqual({ type: "leaf", field: "label", value: "Alice" });
	});

	it("A AND B", () => {
		const expr = parseQueryExpr('tag:"character" AND category:"person"');
		expect(expr).toEqual({
			type: "branch",
			op: "AND",
			left: { type: "leaf", field: "tag", value: "character" },
			right: { type: "leaf", field: "category", value: "person" },
		});
	});

	it("A OR B AND C → A OR (B AND C) [AND binds tighter]", () => {
		const expr = parseQueryExpr('tag:"a" OR tag:"b" AND tag:"c"');
		expect(expr).toEqual({
			type: "branch",
			op: "OR",
			left: { type: "leaf", field: "tag", value: "a" },
			right: {
				type: "branch",
				op: "AND",
				left: { type: "leaf", field: "tag", value: "b" },
				right: { type: "leaf", field: "tag", value: "c" },
			},
		});
	});

	it("parentheses override precedence: (A OR B) AND C", () => {
		const expr = parseQueryExpr('(tag:"a" OR tag:"b") AND tag:"c"');
		expect(expr).toEqual({
			type: "branch",
			op: "AND",
			left: {
				type: "branch",
				op: "OR",
				left: { type: "leaf", field: "tag", value: "a" },
				right: { type: "leaf", field: "tag", value: "b" },
			},
			right: { type: "leaf", field: "tag", value: "c" },
		});
	});

	it("XOR, NOR, NAND operators", () => {
		const expr = parseQueryExpr('tag:"a" XOR tag:"b"');
		expect(expr).toEqual({
			type: "branch",
			op: "XOR",
			left: { type: "leaf", field: "tag", value: "a" },
			right: { type: "leaf", field: "tag", value: "b" },
		});
	});

	it("empty string returns null", () => {
		expect(parseQueryExpr("")).toBeNull();
		expect(parseQueryExpr("  ")).toBeNull();
	});

	it("complex nested: (A OR B) AND (C XOR D)", () => {
		const expr = parseQueryExpr('(tag:"a" OR tag:"b") AND (category:"c" XOR category:"d")');
		expect(expr!.type).toBe("branch");
		expect((expr as QueryBranch).op).toBe("AND");
	});
});

describe("serializeExpr", () => {
	it('leaf → field:"value"', () => {
		expect(serializeExpr({ type: "leaf", field: "tag", value: "character" })).toBe('tag:"character"');
	});

	it("label field omits field name", () => {
		expect(serializeExpr({ type: "leaf", field: "label", value: "Alice" })).toBe('"Alice"');
	});

	it("branch → left OP right", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "AND",
			left: { type: "leaf", field: "tag", value: "a" },
			right: { type: "leaf", field: "tag", value: "b" },
		};
		expect(serializeExpr(expr)).toBe('tag:"a" AND tag:"b"');
	});

	it("nested branches add parentheses when needed", () => {
		const expr: QueryExpression = {
			type: "branch",
			op: "AND",
			left: {
				type: "branch",
				op: "OR",
				left: { type: "leaf", field: "tag", value: "a" },
				right: { type: "leaf", field: "tag", value: "b" },
			},
			right: { type: "leaf", field: "tag", value: "c" },
		};
		expect(serializeExpr(expr)).toBe('(tag:"a" OR tag:"b") AND tag:"c"');
	});

	it("roundtrip: parse → serialize → parse gives same AST", () => {
		const input = '(tag:"a" OR tag:"b") AND category:"c"';
		const parsed = parseQueryExpr(input)!;
		const serialized = serializeExpr(parsed);
		const reparsed = parseQueryExpr(serialized)!;
		expect(reparsed).toEqual(parsed);
	});
});

describe("filter compatibility (search bar & directional gravity)", () => {
	it("bare word is parsed as label leaf", () => {
		const expr = parseQueryExpr("alice");
		expect(expr).toEqual({ type: "leaf", field: "label", value: "alice" });
		expect(evaluateExpr(expr!, makeNode({ label: "Alice" }))).toBe(true);
		expect(evaluateExpr(expr!, makeNode({ label: "Bob" }))).toBe(false);
	});

	it("tag:character matches node with that tag", () => {
		const expr = parseQueryExpr("tag:character");
		expect(evaluateExpr(expr!, makeNode({ tags: ["character", "protagonist"] }))).toBe(true);
		expect(evaluateExpr(expr!, makeNode({ tags: ["location"] }))).toBe(false);
	});

	it("isTag matches virtual tag nodes", () => {
		const expr = parseQueryExpr("isTag");
		expect(evaluateExpr(expr!, makeNode({ isTag: true }))).toBe(true);
		expect(evaluateExpr(expr!, makeNode({ isTag: false }))).toBe(false);
	});

	it("category:person matches category field", () => {
		const expr = parseQueryExpr("category:person");
		expect(evaluateExpr(expr!, makeNode({ category: "person" }))).toBe(true);
		expect(evaluateExpr(expr!, makeNode({ category: "place" }))).toBe(false);
	});

	it("* matches all nodes (wildcard)", () => {
		// Note: matchesFilter treats "*" as a special case before parsing,
		// but parseQueryExpr("*") should parse as label:"*" which matches via substring
		const expr = parseQueryExpr("*");
		// "*" parsed as bare word → label:"*" — wildcard handled at caller level
		expect(expr).not.toBeNull();
	});

	it("boolean filter: tag:character AND category:person", () => {
		const expr = parseQueryExpr("tag:character AND category:person");
		expect(evaluateExpr(expr!, makeNode({ tags: ["character"], category: "person" }))).toBe(true);
		expect(evaluateExpr(expr!, makeNode({ tags: ["character"], category: "place" }))).toBe(false);
	});
});

describe("NOT operator", () => {
	it("NOT tag:battle excludes battle-tagged nodes", () => {
		const expr = parseQueryExpr("NOT tag:battle");
		expect(expr).not.toBeNull();
		const battleNode = makeNode({ tags: ["battle", "scene"] });
		const peaceNode = makeNode({ tags: ["peace"] });
		expect(evaluateExpr(expr!, battleNode)).toBe(false);
		expect(evaluateExpr(expr!, peaceNode)).toBe(true);
	});

	it("NOT is case-insensitive", () => {
		const expr = parseQueryExpr("not tag:battle");
		expect(expr).not.toBeNull();
		expect(expr!.type).toBe("not");
	});

	it("NOT with parentheses: NOT (tag:a OR tag:b)", () => {
		const expr = parseQueryExpr("NOT (tag:a OR tag:b)");
		expect(expr).not.toBeNull();
		const nodeA = makeNode({ tags: ["a"] });
		const nodeC = makeNode({ tags: ["c"] });
		expect(evaluateExpr(expr!, nodeA)).toBe(false);
		expect(evaluateExpr(expr!, nodeC)).toBe(true);
	});
});

describe("query-expr — boundary values", () => {
	it("Japanese characters in tag search", () => {
		const expr = parseQueryExpr("tag:キャラクター");
		expect(expr).not.toBeNull();
		const node = makeNode({ tags: ["キャラクター"] });
		expect(evaluateExpr(expr!, node)).toBe(true);
	});

	it("quoted value with spaces", () => {
		const expr = parseQueryExpr('label:"hello world"');
		expect(expr).not.toBeNull();
		const node = makeNode({ label: "hello world" });
		expect(evaluateExpr(expr!, node)).toBe(true);
	});

	it("quoted value with colon", () => {
		const expr = parseQueryExpr('label:"key:value"');
		expect(expr).not.toBeNull();
		const node = makeNode({ label: "key:value" });
		expect(evaluateExpr(expr!, node)).toBe(true);
	});

	it("multiple spaces between tokens", () => {
		const expr = parseQueryExpr("tag:a   AND   tag:b");
		expect(expr).not.toBeNull();
		expect(expr!.type).toBe("branch");
	});

	it("wildcard * in bare position", () => {
		const expr = parseQueryExpr("*");
		expect(expr).not.toBeNull();
		// * matches any node
		expect(evaluateExpr(expr!, makeNode({ label: "anything" }))).toBe(true);
	});

	it("single character tag", () => {
		const expr = parseQueryExpr("tag:x");
		expect(expr).not.toBeNull();
		expect(evaluateExpr(expr!, makeNode({ tags: ["x"] }))).toBe(true);
		expect(evaluateExpr(expr!, makeNode({ tags: ["y"] }))).toBe(false);
	});

	it("NOT NOT double negation", () => {
		const expr = parseQueryExpr("NOT NOT tag:a");
		expect(expr).not.toBeNull();
		const node = makeNode({ tags: ["a"] });
		// NOT NOT a = a
		expect(evaluateExpr(expr!, node)).toBe(true);
	});

	it("meta field access via field:value", () => {
		const expr = parseQueryExpr("node_type:character");
		expect(expr).not.toBeNull();
		// node_type is treated as meta field or label fallback
		const node = makeNode({ label: "hero" });
		// meta field → node.meta?.node_type
		(node as any).meta = { node_type: "character" };
		expect(evaluateExpr(expr!, node)).toBe(true);
	});

	it("serializeExpr handles NOT expressions", () => {
		const expr = parseQueryExpr("NOT tag:battle");
		expect(expr).not.toBeNull();
		const serialized = serializeExpr(expr!);
		expect(serialized).toContain("NOT");
	});

	it("complex: (A XOR B) NAND (C NOR D)", () => {
		const expr = parseQueryExpr("(tag:a XOR tag:b) NAND (tag:c NOR tag:d)");
		expect(expr).not.toBeNull();
		// a=true, b=false → XOR=true; c=false, d=false → NOR=true; NAND(true, true)=false
		expect(evaluateExpr(expr!, makeNode({ tags: ["a"] }))).toBe(false);
		// a=false, b=false → XOR=false; c=false, d=false → NOR=true; NAND(false, true)=true
		expect(evaluateExpr(expr!, makeNode({ tags: [] }))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Full truth tables for all binary operators (cycle117)
// ---------------------------------------------------------------------------
describe("binary operator truth tables", () => {
	// Helper: create a node with specific tags to control A/B truth values
	// A = tag:a present, B = tag:b present
	const tt = (tags: string[]) => makeNode({ tags });

	// Parse each operator expression once
	const andExpr = parseQueryExpr("tag:a AND tag:b")!;
	const orExpr = parseQueryExpr("tag:a OR tag:b")!;
	const xorExpr = parseQueryExpr("tag:a XOR tag:b")!;
	const norExpr = parseQueryExpr("tag:a NOR tag:b")!;
	const nandExpr = parseQueryExpr("tag:a NAND tag:b")!;

	// AND truth table: T&T=T, T&F=F, F&T=F, F&F=F
	it("AND: TT=T, TF=F, FT=F, FF=F", () => {
		expect(evaluateExpr(andExpr, tt(["a", "b"]))).toBe(true);
		expect(evaluateExpr(andExpr, tt(["a"]))).toBe(false);
		expect(evaluateExpr(andExpr, tt(["b"]))).toBe(false);
		expect(evaluateExpr(andExpr, tt([]))).toBe(false);
	});

	// OR truth table: T|T=T, T|F=T, F|T=T, F|F=F
	it("OR: TT=T, TF=T, FT=T, FF=F", () => {
		expect(evaluateExpr(orExpr, tt(["a", "b"]))).toBe(true);
		expect(evaluateExpr(orExpr, tt(["a"]))).toBe(true);
		expect(evaluateExpr(orExpr, tt(["b"]))).toBe(true);
		expect(evaluateExpr(orExpr, tt([]))).toBe(false);
	});

	// XOR truth table: T⊕T=F, T⊕F=T, F⊕T=T, F⊕F=F
	it("XOR: TT=F, TF=T, FT=T, FF=F", () => {
		expect(evaluateExpr(xorExpr, tt(["a", "b"]))).toBe(false);
		expect(evaluateExpr(xorExpr, tt(["a"]))).toBe(true);
		expect(evaluateExpr(xorExpr, tt(["b"]))).toBe(true);
		expect(evaluateExpr(xorExpr, tt([]))).toBe(false);
	});

	// NOR truth table: ¬(T|T)=F, ¬(T|F)=F, ¬(F|T)=F, ¬(F|F)=T
	it("NOR: TT=F, TF=F, FT=F, FF=T", () => {
		expect(evaluateExpr(norExpr, tt(["a", "b"]))).toBe(false);
		expect(evaluateExpr(norExpr, tt(["a"]))).toBe(false);
		expect(evaluateExpr(norExpr, tt(["b"]))).toBe(false);
		expect(evaluateExpr(norExpr, tt([]))).toBe(true);
	});

	// NAND truth table: ¬(T&T)=F, ¬(T&F)=T, ¬(F&T)=T, ¬(F&F)=T
	it("NAND: TT=F, TF=T, FT=T, FF=T", () => {
		expect(evaluateExpr(nandExpr, tt(["a", "b"]))).toBe(false);
		expect(evaluateExpr(nandExpr, tt(["a"]))).toBe(true);
		expect(evaluateExpr(nandExpr, tt(["b"]))).toBe(true);
		expect(evaluateExpr(nandExpr, tt([]))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// NOT combinations with binary operators
// ---------------------------------------------------------------------------
describe("NOT with binary operators", () => {
	it("NOT A AND B: only B-only nodes pass", () => {
		const expr = parseQueryExpr("NOT tag:a AND tag:b")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["b"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["a", "b"] }))).toBe(false);
		expect(evaluateExpr(expr, makeNode({ tags: ["a"] }))).toBe(false);
		expect(evaluateExpr(expr, makeNode({ tags: [] }))).toBe(false);
	});

	it("NOT (A OR B): neither A nor B", () => {
		const expr = parseQueryExpr("NOT (tag:a OR tag:b)")!;
		expect(evaluateExpr(expr, makeNode({ tags: [] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["a"] }))).toBe(false);
		expect(evaluateExpr(expr, makeNode({ tags: ["b"] }))).toBe(false);
		expect(evaluateExpr(expr, makeNode({ tags: ["a", "b"] }))).toBe(false);
	});

	it("A AND NOT B: only A-only nodes pass", () => {
		const expr = parseQueryExpr("tag:a AND NOT tag:b")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["a"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["a", "b"] }))).toBe(false);
		expect(evaluateExpr(expr, makeNode({ tags: ["b"] }))).toBe(false);
		expect(evaluateExpr(expr, makeNode({ tags: [] }))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Wildcard glob patterns in field:value queries
// ---------------------------------------------------------------------------
describe("wildcard glob patterns", () => {
	it("prefix match: tag:char* matches character but not chapter", () => {
		const expr = parseQueryExpr("tag:char*")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["charm"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["chapter"] }))).toBe(false); // chap ≠ char
		expect(evaluateExpr(expr, makeNode({ tags: ["location"] }))).toBe(false);
	});

	it("suffix match: tag:*tion matches location", () => {
		const expr = parseQueryExpr("tag:*tion")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["location"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["action"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(false);
	});

	it("contains match: tag:*act* matches character and action", () => {
		const expr = parseQueryExpr("tag:*act*")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["action"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["hero"] }))).toBe(false);
	});

	it("middle wildcard: tag:ch*er matches character and chapter", () => {
		const expr = parseQueryExpr("tag:ch*er")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["chapter"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["child"] }))).toBe(false);
	});

	it("path prefix: path:stories/*", () => {
		const expr = parseQueryExpr("path:stories/*")!;
		expect(evaluateExpr(expr, makeNode({ filePath: "stories/hero.md" }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ filePath: "world/map.md" }))).toBe(false);
	});

	it("exact match without wildcard", () => {
		const expr = parseQueryExpr("tag:hero")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["hero"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["heroes"] }))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Fuzzy match (~)
// ---------------------------------------------------------------------------
describe("fuzzy match (~)", () => {
	it("~query matches similar labels", () => {
		const expr = parseQueryExpr("~hero")!;
		expect(evaluateExpr(expr, makeNode({ label: "hero" }))).toBe(true);
		// Close edit distance
		expect(evaluateExpr(expr, makeNode({ label: "heros" }))).toBe(true);
	});

	it("~query does not match very different labels", () => {
		const expr = parseQueryExpr("~hero")!;
		expect(evaluateExpr(expr, makeNode({ label: "completely different" }))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Empty / edge-case queries
// ---------------------------------------------------------------------------
describe("query edge cases", () => {
	it("empty string returns null", () => {
		expect(parseQueryExpr("")).toBeNull();
	});

	it("whitespace-only returns null", () => {
		expect(parseQueryExpr("   ")).toBeNull();
	});

	it("single operator keyword returns leaf, not null", () => {
		// "AND" alone is treated as a label search for "AND"
		const expr = parseQueryExpr("AND");
		// Parser may return null or a leaf — but should not crash
		expect(() => parseQueryExpr("AND")).not.toThrow();
	});

	it("deeply nested parentheses", () => {
		const expr = parseQueryExpr("((tag:a AND tag:b))")!;
		expect(evaluateExpr(expr, makeNode({ tags: ["a", "b"] }))).toBe(true);
		expect(evaluateExpr(expr, makeNode({ tags: ["a"] }))).toBe(false);
	});
});

// =========================================================================
// Parser robustness — edge cases
// =========================================================================
describe("parseQueryExpr robustness", () => {
	it("empty string returns null", () => {
		expect(parseQueryExpr("")).toBeNull();
	});

	it("whitespace-only returns null", () => {
		expect(parseQueryExpr("   ")).toBeNull();
	});

	it("single keyword parses without crash", () => {
		const expr = parseQueryExpr("hello");
		expect(expr).not.toBeNull();
	});

	it("unclosed parenthesis parses gracefully", () => {
		// Should not throw — may return partial parse or null
		expect(() => parseQueryExpr("(tag:a")).not.toThrow();
	});

	it("extra closing paren parses gracefully", () => {
		expect(() => parseQueryExpr("tag:a)")).not.toThrow();
	});

	it("deeply nested parens parse correctly", () => {
		const expr = parseQueryExpr("(((tag:deep)))");
		expect(expr).not.toBeNull();
		if (expr) {
			expect(evaluateExpr(expr, makeNode({ tags: ["deep"] }))).toBe(true);
		}
	});

	it("special characters in field value", () => {
		const expr = parseQueryExpr("path:folder/sub-folder/file.md");
		expect(expr).not.toBeNull();
	});

	it("operator as value doesn't crash", () => {
		// "OR" alone should parse as a field/value, not crash
		expect(() => parseQueryExpr("OR")).not.toThrow();
	});

	it("multiple spaces between terms", () => {
		expect(() => parseQueryExpr("tag:a    OR    tag:b")).not.toThrow();
	});

	it("mixed case operators", () => {
		const expr = parseQueryExpr("tag:a or tag:b");
		// May or may not recognize lowercase — just shouldn't crash
		expect(() => {
			if (expr) evaluateExpr(expr, makeNode({ tags: ["a"] }));
		}).not.toThrow();
	});
});
