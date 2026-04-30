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

// ---------------------------------------------------------------------------
// Union literal sets — kept in sync with PanelState field types.
// ---------------------------------------------------------------------------
const NODE_COLOR_MODES = ["default", "category", "heatmap", "community", "field"] as const;
type NodeColorMode = (typeof NODE_COLOR_MODES)[number];

const EDGE_DIRECTION_FILTERS = ["all", "bidirectional", "unidirectional"] as const;
type EdgeDirectionFilter = (typeof EDGE_DIRECTION_FILTERS)[number];

const IMPORTANCE_METRICS = ["degree", "betweenness", "pagerank"] as const;
type ImportanceMetric = (typeof IMPORTANCE_METRICS)[number];

const CLUSTER_LABEL_DETAILS = ["minimal", "standard", "detailed", "rich"] as const;
type ClusterLabelDetail = (typeof CLUSTER_LABEL_DETAILS)[number];

const ANALYSIS_OVERLAYS = ["off", "bridges", "entropy", "gaps", "missing", "density", "all"] as const;
type AnalysisOverlay = (typeof ANALYSIS_OVERLAYS)[number];

const CABLE_BUNDLE_MODES = ["auto", "always", "never"] as const;
type CableBundleMode = (typeof CABLE_BUNDLE_MODES)[number];

const LABEL_MODE_OVERRIDES = ["auto", "initials", "truncated", "full"] as const;
type LabelModeOverride = (typeof LABEL_MODE_OVERRIDES)[number];

const ENCLOSURE_LABEL_POSITIONS = ["top", "center", "bottom"] as const;
type EnclosureLabelPosition = (typeof ENCLOSURE_LABEL_POSITIONS)[number];

const GRID_STYLES = ["lines", "table"] as const;
type GridStyle = (typeof GRID_STYLES)[number];

const GRID_LABEL_PLACEMENTS = ["on-line", "between"] as const;
type GridLabelPlacement = (typeof GRID_LABEL_PLACEMENTS)[number];

const CARD_PRESETS = ["custom", "compact", "detailed", "full"] as const;
type CardPreset = (typeof CARD_PRESETS)[number];

const HEADER_STYLES = ["plain", "table"] as const;
type HeaderStyle = (typeof HEADER_STYLES)[number];

const FIELD_FORMATS = ["key-value", "value-only"] as const;
type FieldFormat = (typeof FIELD_FORMATS)[number];

// ---------------------------------------------------------------------------
// Edge-type boolean flags — the "solo edge type" cycler in panel-sections*.ts
// drove most of the dynamic-key casts. Centralizing here lets callers iterate
// the keys without unsafe Record indexing.
// ---------------------------------------------------------------------------
const EDGE_TYPE_KEYS = [
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

type EdgeTypeKey = (typeof EDGE_TYPE_KEYS)[number];

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

type HoverEdgeTypeKey = (typeof HOVER_EDGE_TYPE_KEYS)[number];
