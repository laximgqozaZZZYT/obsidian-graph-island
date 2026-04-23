/**
 * Tests for src/views/panel-defaults.ts
 *
 * Guards two regressions simultaneously:
 *   1. Shape drift — any change in a DEFAULT_*_STATE bucket or
 *      createDefaultPanelState() is caught by snapshot.
 *   2. Shared-reference leak — every invocation must return fresh
 *      instances for mutable fields (Set, Array, Object).
 *
 * Also enforces the disjoint-union invariant: the 4 DEFAULT_*_STATE
 * factories must partition PanelState's required keys exactly, so that
 * the spread inside createDefaultPanelState() cannot silently overwrite
 * one bucket with another or miss a field entirely.
 */
import { describe, it, expect } from "vitest";
import {
	DEFAULT_FILTER_STATE,
	DEFAULT_DISPLAY_STATE,
	DEFAULT_LAYOUT_STATE,
	DEFAULT_TOOLBAR_STATE,
	createDefaultPanelState,
} from "../../src/views/panel-defaults";

describe("panel-defaults — shape snapshots", () => {
	it("DEFAULT_FILTER_STATE shape is stable", () => {
		expect(DEFAULT_FILTER_STATE()).toMatchSnapshot();
	});

	it("DEFAULT_DISPLAY_STATE shape is stable", () => {
		expect(DEFAULT_DISPLAY_STATE()).toMatchSnapshot();
	});

	it("DEFAULT_LAYOUT_STATE shape is stable", () => {
		expect(DEFAULT_LAYOUT_STATE()).toMatchSnapshot();
	});

	it("DEFAULT_TOOLBAR_STATE shape is stable", () => {
		expect(DEFAULT_TOOLBAR_STATE()).toMatchSnapshot();
	});

	it("createDefaultPanelState shape is stable", () => {
		expect(createDefaultPanelState()).toMatchSnapshot();
	});
});

describe("panel-defaults — fresh instances (no shared refs)", () => {
	it("returns a new Set for collapsedGroups on every call", () => {
		const a = createDefaultPanelState();
		const b = createDefaultPanelState();
		expect(a.collapsedGroups).not.toBe(b.collapsedGroups);
	});

	it("returns a new array for excludeNodes on every call", () => {
		const a = createDefaultPanelState();
		const b = createDefaultPanelState();
		expect(a.excludeNodes).not.toBe(b.excludeNodes);
	});

	it("returns a new object for hoverHighlightTypes on every call", () => {
		const a = createDefaultPanelState();
		const b = createDefaultPanelState();
		expect(a.hoverHighlightTypes).not.toBe(b.hoverHighlightTypes);
	});

	it("returns a new object for pinnedPositions on every call", () => {
		const a = createDefaultPanelState();
		const b = createDefaultPanelState();
		expect(a.pinnedPositions).not.toBe(b.pinnedPositions);
	});

	it("returns a new object for nodeIconMap on every call", () => {
		const a = createDefaultPanelState();
		const b = createDefaultPanelState();
		expect(a.nodeIconMap).not.toBe(b.nodeIconMap);
	});

	it("returns a new object for cardDisplayConfig on every call", () => {
		const a = createDefaultPanelState();
		const b = createDefaultPanelState();
		expect(a.cardDisplayConfig).not.toBe(b.cardDisplayConfig);
		// nested mutable field must also be fresh
		expect(a.cardDisplayConfig.fields).not.toBe(b.cardDisplayConfig.fields);
	});

	it("mutating one instance does not leak into another", () => {
		const a = createDefaultPanelState();
		const b = createDefaultPanelState();
		a.collapsedGroups.add("leaked");
		a.excludeNodes.push("leaked");
		a.pinnedPositions["x"] = { x: 1, y: 2 };
		expect(b.collapsedGroups.size).toBe(0);
		expect(b.excludeNodes).toHaveLength(0);
		expect(b.pinnedPositions).toEqual({});
	});
});

describe("panel-defaults — 4 buckets partition PanelState keys exactly", () => {
	const filterKeys = Object.keys(DEFAULT_FILTER_STATE());
	const displayKeys = Object.keys(DEFAULT_DISPLAY_STATE());
	const layoutKeys = Object.keys(DEFAULT_LAYOUT_STATE());
	const toolbarKeys = Object.keys(DEFAULT_TOOLBAR_STATE());
	const combinedKeys = [...filterKeys, ...displayKeys, ...layoutKeys, ...toolbarKeys];
	const unionKeys = new Set(combinedKeys);

	it("no key appears in more than one DEFAULT_* bucket (disjoint)", () => {
		// Duplicate detection: if any key is shared, size < length.
		expect(unionKeys.size).toBe(combinedKeys.length);
	});

	it("union of 4 DEFAULT_* keys equals Object.keys(createDefaultPanelState())", () => {
		const stateKeys = new Set(Object.keys(createDefaultPanelState()));
		// Same cardinality AND same membership.
		expect(stateKeys.size).toBe(unionKeys.size);
		for (const k of unionKeys) {
			expect(stateKeys.has(k)).toBe(true);
		}
	});
});
