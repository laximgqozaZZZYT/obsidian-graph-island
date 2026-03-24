import type { LayoutType, ViewMode } from "../types";
import {
  LAYOUT_FORCE,
  LAYOUT_SUNBURST,
  LAYOUT_TIMELINE,
} from "../constants";

const VIEW_MODE_LAYOUT_MAP: Record<ViewMode, LayoutType> = {
  graph: LAYOUT_FORCE,
  sunburst: LAYOUT_SUNBURST,
  timeline: LAYOUT_TIMELINE,
  matrix: LAYOUT_FORCE, // matrix uses DOM, not Canvas layout
};

/** Convert a user-facing ViewMode to the internal LayoutType. */
export function viewModeToLayout(mode: ViewMode): LayoutType {
  return VIEW_MODE_LAYOUT_MAP[mode] ?? LAYOUT_FORCE;
}

/** Whether the RenderPipeline should skip per-node rendering for this viewMode. */
export function viewModeSkipsNodeRendering(mode: ViewMode): boolean {
  return mode === "sunburst" || mode === "timeline" || mode === "matrix";
}

/** Whether edges should be skipped for this viewMode. */
export function viewModeSkipsEdges(mode: ViewMode): boolean {
  return mode === "sunburst" || mode === "timeline" || mode === "matrix";
}

/** Whether this viewMode uses DOM rendering instead of Canvas. */
export function viewModeUsesDom(mode: ViewMode): boolean {
  return mode === "matrix";
}
