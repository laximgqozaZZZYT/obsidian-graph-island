// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
// Skeleton module for parent issue 1262 (type-assertions).
//
// Each guard is declared with the canonical signature `(v: unknown) => v is T`.
// Implementations are intentionally stubbed (always return `false`) and will be
// filled in by follow-up tasks that replace `as T` casts at call sites with
// `if (isT(v)) { ... }` checks. Until then, callers should not rely on these.
// ---------------------------------------------------------------------------

import type { EdgeType, GraphNode, LayoutType, ViewMode } from "../types";
import type { NodeShape } from "./node-shapes";

/** True for any non-null object value (the runtime shape of `Record<string, unknown>`). */
export function isStringRecord(v: unknown): v is Record<string, unknown> {
	void v;
	return false;
}

/** True for valid `NodeShape` literals ("circle" | "triangle" | ...). */
export function isNodeShape(v: unknown): v is NodeShape {
	void v;
	return false;
}

/** True for valid `ViewMode` literals ("graph" | "sunburst" | "timeline" | "matrix"). */
export function isViewMode(v: unknown): v is ViewMode {
	void v;
	return false;
}

/** True for valid `LayoutType` literals. */
export function isLayoutType(v: unknown): v is LayoutType {
	void v;
	return false;
}

/** True for valid `EdgeType` literals. */
export function isEdgeType(v: unknown): v is EdgeType {
	void v;
	return false;
}

/** True for objects shaped like `GraphNode` (has `id` and `label` strings, numeric `x`/`y`). */
export function isGraphNode(v: unknown): v is GraphNode {
	void v;
	return false;
}
