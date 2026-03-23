import type { LayoutType, ViewMode } from "../types";
import {
  LAYOUT_FORCE,
  LAYOUT_SUNBURST,
  LAYOUT_TIMELINE,
  LAYOUT_TREE,
} from "../constants";

const VIEW_MODE_LAYOUT_MAP: Record<ViewMode, LayoutType> = {
  graph: LAYOUT_FORCE,
  sunburst: LAYOUT_SUNBURST,
  timeline: LAYOUT_TIMELINE,
  tree: LAYOUT_TREE,
};

/** Convert a user-facing ViewMode to the internal LayoutType. */
export function viewModeToLayout(mode: ViewMode): LayoutType {
  return VIEW_MODE_LAYOUT_MAP[mode] ?? LAYOUT_FORCE;
}
