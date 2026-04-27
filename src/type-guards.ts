// ---------------------------------------------------------------------------
// Type guards and typed-assignment helpers
//
// Centralizes runtime validators for enum-like string unions and a typed
// helper for assigning boolean-typed keys of PanelState. Keeping these
// helpers here lets the views/ layer call them by name instead of scattering
// `as unknown as Record<string, unknown>` casts at each assignment site.
// ---------------------------------------------------------------------------
import type { ViewMode, NodeDisplayMode, EdgeCardinalityMode } from "./types";
import { ALL_SHAPES, type NodeShape } from "./utils/node-shapes";
import type { PanelState } from "./views/PanelBuilder";

const NODE_SHAPE_SET: ReadonlySet<NodeShape> = new Set(ALL_SHAPES);
const VIEW_MODES: readonly ViewMode[] = ["graph", "sunburst", "timeline", "matrix"];
const NODE_DISPLAY_MODES: readonly NodeDisplayMode[] = ["node", "card", "donut", "sunburst-segment"];
const EDGE_CARDINALITY_MODES: readonly EdgeCardinalityMode[] = ["none", "crowsfoot"];

export function isNodeShape(v: string): v is NodeShape {
	return NODE_SHAPE_SET.has(v as NodeShape);
}

export function isViewMode(v: string): v is ViewMode {
	return (VIEW_MODES as readonly string[]).includes(v);
}

export function isNodeDisplayMode(v: string): v is NodeDisplayMode {
	return (NODE_DISPLAY_MODES as readonly string[]).includes(v);
}

export function isEdgeCardinalityMode(v: string): v is EdgeCardinalityMode {
	return (EDGE_CARDINALITY_MODES as readonly string[]).includes(v);
}

const NODE_COLOR_MODES = ["default", "category", "heatmap", "community", "field"] as const;
export type NodeColorMode = (typeof NODE_COLOR_MODES)[number];
export function isNodeColorMode(v: string): v is NodeColorMode {
	return (NODE_COLOR_MODES as readonly string[]).includes(v);
}

const LABEL_MODE_OVERRIDES = ["auto", "initials", "truncated", "full"] as const;
export type LabelModeOverride = (typeof LABEL_MODE_OVERRIDES)[number];
export function isLabelModeOverride(v: string): v is LabelModeOverride {
	return (LABEL_MODE_OVERRIDES as readonly string[]).includes(v);
}

const EDGE_DIRECTION_FILTERS = ["all", "bidirectional", "unidirectional"] as const;
export type EdgeDirectionFilter = (typeof EDGE_DIRECTION_FILTERS)[number];
export function isEdgeDirectionFilter(v: string): v is EdgeDirectionFilter {
	return (EDGE_DIRECTION_FILTERS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Typed boolean-field assignment for PanelState.
// `K extends PanelBooleanKey` constrains the key to those whose value type
// is exactly boolean, so the call site is statically prevented from writing
// a boolean into a numeric or enum field.
// ---------------------------------------------------------------------------
type BooleanKeys<T> = { [K in keyof T]-?: T[K] extends boolean ? K : never }[keyof T];
export type PanelBooleanKey = BooleanKeys<PanelState>;

export function setPanelBoolean<K extends PanelBooleanKey>(panel: PanelState, key: K, value: boolean): void {
	// Safe: K is constrained to keys of PanelState whose value type is boolean.
	// TypeScript still requires a cast through `unknown` because mapped-type
	// indexing is not provably narrowed at the assignment site.
	(panel as unknown as Record<K, boolean>)[key] = value;
}
