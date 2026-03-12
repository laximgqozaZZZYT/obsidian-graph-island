// ---------------------------------------------------------------------------
// Preset export/import utilities for Graph Island
// ---------------------------------------------------------------------------
// Serializes PanelState to shareable JSON and validates on import.
// ---------------------------------------------------------------------------

import type { PanelState } from "../views/PanelBuilder";

// ---------------------------------------------------------------------------
// Field metadata for validation
// ---------------------------------------------------------------------------

/** Fields that should be boolean */
const BOOLEAN_FIELDS: (keyof PanelState)[] = [
  "showTags", "showAttachments", "existingOnly", "showOrphans", "showArrows",
  "scaleByDegree", "showOrbitRings", "orbitAutoRotate", "colorEdgesByRelation",
  "colorNodesByCategory", "showInheritance", "showAggregation", "showTagNodes",
  "showSimilar", "showSibling", "showSequence", "showLinks", "showTagEdges",
  "showCategoryEdges", "showSemanticEdges", "fadeEdgesByDegree",
  "showEdgeLabels", "showMinimap", "autoFit", "showDurationBars",
  "showGuideLines", "showGroupGrid",
];

/** Fields that should be number */
const NUMBER_FIELDS: (keyof PanelState)[] = [
  "textFadeThreshold", "nodeSize", "centerForce", "repelForce", "linkForce",
  "linkDistance", "concentricMinRadius", "concentricRadiusStep",
  "enclosureSpacing", "hoverHops", "clusterNodeSpacing", "clusterGroupScale",
  "clusterGroupSpacing", "edgeBundleStrength", "groupMinSize",
];

/** Fields that should be string */
const STRING_FIELDS: (keyof PanelState)[] = [
  "searchQuery", "timelineKey", "groupFilter", "groupBy",
  "dataviewQuery", "timelineEndKey", "timelineOrderFields",
];

/** Fields that should be arrays */
const ARRAY_FIELDS: (keyof PanelState)[] = [
  "groups", "directionalGravityRules", "commonQueries", "clusterGroupRules",
  "sortRules", "nodeRules", "nodeShapeRules",
];

/** Valid values for enum-like fields */
const ENUM_VALUES: Partial<Record<keyof PanelState, readonly string[]>> = {
  tagDisplay: ["node", "enclosure"] as const,
  clusterArrangement: ["spiral", "concentric", "tree", "grid", "triangle", "random", "mountain", "sunburst", "timeline"] as const,
  guideLineMode: ["shared", "per-group"] as const,
  activeTab: ["filter", "display", "layout", "settings"] as const,
};

/** Fields that are nullable objects (object | null) — passed through if object or null */
const NULLABLE_OBJECT_FIELDS: (keyof PanelState)[] = [
  "coordinateLayout",
];

/** All valid PanelState keys — derived from the field lists above plus enums */
const VALID_KEYS = new Set<string>([
  ...BOOLEAN_FIELDS,
  ...NUMBER_FIELDS,
  ...STRING_FIELDS,
  ...ARRAY_FIELDS,
  ...Object.keys(ENUM_VALUES),
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

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Parse a JSON string and return only the valid PanelState fields.
 * Throws on invalid JSON. Silently drops unknown or invalid fields.
 */
export function importPreset(json: string): Partial<PanelState> {
  const raw = JSON.parse(json);

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Preset must be a JSON object");
  }

  const result: Partial<PanelState> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (!VALID_KEYS.has(key)) continue;

    const k = key as keyof PanelState;

    // Boolean fields
    if ((BOOLEAN_FIELDS as string[]).includes(key)) {
      if (typeof value === "boolean") {
        (result as any)[k] = value;
      }
      continue;
    }

    // Number fields
    if ((NUMBER_FIELDS as string[]).includes(key)) {
      if (typeof value === "number" && isFinite(value)) {
        (result as any)[k] = value;
      }
      continue;
    }

    // String fields
    if ((STRING_FIELDS as string[]).includes(key)) {
      if (typeof value === "string") {
        (result as any)[k] = value;
      }
      continue;
    }

    // Enum fields
    if (key in ENUM_VALUES) {
      const allowed = ENUM_VALUES[k];
      if (allowed && typeof value === "string" && allowed.includes(value)) {
        (result as any)[k] = value;
      }
      continue;
    }

    // Array fields
    if ((ARRAY_FIELDS as string[]).includes(key)) {
      if (Array.isArray(value)) {
        (result as any)[k] = value;
      }
      continue;
    }

    // Nullable object fields (object | null)
    if ((NULLABLE_OBJECT_FIELDS as string[]).includes(key)) {
      if (value === null || (typeof value === "object" && !Array.isArray(value))) {
        (result as any)[k] = value;
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
  const merged = { ...current };

  for (const [key, value] of Object.entries(preset)) {
    const k = key as keyof PanelState;

    // If the current value is a Set and the incoming value is an array,
    // convert array back to Set
    if ((current as any)[k] instanceof Set && Array.isArray(value)) {
      (merged as any)[k] = new Set(value as unknown[]);
    } else {
      (merged as any)[k] = value;
    }
  }

  return merged;
}
