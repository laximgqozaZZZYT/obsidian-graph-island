import { describe, it, expect, vi } from "vitest";
import {
	ensureRT,
	createDefaultPanel,
	validatePanelState,
	DEFAULT_PANEL,
	type PanelState,
} from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// ensureRT — lazy-initialize renderThresholds
// ---------------------------------------------------------------------------
describe("ensureRT", () => {
	it("initializes renderThresholds when undefined", () => {
		const panel = createDefaultPanel();
		panel.renderThresholds = undefined;
		const rt = ensureRT(panel);
		expect(rt).toBeDefined();
		expect(typeof rt).toBe("object");
		expect(panel.renderThresholds).toBe(rt);
	});

	it("returns existing renderThresholds when already set", () => {
		const panel = createDefaultPanel();
		panel.renderThresholds = { nodeSizeByDegree: true };
		const rt = ensureRT(panel);
		expect(rt.nodeSizeByDegree).toBe(true);
		expect(rt).toBe(panel.renderThresholds);
	});

	it("allows mutation of returned reference", () => {
		const panel = createDefaultPanel();
		panel.renderThresholds = undefined;
		const rt = ensureRT(panel);
		rt.autoLOD = true;
		expect(panel.renderThresholds!.autoLOD).toBe(true);
	});

	it("does not overwrite pre-existing fields", () => {
		const panel = createDefaultPanel();
		panel.renderThresholds = { labelOverlapMargin: 20 };
		const rt = ensureRT(panel);
		expect(rt.labelOverlapMargin).toBe(20);
	});

	it("idempotent: calling twice returns same object", () => {
		const panel = createDefaultPanel();
		const rt1 = ensureRT(panel);
		const rt2 = ensureRT(panel);
		expect(rt1).toBe(rt2);
	});
});

// ---------------------------------------------------------------------------
// DEFAULT_PANEL — frozen singleton
// ---------------------------------------------------------------------------
describe("DEFAULT_PANEL", () => {
	it("is frozen (immutable)", () => {
		expect(Object.isFrozen(DEFAULT_PANEL)).toBe(true);
	});

	it("contains all keys from createDefaultPanel", () => {
		const fresh = createDefaultPanel();
		const frozenKeys = Object.keys(DEFAULT_PANEL).sort();
		const freshKeys = Object.keys(fresh).sort();
		expect(frozenKeys).toEqual(freshKeys);
	});

	it("has same values as a fresh createDefaultPanel", () => {
		const fresh = createDefaultPanel();
		for (const key of Object.keys(fresh)) {
			const frozenVal = (DEFAULT_PANEL as any)[key];
			const freshVal = (fresh as any)[key];
			if (freshVal instanceof Set) {
				// Compare Set contents
				expect(frozenVal instanceof Set, `${key} should be Set`).toBe(true);
				expect([...frozenVal]).toEqual([...freshVal]);
			} else {
				expect(frozenVal, `${key} should match`).toEqual(freshVal);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// validatePanelState — viewMode validation
// ---------------------------------------------------------------------------
describe("validatePanelState viewMode", () => {
	it("resets invalid viewMode to 'graph'", () => {
		const panel = createDefaultPanel();
		(panel as any).viewMode = "invalid-mode";
		validatePanelState(panel);
		expect(panel.viewMode).toBe("graph");
	});

	it("preserves valid viewMode 'timeline'", () => {
		const panel = createDefaultPanel();
		panel.viewMode = "timeline";
		validatePanelState(panel);
		expect(panel.viewMode).toBe("timeline");
	});

	it("preserves valid viewMode 'sunburst'", () => {
		const panel = createDefaultPanel();
		panel.viewMode = "sunburst";
		validatePanelState(panel);
		expect(panel.viewMode).toBe("sunburst");
	});

	it("preserves valid viewMode 'matrix'", () => {
		const panel = createDefaultPanel();
		panel.viewMode = "matrix";
		validatePanelState(panel);
		expect(panel.viewMode).toBe("matrix");
	});

	it("resets empty string viewMode to 'graph'", () => {
		const panel = createDefaultPanel();
		(panel as any).viewMode = "";
		validatePanelState(panel);
		expect(panel.viewMode).toBe("graph");
	});
});
