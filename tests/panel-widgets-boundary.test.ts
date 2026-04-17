/**
 * panel-widgets — deeper boundary tests for pure parsing and serialization functions
 */
import { describe, it, expect } from "vitest";
import {
	parseGroupByRules,
	deriveClusterRulesFromGroupBy,
	serializeGroupByRules,
	resolvePrefix,
	parseActiveToken,
	angleToPreset,
	getQueryOptions,
	getSortKeyOptions,
	getGravityDirOptions,
	setCachedFieldSuggestions,
	getGroupByOptions,
} from "../src/views/panel-widgets";

// ---------------------------------------------------------------------------
// parseGroupByRules — boundary cases
// ---------------------------------------------------------------------------
describe("parseGroupByRules boundary", () => {
	it("returns empty for empty string", () => {
		expect(parseGroupByRules("")).toEqual([]);
	});

	it("returns empty for 'none'", () => {
		expect(parseGroupByRules("none")).toEqual([]);
	});

	it("parses single field", () => {
		const rules = parseGroupByRules("tag");
		expect(rules).toHaveLength(1);
		expect(rules[0].field).toBe("tag");
	});

	it("parses comma-separated fields", () => {
		const rules = parseGroupByRules("tag,category");
		expect(rules).toHaveLength(2);
		expect(rules[0].field).toBe("tag");
		expect(rules[1].field).toBe("category");
	});

	it("parses fields with AND operator", () => {
		const rules = parseGroupByRules("tag AND category");
		expect(rules).toHaveLength(2);
		expect(rules[0].field).toBe("tag");
		expect(rules[0].op).toBe("AND");
		expect(rules[1].field).toBe("category");
	});

	it("parses fields with OR operator", () => {
		const rules = parseGroupByRules("tag OR category");
		expect(rules[0].op).toBe("OR");
	});

	it("handles XOR operator", () => {
		const rules = parseGroupByRules("a XOR b");
		expect(rules[0].op).toBe("XOR");
	});

	it("handles NOR operator", () => {
		const rules = parseGroupByRules("a NOR b");
		expect(rules[0].op).toBe("NOR");
	});

	it("handles NAND operator", () => {
		const rules = parseGroupByRules("a NAND b");
		expect(rules[0].op).toBe("NAND");
	});

	it("handles NOT operator", () => {
		const rules = parseGroupByRules("a NOT b");
		expect(rules[0].op).toBe("NOT");
	});

	it("handles case-insensitive operators", () => {
		const rules = parseGroupByRules("tag and category");
		expect(rules[0].op).toBe("AND");
	});

	it("handles whitespace-only string", () => {
		const rules = parseGroupByRules("   ");
		expect(rules).toEqual([]);
	});

	it("handles leading/trailing whitespace", () => {
		const rules = parseGroupByRules("  tag  ");
		expect(rules).toHaveLength(1);
		expect(rules[0].field).toBe("tag");
	});

	it("handles multiple commas with spaces", () => {
		const rules = parseGroupByRules("a, b, c");
		expect(rules).toHaveLength(3);
		expect(rules.map((r) => r.field)).toEqual(["a", "b", "c"]);
	});

	it("handles field with special characters", () => {
		const rules = parseGroupByRules("prop-category:?");
		expect(rules[0].field).toBe("prop-category:?");
	});
});

// ---------------------------------------------------------------------------
// deriveClusterRulesFromGroupBy — boundary
// ---------------------------------------------------------------------------
describe("deriveClusterRulesFromGroupBy boundary", () => {
	it("returns empty for empty rules", () => {
		expect(deriveClusterRulesFromGroupBy([])).toEqual([]);
	});

	it("appends :? to fields without it", () => {
		const rules = deriveClusterRulesFromGroupBy([{ field: "tag", indent: 0 }]);
		expect(rules[0].groupBy).toBe("tag:?");
	});

	it("does not double-append :? to fields that already have it", () => {
		const rules = deriveClusterRulesFromGroupBy([{ field: "tag:?", indent: 0 }]);
		expect(rules[0].groupBy).toBe("tag:?");
	});

	it("filters out empty/whitespace fields", () => {
		const rules = deriveClusterRulesFromGroupBy([
			{ field: "", indent: 0 },
			{ field: "   ", indent: 0 },
			{ field: "tag", indent: 0 },
		]);
		expect(rules).toHaveLength(1);
		expect(rules[0].groupBy).toBe("tag:?");
	});

	it("respects recursive flag", () => {
		const rules = deriveClusterRulesFromGroupBy([{ field: "tag", indent: 0, recursive: true }]);
		expect(rules[0].recursive).toBe(true);
	});

	it("defaults recursive to false", () => {
		const rules = deriveClusterRulesFromGroupBy([{ field: "tag", indent: 0 }]);
		expect(rules[0].recursive).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// serializeGroupByRules — round-trip
// ---------------------------------------------------------------------------
describe("serializeGroupByRules boundary", () => {
	it("returns 'none' for empty rules", () => {
		expect(serializeGroupByRules([])).toBe("none");
	});

	it("serializes single rule without trailing operator", () => {
		const result = serializeGroupByRules([{ field: "tag", indent: 0 }]);
		expect(result).toBe("tag");
	});

	it("serializes two rules with default AND", () => {
		const result = serializeGroupByRules([
			{ field: "tag", indent: 0 },
			{ field: "category", indent: 0 },
		]);
		expect(result).toBe("tag AND category");
	});

	it("serializes custom operator", () => {
		const result = serializeGroupByRules([
			{ field: "tag", indent: 0, op: "OR" },
			{ field: "category", indent: 0 },
		]);
		expect(result).toBe("tag OR category");
	});

	it("round-trips correctly", () => {
		const original = "tag AND category";
		const rules = parseGroupByRules(original);
		const serialized = serializeGroupByRules(rules);
		expect(serialized).toBe(original);
	});

	it("round-trips OR operator", () => {
		const original = "a OR b";
		const rules = parseGroupByRules(original);
		const serialized = serializeGroupByRules(rules);
		expect(serialized).toBe(original);
	});
});

// ---------------------------------------------------------------------------
// resolvePrefix — boundary cases
// ---------------------------------------------------------------------------
describe("resolvePrefix boundary", () => {
	it("resolves known path prefix", () => {
		expect(resolvePrefix("path:")).toBe("path");
	});

	it("resolves unknown but valid prefix", () => {
		expect(resolvePrefix("node_type:")).toBe("node_type");
	});

	it("returns empty for single colon", () => {
		expect(resolvePrefix(":")).toBe("");
	});

	it("returns empty for no colon", () => {
		expect(resolvePrefix("hello")).toBe("");
	});

	it("resolves prefix with hyphen", () => {
		expect(resolvePrefix("prop-category:")).toBe("prop-category");
	});
});

// ---------------------------------------------------------------------------
// parseActiveToken — cursor-aware parsing
// ---------------------------------------------------------------------------
describe("parseActiveToken boundary", () => {
	it("returns null for no colon in input", () => {
		expect(parseActiveToken("hello world", 5)).toBeNull();
	});

	it("returns null for cursor at start", () => {
		expect(parseActiveToken("path:test", 0)).toBeNull();
	});

	it("detects token at beginning of string", () => {
		const result = parseActiveToken("path:test", 9);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("path:");
		expect(result!.partial).toBe("test");
	});

	it("detects token after space", () => {
		const result = parseActiveToken("hello tag:char", 14);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("tag:");
		expect(result!.partial).toBe("char");
	});

	it("returns empty partial when cursor is right after colon", () => {
		const result = parseActiveToken("path:", 5);
		expect(result).not.toBeNull();
		expect(result!.partial).toBe("");
	});

	it("returns correct tokenStart", () => {
		const result = parseActiveToken("foo tag:bar", 11);
		expect(result!.tokenStart).toBe(8); // after "tag:"
	});

	it("handles multiple colons — uses first colon in token", () => {
		const result = parseActiveToken("path:a:b", 8);
		expect(result).not.toBeNull();
		expect(result!.prefix).toBe("path:");
		expect(result!.partial).toBe("a:b");
	});
});

// ---------------------------------------------------------------------------
// angleToPreset — angle-to-name mapping
// ---------------------------------------------------------------------------
describe("angleToPreset boundary", () => {
	it("returns 'none' for negative angles", () => {
		expect(angleToPreset(-1)).toBe("none");
		expect(angleToPreset(-100)).toBe("none");
	});

	it("returns 'right' for 0", () => {
		expect(angleToPreset(0)).toBe("right");
	});

	it("returns 'down' for 90", () => {
		expect(angleToPreset(90)).toBe("down");
	});

	it("returns 'left' for 180", () => {
		expect(angleToPreset(180)).toBe("left");
	});

	it("returns 'up' for 270", () => {
		expect(angleToPreset(270)).toBe("up");
	});

	it("returns 'custom' for non-standard angles", () => {
		expect(angleToPreset(45)).toBe("custom");
		expect(angleToPreset(135)).toBe("custom");
		expect(angleToPreset(360)).toBe("custom");
	});
});

// ---------------------------------------------------------------------------
// getQueryOptions — includes cached field suggestions
// ---------------------------------------------------------------------------
describe("getQueryOptions with cached suggestions", () => {
	it("returns base options when no cached suggestions", () => {
		setCachedFieldSuggestions([]);
		const options = getQueryOptions();
		expect(options.length).toBeGreaterThanOrEqual(9); // base set
		expect(options.some((o) => o.prefix === "path:")).toBe(true);
		expect(options.some((o) => o.prefix === "tag:")).toBe(true);
	});

	it("appends cached field suggestions", () => {
		setCachedFieldSuggestions(["status", "node_type"]);
		const options = getQueryOptions();
		expect(options.some((o) => o.prefix === "status:")).toBe(true);
		expect(options.some((o) => o.prefix === "node_type:")).toBe(true);
		// Clean up
		setCachedFieldSuggestions([]);
	});

	it("does not duplicate existing prefixes", () => {
		setCachedFieldSuggestions(["tag", "category"]);
		const options = getQueryOptions();
		const tagOptions = options.filter((o) => o.prefix === "tag:");
		expect(tagOptions).toHaveLength(1);
		setCachedFieldSuggestions([]);
	});

	it("limits to 15 suggestions", () => {
		const manyFields = Array.from({ length: 30 }, (_, i) => `field${i}`);
		setCachedFieldSuggestions(manyFields);
		const options = getQueryOptions();
		// 9 base + at most 15 dynamic = 24
		expect(options.length).toBeLessThanOrEqual(24);
		setCachedFieldSuggestions([]);
	});
});

// ---------------------------------------------------------------------------
// getSortKeyOptions — complete coverage
// ---------------------------------------------------------------------------
describe("getSortKeyOptions completeness", () => {
	it("returns at least 6 options", () => {
		const options = getSortKeyOptions();
		expect(options.length).toBeGreaterThanOrEqual(6);
	});

	it("includes degree and label sort keys", () => {
		const options = getSortKeyOptions();
		const values = options.map((o) => o.value);
		expect(values).toContain("degree");
		expect(values).toContain("label");
	});

	it("all options have non-empty labels", () => {
		for (const opt of getSortKeyOptions()) {
			expect(opt.label.length).toBeGreaterThan(0);
		}
	});
});

// ---------------------------------------------------------------------------
// getGravityDirOptions — completeness
// ---------------------------------------------------------------------------
describe("getGravityDirOptions completeness", () => {
	it("includes all four cardinal directions plus none and custom", () => {
		const options = getGravityDirOptions();
		const values = options.map((o) => o.value);
		expect(values).toContain("none");
		expect(values).toContain("up");
		expect(values).toContain("down");
		expect(values).toContain("left");
		expect(values).toContain("right");
		expect(values).toContain("custom");
	});

	it("up has angle 270", () => {
		const opt = getGravityDirOptions().find((o) => o.value === "up");
		expect(opt!.angle).toBe(270);
	});

	it("down has angle 90", () => {
		const opt = getGravityDirOptions().find((o) => o.value === "down");
		expect(opt!.angle).toBe(90);
	});

	it("left has angle 180", () => {
		const opt = getGravityDirOptions().find((o) => o.value === "left");
		expect(opt!.angle).toBe(180);
	});

	it("right has angle 0", () => {
		const opt = getGravityDirOptions().find((o) => o.value === "right");
		expect(opt!.angle).toBe(0);
	});

	it("none has angle -1", () => {
		const opt = getGravityDirOptions().find((o) => o.value === "none");
		expect(opt!.angle).toBe(-1);
	});
});
