/**
 * Tests for `src/views/panel-sections-filter-logic.ts` — pure (DOM-free)
 * helpers used by the display-tab section builders. Focuses on boundary
 * values: empty input, whitespace-only, undefined gates, idempotence.
 */
import { describe, it, expect } from "vitest";
import type { CardDisplayConfig } from "../src/types";
import {
	normalizeCardFields,
	normalizeDefinitionField,
	normalizeDonutBreakdownField,
	applyCardPreset,
	shouldShowCardSubSettings,
	shouldShowDonutSubSettings,
	shouldShowCableSubSettings,
	shouldShowRecencySlider,
	shouldShowImportanceMetric,
	shouldShowClusterLabelDetail,
	shouldShowFocusLayout,
	shouldShowHierarchyBreadcrumb,
	shouldShowApplyEgoButton,
	shouldShowMultiSelectSection,
	shouldShowRoadSubSettings,
	shouldShowRelationColorSection,
	shouldShowViewportList,
	shouldShowThumbnailToggle,
	shouldShowHierarchyTree,
	shouldShowOntologyBackbone,
	ensureHoverHighlightTypes,
	countActiveHoverHighlights,
	removeBookmark,
	removeViewport,
	DEFAULT_HOVER_HIGHLIGHT_TYPES,
} from "../src/views/panel-sections-filter-logic";

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

describe("normalizeCardFields", () => {
	it("returns empty array for empty string", () => {
		expect(normalizeCardFields("")).toEqual([]);
	});

	it("returns empty array for whitespace-only input", () => {
		expect(normalizeCardFields("   ")).toEqual([]);
	});

	it("trims surrounding whitespace from each field", () => {
		expect(normalizeCardFields("  a , b  ,c")).toEqual(["a", "b", "c"]);
	});

	it("drops empty entries from consecutive commas", () => {
		expect(normalizeCardFields("a,,b,,,c")).toEqual(["a", "b", "c"]);
	});

	it("keeps order of original input", () => {
		expect(normalizeCardFields("z,y,x")).toEqual(["z", "y", "x"]);
	});

	it("returns single element array for single field", () => {
		expect(normalizeCardFields("only")).toEqual(["only"]);
	});

	it("ignores trailing comma", () => {
		expect(normalizeCardFields("a,")).toEqual(["a"]);
	});
});

describe("normalizeDefinitionField", () => {
	it("returns empty string for empty input", () => {
		expect(normalizeDefinitionField("")).toBe("");
	});

	it("trims whitespace-only input to empty string", () => {
		expect(normalizeDefinitionField("   \t  ")).toBe("");
	});

	it("trims surrounding whitespace from field name", () => {
		expect(normalizeDefinitionField("  definition  ")).toBe("definition");
	});

	it("preserves internal whitespace", () => {
		expect(normalizeDefinitionField("  my field  ")).toBe("my field");
	});
});

describe("normalizeDonutBreakdownField", () => {
	it("collapses empty input to undefined", () => {
		expect(normalizeDonutBreakdownField("")).toBeUndefined();
	});

	it("collapses whitespace-only input to undefined", () => {
		expect(normalizeDonutBreakdownField("   ")).toBeUndefined();
	});

	it("returns trimmed value when non-empty", () => {
		expect(normalizeDonutBreakdownField("  category  ")).toBe("category");
	});
});

// ---------------------------------------------------------------------------
// applyCardPreset
// ---------------------------------------------------------------------------

describe("applyCardPreset", () => {
	const baseConfig: CardDisplayConfig = {
		preset: "custom",
		fields: ["originalField"],
		maxWidth: 999,
		showIcon: true,
		headerStyle: "plain",
		fieldFormat: "key-value",
	};

	it("applies compact preset overrides on top of base", () => {
		const out = applyCardPreset(baseConfig, "compact");
		expect(out.preset).toBe("compact");
		expect(out.fields).toEqual([]);
		expect(out.maxWidth).toBe(80);
		expect(out.showIcon).toBe(false);
		expect(out.headerStyle).toBe("plain");
	});

	it("applies detailed preset overrides on top of base", () => {
		const out = applyCardPreset(baseConfig, "detailed");
		expect(out.preset).toBe("detailed");
		expect(out.fields).toEqual(["category"]);
		expect(out.maxWidth).toBe(150);
		expect(out.showIcon).toBe(true);
		expect(out.headerStyle).toBe("table");
	});

	it("applies full preset overrides on top of base", () => {
		const out = applyCardPreset(baseConfig, "full");
		expect(out.preset).toBe("full");
		expect(out.fields).toEqual(["category", "node_type", "tags"]);
		expect(out.maxWidth).toBe(200);
		expect(out.showIcon).toBe(true);
		expect(out.headerStyle).toBe("table");
	});

	it("custom preset preserves user values, only updates preset marker", () => {
		const out = applyCardPreset(baseConfig, "custom");
		expect(out.preset).toBe("custom");
		expect(out.fields).toEqual(["originalField"]);
		expect(out.maxWidth).toBe(999);
		expect(out.showIcon).toBe(true);
	});

	it("preserves unrelated fields (e.g. fieldFormat) across preset application", () => {
		const out = applyCardPreset(baseConfig, "compact");
		expect(out.fieldFormat).toBe("key-value");
	});

	it("returns a new object (does not mutate input)", () => {
		const out = applyCardPreset(baseConfig, "full");
		expect(out).not.toBe(baseConfig);
		expect(baseConfig.preset).toBe("custom"); // unchanged
		expect(baseConfig.fields).toEqual(["originalField"]); // unchanged
	});
});

// ---------------------------------------------------------------------------
// Visibility predicates — single-arg gates
// ---------------------------------------------------------------------------

describe("shouldShowCardSubSettings", () => {
	it("returns true only for card mode", () => {
		expect(shouldShowCardSubSettings("card")).toBe(true);
		expect(shouldShowCardSubSettings("node")).toBe(false);
		expect(shouldShowCardSubSettings("donut")).toBe(false);
		expect(shouldShowCardSubSettings("sunburst-segment")).toBe(false);
	});
});

describe("shouldShowDonutSubSettings", () => {
	it("returns true only for donut mode", () => {
		expect(shouldShowDonutSubSettings("donut")).toBe(true);
		expect(shouldShowDonutSubSettings("node")).toBe(false);
		expect(shouldShowDonutSubSettings("card")).toBe(false);
		expect(shouldShowDonutSubSettings("sunburst-segment")).toBe(false);
	});
});

describe("shouldShowCableSubSettings", () => {
	it("returns true for auto and always, false for never", () => {
		expect(shouldShowCableSubSettings("auto")).toBe(true);
		expect(shouldShowCableSubSettings("always")).toBe(true);
		expect(shouldShowCableSubSettings("never")).toBe(false);
	});
});

describe("shouldShowRecencySlider", () => {
	it("returns false when flag missing", () => {
		expect(shouldShowRecencySlider({})).toBe(false);
	});
	it("returns false when flag is false", () => {
		expect(shouldShowRecencySlider({ showRecencyMarker: false })).toBe(false);
	});
	it("returns true when flag is true", () => {
		expect(shouldShowRecencySlider({ showRecencyMarker: true })).toBe(true);
	});
});

describe("shouldShowImportanceMetric", () => {
	it("returns false when flag missing", () => {
		expect(shouldShowImportanceMetric({})).toBe(false);
	});
	it("returns true when flag is true", () => {
		expect(shouldShowImportanceMetric({ showImportanceRing: true })).toBe(true);
	});
});

describe("shouldShowClusterLabelDetail", () => {
	it("requires both showTagNodes and tagDisplay==='enclosure'", () => {
		expect(shouldShowClusterLabelDetail({ showTagNodes: true, tagDisplay: "enclosure" })).toBe(true);
	});
	it("returns false when showTagNodes is false", () => {
		expect(shouldShowClusterLabelDetail({ showTagNodes: false, tagDisplay: "enclosure" })).toBe(false);
	});
	it("returns false when tagDisplay is 'node' (not enclosure)", () => {
		expect(shouldShowClusterLabelDetail({ showTagNodes: true, tagDisplay: "node" })).toBe(false);
	});
	it("returns false when both flags missing", () => {
		expect(shouldShowClusterLabelDetail({})).toBe(false);
	});
});

describe("shouldShowFocusLayout", () => {
	it("returns true when focusMode is true", () => {
		expect(shouldShowFocusLayout({ focusMode: true })).toBe(true);
	});
	it("returns false when focusMode missing", () => {
		expect(shouldShowFocusLayout({})).toBe(false);
	});
});

describe("shouldShowHierarchyBreadcrumb", () => {
	it("returns true when localGraphCenter is a non-empty string", () => {
		expect(shouldShowHierarchyBreadcrumb({ localGraphCenter: "file.md" })).toBe(true);
	});
	it("returns true even for empty string (only null/undefined hides)", () => {
		expect(shouldShowHierarchyBreadcrumb({ localGraphCenter: "" })).toBe(true);
	});
	it("returns false when localGraphCenter is null", () => {
		expect(shouldShowHierarchyBreadcrumb({ localGraphCenter: null })).toBe(false);
	});
	it("returns false when localGraphCenter is undefined", () => {
		expect(shouldShowHierarchyBreadcrumb({})).toBe(false);
	});
});

describe("shouldShowApplyEgoButton", () => {
	it("returns true when focusNodeId is set", () => {
		expect(shouldShowApplyEgoButton({ focusNodeId: "n1" })).toBe(true);
	});
	it("returns true when localGraphCenter is set", () => {
		expect(shouldShowApplyEgoButton({ localGraphCenter: "file.md" })).toBe(true);
	});
	it("returns true when both are set", () => {
		expect(shouldShowApplyEgoButton({ focusNodeId: "n1", localGraphCenter: "file.md" })).toBe(true);
	});
	it("returns false when both are null", () => {
		expect(shouldShowApplyEgoButton({ focusNodeId: null, localGraphCenter: null })).toBe(false);
	});
	it("returns false when both are missing", () => {
		expect(shouldShowApplyEgoButton({})).toBe(false);
	});
});

describe("shouldShowMultiSelectSection", () => {
	it("returns true when at least one node is selected", () => {
		expect(shouldShowMultiSelectSection({ multiSelectNodeIds: ["n1"] })).toBe(true);
	});
	it("returns false for empty selection array", () => {
		expect(shouldShowMultiSelectSection({ multiSelectNodeIds: [] })).toBe(false);
	});
	it("returns false when missing entirely", () => {
		expect(shouldShowMultiSelectSection({})).toBe(false);
	});
});

describe("shouldShowRoadSubSettings", () => {
	it("returns true when showRoadNetwork is true", () => {
		expect(shouldShowRoadSubSettings({ showRoadNetwork: true })).toBe(true);
	});
	it("returns false when missing", () => {
		expect(shouldShowRoadSubSettings({})).toBe(false);
	});
});

describe("shouldShowRelationColorSection", () => {
	it("requires both colorEdgesByRelation flag and non-empty colors map", () => {
		expect(
			shouldShowRelationColorSection({ colorEdgesByRelation: true }, { relationColors: { size: 3 } }),
		).toBe(true);
	});
	it("returns false when flag is false even with colors", () => {
		expect(
			shouldShowRelationColorSection({ colorEdgesByRelation: false }, { relationColors: { size: 3 } }),
		).toBe(false);
	});
	it("returns false when colors map is empty (size 0)", () => {
		expect(
			shouldShowRelationColorSection({ colorEdgesByRelation: true }, { relationColors: { size: 0 } }),
		).toBe(false);
	});
	it("returns false when both gates fail", () => {
		expect(shouldShowRelationColorSection({}, { relationColors: { size: 0 } })).toBe(false);
	});
});

describe("shouldShowViewportList", () => {
	it("returns true when at least one viewport saved", () => {
		expect(shouldShowViewportList({ savedViewports: [{ name: "a" }] })).toBe(true);
	});
	it("returns false for empty array", () => {
		expect(shouldShowViewportList({ savedViewports: [] })).toBe(false);
	});
	it("returns false when missing entirely", () => {
		expect(shouldShowViewportList({})).toBe(false);
	});
	it("returns false when value is not an array", () => {
		expect(shouldShowViewportList({ savedViewports: undefined })).toBe(false);
	});
});

describe("shouldShowThumbnailToggle", () => {
	it("returns true when image meta nodes exist", () => {
		expect(shouldShowThumbnailToggle({ hasImageMetaNodes: true })).toBe(true);
	});
	it("returns false otherwise", () => {
		expect(shouldShowThumbnailToggle({ hasImageMetaNodes: false })).toBe(false);
		expect(shouldShowThumbnailToggle({})).toBe(false);
	});
});

describe("shouldShowHierarchyTree", () => {
	it("returns true when inheritance edges exist", () => {
		expect(shouldShowHierarchyTree({ hasInheritanceEdges: true })).toBe(true);
	});
	it("returns false otherwise", () => {
		expect(shouldShowHierarchyTree({ hasInheritanceEdges: false })).toBe(false);
		expect(shouldShowHierarchyTree({})).toBe(false);
	});
});

describe("shouldShowOntologyBackbone", () => {
	it("returns true when ontology has at least one rule", () => {
		expect(shouldShowOntologyBackbone({ ontology: { rules: [{}] } })).toBe(true);
	});
	it("returns false for empty rules array", () => {
		expect(shouldShowOntologyBackbone({ ontology: { rules: [] } })).toBe(false);
	});
	it("returns false when ontology missing", () => {
		expect(shouldShowOntologyBackbone({})).toBe(false);
	});
	it("returns false when rules missing", () => {
		expect(shouldShowOntologyBackbone({ ontology: {} })).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Hover highlight defaults
// ---------------------------------------------------------------------------

describe("ensureHoverHighlightTypes", () => {
	it("returns full defaults when input is undefined", () => {
		expect(ensureHoverHighlightTypes(undefined)).toEqual(DEFAULT_HOVER_HIGHLIGHT_TYPES);
	});

	it("returns full defaults when input is empty object", () => {
		expect(ensureHoverHighlightTypes({})).toEqual(DEFAULT_HOVER_HIGHLIGHT_TYPES);
	});

	it("merges partial input on top of defaults", () => {
		const out = ensureHoverHighlightTypes({ sharedTags: true });
		expect(out).toEqual({
			forwardLinks: true,
			backlinks: true,
			sharedTags: true,
			sameFolder: false,
		});
	});

	it("partial values override defaults (false wins over default true)", () => {
		const out = ensureHoverHighlightTypes({ forwardLinks: false });
		expect(out.forwardLinks).toBe(false);
		expect(out.backlinks).toBe(true);
	});

	it("returns a new object (defaults reference stays stable)", () => {
		const out = ensureHoverHighlightTypes({ sharedTags: true });
		expect(out).not.toBe(DEFAULT_HOVER_HIGHLIGHT_TYPES);
		expect(DEFAULT_HOVER_HIGHLIGHT_TYPES.sharedTags).toBe(false);
	});
});

describe("countActiveHoverHighlights", () => {
	it("returns 0 for undefined", () => {
		expect(countActiveHoverHighlights(undefined)).toBe(0);
	});

	it("returns 0 for empty object", () => {
		expect(countActiveHoverHighlights({})).toBe(0);
	});

	it("returns 0 when all flags are false", () => {
		expect(
			countActiveHoverHighlights({
				forwardLinks: false,
				backlinks: false,
				sharedTags: false,
				sameFolder: false,
			}),
		).toBe(0);
	});

	it("returns 4 when all flags are true", () => {
		expect(
			countActiveHoverHighlights({
				forwardLinks: true,
				backlinks: true,
				sharedTags: true,
				sameFolder: true,
			}),
		).toBe(4);
	});

	it("counts only true flags", () => {
		expect(
			countActiveHoverHighlights({
				forwardLinks: true,
				backlinks: false,
				sharedTags: true,
				sameFolder: false,
			}),
		).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Collection mutations
// ---------------------------------------------------------------------------

describe("removeBookmark", () => {
	it("returns array without target id", () => {
		expect(removeBookmark(["a", "b", "c"], "b")).toEqual(["a", "c"]);
	});

	it("is idempotent when id not present", () => {
		expect(removeBookmark(["a", "b"], "missing")).toEqual(["a", "b"]);
	});

	it("removes all duplicates of id", () => {
		expect(removeBookmark(["a", "b", "a", "c", "a"], "a")).toEqual(["b", "c"]);
	});

	it("returns empty array when removing only entry", () => {
		expect(removeBookmark(["only"], "only")).toEqual([]);
	});

	it("works on empty input", () => {
		expect(removeBookmark([], "anything")).toEqual([]);
	});

	it("returns a new array (does not mutate input)", () => {
		const input = ["a", "b"];
		const out = removeBookmark(input, "a");
		expect(out).not.toBe(input);
		expect(input).toEqual(["a", "b"]);
	});
});

describe("removeViewport", () => {
	it("removes a target by reference equality", () => {
		const v1 = { name: "one" };
		const v2 = { name: "two" };
		const v3 = { name: "three" };
		expect(removeViewport([v1, v2, v3], v2)).toEqual([v1, v3]);
	});

	it("does not remove structurally-equal but distinct objects", () => {
		const v1 = { name: "one" };
		const v1Twin = { name: "one" };
		expect(removeViewport([v1], v1Twin)).toEqual([v1]);
	});

	it("returns empty array for empty input", () => {
		expect(removeViewport([], { name: "x" })).toEqual([]);
	});

	it("works for primitive values", () => {
		expect(removeViewport([1, 2, 3, 2], 2)).toEqual([1, 3]);
	});

	it("returns a new array (does not mutate input)", () => {
		const v1 = { name: "one" };
		const input = [v1];
		const out = removeViewport(input, v1);
		expect(out).not.toBe(input);
		expect(input).toEqual([v1]);
	});
});
