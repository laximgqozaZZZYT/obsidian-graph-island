/**
 * Tests for `src/views/panel-sections-filter-logic.ts` — pure (DOM-free)
 * helpers used by the display-tab section builders. Focuses on boundary
 * values: empty input, whitespace-only, undefined gates, idempotence.
 */
import { describe, it, expect } from "vitest";
import {
	normalizeDefinitionField,
	shouldShowCardSubSettings,
	shouldShowDonutSubSettings,
	shouldShowRecencySlider,
	shouldShowImportanceMetric,
	shouldShowClusterLabelDetail,
	shouldShowFocusLayout,
	shouldShowThumbnailToggle,
	shouldShowOntologyBackbone,
	ensureHoverHighlightTypes,
	removeBookmark,
	DEFAULT_HOVER_HIGHLIGHT_TYPES,
} from "../src/views/panel-sections-filter-logic";

// ---------------------------------------------------------------------------
// Input normalization
// ---------------------------------------------------------------------------

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

describe("shouldShowThumbnailToggle", () => {
	it("returns true when image meta nodes exist", () => {
		expect(shouldShowThumbnailToggle({ hasImageMetaNodes: true })).toBe(true);
	});
	it("returns false otherwise", () => {
		expect(shouldShowThumbnailToggle({ hasImageMetaNodes: false })).toBe(false);
		expect(shouldShowThumbnailToggle({})).toBe(false);
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
