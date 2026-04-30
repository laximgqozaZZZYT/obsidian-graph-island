/**
 * Unit tests for src/views/panel-helpers.ts
 *
 * Scope:
 *   The two generic accessor helpers (`getPanelValue` / `setPanelValue`) are
 *   tiny but cover the entire file (0/2 → 2/2). The interesting property is
 *   the typed `<K extends keyof PanelState>` signature: it must (a) return
 *   the live reference (not a copy) and (b) mutate the panel in place when
 *   set is called. We exercise representative key shapes (primitives,
 *   strings, objects, arrays, optional fields) to guard against accidental
 *   structural-clone or `Object.assign` rewrites in the future.
 */
import { describe, it, expect } from "vitest";
import { setPanelValue, getPanelValue } from "../../src/views/panel-helpers";
import { createDefaultPanel } from "../../src/views/PanelBuilder";

describe("panel-helpers", () => {
	describe("getPanelValue", () => {
		it("reads a primitive numeric field from the panel", () => {
			const panel = createDefaultPanel();
			expect(getPanelValue(panel, "minDegreeFilter")).toBe(panel.minDegreeFilter);
		});

		it("reads a string field from the panel", () => {
			const panel = createDefaultPanel();
			expect(getPanelValue(panel, "groupBy")).toBe(panel.groupBy);
		});

		it("returns the live object reference, not a structural copy", () => {
			// If a future refactor introduces a defensive clone, mutating the
			// returned reference would no longer affect the underlying panel —
			// this test pins the by-reference contract.
			const panel = createDefaultPanel();
			const cfg = getPanelValue(panel, "cardDisplayConfig");
			expect(cfg).toBe(panel.cardDisplayConfig);
		});

		it("reads boolean fields without coercion", () => {
			const panel = createDefaultPanel();
			panel.autoFit = false;
			expect(getPanelValue(panel, "autoFit")).toBe(false);
			panel.autoFit = true;
			expect(getPanelValue(panel, "autoFit")).toBe(true);
		});
	});

	describe("setPanelValue", () => {
		it("mutates the panel in place (does not return a new object)", () => {
			const panel = createDefaultPanel();
			const before = panel;
			setPanelValue(panel, "minDegreeFilter", 5);
			expect(panel).toBe(before);
			expect(panel.minDegreeFilter).toBe(5);
		});

		it("overwrites the previous value rather than merging", () => {
			const panel = createDefaultPanel();
			const next = { preset: "compact" as const, fields: [], maxWidth: 80 };
			setPanelValue(panel, "cardDisplayConfig", next);
			// Full replacement: any default fields not in `next` must be gone.
			expect(panel.cardDisplayConfig).toBe(next);
			expect(panel.cardDisplayConfig.maxWidth).toBe(80);
		});

		it("round-trips with getPanelValue (set then get returns the same value)", () => {
			const panel = createDefaultPanel();
			setPanelValue(panel, "groupBy", "node_type");
			expect(getPanelValue(panel, "groupBy")).toBe("node_type");
		});

		it("accepts boolean writes for boolean keys", () => {
			const panel = createDefaultPanel();
			setPanelValue(panel, "autoFit", false);
			expect(panel.autoFit).toBe(false);
			setPanelValue(panel, "autoFit", true);
			expect(panel.autoFit).toBe(true);
		});

		it("does not affect unrelated keys when one key is set", () => {
			// Guards against an accidental `Object.assign(panel, {[key]: value, …})`
			// rewrite that would clobber neighboring fields.
			const panel = createDefaultPanel();
			const originalGroupBy = panel.groupBy;
			const originalShowOrphans = panel.showOrphans;
			setPanelValue(panel, "minDegreeFilter", 7);
			expect(panel.groupBy).toBe(originalGroupBy);
			expect(panel.showOrphans).toBe(originalShowOrphans);
		});
	});
});
