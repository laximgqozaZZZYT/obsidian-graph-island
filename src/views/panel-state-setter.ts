/**
 * panel-state-setter.ts
 *
 * Type-safe panel field assignment + unknown→union narrowing helpers.
 *
 * Replaces ad-hoc `panel.x = v as Foo` and `(panel as unknown as Record<string, unknown>)[k] = v`
 * casts scattered across panel-sections*.ts dropdown/toggle callbacks.
 *
 * No DOM, no Obsidian deps — fully unit-testable.
 */
import type { PanelState } from "./PanelBuilder";
import { ALL_SHAPES, type NodeShape } from "../utils/node-shapes";
import type { ClusterArrangement, ClusterGroupArrangement, CoordinateSystem, NodeDisplayMode } from "../types";

/**
 * Type-safe assignment of `value` to `panel[key]`.
 *
 * The generic constraint forces TypeScript to verify that `value`'s type
 * matches `PanelState[K]`, so callers cannot smuggle a wrongly-typed value
 * via `unknown`. Replaces `(panel as unknown as Record<string, unknown>)[key] = v`.
 */
export function setPanelField<K extends keyof PanelState>(panel: PanelState, key: K, value: PanelState[K]): void {
	panel[key] = value;
}

// ---------------------------------------------------------------------------
// Union literal sets — kept in sync with PanelState field types.
// ---------------------------------------------------------------------------
const NODE_COLOR_MODES = ["default", "category", "heatmap", "community", "field"] as const;
export type NodeColorMode = (typeof NODE_COLOR_MODES)[number];

const EDGE_DIRECTION_FILTERS = ["all", "bidirectional", "unidirectional"] as const;
export type EdgeDirectionFilter = (typeof EDGE_DIRECTION_FILTERS)[number];

const NODE_DISPLAY_MODES = ["node", "card", "donut", "sunburst-segment"] as const;

const IMPORTANCE_METRICS = ["degree", "betweenness", "pagerank"] as const;
export type ImportanceMetric = (typeof IMPORTANCE_METRICS)[number];

const CLUSTER_LABEL_DETAILS = ["minimal", "standard", "detailed", "rich"] as const;
export type ClusterLabelDetail = (typeof CLUSTER_LABEL_DETAILS)[number];

const ANALYSIS_OVERLAYS = ["off", "bridges", "entropy", "gaps", "missing", "density", "all"] as const;
export type AnalysisOverlay = (typeof ANALYSIS_OVERLAYS)[number];

const CABLE_BUNDLE_MODES = ["auto", "always", "never"] as const;
export type CableBundleMode = (typeof CABLE_BUNDLE_MODES)[number];

const LABEL_MODE_OVERRIDES = ["auto", "initials", "truncated", "full"] as const;
export type LabelModeOverride = (typeof LABEL_MODE_OVERRIDES)[number];

const ENCLOSURE_LABEL_POSITIONS = ["top", "center", "bottom"] as const;
export type EnclosureLabelPosition = (typeof ENCLOSURE_LABEL_POSITIONS)[number];

const CLUSTER_ARRANGEMENTS = [
	"inherit",
	"concentric",
	"radial",
	"phyllotaxis",
	"grid",
	"triangle",
	"random",
	"timeline",
	"custom",
	"ego",
] as const;

const CLUSTER_GROUP_ARRANGEMENTS = ["auto", "circle", "horizontal", "vertical", "concentric", "grid"] as const;

const COORDINATE_SYSTEMS = ["cartesian", "polar"] as const;

const GRID_STYLES = ["lines", "table"] as const;
export type GridStyle = (typeof GRID_STYLES)[number];

const GRID_LABEL_PLACEMENTS = ["on-line", "between"] as const;
export type GridLabelPlacement = (typeof GRID_LABEL_PLACEMENTS)[number];

const CARD_PRESETS = ["custom", "compact", "detailed", "full"] as const;
export type CardPreset = (typeof CARD_PRESETS)[number];

const HEADER_STYLES = ["plain", "table"] as const;
export type HeaderStyle = (typeof HEADER_STYLES)[number];

const FIELD_FORMATS = ["key-value", "value-only"] as const;
export type FieldFormat = (typeof FIELD_FORMATS)[number];

/** Generic "is the value one of the literals in this set?" guard. */
function inSet<T extends string>(set: readonly T[], v: unknown): v is T {
	return typeof v === "string" && (set as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Narrowing helpers — return null for invalid input so callers can early-return.
// ---------------------------------------------------------------------------
export function asNodeShape(v: unknown): NodeShape | null {
	return inSet(ALL_SHAPES, v) ? v : null;
}
export function asNodeColorMode(v: unknown): NodeColorMode | null {
	return inSet(NODE_COLOR_MODES, v) ? v : null;
}
export function asEdgeDirectionFilter(v: unknown): EdgeDirectionFilter | null {
	return inSet(EDGE_DIRECTION_FILTERS, v) ? v : null;
}
export function asNodeDisplayMode(v: unknown): NodeDisplayMode | null {
	return inSet(NODE_DISPLAY_MODES, v) ? v : null;
}
export function asImportanceMetric(v: unknown): ImportanceMetric | null {
	return inSet(IMPORTANCE_METRICS, v) ? v : null;
}
export function asClusterLabelDetail(v: unknown): ClusterLabelDetail | null {
	return inSet(CLUSTER_LABEL_DETAILS, v) ? v : null;
}
export function asAnalysisOverlay(v: unknown): AnalysisOverlay | null {
	return inSet(ANALYSIS_OVERLAYS, v) ? v : null;
}
export function asCableBundleMode(v: unknown): CableBundleMode | null {
	return inSet(CABLE_BUNDLE_MODES, v) ? v : null;
}
export function asLabelModeOverride(v: unknown): LabelModeOverride | null {
	return inSet(LABEL_MODE_OVERRIDES, v) ? v : null;
}
export function asEnclosureLabelPosition(v: unknown): EnclosureLabelPosition | null {
	return inSet(ENCLOSURE_LABEL_POSITIONS, v) ? v : null;
}
export function asClusterArrangement(v: unknown): ClusterArrangement | null {
	return inSet(CLUSTER_ARRANGEMENTS, v) ? v : null;
}
export function asClusterGroupArrangement(v: unknown): ClusterGroupArrangement | null {
	return inSet(CLUSTER_GROUP_ARRANGEMENTS, v) ? v : null;
}
export function asCoordinateSystem(v: unknown): CoordinateSystem | null {
	return inSet(COORDINATE_SYSTEMS, v) ? v : null;
}
export function asGridStyle(v: unknown): GridStyle | null {
	return inSet(GRID_STYLES, v) ? v : null;
}
export function asGridLabelPlacement(v: unknown): GridLabelPlacement | null {
	return inSet(GRID_LABEL_PLACEMENTS, v) ? v : null;
}
export function asCardPreset(v: unknown): CardPreset | null {
	return inSet(CARD_PRESETS, v) ? v : null;
}
export function asHeaderStyle(v: unknown): HeaderStyle | null {
	return inSet(HEADER_STYLES, v) ? v : null;
}
export function asFieldFormat(v: unknown): FieldFormat | null {
	return inSet(FIELD_FORMATS, v) ? v : null;
}

// ---------------------------------------------------------------------------
// Edge-type boolean flags — the "solo edge type" cycler in panel-sections*.ts
// drove most of the dynamic-key casts. Centralizing here lets callers iterate
// the keys without unsafe Record indexing.
// ---------------------------------------------------------------------------
export const EDGE_TYPE_KEYS = [
	"showLinks",
	"showTagEdges",
	"showCategoryEdges",
	"showSemanticEdges",
	"showInheritance",
	"showAggregation",
	"showSimilar",
	"showSibling",
	"showSequence",
	"showInlineRelation",
] as const satisfies readonly (keyof PanelState)[];

export type EdgeTypeKey = (typeof EDGE_TYPE_KEYS)[number];

export function setEdgeTypeFlag(panel: PanelState, key: EdgeTypeKey, on: boolean): void {
	panel[key] = on;
}

export function getEdgeTypeFlag(panel: PanelState, key: EdgeTypeKey): boolean {
	return panel[key];
}

// ---------------------------------------------------------------------------
// Hover edge-type flags — same shape as PanelState["hoverEdgeTypes"].
// ---------------------------------------------------------------------------
const HOVER_EDGE_TYPE_KEYS = [
	"link",
	"semantic",
	"tag",
	"hasTag",
	"similar",
	"sibling",
	"sequence",
	"inheritance",
	"aggregation",
] as const;

export type HoverEdgeTypeKey = (typeof HOVER_EDGE_TYPE_KEYS)[number];

export function asHoverEdgeTypeKey(v: unknown): HoverEdgeTypeKey | null {
	return inSet(HOVER_EDGE_TYPE_KEYS, v) ? v : null;
}

export function setHoverEdgeTypeFlag(het: PanelState["hoverEdgeTypes"], key: HoverEdgeTypeKey, on: boolean): void {
	het[key] = on;
}

export function getHoverEdgeTypeFlag(het: PanelState["hoverEdgeTypes"], key: HoverEdgeTypeKey): boolean {
	return het[key];
}
