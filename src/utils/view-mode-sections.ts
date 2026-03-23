import type { ViewMode } from "../types";

/** Identifiers for panel sections that may be hidden based on viewMode. */
export type PanelSectionId =
  | "filter"
  | "grouping"
  | "nodeDisplay"
  | "nodeDisplayMode"
  | "nodeDecorations"
  | "structureAnalysis"
  | "discovery"
  | "interaction"
  | "edgeDisplay"
  | "cableDisplay"
  | "roadNetwork"
  | "minimap"
  | "renderThresholds"
  | "relationColors"
  | "clusterArrangement"
  | "coordinateControls"
  | "timelineControls"
  | "forceParameters"
  | "nodeRules"
  | "graphSync"
  | "pluginSettings"
  | "ontology";

/** Sections that are HIDDEN for each non-graph viewMode.
 *  If a section is not listed, it is visible (default: true). */
const HIDDEN_SECTIONS: Record<Exclude<ViewMode, "graph">, Set<PanelSectionId>> = {
  sunburst: new Set([
    "nodeDisplay",
    "nodeDisplayMode",
    "nodeDecorations",
    "structureAnalysis",
    "discovery",
    "interaction",
    "edgeDisplay",
    "cableDisplay",
    "roadNetwork",
    "minimap",
    "relationColors",
    "clusterArrangement",
    "coordinateControls",
    "timelineControls",
    "forceParameters",
    "nodeRules",
  ]),
  timeline: new Set([
    "nodeDisplay",
    "nodeDisplayMode",
    "nodeDecorations",
    "structureAnalysis",
    "discovery",
    "interaction",
    "cableDisplay",
    "roadNetwork",
    "relationColors",
    "clusterArrangement",
    "coordinateControls",
    "forceParameters",
    "nodeRules",
  ]),
  tree: new Set([
    "clusterArrangement",
    "coordinateControls",
    "timelineControls",
    "forceParameters",
    "nodeRules",
    "cableDisplay",
    "roadNetwork",
  ]),
  matrix: new Set([
    "nodeDisplay",
    "nodeDisplayMode",
    "nodeDecorations",
    "structureAnalysis",
    "discovery",
    "interaction",
    "edgeDisplay",
    "cableDisplay",
    "roadNetwork",
    "minimap",
    "relationColors",
    "clusterArrangement",
    "coordinateControls",
    "timelineControls",
    "forceParameters",
    "nodeRules",
  ]),
};

/** Check if a panel section should be visible for the given viewMode. */
export function isSectionVisible(mode: ViewMode, section: PanelSectionId): boolean {
  if (mode === "graph") return true;
  return !HIDDEN_SECTIONS[mode]?.has(section);
}
