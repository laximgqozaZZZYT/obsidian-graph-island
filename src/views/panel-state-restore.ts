/**
 * panel-state-restore.ts
 *
 * Pure helpers for GraphViewContainer.setState(), extracted to lower the
 * cyclomatic complexity of setState (was 23 before extraction) and to
 * shrink the GVC god-object file. Each helper has a single responsibility
 * and operates either on the incoming Obsidian view state object or on a
 * PanelState instance — no Obsidian API dependencies.
 */
import {
	ARRANGEMENT_CONCENTRIC,
	ARRANGEMENT_GRID,
	ARRANGEMENT_TIMELINE,
	LAYOUT_ARC,
	LAYOUT_CONCENTRIC,
	LAYOUT_FORCE,
	LAYOUT_SUNBURST,
	LAYOUT_TIMELINE,
	LAYOUT_TREE,
} from "../constants";
import { DEFAULT_PANEL, type PanelState } from "./PanelBuilder";

const LEGACY_LAYOUT_TO_ARRANGEMENT: Record<string, string> = {
	[LAYOUT_TREE]: ARRANGEMENT_GRID,
	[LAYOUT_CONCENTRIC]: ARRANGEMENT_CONCENTRIC,
	[LAYOUT_SUNBURST]: ARRANGEMENT_GRID,
	[LAYOUT_TIMELINE]: ARRANGEMENT_TIMELINE,
	[LAYOUT_ARC]: ARRANGEMENT_CONCENTRIC,
};

/** Migrate legacy `state.layout` into `state.panel.clusterArrangement` in place.
 *  Layout is always "force" now; older saves may carry legacy values that map
 *  onto a cluster-arrangement pattern. No-op when state.layout is force/missing
 *  or when state.panel is absent. */
export function migrateLegacyLayoutInState(state: Record<string, unknown>): void {
	if (!state.layout || typeof state.layout !== "string" || state.layout === LAYOUT_FORCE) return;
	const mapped = LEGACY_LAYOUT_TO_ARRANGEMENT[state.layout];
	if (!mapped) return;
	if (!state.panel || typeof state.panel !== "object") return;
	(state.panel as Record<string, unknown>).clusterArrangement = mapped;
}

/** Copy saved panel fields onto the live panel. Special-cases:
 *  - `collapsedGroups` deserializes from Array → Set
 *  - `groupByRules` is transient: cleared so it re-parses from groupBy string
 *  Only keys present on DEFAULT_PANEL are copied (safety against unknown keys). */
export function restoreSavedPanelFields(panel: PanelState, state: Record<string, unknown>): void {
	if (!state.panel || typeof state.panel !== "object") return;
	const saved = JSON.parse(JSON.stringify(state.panel)) as Record<string, unknown>;
	const panelRecord = panel as unknown as Record<string, unknown>;
	for (const key of Object.keys(DEFAULT_PANEL) as (keyof PanelState)[]) {
		if (!(key in saved) || saved[key] === undefined) continue;
		if (key === "collapsedGroups") {
			const arr = Array.isArray(saved[key]) ? (saved[key] as string[]) : [];
			panel.collapsedGroups = new Set<string>(arr);
		} else if (key === "groupByRules") {
			panel.groupByRules = null;
		} else {
			panelRecord[key] = saved[key];
		}
	}
}

/** Sync `clusterGroupRules` from the parsed `groupBy` string when follow-mode
 *  is active. Without this, cable-tray and cluster-force would use stale rules
 *  after a session restore (the sync otherwise only fires on UI interaction). */
export function syncClusterRulesFromGroupBy(panel: PanelState): void {
	if (!panel.clusterFollowsGroupBy) return;
	if (!panel.groupBy || panel.groupBy === "none") return;
	const fields = panel.groupBy
		.replace(/\b(AND|OR|XOR|NOR|NAND|NOT)\b/gi, ",")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	panel.clusterGroupRules = fields.map((f) => ({
		groupBy: f.endsWith(":?") ? f : f + ":?",
		recursive: false,
	}));
}

/** Apply default migrations for renderThresholds fields that were added after
 *  initial release. Keeps old saves usable without forcing user to re-toggle. */
export function applyRenderThresholdsMigration(panel: PanelState): void {
	const rt = panel.renderThresholds;
	if (!rt) return;
	if (rt.nodeSizeByDegree === undefined || rt.nodeSizeByDegree === false) {
		rt.nodeSizeByDegree = true;
	}
	if (rt.autoLOD === undefined) {
		rt.autoLOD = true;
	}
}
