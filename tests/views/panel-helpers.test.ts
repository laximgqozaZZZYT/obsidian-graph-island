/**
 * Tests for src/views/panel-helpers.ts — generic typed get/set on PanelState.
 *
 * The helpers are tiny but unify how PanelState is mutated, so guarding their
 * behavior protects against accidental refactors that drop the property pass-
 * through (e.g. accidentally returning a default instead of the live value).
 */
import { describe, it, expect } from "vitest";
import { getPanelValue, setPanelValue } from "../../src/views/panel-helpers";
import type { PanelState } from "../../src/views/PanelBuilder";

function makePanel(): PanelState {
	return {
		showArrows: true,
		showEdgeLabels: false,
		hoverShowBody: false,
	} as unknown as PanelState;
}

describe("setPanelValue", () => {
	it("writes a value to the given key on the panel", () => {
		const panel = makePanel();
		setPanelValue(panel, "showArrows", false);
		expect(panel.showArrows).toBe(false);
	});

	it("overwrites existing values rather than merging them", () => {
		const panel = makePanel();
		setPanelValue(panel, "showEdgeLabels", true);
		expect(panel.showEdgeLabels).toBe(true);
		setPanelValue(panel, "showEdgeLabels", false);
		expect(panel.showEdgeLabels).toBe(false);
	});

	it("mutates the panel in place (no clone)", () => {
		const panel = makePanel();
		setPanelValue(panel, "hoverShowBody", true);
		// The same reference reflects the new value.
		expect(panel.hoverShowBody).toBe(true);
	});
});

describe("getPanelValue", () => {
	it("reads a value from the given key", () => {
		const panel = makePanel();
		expect(getPanelValue(panel, "showArrows")).toBe(true);
		expect(getPanelValue(panel, "showEdgeLabels")).toBe(false);
	});

	it("reflects writes performed via setPanelValue", () => {
		const panel = makePanel();
		setPanelValue(panel, "showArrows", false);
		expect(getPanelValue(panel, "showArrows")).toBe(false);
	});
});
