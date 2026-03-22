// ---------------------------------------------------------------------------
// Preset export/import utilities for Graph Island
// ---------------------------------------------------------------------------
// Serializes PanelState to shareable JSON and validates on import.
// ---------------------------------------------------------------------------

import type { PanelState } from "../views/PanelBuilder";
import { ARRANGEMENT_GRID } from "../constants";

// ---------------------------------------------------------------------------
// Field metadata for validation
// ---------------------------------------------------------------------------

/** Fields that should be boolean */
const BOOLEAN_FIELDS: (keyof PanelState)[] = [
  "includeTagsInData", "showAttachments", "existingOnly", "showOrphans", "showArrows",
  "showOrbitRings", "orbitAutoRotate", "colorEdgesByRelation",
  "showInheritance", "showAggregation", "showTagNodes",
  "showSimilar", "showSibling", "showSequence", "showLinks", "showTagEdges",
  "showCategoryEdges", "showSemanticEdges", "fadeEdgesByDegree",
  "showEdgeLabels", "showMinimap", "autoFit", "showDurationBars",
  "showDotGrid",
  "gridShowHeaders", "gridCellShading",
  "clusterFollowsGroupBy",
  "focusMode",
  "focusConeEnabled",
  "showTimelineRoutes",
  "showAxisTitles",
  "showTimelineTickLabels",
  "ringChartMode",
  "edgeWeightThickness",
  "edgeLayerMode",
  "syncWithEditor",
  "showEdgeWeightLabels",
  "showLegend",
  "visualLinkEditor",
  "showBidirectionalIndicator",
  "showEdgeCardinalityLabels",
  "showOutOfBoundsIndicator",
  "highlightMissingNeighbors",
  "showGraphStats",
  "showAncestryBreadcrumb",
  "showPathfinderOverlay",
  "semanticZoom",
  "showTagBadges",
  "highContrastMode",
  "showImportanceRing",
  "showRecencyMarker",
  "showOntologyBackbone",
  "highlightPatterns",
  "showBridgeNodes",
  "focusLayout",
  "showHierarchyBreadcrumb",
  "showGapEdges",
  "showSimilarSuggestions",
  "showStructureQuestions",
  "showEntropyOverlay",
  "showClusterCompare",
  "showRelationTypePicker",
  "enableInlineEdit",
  "showRelationDrawer",
  "enableManualClustering",
  "enableInlineOntologyEditor",
  "showRelationMatrix",
  "presentationMode",
  "showNodeThumbnails",
  "autoFitOnFilter",
  "showHierarchyTree",
  "hoverShowTitle",
  "hoverShowMeta",
  "hoverShowBody",
];

/** Fields that should be number */
const NUMBER_FIELDS: (keyof PanelState)[] = [
  "textFadeThreshold", "nodeSize", "centerForce", "repelForce", "linkForce",
  "linkDistance", "concentricMinRadius", "concentricRadiusStep",
  "enclosureSpacing", "hoverHops", "clusterNodeSpacing", "clusterGroupScale",
  "clusterGroupSpacing", "edgeBundleStrength", "groupMinSize",
  "timelineRangeMin", "timelineRangeMax",
  "cableTrunkWidth", "cableTrunkAlpha", "cableSpacing", "cableFanWidth", "cableFanAlpha",
  "localGraphHops",
  "navHistoryCursor",
  "recencyDays",
  "kShortestPaths",
  "presentationStep",
  "degreeEdgeWidth",
  "minDegreeFilter",
  "maxDegreeFilter",
  "presetZoomLevel",
  "surpriseInterval",
];

/** Fields that should be string */
const STRING_FIELDS: (keyof PanelState)[] = [
  "searchQuery", "timelineKey", "groupFilter", "groupBy",
  "dataviewQuery", "timelineEndKey", "timelineOrderFields",
  "gridStyle", "gridLabelPlacement",
  "orphanClusterField",
  "localGraphCenter",
  "definitionField",
  "nodeSubLabelFields",
  "hoverTooltipFields",
  "nodeIconField",
  "nodeIconMap",
  "nodeColorField",
  "customColorPalette",
];

/** Fields that should be arrays */
const ARRAY_FIELDS: (keyof PanelState)[] = [
  "groups", "directionalGravityRules", "commonQueries", "clusterGroupRules",
  "sortRules", "nodeRules", "nodeShapeRules", "groupByRules",
  "cardinalityRules", "annotations", "bookmarkedNodes", "searchHistory", "savedSearchQueries",
  "navHistory", "multiSelectNodeIds", "presentationWaypoints", "excludeNodes", "savedViewports",
  "expandedNodes", "hierarchyRelations",
];

/** Valid values for enum-like fields */
const ENUM_VALUES: Partial<Record<keyof PanelState, readonly string[]>> = {
  tagDisplay: ["node", "enclosure"] as const,
  clusterArrangement: ["concentric", "radial", "phyllotaxis", "grid", "triangle", "random", "timeline", "custom", "ego"] as const,
  clusterGroupArrangement: ["auto", "circle", "horizontal", "vertical", "concentric", "grid"] as const,
  nodeDisplayMode: ["node", "card", "donut", "sunburst-segment"] as const,
  edgeCardinalityMode: ["none", "crowsfoot"] as const,
  cableBundleMode: ["auto", "always", "never"] as const,
  edgeDirectionFilter: ["all", "bidirectional", "unidirectional"] as const,
  edgeLabelPlacement: ["center", "offset", "smart"] as const,
  nodeColorMode: ["default", "category", "heatmap", "community", "field"] as const,
  importanceMetric: ["degree", "betweenness", "pagerank"] as const,
  clusterLabelDetail: ["minimal", "standard", "detailed", "rich"] as const,
  gapDetectionMode: ["within-tag", "cross-cluster", "both"] as const,
  searchMode: ["filter", "highlight"] as const,
  activeTab: ["filter", "display", "layout", "settings"] as const,
  analysisOverlay: ["off", "bridges", "entropy", "gaps", "missing", "density", "all"] as const,
};

/** Fields that are Set<string> — exported as arrays, imported as arrays, converted back to Set in apply */
const SET_FIELDS: (keyof PanelState)[] = [
  "collapsedGroups",
];

/** Fields that are nullable objects (object | null) — passed through if object or null */
const NULLABLE_OBJECT_FIELDS: (keyof PanelState)[] = [
  "coordinateLayout",
  "clusterGravity",
  "cardDisplayConfig",
  "donutDisplayConfig",
  "cardRenderConfig",
  "cardinalityRenderConfig",
  "renderThresholds",
  "pinnedPositions",
  "manualClusterOverrides",
];

/** All valid PanelState keys — derived from the field lists above plus enums */
const VALID_KEYS = new Set<string>([
  ...BOOLEAN_FIELDS,
  ...NUMBER_FIELDS,
  ...STRING_FIELDS,
  ...ARRAY_FIELDS,
  ...Object.keys(ENUM_VALUES),
  ...SET_FIELDS,
  ...NULLABLE_OBJECT_FIELDS,
]);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Serialize a PanelState to a JSON string suitable for sharing.
 * Converts Set values to arrays for JSON compatibility.
 */
export function exportPreset(panel: PanelState): string {
  const serializable: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(panel)) {
    if (value instanceof Set) {
      // Convert Set to Array for JSON serialization
      serializable[key] = Array.from(value);
    } else {
      serializable[key] = value;
    }
  }

  return JSON.stringify(serializable, null, 2);
}

/**
 * Export only settings that differ from defaults.
 * Produces a compact JSON with only user-customized values.
 */
export function exportPresetDiff(panel: PanelState, defaults: PanelState): string {
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(panel)) {
    const defVal = (defaults as unknown as Record<string, unknown>)[key];
    if (value instanceof Set || defVal instanceof Set) continue;
    if (Array.isArray(value) || Array.isArray(defVal)) continue;
    if (typeof value === "object" || typeof defVal === "object") {
      if (JSON.stringify(value) !== JSON.stringify(defVal)) diff[key] = value;
      continue;
    }
    if (value !== defVal) diff[key] = value;
  }
  return JSON.stringify(diff, null, 2);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string and return only the valid PanelState fields.
 * Throws on invalid JSON. Silently drops unknown or invalid fields.
 */
/** Removed arrangement patterns -- silently migrated to "grid" on import */
const REMOVED_ARRANGEMENTS = new Set(["spiral", "mountain", "sunburst", "tree"]);

/** Deprecated settings -- silently stripped on import */
const REMOVED_SETTINGS = new Set(["scaleByDegree"]);

/** Migrated field information returned by importPreset */
export interface PresetMigrationInfo {
  /** Fields that were renamed or converted */
  migratedFields: string[];
  /** Fields that were stripped as deprecated */
  removedFields: string[];
}

export function importPreset(json: string, migrationInfo?: PresetMigrationInfo): Partial<PanelState> {
  const raw = JSON.parse(json);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Preset must be a JSON object");
  }

  // Migrate removed arrangement patterns to "grid"
  if (typeof raw.clusterArrangement === "string" && REMOVED_ARRANGEMENTS.has(raw.clusterArrangement)) {
    raw.clusterArrangement = ARRANGEMENT_GRID;
    migrationInfo?.migratedFields.push(`clusterArrangement: ${raw.clusterArrangement} → grid`);
  }

  // Strip deprecated settings
  for (const key of REMOVED_SETTINGS) {
    if (raw[key] !== undefined) {
      migrationInfo?.removedFields.push(key);
    }
    delete raw[key];
  }

  // Migrate legacy field names
  if (raw.showTags !== undefined && raw.includeTagsInData === undefined) {
    raw.includeTagsInData = raw.showTags;
    delete raw.showTags;
    migrationInfo?.migratedFields.push("showTags → includeTagsInData");
  }
  if (!raw.nodeColorMode && (raw.colorNodesByCategory !== undefined || raw.heatmapMode !== undefined)) {
    raw.nodeColorMode = raw.heatmapMode ? "heatmap" : raw.colorNodesByCategory ? "category" : "default";
    migrationInfo?.migratedFields.push(`colorNodesByCategory/heatmapMode → nodeColorMode: ${raw.nodeColorMode}`);
    delete raw.colorNodesByCategory;
    delete raw.heatmapMode;
  }

  const result: Partial<PanelState> = {};
  // Use a string-keyed record view for dynamic property assignment.
  // This is safe because every key written is validated against VALID_KEYS
  // and type-checked per category before assignment.
  const out = result as Record<string, unknown>;

  for (const [key, value] of Object.entries(raw)) {
    if (!VALID_KEYS.has(key)) continue;

    // Boolean fields
    if ((BOOLEAN_FIELDS as string[]).includes(key)) {
      if (typeof value === "boolean") {
        out[key] = value;
      }
      continue;
    }

    // Number fields
    if ((NUMBER_FIELDS as string[]).includes(key)) {
      if (typeof value === "number" && isFinite(value)) {
        out[key] = value;
      }
      continue;
    }

    // String fields
    if ((STRING_FIELDS as string[]).includes(key)) {
      if (typeof value === "string") {
        out[key] = value;
      }
      continue;
    }

    // Enum fields
    if (key in ENUM_VALUES) {
      const k = key as keyof PanelState;
      const allowed = ENUM_VALUES[k];
      if (allowed && typeof value === "string" && allowed.includes(value)) {
        out[key] = value;
      }
      continue;
    }

    // Array fields (some are nullable, e.g. groupByRules)
    if ((ARRAY_FIELDS as string[]).includes(key)) {
      if (Array.isArray(value) || value === null) {
        out[key] = value;
      }
      continue;
    }

    // Set fields — accept arrays (will be converted to Set in applyPreset)
    if ((SET_FIELDS as string[]).includes(key)) {
      if (Array.isArray(value)) {
        out[key] = value;
      }
      continue;
    }

    // Nullable object fields (object | null)
    if ((NULLABLE_OBJECT_FIELDS as string[]).includes(key)) {
      if (value === null || (typeof value === "object" && !Array.isArray(value))) {
        out[key] = value;
      }
      continue;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * Merge a partial preset into an existing PanelState, producing a new state.
 * Any Set fields in the preset (stored as arrays) are converted back to Sets.
 */
export function applyPreset(
  current: PanelState,
  preset: Partial<PanelState>,
): PanelState {
  // Migrate legacy fields
  const raw = preset as Record<string, unknown>;
  if (!raw.nodeColorMode && (raw.colorNodesByCategory !== undefined || raw.heatmapMode !== undefined)) {
    raw.nodeColorMode = raw.heatmapMode ? "heatmap" : raw.colorNodesByCategory ? "category" : "default";
  }
  if (raw.showTags !== undefined && raw.includeTagsInData === undefined) {
    raw.includeTagsInData = raw.showTags;
    delete raw.showTags;
  }
  const merged = { ...current };
  // String-keyed record views for dynamic property access.
  // Safe because keys come from Object.entries(preset) which was
  // validated by importPreset().
  const src = current as unknown as Record<string, unknown>;
  const dst = merged as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(preset)) {
    // If the current value is a Set and the incoming value is an array,
    // convert array back to Set
    if (src[key] instanceof Set && Array.isArray(value)) {
      dst[key] = new Set(value as unknown[]);
    } else {
      dst[key] = value;
    }
  }

  return merged;
}
