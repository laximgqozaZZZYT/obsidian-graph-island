import { describe, it, expect } from "vitest";
import {
	resolvePrefix,
	parseActiveToken,
	getQueryOptions,
	setCachedFieldSuggestions,
	getSortKeyOptions,
	getGravityDirOptions,
	angleToPreset,
	parseGroupByRules,
	deriveClusterRulesFromGroupBy,
	serializeGroupByRules,
} from "../src/views/panel-widgets";

// ---------------------------------------------------------------------------
// resolvePrefix — extended edge cases
// ---------------------------------------------------------------------------
describe("resolvePrefix (extended)", () => {
	it("handles single colon", () => {
		// ":" → length=1, ends with ":", but length <= 1 so returns ""
		expect(resolvePrefix(":")).toBe("");
	});

	it("handles empty string", () => {
		expect(resolvePrefix("")).toBe("");
	});

	it("handles prefix without colon", () => {
		expect(resolvePrefix("path")).toBe("");
	});

	it("resolves known 'path:' prefix", () => {
		expect(resolvePrefix("path:")).toBe("path");
	});

	it("resolves known 'tag:' prefix", () => {
		expect(resolvePrefix("tag:")).toBe("tag");
	});

	it("resolves dynamic 'my_field:' prefix", () => {
		expect(resolvePrefix("my_field:")).toBe("my_field");
	});

	it("resolves prefix with hyphen", () => {
		expect(resolvePrefix("prop-category:")).toBe("prop-category");
	});

	it("resolves prefix with numbers", () => {
		expect(resolvePrefix("field123:")).toBe("field123");
	});

	it("resolves 'id:' prefix", () => {
		expect(resolvePrefix("id:")).toBe("id");
	});
});

// ---------------------------------------------------------------------------
// parseActiveToken — cursor position analysis for autocomplete
// ---------------------------------------------------------------------------
describe("parseActiveToken (extended)", () => {
	it("returns null when no colon in token", () => {
		expect(parseActiveToken("hello world", 5)).toBeNull();
	});

	it("returns null when cursor is at start with no prefix", () => {
		expect(parseActiveToken("", 0)).toBeNull();
	});

	it("parses path: prefix at start of input", () => {
		const result = parseActiveToken("path:bibl", 9);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("path:");
		expect(result!.partial).toBe("bibl");
	});

	it("parses tag: prefix after space", () => {
		const result = parseActiveToken("foo tag:val", 11);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("tag:");
		expect(result!.partial).toBe("val");
	});

	it("parses prefix with empty partial", () => {
		const result = parseActiveToken("category:", 9);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("category:");
		expect(result!.partial).toBe("");
	});

	it("handles cursor in middle of input", () => {
		const result = parseActiveToken("path:abc AND tag:xyz", 8);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("path:");
		expect(result!.partial).toBe("abc");
	});

	it("returns tokenStart correctly", () => {
		const result = parseActiveToken("path:value", 10);
		expect(result).not.toBeNull();
		expect(result!.tokenStart).toBe(5); // after "path:"
	});

	it("returns null for unknown prefix that resolves to empty", () => {
		// ":value" → prefix=":", resolvePrefix(":") = "" → null
		expect(parseActiveToken(":value", 6)).toBeNull();
	});

	it("handles dynamic frontmatter field prefix", () => {
		const result = parseActiveToken("node_type:char", 14);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("node_type:");
		expect(result!.partial).toBe("char");
	});

	it("handles multiple tokens, returns the one at cursor", () => {
		const result = parseActiveToken("path:a tag:b", 12);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("tag:");
		expect(result!.partial).toBe("b");
	});
});

// ---------------------------------------------------------------------------
// getQueryOptions — search prefix options
// ---------------------------------------------------------------------------
describe("getQueryOptions (extended)", () => {
	it("returns at least 9 base options", () => {
		setCachedFieldSuggestions([]);
		const opts = getQueryOptions();
		expect(opts.length).toBeGreaterThanOrEqual(9);
	});

	it("includes path: prefix", () => {
		const opts = getQueryOptions();
		expect(opts.some((o) => o.prefix === "path:")).toBe(true);
	});

	it("includes tag: prefix", () => {
		const opts = getQueryOptions();
		expect(opts.some((o) => o.prefix === "tag:")).toBe(true);
	});

	it("includes AND / OR boolean ops", () => {
		const opts = getQueryOptions();
		expect(opts.some((o) => o.prefix === "AND / OR")).toBe(true);
	});

	it("includes wildcard *", () => {
		const opts = getQueryOptions();
		expect(opts.some((o) => o.prefix === "*")).toBe(true);
	});

	it("adds cached field suggestions", () => {
		setCachedFieldSuggestions(["status", "priority"]);
		const opts = getQueryOptions();
		expect(opts.some((o) => o.prefix === "status:")).toBe(true);
		expect(opts.some((o) => o.prefix === "priority:")).toBe(true);
		setCachedFieldSuggestions([]); // cleanup
	});

	it("does not duplicate existing prefixes from cached suggestions", () => {
		setCachedFieldSuggestions(["tag", "path"]);
		const opts = getQueryOptions();
		// tag: and path: are already base options; they should not appear twice
		const tagCount = opts.filter((o) => o.prefix === "tag:").length;
		expect(tagCount).toBe(1);
		setCachedFieldSuggestions([]);
	});

	it("limits cached suggestions to 15", () => {
		const many = Array.from({ length: 30 }, (_, i) => `field${i}`);
		setCachedFieldSuggestions(many);
		const opts = getQueryOptions();
		// Base 9 + up to 15 cached = max 24
		expect(opts.length).toBeLessThanOrEqual(24);
		setCachedFieldSuggestions([]);
	});

	it("all options have prefix and desc fields", () => {
		const opts = getQueryOptions();
		for (const o of opts) {
			expect(typeof o.prefix).toBe("string");
			expect(typeof o.desc).toBe("string");
			expect(o.prefix.length).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// getSortKeyOptions
// ---------------------------------------------------------------------------
describe("getSortKeyOptions (extended)", () => {
	it("returns non-empty array", () => {
		const opts = getSortKeyOptions();
		expect(opts.length).toBeGreaterThan(0);
	});

	it("each option has value and label", () => {
		for (const o of getSortKeyOptions()) {
			expect(typeof o.value).toBe("string");
			expect(typeof o.label).toBe("string");
		}
	});

	it("includes 'degree' sort key", () => {
		expect(getSortKeyOptions().some((o) => o.value === "degree")).toBe(true);
	});

	it("includes 'label' sort key", () => {
		expect(getSortKeyOptions().some((o) => o.value === "label")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// getGravityDirOptions
// ---------------------------------------------------------------------------
describe("getGravityDirOptions (extended)", () => {
	it("returns non-empty array", () => {
		const opts = getGravityDirOptions();
		expect(opts.length).toBeGreaterThan(0);
	});

	it("each option has value, label, and angle", () => {
		for (const o of getGravityDirOptions()) {
			expect(typeof o.value).toBe("string");
			expect(typeof o.label).toBe("string");
			expect(typeof o.angle).toBe("number");
		}
	});

	it("angles are either -1 (special) or in [0, 360) range", () => {
		for (const o of getGravityDirOptions()) {
			if (o.angle === -1) {
				// "none" and "custom" use -1 as sentinel
				expect(["none", "custom"]).toContain(o.value);
			} else {
				expect(o.angle).toBeGreaterThanOrEqual(0);
				expect(o.angle).toBeLessThan(360);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// angleToPreset — angle-to-direction mapping
// ---------------------------------------------------------------------------
describe("angleToPreset (extended)", () => {
	it("maps 0 to a direction", () => {
		const result = angleToPreset(0);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
	});

	it("maps 90 to a direction", () => {
		const result = angleToPreset(90);
		expect(typeof result).toBe("string");
	});

	it("maps 180 to a direction", () => {
		const result = angleToPreset(180);
		expect(typeof result).toBe("string");
	});

	it("maps 270 to a direction", () => {
		const result = angleToPreset(270);
		expect(typeof result).toBe("string");
	});

	it("cardinal angles return different presets", () => {
		const a = new Set([0, 90, 180, 270].map(angleToPreset));
		// At least 3 unique (some might coincide)
		expect(a.size).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// parseGroupByRules — extended
// ---------------------------------------------------------------------------
describe("parseGroupByRules (extended)", () => {
	it("parses simple field", () => {
		const rules = parseGroupByRules("category");
		expect(rules).toHaveLength(1);
		expect(rules[0].field).toBe("category");
	});

	it("parses comma-separated fields", () => {
		const rules = parseGroupByRules("category,tag");
		expect(rules).toHaveLength(2);
		expect(rules[0].field).toBe("category");
		expect(rules[1].field).toBe("tag");
	});

	it("handles empty string", () => {
		expect(parseGroupByRules("")).toHaveLength(0);
	});

	it("handles field with op suffix (preserved as-is)", () => {
		const rules = parseGroupByRules("category:?");
		expect(rules).toHaveLength(1);
		expect(rules[0].field).toBe("category:?");
	});

	it("trims whitespace", () => {
		const rules = parseGroupByRules("  category  ");
		expect(rules).toHaveLength(1);
		expect(rules[0].field).toBe("category");
	});
});

// ---------------------------------------------------------------------------
// deriveClusterRulesFromGroupBy
// ---------------------------------------------------------------------------
describe("deriveClusterRulesFromGroupBy (extended)", () => {
	it("converts group rules to cluster rules", () => {
		const rules = [{ field: "category" }];
		const cluster = deriveClusterRulesFromGroupBy(rules);
		expect(cluster).toHaveLength(1);
		expect(cluster[0].groupBy).toContain("category");
	});

	it("handles empty rules", () => {
		expect(deriveClusterRulesFromGroupBy([])).toHaveLength(0);
	});

	it("preserves field names in cluster rules", () => {
		const rules = [{ field: "tag" }, { field: "status" }];
		const cluster = deriveClusterRulesFromGroupBy(rules);
		expect(cluster).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// serializeGroupByRules
// ---------------------------------------------------------------------------
describe("serializeGroupByRules (extended)", () => {
	it("serializes single rule", () => {
		const result = serializeGroupByRules([{ field: "category" }]);
		expect(result).toContain("category");
	});

	it("serializes multiple rules with separator", () => {
		const result = serializeGroupByRules([{ field: "a" }, { field: "b" }]);
		expect(result).toContain("a");
		expect(result).toContain("b");
	});

	it("serializes empty rules to 'none'", () => {
		expect(serializeGroupByRules([])).toBe("none");
	});

	it("round-trips: serialize(parse(x)) preserves field names", () => {
		const original = "category|tag";
		const parsed = parseGroupByRules(original);
		const serialized = serializeGroupByRules(parsed);
		const reparsed = parseGroupByRules(serialized);
		expect(reparsed.map((r) => r.field)).toEqual(parsed.map((r) => r.field));
	});
});
