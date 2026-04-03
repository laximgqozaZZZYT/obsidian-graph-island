import { describe, it, expect } from "vitest";
import {
  parseGroupByRules,
  deriveClusterRulesFromGroupBy,
  serializeGroupByRules,
  resolvePrefix,
  parseActiveToken,
  getUnifiedFieldSuggestions,
  getGroupByOptions,
  updateSliderProgress,
  _insertTextAtCursor,
  _replaceTokenAtPosition,
  _updateHintSelection,
} from "../src/views/panel-widgets";

// ---------------------------------------------------------------------------
// getUnifiedFieldSuggestions
// ---------------------------------------------------------------------------
describe("getUnifiedFieldSuggestions", () => {
  it("returns built-in fields with empty frontmatter keys", () => {
    const ctx = { frontmatterKeys: [] } as any;
    const result = getUnifiedFieldSuggestions(ctx);
    expect(result).toContain("path");
    expect(result).toContain("file");
    expect(result).toContain("tag");
    expect(result).toContain("category");
    expect(result).toContain("folder");
    expect(result).toContain("id");
    expect(result).toContain("isTag");
  });

  it("merges frontmatter keys without duplicates", () => {
    const ctx = { frontmatterKeys: ["node_type", "story_order", "path"] } as any;
    const result = getUnifiedFieldSuggestions(ctx);
    expect(result).toContain("node_type");
    expect(result).toContain("story_order");
    // "path" is both built-in and frontmatter — should appear once
    const pathCount = result.filter(f => f === "path").length;
    expect(pathCount).toBe(1);
  });

  it("preserves order: built-in first, then frontmatter", () => {
    const ctx = { frontmatterKeys: ["custom_field"] } as any;
    const result = getUnifiedFieldSuggestions(ctx);
    const pathIdx = result.indexOf("path");
    const customIdx = result.indexOf("custom_field");
    expect(pathIdx).toBeLessThan(customIdx);
  });

  it("handles large frontmatter key list", () => {
    const keys = Array.from({ length: 50 }, (_, i) => `field_${i}`);
    const ctx = { frontmatterKeys: keys } as any;
    const result = getUnifiedFieldSuggestions(ctx);
    expect(result.length).toBe(7 + 50); // 7 built-in + 50 custom
  });
});

// ---------------------------------------------------------------------------
// getGroupByOptions
// ---------------------------------------------------------------------------
describe("getGroupByOptions", () => {
  it("starts with louvain option", () => {
    const ctx = { frontmatterKeys: [] } as any;
    const opts = getGroupByOptions(ctx);
    expect(opts[0].value).toBe("louvain:?");
  });

  it("includes built-in fields with :? suffix", () => {
    const ctx = { frontmatterKeys: [] } as any;
    const opts = getGroupByOptions(ctx);
    const values = opts.map(o => o.value);
    expect(values).toContain("tag:?");
    expect(values).toContain("category:?");
    expect(values).toContain("folder:?");
  });

  it("includes frontmatter fields with :? suffix", () => {
    const ctx = { frontmatterKeys: ["prop-category"] } as any;
    const opts = getGroupByOptions(ctx);
    expect(opts.some(o => o.value === "prop-category:?")).toBe(true);
  });

  it("does not duplicate fields", () => {
    const ctx = { frontmatterKeys: ["tag", "category"] } as any;
    const opts = getGroupByOptions(ctx);
    const tagCount = opts.filter(o => o.value === "tag:?").length;
    expect(tagCount).toBe(1);
  });

  it("all options have labels", () => {
    const ctx = { frontmatterKeys: ["x"] } as any;
    for (const opt of getGroupByOptions(ctx)) {
      expect(opt.label).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// parseGroupByRules — extended
// ---------------------------------------------------------------------------
describe("parseGroupByRules — extended", () => {
  it("handles XOR operator", () => {
    const rules = parseGroupByRules("tags XOR category");
    expect(rules).toHaveLength(2);
    expect(rules[0].op).toBe("XOR");
  });

  it("handles NOR operator", () => {
    const rules = parseGroupByRules("a NOR b");
    expect(rules).toHaveLength(2);
    expect(rules[0].op).toBe("NOR");
  });

  it("handles NAND operator", () => {
    const rules = parseGroupByRules("a NAND b");
    expect(rules).toHaveLength(2);
    expect(rules[0].op).toBe("NAND");
  });

  it("handles NOT operator", () => {
    const rules = parseGroupByRules("a NOT b");
    expect(rules).toHaveLength(2);
    expect(rules[0].op).toBe("NOT");
  });

  it("handles multiple commas", () => {
    const rules = parseGroupByRules("a,b,c,d");
    expect(rules).toHaveLength(4);
    expect(rules.map(r => r.field)).toEqual(["a", "b", "c", "d"]);
  });

  it("handles trailing comma", () => {
    const rules = parseGroupByRules("tags,");
    expect(rules).toHaveLength(1);
    expect(rules[0].field).toBe("tags");
  });

  it("handles leading comma", () => {
    const rules = parseGroupByRules(",tags");
    expect(rules).toHaveLength(1);
    expect(rules[0].field).toBe("tags");
  });

  it("case-insensitive operator matching", () => {
    const rules = parseGroupByRules("a and b");
    expect(rules).toHaveLength(2);
    expect(rules[0].op).toBe("AND");
  });

  it("multiple operators in chain", () => {
    const rules = parseGroupByRules("a AND b OR c");
    expect(rules).toHaveLength(3);
    expect(rules[0].op).toBe("AND");
    expect(rules[1].op).toBe("OR");
  });
});

// ---------------------------------------------------------------------------
// deriveClusterRulesFromGroupBy — extended
// ---------------------------------------------------------------------------
describe("deriveClusterRulesFromGroupBy — extended", () => {
  it("handles fields with special characters", () => {
    const result = deriveClusterRulesFromGroupBy([{ field: "prop-category", indent: 0 }]);
    expect(result[0].groupBy).toBe("prop-category:?");
  });

  it("handles field already ending with :?", () => {
    const result = deriveClusterRulesFromGroupBy([{ field: "tags:?", indent: 0 }]);
    expect(result[0].groupBy).toBe("tags:?");
  });

  it("multiple rules", () => {
    const result = deriveClusterRulesFromGroupBy([
      { field: "tags", indent: 0 },
      { field: "category", indent: 0, recursive: true },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].recursive).toBe(false);
    expect(result[1].recursive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// serializeGroupByRules — extended
// ---------------------------------------------------------------------------
describe("serializeGroupByRules — extended", () => {
  it("three fields with mixed operators", () => {
    const result = serializeGroupByRules([
      { field: "tags", op: "OR", indent: 0 },
      { field: "category", op: "AND", indent: 0 },
      { field: "folder", indent: 0 },
    ]);
    expect(result).toBe("tags OR category AND folder");
  });

  it("single field without operator has no trailing AND", () => {
    const result = serializeGroupByRules([{ field: "tags", indent: 0 }]);
    expect(result).toBe("tags");
    expect(result).not.toContain("AND");
  });
});

// ---------------------------------------------------------------------------
// resolvePrefix — extended
// ---------------------------------------------------------------------------
describe("resolvePrefix — extended", () => {
  it("handles nested property prefix", () => {
    expect(resolvePrefix("metadata.author:")).toBe("metadata.author");
  });

  it("handles single-char prefix", () => {
    expect(resolvePrefix("x:")).toBe("x");
  });

  it("handles unicode prefix", () => {
    expect(resolvePrefix("日本語:")).toBe("日本語");
  });
});

// ---------------------------------------------------------------------------
// parseActiveToken — extended
// ---------------------------------------------------------------------------
describe("parseActiveToken — extended", () => {
  it("handles multiple tokens, cursor at last", () => {
    const result = parseActiveToken("tag:char file:test", 18);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("file:");
    expect(result!.partial).toBe("test");
  });

  it("cursor at boundary between tokens", () => {
    const result = parseActiveToken("tag:char file:test", 8);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("tag:");
    expect(result!.partial).toBe("char");
  });

  it("cursor at colon returns empty partial", () => {
    const result = parseActiveToken("tag:", 4);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("tag:");
    expect(result!.partial).toBe("");
  });

  it("handles path with slashes in value", () => {
    const result = parseActiveToken("path:folder/sub/file", 20);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("path:");
    expect(result!.partial).toBe("folder/sub/file");
  });
});

// ---------------------------------------------------------------------------
// updateSliderProgress
// ---------------------------------------------------------------------------
describe("updateSliderProgress", () => {
  it("sets --progress CSS variable correctly", () => {
    const el = {
      min: "0", max: "100", value: "50",
      style: { setProperty: (_k: string, _v: string) => {} },
    };
    let setKey = "";
    let setVal = "";
    el.style.setProperty = (k: string, v: string) => { setKey = k; setVal = v; };
    updateSliderProgress(el as any);
    expect(setKey).toBe("--progress");
    expect(setVal).toBe("50%");
  });

  it("handles min != 0", () => {
    const el = {
      min: "10", max: "30", value: "20",
      style: { setProperty: (_k: string, _v: string) => {} },
    };
    let setVal = "";
    el.style.setProperty = (_k: string, v: string) => { setVal = v; };
    updateSliderProgress(el as any);
    expect(setVal).toBe("50%");
  });

  it("handles value at min", () => {
    const el = {
      min: "0", max: "100", value: "0",
      style: { setProperty: (_k: string, _v: string) => {} },
    };
    let setVal = "";
    el.style.setProperty = (_k: string, v: string) => { setVal = v; };
    updateSliderProgress(el as any);
    expect(setVal).toBe("0%");
  });

  it("handles value at max", () => {
    const el = {
      min: "0", max: "100", value: "100",
      style: { setProperty: (_k: string, _v: string) => {} },
    };
    let setVal = "";
    el.style.setProperty = (_k: string, v: string) => { setVal = v; };
    updateSliderProgress(el as any);
    expect(setVal).toBe("100%");
  });
});
