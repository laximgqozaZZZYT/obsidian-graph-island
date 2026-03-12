import type { CoordinateLayout, ClusterArrangement, AxisConfig, AxisSource } from "../types";

/**
 * Maps each legacy arrangement name to its equivalent CoordinateLayout.
 * These serve as presets — selecting an arrangement fills in the coordinate config.
 * The coordinate system is NOT coupled to the arrangement; users can override freely.
 */
export const ARRANGEMENT_PRESETS: Record<ClusterArrangement, CoordinateLayout> = {
  spiral: {
    system: "polar",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "golden-angle" } },
    perGroup: true,
  },
  concentric: {
    system: "polar",
    axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "bin", count: 5 } },
    axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
    perGroup: true,
  },
  tree: {
    system: "cartesian",
    axis1: { source: { kind: "metric", metric: "bfs-depth" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "metric", metric: "sibling-rank" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  grid: {
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  triangle: {
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  random: {
    system: "cartesian",
    axis1: { source: { kind: "random", seed: 42 }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "random", seed: 42 }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  mountain: {
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: -1 } },
    perGroup: true,
  },
  sunburst: {
    system: "polar",
    axis1: { source: { kind: "const", value: 1 }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
    perGroup: false,
  },
  timeline: {
    system: "cartesian",
    axis1: { source: { kind: "property", key: "date" }, transform: { kind: "date-to-index" } },
    axis2: { source: { kind: "index" }, transform: { kind: "stack-avoid" } },
    perGroup: true,
  },
  custom: {
    system: "cartesian",
    axis1: { source: { kind: "field", field: "folder" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
};

/**
 * Resolve the effective CoordinateLayout for the current panel state.
 * If coordinateLayout is explicitly set, use it.
 * Otherwise, derive from clusterArrangement preset.
 */
export function resolveCoordinateLayout(
  arrangement: ClusterArrangement,
  override: CoordinateLayout | null,
): CoordinateLayout {
  return override ?? ARRANGEMENT_PRESETS[arrangement];
}

/**
 * Determine which arrangement function to call based on CoordinateLayout.
 * This maps coordinate configs back to the concrete offset function.
 *
 * The mapping uses the SOURCE types of each axis to infer the right algorithm,
 * NOT the coordinate system. This ensures polar can be used with timeline, etc.
 */
export function resolveArrangementFromLayout(layout: CoordinateLayout): ClusterArrangement {
  const s1 = layout.axis1.source.kind;
  const s2 = layout.axis2.source.kind;
  const t1 = layout.axis1.transform.kind;
  const t2 = layout.axis2.transform.kind;

  // Property + date-to-index on axis1 → timeline
  if (s1 === "property" && t1 === "date-to-index") return "timeline";

  // Random sources → random
  if (s1 === "random" || s2 === "random") return "random";

  // Metric: bfs-depth → tree
  if (s1 === "metric" && (layout.axis1.source as { kind: "metric"; metric: string }).metric === "bfs-depth") return "tree";

  // Metric: degree on axis1 with bin → concentric
  if (s1 === "metric" && (layout.axis1.source as { kind: "metric"; metric: string }).metric === "degree" && t1 === "bin") return "concentric";

  // Metric: degree on axis2 with negative scale → mountain
  if (s2 === "metric" && (layout.axis2.source as { kind: "metric"; metric: string }).metric === "degree") return "mountain";

  // Const on axis1 + even-divide → sunburst
  if (s1 === "const" && t2 === "even-divide" && !layout.perGroup) return "sunburst";

  // Golden angle transform → spiral
  if (t2 === "golden-angle") return "spiral";

  // Index + index with specific transforms
  if (s1 === "index" && s2 === "index") return "grid";

  return "spiral"; // fallback
}

// ---------------------------------------------------------------------------
// Preset detection
// ---------------------------------------------------------------------------

/** Pre-computed JSON strings for all presets (for fast membership check) */
const PRESET_JSON_SET: Set<string> = new Set(
  Object.values(ARRANGEMENT_PRESETS).map(p => JSON.stringify(p)),
);

/**
 * Check if a CoordinateLayout exactly matches any built-in preset.
 * Returns true if the layout is a known preset, false for custom configs.
 *
 * Note: does NOT return the preset name because some presets share identical
 * coordinate configs (e.g. grid and triangle). Use resolveArrangementFromLayout()
 * to determine which hardcoded function to dispatch to.
 */
export function isExactPreset(layout: CoordinateLayout): boolean {
  return PRESET_JSON_SET.has(JSON.stringify(layout));
}

/**
 * Find which arrangement preset matches the given layout, if any.
 * Returns the arrangement name, or "custom" if no preset matches.
 * When multiple presets share the same layout (e.g. grid/triangle),
 * the first match wins (iteration order of ARRANGEMENT_PRESETS).
 */
export function findMatchingPreset(layout: CoordinateLayout): ClusterArrangement {
  const json = JSON.stringify(layout);
  for (const [name, preset] of Object.entries(ARRANGEMENT_PRESETS)) {
    if (name === "custom") continue;
    if (JSON.stringify(preset) === json) return name as ClusterArrangement;
  }
  return "custom";
}
