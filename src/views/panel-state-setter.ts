/**
 * panel-state-setter.ts
 *
 * Panel-state union literal definitions.
 *
 * Originally also held type-safe assignment + unknown→union narrowing helpers
 * (`setPanelField`, `asNodeShape`, …); those went unused and were removed.
 * Union literal sets remain because their derived `export type X = (typeof X_LITERALS)[number]`
 * aliases are the canonical source-of-truth for downstream consumers.
 *
 * No DOM, no Obsidian deps — fully unit-testable.
 */
import type { PanelState } from "./PanelBuilder";

// ---------------------------------------------------------------------------
// Union literal sets — kept in sync with PanelState field types.
// ---------------------------------------------------------------------------
const NODE_COLOR_MODES = ["default", "category", "heatmap", "community", "field"] as const;
export type NodeColorMode = (typeof NODE_COLOR_MODES)[number];

const EDGE_DIRECTION_FILTERS = ["all", "bidirectional", "unidirectional"] as const;
export type EdgeDirectionFilter = (typeof EDGE_DIRECTION_FILTERS)[number];

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

// ---------------------------------------------------------------------------
// Edge-type boolean flag keys — referenced by panel-sections*.ts via the
// derived `EdgeTypeKey` union.
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

// ---------------------------------------------------------------------------
// Hover edge-type flag keys — same shape as PanelState["hoverEdgeTypes"].
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
