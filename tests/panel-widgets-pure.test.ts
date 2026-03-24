import { describe, it, expect } from "vitest";
import {
  parseGroupByRules,
  deriveClusterRulesFromGroupBy,
  serializeGroupByRules,
  resolvePrefix,
  parseActiveToken,
  angleToPreset,
} from "../src/views/panel-widgets";

// ---------------------------------------------------------------------------
// resolvePrefix — known-prefix lookup + dynamic field support
// ---------------------------------------------------------------------------
describe("resolvePrefix", () => {
  it("resolves known prefixes to their field names", () => {
    expect(resolvePrefix("path:")).toBe("path");
    expect(resolvePrefix("file:")).toBe("file");
    expect(resolvePrefix("tag:")).toBe("tag");
    expect(resolvePrefix("category:")).toBe("category");
    expect(resolvePrefix("id:")).toBe("id");
  });

  it("resolves dynamic field prefixes by stripping colon", () => {
    expect(resolvePrefix("status:")).toBe("status");
    expect(resolvePrefix("node_type:")).toBe("node_type");
    expect(resolvePrefix("prop-category:")).toBe("prop-category");
  });

  it("returns empty string for bare colon", () => {
    expect(resolvePrefix(":")).toBe("");
  });

  it("returns empty string for no-colon strings", () => {
    expect(resolvePrefix("path")).toBe("");
    expect(resolvePrefix("")).toBe("");
    expect(resolvePrefix("hello world")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseActiveToken — cursor-aware token extraction for autocomplete
// ---------------------------------------------------------------------------
describe("parseActiveToken", () => {
  it("detects prefix:value at cursor", () => {
    const result = parseActiveToken("path:bibl", 9);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("path:");
    expect(result!.partial).toBe("bibl");
  });

  it("detects token after a space", () => {
    const result = parseActiveToken("hello tag:char", 14);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("tag:");
    expect(result!.partial).toBe("char");
  });

  it("returns null when cursor is not inside a prefix:value token", () => {
    expect(parseActiveToken("hello world", 11)).toBeNull();
    expect(parseActiveToken("", 0)).toBeNull();
  });

  it("returns null for cursor at start of prefix (no colon yet)", () => {
    expect(parseActiveToken("pat", 3)).toBeNull();
  });

  it("handles cursor mid-value correctly", () => {
    const result = parseActiveToken("file:abc/def", 8);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("file:");
    expect(result!.partial).toBe("abc");
  });

  it("works with dynamic frontmatter fields", () => {
    const result = parseActiveToken("status:active", 13);
    expect(result).not.toBeNull();
    expect(result!.prefix).toBe("status:");
    expect(result!.partial).toBe("active");
  });

  it("tokenStart points to the start of the partial value", () => {
    const result = parseActiveToken("tag:character", 13);
    expect(result).not.toBeNull();
    expect(result!.tokenStart).toBe(4); // right after "tag:"
  });
});

// ---------------------------------------------------------------------------
// angleToPreset — angle → named direction
// ---------------------------------------------------------------------------
describe("angleToPreset", () => {
  it("maps canonical angles to named presets", () => {
    expect(angleToPreset(270)).toBe("up");
    expect(angleToPreset(90)).toBe("down");
    expect(angleToPreset(180)).toBe("left");
    expect(angleToPreset(0)).toBe("right");
  });

  it("negative angle returns 'none'", () => {
    expect(angleToPreset(-1)).toBe("none");
    expect(angleToPreset(-999)).toBe("none");
  });

  it("non-canonical positive angle returns 'custom'", () => {
    expect(angleToPreset(45)).toBe("custom");
    expect(angleToPreset(135)).toBe("custom");
    expect(angleToPreset(360)).toBe("custom");
    expect(angleToPreset(1)).toBe("custom");
  });
});

// ---------------------------------------------------------------------------
// parseGroupByRules — string → rule array
// ---------------------------------------------------------------------------
describe("parseGroupByRules", () => {
  it("returns empty for 'none'", () => {
    expect(parseGroupByRules("none")).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(parseGroupByRules("")).toEqual([]);
  });

  it("parses single field", () => {
    const rules = parseGroupByRules("tags");
    expect(rules).toHaveLength(1);
    expect(rules[0].field).toBe("tags");
  });

  it("parses AND-separated fields with operator attached", () => {
    const rules = parseGroupByRules("prop-category AND tags");
    expect(rules).toHaveLength(2);
    expect(rules[0].field).toBe("prop-category");
    expect(rules[0].op).toBe("AND");
    expect(rules[1].field).toBe("tags");
  });

  it("parses OR operator", () => {
    const rules = parseGroupByRules("tags OR category");
    expect(rules).toHaveLength(2);
    expect(rules[0].op).toBe("OR");
  });

  it("parses comma-separated fields as separate rules", () => {
    const rules = parseGroupByRules("tags,category");
    expect(rules).toHaveLength(2);
    expect(rules[0].field).toBe("tags");
    expect(rules[1].field).toBe("category");
  });

  it("handles mixed comma and operator", () => {
    const rules = parseGroupByRules("a,b AND c");
    expect(rules).toHaveLength(3);
    expect(rules[0].field).toBe("a");
    expect(rules[1].field).toBe("b");
    expect(rules[1].op).toBe("AND");
    expect(rules[2].field).toBe("c");
  });

  it("handles whitespace-only input", () => {
    expect(parseGroupByRules("   ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// serializeGroupByRules — rule array → string
// ---------------------------------------------------------------------------
describe("serializeGroupByRules", () => {
  it("returns 'none' for empty rules", () => {
    expect(serializeGroupByRules([])).toBe("none");
  });

  it("serializes single field without trailing operator", () => {
    expect(serializeGroupByRules([{ field: "tags", indent: 0 }])).toBe("tags");
  });

  it("serializes two fields with default AND", () => {
    const result = serializeGroupByRules([
      { field: "prop-category", indent: 0 },
      { field: "tags", indent: 0 },
    ]);
    expect(result).toBe("prop-category AND tags");
  });

  it("preserves explicit operator", () => {
    const result = serializeGroupByRules([
      { field: "tags", op: "OR", indent: 0 },
      { field: "category", indent: 0 },
    ]);
    expect(result).toBe("tags OR category");
  });
});

// ---------------------------------------------------------------------------
// parseGroupByRules ↔ serializeGroupByRules round-trip
// ---------------------------------------------------------------------------
describe("parseGroupByRules ↔ serializeGroupByRules round-trip", () => {
  // TODO: User may want to add their own cases here
  const roundTrips = [
    { input: "none", expectedSerialized: "none" },
    { input: "tags", expectedSerialized: "tags" },
    { input: "prop-category AND tags", expectedSerialized: "prop-category AND tags" },
    { input: "tags OR category", expectedSerialized: "tags OR category" },
  ];

  for (const { input, expectedSerialized } of roundTrips) {
    it(`round-trips "${input}"`, () => {
      const rules = parseGroupByRules(input);
      const serialized = serializeGroupByRules(rules);
      expect(serialized).toBe(expectedSerialized);
    });
  }
});

// ---------------------------------------------------------------------------
// deriveClusterRulesFromGroupBy — groupByRules → clusterGroupRules
// ---------------------------------------------------------------------------
describe("deriveClusterRulesFromGroupBy", () => {
  it("returns empty for empty rules", () => {
    expect(deriveClusterRulesFromGroupBy([])).toEqual([]);
  });

  it("appends :? suffix when field lacks it", () => {
    const result = deriveClusterRulesFromGroupBy([{ field: "tags", indent: 0 }]);
    expect(result).toHaveLength(1);
    expect(result[0].groupBy).toBe("tags:?");
    expect(result[0].recursive).toBe(false);
  });

  it("preserves :? suffix when already present", () => {
    const result = deriveClusterRulesFromGroupBy([{ field: "tags:?", indent: 0 }]);
    expect(result[0].groupBy).toBe("tags:?");
  });

  it("skips empty-field rules", () => {
    const result = deriveClusterRulesFromGroupBy([
      { field: "tags", indent: 0 },
      { field: "  ", indent: 0 },
      { field: "category", indent: 0 },
    ]);
    expect(result).toHaveLength(2);
  });

  it("preserves recursive flag", () => {
    const result = deriveClusterRulesFromGroupBy([
      { field: "tags", indent: 0, recursive: true },
    ]);
    expect(result[0].recursive).toBe(true);
  });
});
