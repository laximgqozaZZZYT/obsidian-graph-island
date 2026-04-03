/**
 * Additional tests for panel-widgets pure functions and DOM helpers.
 */
import { describe, it, expect, vi } from "vitest";
import {
  getUnifiedFieldSuggestions,
  getGroupByOptions,
  parseGroupByRules,
  serializeGroupByRules,
  deriveClusterRulesFromGroupBy,
  getQueryOptions,
  resolvePrefix,
  parseActiveToken,
  setCachedFieldSuggestions,
} from "../src/views/panel-widgets";
import type { PanelContext } from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// getUnifiedFieldSuggestions
// ---------------------------------------------------------------------------
describe("getUnifiedFieldSuggestions", () => {
  function makeCtx(keys: string[]): PanelContext {
    return {
      frontmatterKeys: keys,
      settings: {} as any,
    } as PanelContext;
  }

  it("returns built-in fields when no frontmatter keys", () => {
    const result = getUnifiedFieldSuggestions(makeCtx([]));
    expect(result).toContain("path");
    expect(result).toContain("file");
    expect(result).toContain("tag");
    expect(result).toContain("category");
    expect(result).toContain("folder");
    expect(result).toContain("id");
    expect(result).toContain("isTag");
  });

  it("includes custom frontmatter keys", () => {
    const result = getUnifiedFieldSuggestions(makeCtx(["story_order", "prop-category"]));
    expect(result).toContain("story_order");
    expect(result).toContain("prop-category");
    expect(result).toContain("tag"); // built-in still present
  });

  it("deduplicates fields", () => {
    const result = getUnifiedFieldSuggestions(makeCtx(["tag", "category", "custom"]));
    const tagCount = result.filter(f => f === "tag").length;
    expect(tagCount).toBe(1);
  });

  it("preserves order: built-in first, then custom", () => {
    const result = getUnifiedFieldSuggestions(makeCtx(["zzz", "aaa"]));
    const idxTag = result.indexOf("tag");
    const idxZzz = result.indexOf("zzz");
    expect(idxTag).toBeLessThan(idxZzz);
  });
});

// ---------------------------------------------------------------------------
// getGroupByOptions
// ---------------------------------------------------------------------------
describe("getGroupByOptions", () => {
  function makeCtx(keys: string[]): PanelContext {
    return { frontmatterKeys: keys, settings: {} as any } as PanelContext;
  }

  it("includes louvain as first option", () => {
    const opts = getGroupByOptions(makeCtx([]));
    expect(opts[0].value).toBe("louvain:?");
  });

  it("includes built-in fields with :? suffix", () => {
    const opts = getGroupByOptions(makeCtx([]));
    const values = opts.map(o => o.value);
    expect(values).toContain("tag:?");
    expect(values).toContain("category:?");
    expect(values).toContain("folder:?");
  });

  it("includes custom frontmatter keys with :? suffix", () => {
    const opts = getGroupByOptions(makeCtx(["node_type"]));
    const values = opts.map(o => o.value);
    expect(values).toContain("node_type:?");
  });

  it("deduplicates fields", () => {
    const opts = getGroupByOptions(makeCtx(["tag", "category"]));
    const tagCount = opts.filter(o => o.value === "tag:?").length;
    expect(tagCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// parseGroupByRules (additional edge cases)
// ---------------------------------------------------------------------------
describe("parseGroupByRules (extra)", () => {
  it("handles multiple comma-separated fields", () => {
    const rules = parseGroupByRules("tag,category,folder");
    expect(rules.length).toBe(3);
    expect(rules.map(r => r.field)).toEqual(["tag", "category", "folder"]);
  });

  it("handles mixed operators and commas", () => {
    const rules = parseGroupByRules("tag AND category,folder");
    expect(rules.length).toBe(3);
    expect(rules[0].field).toBe("tag");
    expect(rules[0].op).toBe("AND");
    expect(rules[1].field).toBe("category");
  });

  it("handles whitespace in fields", () => {
    const rules = parseGroupByRules("  tag  AND   category  ");
    expect(rules.length).toBe(2);
    expect(rules[0].field).toBe("tag");
    expect(rules[1].field).toBe("category");
  });

  it("handles all supported operators", () => {
    for (const op of ["AND", "OR", "XOR", "NOR", "NAND", "NOT"]) {
      const rules = parseGroupByRules(`tag ${op} category`);
      expect(rules.length).toBe(2);
      expect(rules[0].op).toBe(op);
    }
  });

  it("case-insensitive operators", () => {
    const rules = parseGroupByRules("tag and category");
    expect(rules.length).toBe(2);
    expect(rules[0].op).toBe("AND");
  });

  it("returns empty for 'none'", () => {
    expect(parseGroupByRules("none")).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(parseGroupByRules("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// serializeGroupByRules (additional)
// ---------------------------------------------------------------------------
describe("serializeGroupByRules (extra)", () => {
  it("serializes single rule without trailing op", () => {
    const result = serializeGroupByRules([{ field: "tag" }]);
    expect(result).toBe("tag");
  });

  it("serializes with default AND operator", () => {
    const result = serializeGroupByRules([
      { field: "tag" },
      { field: "category" },
    ]);
    expect(result).toBe("tag AND category");
  });

  it("serializes with explicit OR operator", () => {
    const result = serializeGroupByRules([
      { field: "tag", op: "OR" },
      { field: "category" },
    ]);
    expect(result).toBe("tag OR category");
  });

  it("returns 'none' for empty rules", () => {
    expect(serializeGroupByRules([])).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// deriveClusterRulesFromGroupBy (additional)
// ---------------------------------------------------------------------------
describe("deriveClusterRulesFromGroupBy (extra)", () => {
  it("filters empty field names", () => {
    const result = deriveClusterRulesFromGroupBy([
      { field: "tag" },
      { field: "  " },
      { field: "category" },
    ]);
    expect(result.length).toBe(2);
  });

  it("adds :? suffix when missing", () => {
    const result = deriveClusterRulesFromGroupBy([{ field: "tag" }]);
    expect(result[0].groupBy).toBe("tag:?");
  });

  it("preserves :? suffix when present", () => {
    const result = deriveClusterRulesFromGroupBy([{ field: "tag:?" }]);
    expect(result[0].groupBy).toBe("tag:?");
  });

  it("respects recursive flag", () => {
    const result = deriveClusterRulesFromGroupBy([
      { field: "folder", recursive: true },
    ]);
    expect(result[0].recursive).toBe(true);
  });

  it("defaults recursive to false", () => {
    const result = deriveClusterRulesFromGroupBy([{ field: "tag" }]);
    expect(result[0].recursive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolvePrefix (additional edge cases)
// ---------------------------------------------------------------------------
describe("resolvePrefix (extra)", () => {
  it("maps known prefixes with colon correctly", () => {
    expect(resolvePrefix("tag:")).toBe("tag");
    expect(resolvePrefix("path:")).toBe("path");
    expect(resolvePrefix("category:")).toBe("category");
    expect(resolvePrefix("file:")).toBe("file");
    expect(resolvePrefix("id:")).toBe("id");
  });

  it("strips colon for unknown prefix", () => {
    expect(resolvePrefix("custom_field:")).toBe("custom_field");
    expect(resolvePrefix("status:")).toBe("status");
  });

  it("returns empty for bare prefix without colon", () => {
    expect(resolvePrefix("tag")).toBe("");
    expect(resolvePrefix("custom")).toBe("");
  });

  it("handles empty string", () => {
    expect(resolvePrefix("")).toBe("");
  });

  it("handles single colon", () => {
    // ":" has length 1, so the endsWith(":") && length > 1 check fails
    expect(resolvePrefix(":")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseActiveToken (additional edge cases)
// ---------------------------------------------------------------------------
describe("parseActiveToken (extra)", () => {
  it("returns null for empty value", () => {
    expect(parseActiveToken("", 0)).toBeNull();
  });

  it("detects prefix:partial token", () => {
    const result = parseActiveToken("tag:val", 7);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.prefix).toBe("tag:");
      expect(result.partial).toBe("val");
    }
  });

  it("detects partial at beginning", () => {
    const result = parseActiveToken("tag:", 4);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.prefix).toBe("tag:");
      expect(result.partial).toBe("");
    }
  });

  it("handles cursor at start of value", () => {
    const result = parseActiveToken("tag:value other", 0);
    // Cursor at 0 means before = "", no token with colon
    expect(result).toBeNull();
  });

  it("handles multiple tokens", () => {
    const result = parseActiveToken("tag:a folder:b", 14);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.prefix).toBe("folder:");
    }
  });

  it("returns null when no colon in token", () => {
    const result = parseActiveToken("hello world", 5);
    expect(result).toBeNull();
  });

  it("returns null for unknown prefix without colon pattern", () => {
    // "abc" has no colon, should return null
    const result = parseActiveToken("abc", 3);
    expect(result).toBeNull();
  });

  it("returns tokenStart pointing after the colon", () => {
    const result = parseActiveToken("path:docs", 9);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.tokenStart).toBe(5); // after "path:"
    }
  });
});

// ---------------------------------------------------------------------------
// getQueryOptions
// ---------------------------------------------------------------------------
describe("getQueryOptions (extra)", () => {
  it("returns array of prefix/desc pairs", () => {
    const opts = getQueryOptions();
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBeGreaterThan(0);
    for (const opt of opts) {
      expect(typeof opt.prefix).toBe("string");
      expect(typeof opt.desc).toBe("string");
    }
  });

  it("includes common field prefixes", () => {
    const opts = getQueryOptions();
    const prefixes = opts.map(o => o.prefix);
    expect(prefixes).toContain("tag:");
  });
});

// ---------------------------------------------------------------------------
// setCachedFieldSuggestions
// ---------------------------------------------------------------------------
describe("setCachedFieldSuggestions", () => {
  it("does not throw", () => {
    expect(() => setCachedFieldSuggestions(["a", "b"])).not.toThrow();
  });

  it("accepts empty array", () => {
    expect(() => setCachedFieldSuggestions([])).not.toThrow();
  });
});
