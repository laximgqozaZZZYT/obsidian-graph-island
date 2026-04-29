import { describe, expect, it } from "vitest";
import {
	applyPanelSettingsMigrations,
	migrateLegacyLayoutInState,
	restorePanelFromSavedState,
	serializePanelForState,
	syncClusterGroupRulesFromGroupBy,
} from "../../../src/views/snapshot/snapshot-serializer";
import { createDefaultPanelState } from "../../../src/views/panel-defaults";
import type { PanelState } from "../../../src/views/PanelBuilder";

const PANEL_KEYS = Object.keys(createDefaultPanelState()) as (keyof PanelState)[];

// ---------------------------------------------------------------------------
// serializePanelForState
// ---------------------------------------------------------------------------

describe("serializePanelForState", () => {
	it("空 panel: returns a JSON-safe clone with default keys", () => {
		const panel = createDefaultPanelState();
		const out = serializePanelForState(panel);
		// Round-trip clean — JSON.stringify must succeed.
		expect(() => JSON.stringify(out)).not.toThrow();
		// Set field is converted to an array (JSON-friendly).
		expect(Array.isArray(out.collapsedGroups)).toBe(true);
		// Transient field always serialized as null.
		expect(out.groupByRules).toBeNull();
	});

	it("通常 panel: collapsedGroups Set → Array preserves entries", () => {
		const panel = createDefaultPanelState();
		panel.collapsedGroups = new Set(["a", "b", "c"]);
		const out = serializePanelForState(panel);
		expect(out.collapsedGroups).toEqual(["a", "b", "c"]);
	});

	it("Set fields のみ: empty Set serializes to empty array", () => {
		const panel = createDefaultPanelState();
		panel.collapsedGroups = new Set();
		const out = serializePanelForState(panel);
		expect(out.collapsedGroups).toEqual([]);
	});

	it("transient fields のみ: groupByRules forced to null even when populated", () => {
		const panel = createDefaultPanelState();
		panel.groupByRules = [{ field: "tag", op: "value-only" } as never];
		const out = serializePanelForState(panel);
		expect(out.groupByRules).toBeNull();
	});

	it("decouples from live references — output mutation does not leak back", () => {
		const panel = createDefaultPanelState();
		panel.searchHistory = ["one", "two"];
		const out = serializePanelForState(panel);
		(out.searchHistory as string[]).push("three");
		expect(panel.searchHistory).toEqual(["one", "two"]);
	});
});

// ---------------------------------------------------------------------------
// restorePanelFromSavedState
// ---------------------------------------------------------------------------

describe("restorePanelFromSavedState", () => {
	it("空 saved: no-op when rawPanel is null/undefined", () => {
		const target = createDefaultPanelState();
		const before = JSON.stringify(serializePanelForState(target));
		restorePanelFromSavedState(null, target, PANEL_KEYS);
		restorePanelFromSavedState(undefined, target, PANEL_KEYS);
		expect(JSON.stringify(serializePanelForState(target))).toBe(before);
	});

	it("空 saved: no-op when rawPanel is not an object", () => {
		const target = createDefaultPanelState();
		const before = target.searchQuery;
		restorePanelFromSavedState("not-an-object", target, PANEL_KEYS);
		restorePanelFromSavedState(42, target, PANEL_KEYS);
		expect(target.searchQuery).toBe(before);
	});

	it("通常: restores scalar fields from saved state", () => {
		const target = createDefaultPanelState();
		const saved = {
			searchQuery: "foo",
			nodeSize: 42,
			showOrphans: !target.showOrphans,
		};
		restorePanelFromSavedState(saved, target, PANEL_KEYS);
		expect(target.searchQuery).toBe("foo");
		expect(target.nodeSize).toBe(42);
		expect(target.showOrphans).toBe(!createDefaultPanelState().showOrphans);
	});

	it("Set fields のみ: collapsedGroups Array → Set", () => {
		const target = createDefaultPanelState();
		const saved = { collapsedGroups: ["x", "y"] };
		restorePanelFromSavedState(saved, target, PANEL_KEYS);
		expect(target.collapsedGroups).toBeInstanceOf(Set);
		expect(target.collapsedGroups.has("x")).toBe(true);
		expect(target.collapsedGroups.has("y")).toBe(true);
	});

	it("Set fields のみ: collapsedGroups non-array tolerated as empty Set", () => {
		const target = createDefaultPanelState();
		target.collapsedGroups = new Set(["preexisting"]);
		const saved = { collapsedGroups: "garbage" };
		restorePanelFromSavedState(saved, target, PANEL_KEYS);
		expect(target.collapsedGroups).toBeInstanceOf(Set);
		expect(target.collapsedGroups.size).toBe(0);
	});

	it("transient fields のみ: groupByRules always null after restore", () => {
		const target = createDefaultPanelState();
		const saved = { groupByRules: [{ field: "tag" }] };
		restorePanelFromSavedState(saved, target, PANEL_KEYS);
		expect(target.groupByRules).toBeNull();
	});

	it("不正 JSON 復元: unknown keys ignored", () => {
		const target = createDefaultPanelState();
		const saved = {
			searchQuery: "kept",
			__unknown_field__: "should-not-appear",
			another_random_key: 999,
		};
		restorePanelFromSavedState(saved, target, PANEL_KEYS);
		expect(target.searchQuery).toBe("kept");
		expect((target as unknown as Record<string, unknown>).__unknown_field__).toBeUndefined();
		expect((target as unknown as Record<string, unknown>).another_random_key).toBeUndefined();
	});

	it("不正 JSON 復元: undefined values for known keys are skipped", () => {
		const target = createDefaultPanelState();
		const before = target.searchQuery;
		const saved = { searchQuery: undefined };
		restorePanelFromSavedState(saved, target, PANEL_KEYS);
		expect(target.searchQuery).toBe(before);
	});

	it("round-trip: serialize → restore yields equivalent panel state", () => {
		const original = createDefaultPanelState();
		original.searchQuery = "round-trip";
		original.collapsedGroups = new Set(["a"]);
		original.nodeSize = 17;
		const serialized = serializePanelForState(original);
		const target = createDefaultPanelState();
		restorePanelFromSavedState(serialized, target, PANEL_KEYS);
		expect(target.searchQuery).toBe("round-trip");
		expect(target.nodeSize).toBe(17);
		expect(target.collapsedGroups).toBeInstanceOf(Set);
		expect(target.collapsedGroups.has("a")).toBe(true);
		// groupByRules cleared on restore (transient).
		expect(target.groupByRules).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// migrateLegacyLayoutInState
// ---------------------------------------------------------------------------

describe("migrateLegacyLayoutInState", () => {
	it("no-op when state.layout is missing", () => {
		const state: Record<string, unknown> = { panel: { clusterArrangement: "inherit" } };
		migrateLegacyLayoutInState(state);
		expect((state.panel as Record<string, unknown>).clusterArrangement).toBe("inherit");
	});

	it("no-op when state.layout is the current LAYOUT_FORCE", () => {
		const state = { layout: "force", panel: { clusterArrangement: "inherit" } } as Record<string, unknown>;
		migrateLegacyLayoutInState(state);
		expect((state.panel as Record<string, unknown>).clusterArrangement).toBe("inherit");
	});

	it("maps legacy 'tree' / 'sunburst' to grid", () => {
		const a = { layout: "tree", panel: {} } as Record<string, unknown>;
		const b = { layout: "sunburst", panel: {} } as Record<string, unknown>;
		migrateLegacyLayoutInState(a);
		migrateLegacyLayoutInState(b);
		expect((a.panel as Record<string, unknown>).clusterArrangement).toBe("grid");
		expect((b.panel as Record<string, unknown>).clusterArrangement).toBe("grid");
	});

	it("maps legacy 'concentric' / 'arc' to concentric", () => {
		const a = { layout: "concentric", panel: {} } as Record<string, unknown>;
		const b = { layout: "arc", panel: {} } as Record<string, unknown>;
		migrateLegacyLayoutInState(a);
		migrateLegacyLayoutInState(b);
		expect((a.panel as Record<string, unknown>).clusterArrangement).toBe("concentric");
		expect((b.panel as Record<string, unknown>).clusterArrangement).toBe("concentric");
	});

	it("maps legacy 'timeline' to timeline arrangement", () => {
		const state = { layout: "timeline", panel: {} } as Record<string, unknown>;
		migrateLegacyLayoutInState(state);
		expect((state.panel as Record<string, unknown>).clusterArrangement).toBe("timeline");
	});

	it("no-op when layout has no legacy mapping", () => {
		const state = { layout: "unknown-layout", panel: { clusterArrangement: "radial" } } as Record<string, unknown>;
		migrateLegacyLayoutInState(state);
		expect((state.panel as Record<string, unknown>).clusterArrangement).toBe("radial");
	});

	it("no-op when state.panel is missing or non-object", () => {
		const a: Record<string, unknown> = { layout: "tree" };
		const b: Record<string, unknown> = { layout: "tree", panel: "string" };
		expect(() => migrateLegacyLayoutInState(a)).not.toThrow();
		expect(() => migrateLegacyLayoutInState(b)).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// syncClusterGroupRulesFromGroupBy
// ---------------------------------------------------------------------------

describe("syncClusterGroupRulesFromGroupBy", () => {
	it("no-op when clusterFollowsGroupBy is false", () => {
		const panel = createDefaultPanelState();
		panel.clusterFollowsGroupBy = false;
		panel.groupBy = "tag";
		panel.clusterGroupRules = [];
		syncClusterGroupRulesFromGroupBy(panel);
		expect(panel.clusterGroupRules).toEqual([]);
	});

	it("no-op when groupBy is empty", () => {
		const panel = createDefaultPanelState();
		panel.clusterFollowsGroupBy = true;
		panel.groupBy = "";
		panel.clusterGroupRules = [];
		syncClusterGroupRulesFromGroupBy(panel);
		expect(panel.clusterGroupRules).toEqual([]);
	});

	it("no-op when groupBy === 'none'", () => {
		const panel = createDefaultPanelState();
		panel.clusterFollowsGroupBy = true;
		panel.groupBy = "none";
		panel.clusterGroupRules = [];
		syncClusterGroupRulesFromGroupBy(panel);
		expect(panel.clusterGroupRules).toEqual([]);
	});

	it("derives a single rule from a single field", () => {
		const panel = createDefaultPanelState();
		panel.clusterFollowsGroupBy = true;
		panel.groupBy = "tag";
		syncClusterGroupRulesFromGroupBy(panel);
		expect(panel.clusterGroupRules).toEqual([{ groupBy: "tag:?", recursive: false }]);
	});

	it("preserves :? suffix when already present", () => {
		const panel = createDefaultPanelState();
		panel.clusterFollowsGroupBy = true;
		panel.groupBy = "tag:?";
		syncClusterGroupRulesFromGroupBy(panel);
		expect(panel.clusterGroupRules).toEqual([{ groupBy: "tag:?", recursive: false }]);
	});

	it("splits comma-separated and operator-separated fields", () => {
		const panel = createDefaultPanelState();
		panel.clusterFollowsGroupBy = true;
		panel.groupBy = "tag, category OR folder";
		syncClusterGroupRulesFromGroupBy(panel);
		const fields = panel.clusterGroupRules.map((r) => r.groupBy);
		expect(fields).toEqual(["tag:?", "category:?", "folder:?"]);
	});
});

// ---------------------------------------------------------------------------
// applyPanelSettingsMigrations
// ---------------------------------------------------------------------------

describe("applyPanelSettingsMigrations", () => {
	it("no-op when renderThresholds is absent", () => {
		const panel = createDefaultPanelState();
		panel.renderThresholds = undefined;
		expect(() => applyPanelSettingsMigrations(panel)).not.toThrow();
		expect(panel.renderThresholds).toBeUndefined();
	});

	it("forces nodeSizeByDegree=true when previously undefined", () => {
		const panel = createDefaultPanelState();
		panel.renderThresholds = { nodeSizeByDegree: undefined };
		applyPanelSettingsMigrations(panel);
		expect(panel.renderThresholds.nodeSizeByDegree).toBe(true);
	});

	it("forces nodeSizeByDegree=true when previously explicitly false", () => {
		const panel = createDefaultPanelState();
		panel.renderThresholds = { nodeSizeByDegree: false };
		applyPanelSettingsMigrations(panel);
		expect(panel.renderThresholds.nodeSizeByDegree).toBe(true);
	});

	it("preserves nodeSizeByDegree=true (no double-toggle)", () => {
		const panel = createDefaultPanelState();
		panel.renderThresholds = { nodeSizeByDegree: true };
		applyPanelSettingsMigrations(panel);
		expect(panel.renderThresholds.nodeSizeByDegree).toBe(true);
	});

	it("forces autoLOD=true when undefined; preserves explicit false", () => {
		const a = createDefaultPanelState();
		a.renderThresholds = { autoLOD: undefined };
		applyPanelSettingsMigrations(a);
		expect(a.renderThresholds.autoLOD).toBe(true);

		const b = createDefaultPanelState();
		b.renderThresholds = { autoLOD: false };
		applyPanelSettingsMigrations(b);
		// false is intentionally allowed for autoLOD (only undefined triggers default).
		expect(b.renderThresholds.autoLOD).toBe(false);
	});
});
