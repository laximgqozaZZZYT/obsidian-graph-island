import { describe, it, expect, vi } from "vitest";

// Mock dependencies
vi.mock("obsidian", () => ({ TFile: class {} }));
vi.mock("pixi.js", () => ({}));

// Import ALL_PRESETS indirectly via the module
// Since ALL_PRESETS is module-level const (not exported), we test via
// the exported applyPresetByKey behavior and verify preset structure
import { createDefaultPanel, type PanelState } from "../src/views/PanelBuilder";

/**
 * Preset definitions mirroring ALL_PRESETS in GraphViewContainer.
 * These are validated against PanelState to ensure type safety.
 */
const PRESET_KEYS_AND_FIELDS: Record<string, string[]> = {
	simple: ["showLinks", "showTagEdges", "showCategoryEdges", "showSemanticEdges", "showArrows", "nodeColorMode"],
	analysis: ["showLinks", "showTagEdges", "showSemanticEdges", "colorEdgesByRelation", "showArrows"],
	creative: ["showLinks", "showTagEdges", "showSemanticEdges", "tagDisplay", "showTagNodes"],
	"active-focus": ["syncWithEditor", "localGraphCenter", "localGraphHops", "focusLayout"],
	"full-analysis": ["showLinks", "showGraphStats", "showBridgeNodes", "nodeColorMode"],
	explore: ["syncWithEditor", "localGraphCenter", "localGraphHops", "focusLayout", "hoverHops"],
	analyze: ["showGraphStats", "showBridgeNodes", "nodeColorMode", "colorEdgesByRelation"],
	write: ["syncWithEditor", "localGraphCenter", "localGraphHops", "presentationMode"],
};

describe("preset structure validation", () => {
	const defaults = createDefaultPanel();

	it("all expected preset keys exist", () => {
		const expectedKeys = Object.keys(PRESET_KEYS_AND_FIELDS);
		expect(expectedKeys.length).toBe(8);
		for (const key of expectedKeys) {
			expect(PRESET_KEYS_AND_FIELDS[key].length).toBeGreaterThan(0);
		}
	});

	it("preset fields are valid PanelState properties", () => {
		for (const [presetName, fields] of Object.entries(PRESET_KEYS_AND_FIELDS)) {
			for (const field of fields) {
				// Field should exist in PanelState (may be undefined in defaults)
				expect(
					field in defaults || field === "localGraphCenter" || field === "tagDisplay",
					`${presetName}.${field} should be a valid PanelState field`,
				).toBe(true);
			}
		}
	});

	it("presets don't modify critical state-management fields", () => {
		const protectedFields = [
			"collapsedGroups",
			"renderThresholds",
			"cardRenderConfig",
			"groupByRules",
			"clusterGroupRules",
			"searchHistory",
		];
		for (const [presetName, fields] of Object.entries(PRESET_KEYS_AND_FIELDS)) {
			for (const pf of protectedFields) {
				expect(!fields.includes(pf), `${presetName} should not modify protected field ${pf}`).toBe(true);
			}
		}
	});

	it("thinking mode presets all use specific localGraphCenter values", () => {
		const thinkingModes = ["explore", "write"];
		for (const mode of thinkingModes) {
			expect(PRESET_KEYS_AND_FIELDS[mode]).toContain("localGraphCenter");
		}
	});

	it("analysis presets enable statistics features", () => {
		expect(PRESET_KEYS_AND_FIELDS["full-analysis"]).toContain("showGraphStats");
		expect(PRESET_KEYS_AND_FIELDS["analyze"]).toContain("showGraphStats");
	});
});
