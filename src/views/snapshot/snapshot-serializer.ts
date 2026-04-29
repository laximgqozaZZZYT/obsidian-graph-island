// ---------------------------------------------------------------------------
// snapshot-serializer.ts — pure view-state ser/deserialization helpers.
// ---------------------------------------------------------------------------
// Extracted from GraphViewContainer.getState/setState. Handles the schema
// quirks that JSON.stringify cannot round-trip on its own:
//   • collapsedGroups: Set ↔ Array
//   • groupByRules: transient (always rehydrate as null)
//   • legacy layout values: map onto cluster arrangement
//   • settings migrations for fields added after old saves were written
// DOM-free and Obsidian-free so the round-trip can be unit-tested in isolation.
// GraphViewContainer invokes these as thin wrappers around super.setState.
// ---------------------------------------------------------------------------

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
} from "../../constants";
import type { PanelState } from "../PanelBuilder";

/**
 * Serialize PanelState into a JSON-safe snapshot for view-state persistence.
 * Handles Set-typed fields (collapsedGroups → array) and transient fields
 * (groupByRules → null) that JSON.stringify would otherwise mangle.
 *
 * Each value is round-tripped through JSON to drop functions/cycles and
 * decouple the serialized snapshot from live references in the panel.
 * Falls back to the live reference when JSON serialization throws.
 */
export function serializePanelForState(panel: PanelState): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(panel)) {
		if (k === "collapsedGroups") {
			out[k] = Array.from(v as Set<string>);
		} else if (k === "groupByRules") {
			// Transient editing state — never persisted (always rehydrated as null).
			out[k] = null;
		} else {
			try {
				out[k] = JSON.parse(JSON.stringify(v));
			} catch (_e) {
				out[k] = v;
			}
		}
	}
	return out;
}

/**
 * Restore PanelState fields from a previously-serialized snapshot in place.
 *
 * Only keys present in `defaultKeys` are copied; unknown keys in `rawPanel`
 * are ignored so that old saves with removed fields do not pollute the
 * current PanelState.
 *
 * Inverse of {@link serializePanelForState}: handles Array → Set for
 * collapsedGroups and forces groupByRules back to null.
 *
 * No-op when `rawPanel` is null/undefined or not an object — callers do
 * not need to guard before invoking.
 */
export function restorePanelFromSavedState(
	rawPanel: unknown,
	target: PanelState,
	defaultKeys: readonly (keyof PanelState)[],
): void {
	if (!rawPanel || typeof rawPanel !== "object") return;
	const saved = JSON.parse(JSON.stringify(rawPanel)) as Record<string, unknown>;
	for (const key of defaultKeys) {
		if (!(key in saved) || saved[key] === undefined) continue;
		if (key === "collapsedGroups") {
			// Restore Set from serialized array; tolerate non-array (e.g. corrupt save).
			const arr = Array.isArray(saved[key]) ? (saved[key] as string[]) : [];
			target.collapsedGroups = new Set<string>(arr);
		} else if (key === "groupByRules") {
			// Always re-parse from the groupBy string on first render.
			target.groupByRules = null;
		} else {
			// Safe: key validated against defaultKeys (= keyof PanelState above).
			(target as unknown as Record<string, unknown>)[key] = saved[key];
		}
	}
}

/**
 * Map legacy `state.layout` values onto `state.panel.clusterArrangement`
 * in place. Old saves encoded visual arrangement via the top-level `layout`
 * field; the current schema uses cluster arrangement on the panel. This
 * bridges old → new during setState.
 *
 * No-op when:
 *   • `state.layout` is missing/non-string, or
 *   • `state.layout` is the current `LAYOUT_FORCE`, or
 *   • the layout value has no legacy mapping, or
 *   • `state.panel` is missing/non-object.
 */
export function migrateLegacyLayoutInState(state: Record<string, unknown>): void {
	const layout = state.layout;
	if (typeof layout !== "string" || layout === LAYOUT_FORCE) return;
	const legacyMap: Record<string, string> = {
		[LAYOUT_TREE]: ARRANGEMENT_GRID,
		[LAYOUT_CONCENTRIC]: ARRANGEMENT_CONCENTRIC,
		[LAYOUT_SUNBURST]: ARRANGEMENT_GRID,
		[LAYOUT_TIMELINE]: ARRANGEMENT_TIMELINE,
		[LAYOUT_ARC]: ARRANGEMENT_CONCENTRIC,
	};
	const mapped = legacyMap[layout];
	if (!mapped) return;
	const panel = state.panel;
	if (panel && typeof panel === "object") {
		(panel as Record<string, unknown>).clusterArrangement = mapped;
	}
}

/**
 * Derive `clusterGroupRules` from the `groupBy` expression when follow-mode
 * is active. Mutates `panel` in place.
 *
 * The sync otherwise only runs on UI interaction, so without this hook a
 * session restored with `clusterFollowsGroupBy = true` would render with
 * stale rules and break cable-tray / cluster force grouping.
 *
 * No-op when `clusterFollowsGroupBy` is false, `groupBy` is empty, or
 * `groupBy === "none"`.
 */
export function syncClusterGroupRulesFromGroupBy(panel: PanelState): void {
	if (!panel.clusterFollowsGroupBy) return;
	if (!panel.groupBy || panel.groupBy === "none") return;
	const withoutOps = panel.groupBy.replace(/\b(AND|OR|XOR|NOR|NAND|NOT)\b/gi, ",");
	const fields = withoutOps
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	panel.clusterGroupRules = fields.map((f) => ({
		groupBy: f.endsWith(":?") ? f : f + ":?",
		recursive: false,
	}));
}

/**
 * Apply settings migrations for fields added after old saves were written.
 *
 * Currently:
 *   • `renderThresholds.nodeSizeByDegree` — defaults to true (was added later
 *      and old saves persist it as undefined or false).
 *   • `renderThresholds.autoLOD` — defaults to true (was added later).
 *
 * No-op when `renderThresholds` is absent (a brand-new panel will have
 * `renderThresholds` filled in by `ensureRT()` at first use).
 */
export function applyPanelSettingsMigrations(panel: PanelState): void {
	const rt = panel.renderThresholds;
	if (!rt) return;
	if (rt.nodeSizeByDegree === undefined || rt.nodeSizeByDegree === false) {
		rt.nodeSizeByDegree = true;
	}
	if (rt.autoLOD === undefined) {
		rt.autoLOD = true;
	}
}
