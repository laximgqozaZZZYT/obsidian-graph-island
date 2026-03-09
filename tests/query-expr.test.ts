import { describe, it, expect } from "vitest";
import { evaluateExpr, parseQueryExpr, serializeExpr, type QueryExpression, type QueryLeaf, type QueryBranch } from "../src/utils/query-expr";
import type { GraphNode } from "../src/types";

function makeNode(overrides?: Partial<GraphNode>): GraphNode {
  return { id: "n1", label: "Alice", x: 0, y: 0, vx: 0, vy: 0, tags: ["character", "protagonist"], category: "person", filePath: "characters/alice.md", ...overrides };
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
      type: "branch", op: "AND",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "tag", value: "protagonist" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(false);
  });

  it("branch: OR", () => {
    const expr: QueryExpression = {
      type: "branch", op: "OR",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "tag", value: "location" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["location"] }))).toBe(true);
    expect(evaluateExpr(expr, makeNode({ tags: ["item"] }))).toBe(false);
  });

  it("branch: XOR", () => {
    const expr: QueryExpression = {
      type: "branch", op: "XOR",
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
      type: "branch", op: "NOR",
      left: { type: "leaf", field: "tag", value: "x" },
      right: { type: "leaf", field: "tag", value: "y" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(true); // neither matches
  });

  it("branch: NAND", () => {
    const expr: QueryExpression = {
      type: "branch", op: "NAND",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "tag", value: "protagonist" },
    };
    expect(evaluateExpr(expr, makeNode())).toBe(false); // both true → NAND = false
    expect(evaluateExpr(expr, makeNode({ tags: ["character"] }))).toBe(true);
  });

  it("nested: (A OR B) AND C", () => {
    const expr: QueryExpression = {
      type: "branch", op: "AND",
      left: {
        type: "branch", op: "OR",
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
      type: "branch", op: "AND",
      left: { type: "leaf", field: "tag", value: "character" },
      right: { type: "leaf", field: "category", value: "person" },
    });
  });

  it("A OR B AND C → A OR (B AND C) [AND binds tighter]", () => {
    const expr = parseQueryExpr('tag:"a" OR tag:"b" AND tag:"c"');
    expect(expr).toEqual({
      type: "branch", op: "OR",
      left: { type: "leaf", field: "tag", value: "a" },
      right: {
        type: "branch", op: "AND",
        left: { type: "leaf", field: "tag", value: "b" },
        right: { type: "leaf", field: "tag", value: "c" },
      },
    });
  });

  it("parentheses override precedence: (A OR B) AND C", () => {
    const expr = parseQueryExpr('(tag:"a" OR tag:"b") AND tag:"c"');
    expect(expr).toEqual({
      type: "branch", op: "AND",
      left: {
        type: "branch", op: "OR",
        left: { type: "leaf", field: "tag", value: "a" },
        right: { type: "leaf", field: "tag", value: "b" },
      },
      right: { type: "leaf", field: "tag", value: "c" },
    });
  });

  it("XOR, NOR, NAND operators", () => {
    const expr = parseQueryExpr('tag:"a" XOR tag:"b"');
    expect(expr).toEqual({
      type: "branch", op: "XOR",
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
  it("leaf → field:\"value\"", () => {
    expect(serializeExpr({ type: "leaf", field: "tag", value: "character" })).toBe('tag:"character"');
  });

  it("label field omits field name", () => {
    expect(serializeExpr({ type: "leaf", field: "label", value: "Alice" })).toBe('"Alice"');
  });

  it("branch → left OP right", () => {
    const expr: QueryExpression = {
      type: "branch", op: "AND",
      left: { type: "leaf", field: "tag", value: "a" },
      right: { type: "leaf", field: "tag", value: "b" },
    };
    expect(serializeExpr(expr)).toBe('tag:"a" AND tag:"b"');
  });

  it("nested branches add parentheses when needed", () => {
    const expr: QueryExpression = {
      type: "branch", op: "AND",
      left: {
        type: "branch", op: "OR",
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
