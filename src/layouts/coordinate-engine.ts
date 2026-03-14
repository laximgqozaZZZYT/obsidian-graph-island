/**
 * Generic coordinate-based layout engine.
 *
 * 3-phase pipeline:
 *   1. resolveAxisValues  — extract raw numeric values from node data
 *   2. applyTransform     — map raw values through the configured transform
 *   3. toCartesian        — convert (axis1, axis2) to (dx, dy) via coordinate system
 *
 * This engine is used when the user customises a CoordinateLayout beyond
 * the built-in presets.  Preset-matching layouts still dispatch to the
 * hand-tuned offset functions in cluster-force.ts for backward compatibility.
 */

import type {
  GraphNode,
  GraphEdge,
  AxisSource,
  AxisConfig,
  AxisTransform,
  CoordinateLayout,
  CoordinateSystem,
  ShapeFillKind,
  GridConfig,
  GridAxisConfig,
  GridShape,
  GridPositionSource,
  GridStyle,
} from "../types";
import { DEFAULT_RENDER_THRESHOLDS } from "../types";
import { getNodeFieldValues } from "../utils/node-grouping";
import type { ArrangementResult } from "./cluster-force";
import { CURVE_REGISTRY } from "./coordinate-presets";
import { parseExpr, evalExpr, setUserVars, type ExprNode } from "../utils/expr-eval";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Context needed for axis value resolution (passed from cluster-force) */
export interface CoordinateContext {
  /** Degree (total connections) per node */
  degrees: Map<string, number>;
  /** All edges in the subgraph */
  edges: GraphEdge[];
  /** Base node size for spacing */
  nodeSize: number;
  /** Node spacing multiplier */
  nodeSpacing: number;
  /** Group scale multiplier */
  groupScale: number;
  /** Accessor for frontmatter properties */
  getNodeProperty?: (nodeId: string, key: string) => string | undefined;
  /** Number of equal divisions for continuous grid axes (default from DEFAULT_RENDER_THRESHOLDS) */
  coordinateGridDivisions?: number;
  /** Total number of nodes across all groups (exposed as built-in variable N) */
  totalNodeCount?: number;
}

/** A single resolved grid line with position and optional label */
export interface ResolvedGridLine {
  position: number;
  label?: string;
}

/** Fully resolved grid information for rendering */
export interface ResolvedGridInfo {
  axis1Lines: ResolvedGridLine[];
  axis2Lines: ResolvedGridLine[];
  axis1Shape: GridShape;
  axis2Shape: GridShape;
  style: GridStyle;
  cellShading: boolean;
}

/** Guide data for generic coordinate layout */
export interface CoordinateGuide {
  type: "coordinate";
  system: CoordinateSystem;
  axis1Label: string;
  axis2Label: string;
  bounds?: {
    xMin: number; yMin: number; xMax: number; yMax: number;
    maxR?: number;  // polar layouts only
  };
  gridInfo?: ResolvedGridInfo;
}

// ---------------------------------------------------------------------------
// Phase 1: Resolve axis values
// ---------------------------------------------------------------------------

/**
 * Extract a raw numeric value for each node based on the axis source config.
 */
export function resolveAxisValues(
  members: GraphNode[],
  source: AxisSource,
  ctx: CoordinateContext,
): Map<string, number> {
  const result = new Map<string, number>();

  switch (source.kind) {
    case "index": {
      for (let i = 0; i < members.length; i++) {
        result.set(members[i].id, i);
      }
      break;
    }

    case "field": {
      // Unified node attribute source — handles built-in fields (path, file,
      // folder, tag, category, id, isTag) and any frontmatter property.
      const field = source.field;
      const rawValues: { id: string; raw: string }[] = [];
      for (const m of members) {
        const vals = getNodeFieldValues(m, field);
        // Use the first value (multi-value fields like tag take the first)
        rawValues.push({ id: m.id, raw: vals[0] ?? "" });
      }
      // Try numeric parse; fall back to lexicographic index
      const allNumeric = rawValues.every(v => v.raw === "" || !isNaN(Number(v.raw)));
      if (allNumeric) {
        for (const v of rawValues) {
          result.set(v.id, v.raw === "" ? 0 : Number(v.raw));
        }
      } else {
        const sorted = [...new Set(rawValues.map(v => v.raw))].sort();
        const indexMap = new Map(sorted.map((s, i) => [s, i]));
        for (const v of rawValues) {
          result.set(v.id, indexMap.get(v.raw) ?? 0);
        }
      }
      break;
    }

    case "property": {
      const key = source.key;
      // Collect raw string values, then convert to numbers
      const rawValues: { id: string; raw: string }[] = [];
      for (const m of members) {
        let val: string | undefined;
        if (ctx.getNodeProperty) {
          val = ctx.getNodeProperty(m.id, key);
        }
        if (val === undefined && m.meta) {
          const mv = m.meta[key];
          val = mv != null ? String(mv) : undefined;
        }
        rawValues.push({ id: m.id, raw: val ?? "" });
      }

      // Try numeric parse first; fall back to lexicographic index
      const numeric = rawValues.every(v => v.raw === "" || !isNaN(Number(v.raw)));
      if (numeric) {
        for (const v of rawValues) {
          result.set(v.id, v.raw === "" ? 0 : Number(v.raw));
        }
      } else {
        // Lexicographic sort → index
        const sorted = [...new Set(rawValues.map(v => v.raw))].sort();
        const indexMap = new Map(sorted.map((s, i) => [s, i]));
        for (const v of rawValues) {
          result.set(v.id, indexMap.get(v.raw) ?? 0);
        }
      }
      break;
    }

    case "hop": {
      // BFS distance from a specific node (identified by substring match on id)
      const fromPattern = source.from.toLowerCase();
      const maxDepth = source.maxDepth ?? Infinity;
      const memberSet = new Set(members.map(m => m.id));

      // Find the root node by id substring match
      let root: string | undefined;
      for (const m of members) {
        if (m.id.toLowerCase().includes(fromPattern)) {
          root = m.id;
          break;
        }
      }

      if (!root) {
        // No matching root — assign sequential index as fallback so all nodes
        // get finite, well-spread coordinates (maxDepth+1 could be Infinity).
        for (let i = 0; i < members.length; i++) result.set(members[i].id, i);
        break;
      }

      // Build adjacency list within members
      const adj = new Map<string, string[]>();
      for (const id of memberSet) adj.set(id, []);
      for (const e of ctx.edges) {
        if (memberSet.has(e.source) && memberSet.has(e.target)) {
          adj.get(e.source)!.push(e.target);
          adj.get(e.target)!.push(e.source);
        }
      }

      // BFS from root
      const depth = new Map<string, number>();
      depth.set(root, 0);
      const queue = [root];
      let head = 0;
      while (head < queue.length) {
        const cur = queue[head++];
        const d = depth.get(cur)!;
        if (d >= maxDepth) continue;
        for (const nb of adj.get(cur) ?? []) {
          if (!depth.has(nb)) {
            depth.set(nb, d + 1);
            queue.push(nb);
          }
        }
      }

      const fallback = (depth.size > 0 ? Math.max(...depth.values()) : 0) + 1;
      for (const m of members) {
        result.set(m.id, depth.get(m.id) ?? fallback);
      }
      break;
    }

    case "metric": {
      switch (source.metric) {
        case "degree": {
          for (const m of members) {
            result.set(m.id, ctx.degrees.get(m.id) ?? 0);
          }
          break;
        }
        case "in-degree": {
          const inDeg = new Map<string, number>();
          const memberSet = new Set(members.map(m => m.id));
          for (const e of ctx.edges) {
            if (memberSet.has(e.target)) {
              inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
            }
          }
          for (const m of members) {
            result.set(m.id, inDeg.get(m.id) ?? 0);
          }
          break;
        }
        case "out-degree": {
          const outDeg = new Map<string, number>();
          const memberSet = new Set(members.map(m => m.id));
          for (const e of ctx.edges) {
            if (memberSet.has(e.source)) {
              outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
            }
          }
          for (const m of members) {
            result.set(m.id, outDeg.get(m.id) ?? 0);
          }
          break;
        }
        case "bfs-depth": {
          result.clear();
          const memberSet = new Set(members.map(m => m.id));
          // Build adjacency list within the subgraph
          const adj = new Map<string, string[]>();
          for (const id of memberSet) adj.set(id, []);
          for (const e of ctx.edges) {
            if (memberSet.has(e.source) && memberSet.has(e.target)) {
              adj.get(e.source)!.push(e.target);
              adj.get(e.target)!.push(e.source);
            }
          }
          // Root = highest degree node
          let root = members[0]?.id;
          let maxDeg = -1;
          for (const m of members) {
            const d = ctx.degrees.get(m.id) ?? 0;
            if (d > maxDeg) { maxDeg = d; root = m.id; }
          }
          // BFS
          const depth = new Map<string, number>();
          depth.set(root, 0);
          const queue = [root];
          let head = 0;
          while (head < queue.length) {
            const cur = queue[head++];
            const d = depth.get(cur)!;
            for (const nb of adj.get(cur) ?? []) {
              if (!depth.has(nb)) {
                depth.set(nb, d + 1);
                queue.push(nb);
              }
            }
          }
          const maxDepth = queue.length > 0 ? (depth.get(queue[queue.length - 1]) ?? 0) : 0;
          for (const m of members) {
            result.set(m.id, depth.get(m.id) ?? maxDepth + 1);
          }
          break;
        }
        case "sibling-rank": {
          // First compute BFS depth, then rank within each depth level
          const memberSet = new Set(members.map(m => m.id));
          const adj = new Map<string, string[]>();
          for (const id of memberSet) adj.set(id, []);
          for (const e of ctx.edges) {
            if (memberSet.has(e.source) && memberSet.has(e.target)) {
              adj.get(e.source)!.push(e.target);
              adj.get(e.target)!.push(e.source);
            }
          }
          let root = members[0]?.id;
          let maxDeg = -1;
          for (const m of members) {
            const d = ctx.degrees.get(m.id) ?? 0;
            if (d > maxDeg) { maxDeg = d; root = m.id; }
          }
          const depth = new Map<string, number>();
          depth.set(root, 0);
          const queue = [root];
          let head = 0;
          while (head < queue.length) {
            const cur = queue[head++];
            const d = depth.get(cur)!;
            for (const nb of adj.get(cur) ?? []) {
              if (!depth.has(nb)) {
                depth.set(nb, d + 1);
                queue.push(nb);
              }
            }
          }
          // Group by depth, assign rank within each level
          const byDepth = new Map<number, string[]>();
          for (const m of members) {
            const d = depth.get(m.id) ?? 999;
            if (!byDepth.has(d)) byDepth.set(d, []);
            byDepth.get(d)!.push(m.id);
          }
          for (const [, ids] of byDepth) {
            for (let i = 0; i < ids.length; i++) {
              result.set(ids[i], i);
            }
          }
          break;
        }
      }
      break;
    }

    case "random": {
      const seed = source.seed;
      for (const m of members) {
        result.set(m.id, seededHash(m.id, seed));
      }
      break;
    }

    case "const": {
      const v = source.value;
      for (const m of members) {
        result.set(m.id, v);
      }
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase 2: Apply transform
// ---------------------------------------------------------------------------

/**
 * Transform raw axis values according to the transform configuration.
 * @param rawValues Raw numeric values from resolveAxisValues
 * @param transform Transform to apply
 * @param spacing Base spacing (nodeSize × nodeSpacing × groupScale)
 * @param otherAxisValues Values from the other axis (needed for stack-avoid)
 */
export function applyTransform(
  rawValues: Map<string, number>,
  transform: AxisTransform,
  spacing: number,
  otherAxisValues?: Map<string, number>,
  constants?: Record<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();

  switch (transform.kind) {
    case "linear": {
      const scale = transform.scale;
      for (const [id, v] of rawValues) {
        result.set(id, v * scale * spacing);
      }
      break;
    }

    case "bin": {
      const count = Math.max(transform.count, 1);
      let min = Infinity, max = -Infinity;
      for (const v of rawValues.values()) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const range = max - min || 1;
      for (const [id, v] of rawValues) {
        const bin = Math.min(Math.floor(((v - min) / range) * count), count - 1);
        // Use (bin + 1) so that the lowest bin has non-zero spacing.
        // This is essential for polar layouts where bin=0 → radius=0
        // would collapse all lowest-value nodes to the center point.
        result.set(id, (bin + 1) * spacing);
      }
      break;
    }

    case "date-to-index": {
      // Sort by raw string value (dates sort lexicographically for ISO format)
      const entries = [...rawValues.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < entries.length; i++) {
        result.set(entries[i][0], i * spacing);
      }
      break;
    }

    case "golden-angle": {
      const GOLDEN_ANGLE = 2.39996322972865332; // radians
      for (const [id, v] of rawValues) {
        result.set(id, v * GOLDEN_ANGLE);
      }
      break;
    }

    case "even-divide": {
      const totalRad = (transform.totalRange * Math.PI) / 180;
      if (otherAxisValues && otherAxisValues.size > 0) {
        // Per-ring even-divide: group nodes by their other-axis value (e.g. radius bin),
        // then distribute angles evenly within each ring.
        // This prevents the diagonal-stripe artifact where angle correlates with radius.
        const rings = new Map<number, string[]>();
        for (const [id] of rawValues) {
          const ringVal = otherAxisValues.get(id) ?? 0;
          if (!rings.has(ringVal)) rings.set(ringVal, []);
          rings.get(ringVal)!.push(id);
        }
        // Rings grouped by other-axis value; each ring distributes angles evenly
        for (const [, ids] of rings) {
          const n = ids.length;
          for (let i = 0; i < n; i++) {
            result.set(ids[i], (i / n) * totalRad);
          }
        }
      } else {
        // Global even-divide: distribute all nodes across the full range
        let maxVal = 0;
        for (const v of rawValues.values()) {
          if (v > maxVal) maxVal = v;
        }
        const divisor = maxVal > 0 ? maxVal + 1 : 1;
        for (const [id, v] of rawValues) {
          result.set(id, (v / divisor) * totalRad);
        }
      }
      break;
    }

    case "stack-avoid": {
      // Group nodes by their OTHER axis value (binned), then spread within each bin
      if (!otherAxisValues) {
        // Fallback: just use linear spacing
        for (const [id, v] of rawValues) {
          result.set(id, v * spacing);
        }
        break;
      }

      // Bin other-axis values to group nodes in same "column"
      const bins = new Map<number, string[]>();
      for (const [id] of rawValues) {
        const otherVal = otherAxisValues.get(id) ?? 0;
        // Round to nearest spacing unit to group nearby values
        const binKey = Math.round(otherVal / (spacing || 1));
        if (!bins.has(binKey)) bins.set(binKey, []);
        bins.get(binKey)!.push(id);
      }

      // Within each bin, spread nodes vertically
      for (const [, ids] of bins) {
        const n = ids.length;
        const offset = -(n - 1) / 2;
        for (let i = 0; i < n; i++) {
          result.set(ids[i], (offset + i) * spacing);
        }
      }
      break;
    }

    case "curve": {
      const def = CURVE_REGISTRY[transform.curve];
      if (!def) {
        // Unknown curve — fallback to linear
        for (const [id, v] of rawValues) {
          result.set(id, v * spacing);
        }
        break;
      }
      // Merge: defaults < transform params < user constants
      const params = { ...def.defaultParams, ...transform.params, ...constants };
      const scale = transform.scale ?? 1;
      // Normalize raw values to t ∈ [0, 1]
      let min = Infinity, max = -Infinity;
      for (const v of rawValues.values()) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const range = max - min || 1;
      for (const [id, v] of rawValues) {
        const t = (v - min) / range;
        result.set(id, def.fn(t, params) * scale * spacing);
      }
      break;
    }

    case "shape-fill": {
      const n = rawValues.size;
      const coords = computeShapeFill(transform.shape, n, spacing);
      const ids = [...rawValues.keys()];
      for (let j = 0; j < ids.length; j++) {
        result.set(ids[j], transform.axis === 1 ? coords[j].x : coords[j].y);
      }
      break;
    }

    case "expression": {
      const scale = transform.scale ?? 1;
      // Register constant names so the parser accepts them as variables
      if (constants) setUserVars(new Set(Object.keys(constants)));
      let ast: ExprNode;
      try {
        ast = parseExpr(transform.expr);
      } catch (parseErr) {
        // Invalid expression — fallback to linear
        // Invalid expression — fallback to linear spacing
        for (const [id, v] of rawValues) {
          result.set(id, v * spacing);
        }
        break;
      }
      // Normalize raw values to t ∈ [0, 1]
      let min = Infinity, max = -Infinity;
      for (const v of rawValues.values()) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const range = max - min || 1;
      const n = rawValues.size;
      // Built-in mathematical & context constants
      const builtins: Record<string, number> = { pi: Math.PI, e: Math.E, N: constants?.N ?? n };
      // Lowercase constant keys to match the tokenizer's case normalization
      const lcConsts: Record<string, number> = {};
      if (constants) {
        for (const [k, val] of Object.entries(constants)) {
          lcConsts[k.toLowerCase()] = val as number;
        }
      }
      let idx = 0;
      for (const [id, v] of rawValues) {
        const t = (v - min) / range;
        const val = evalExpr(ast, { t, i: idx, n, v, ...builtins, ...lcConsts });
        result.set(id, val * scale * spacing);
        idx++;
      }
      break;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase 3: To Cartesian
// ---------------------------------------------------------------------------

/**
 * Convert two axis values to (dx, dy) offsets using the specified coordinate system.
 * Normalizes centroid to origin.
 */
export function toCartesian(
  axis1Values: Map<string, number>,
  axis2Values: Map<string, number>,
  system: CoordinateSystem,
): Map<string, { dx: number; dy: number }> {
  const result = new Map<string, { dx: number; dy: number }>();

  for (const [id, a1] of axis1Values) {
    const a2 = axis2Values.get(id) ?? 0;
    let dx: number, dy: number;

    if (system === "polar") {
      // axis1 = radius, axis2 = angle (radians)
      dx = a1 * Math.cos(a2);
      dy = a1 * Math.sin(a2);
    } else {
      // cartesian: axis1 = x, axis2 = y
      dx = a1;
      dy = a2;
    }

    result.set(id, { dx, dy });
  }

  // Normalize: shift centroid to origin
  if (result.size > 0) {
    let cx = 0, cy = 0;
    for (const { dx, dy } of result.values()) {
      cx += dx;
      cy += dy;
    }
    cx /= result.size;
    cy /= result.size;
    for (const [id, pos] of result) {
      result.set(id, { dx: pos.dx - cx, dy: pos.dy - cy });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compute node offsets using the generic coordinate engine.
 * This is the fallback path for custom (non-preset) coordinate layouts.
 */
export function coordinateOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  edges: GraphEdge[],
  layout: CoordinateLayout,
  ctx: CoordinateContext,
): ArrangementResult {
  if (members.length === 0) return { offsets: new Map() };

  const spacing = ctx.nodeSize * 2 * ctx.nodeSpacing * ctx.groupScale;
  // In polar mode, axis2 is an angle (radians) — spacing must not scale it.
  const isPolar = layout.system === "polar";
  const axis2Spacing = isPolar ? 1 : spacing;

  // Merge user constants with context-level built-ins (totalNodeCount → N)
  const userConsts = ctx.totalNodeCount != null
    ? { ...layout.constants, N: ctx.totalNodeCount }
    : layout.constants;

  // Phase 1: resolve raw values for both axes
  const raw1 = resolveAxisValues(members, layout.axis1.source, ctx);
  const raw2 = resolveAxisValues(members, layout.axis2.source, ctx);

  // Phase 2: apply transforms
  // For stack-avoid, we need to pass the other axis's transformed values
  // Do axis1 first, then axis2 with axis1 results available for stack-avoid
  const t1 = applyTransform(raw1, layout.axis1.transform, spacing, undefined, userConsts);

  // For stack-avoid and even-divide on axis2, pass transformed axis1 values.
  // even-divide uses other-axis values to distribute nodes per-ring (prevents
  // diagonal-stripe artifacts in polar layouts like concentric).
  const axis2NeedsOther = layout.axis2.transform.kind === "stack-avoid"
    || layout.axis2.transform.kind === "even-divide";
  const t2 = axis2NeedsOther
    ? applyTransform(raw2, layout.axis2.transform, axis2Spacing, t1, userConsts)
    : applyTransform(raw2, layout.axis2.transform, axis2Spacing, undefined, userConsts);

  // Similarly for axis1 if it has stack-avoid (unusual but supported)
  const finalT1 = layout.axis1.transform.kind === "stack-avoid"
    ? applyTransform(raw1, layout.axis1.transform, spacing, t2, userConsts)
    : t1;

  // Phase 3: convert to Cartesian (dx, dy)
  const offsets = toCartesian(finalT1, t2, layout.system);

  // Compute bounds from offsets for guide rendering
  let bxMin = Infinity, byMin = Infinity, bxMax = -Infinity, byMax = -Infinity;
  let maxR = 0;
  for (const { dx, dy } of offsets.values()) {
    if (dx < bxMin) bxMin = dx;
    if (dy < byMin) byMin = dy;
    if (dx > bxMax) bxMax = dx;
    if (dy > byMax) byMax = dy;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > maxR) maxR = r;
  }

  const guide: CoordinateGuide = {
    type: "coordinate",
    system: layout.system,
    axis1Label: describeAxis(layout.axis1),
    axis2Label: describeAxis(layout.axis2),
    bounds: offsets.size > 0
      ? { xMin: bxMin, yMin: byMin, xMax: bxMax, yMax: byMax, ...(layout.system === "polar" ? { maxR } : {}) }
      : undefined,
  };

  // Resolve custom grid if configured
  if (layout.grid && offsets.size > 0) {
    const defaultShape1: GridShape = layout.system === "polar"
      ? { kind: "circle" } : { kind: "line" };
    const defaultShape2: GridShape = layout.system === "polar"
      ? { kind: "radial" } : { kind: "line" };

    const axis1Grid = layout.grid.axis1Grid ?? {
      positions: { kind: "auto" as const },
      shape: defaultShape1,
      ticks: { show: true, labels: { kind: "auto" as const } },
    };
    const axis2Grid = layout.grid.axis2Grid ?? {
      positions: { kind: "auto" as const },
      shape: defaultShape2,
      ticks: { show: true, labels: { kind: "auto" as const } },
    };

    // Compute centroid shift applied by toCartesian() so grid lines align
    // with actual node positions after normalization.
    let centroidShift1 = 0, centroidShift2 = 0;
    if (layout.system === "cartesian" && offsets.size > 0) {
      let sum1 = 0, sum2 = 0, count = 0;
      for (const [id] of finalT1) {
        sum1 += finalT1.get(id) ?? 0;
        sum2 += t2.get(id) ?? 0;
        count++;
      }
      if (count > 0) {
        centroidShift1 = sum1 / count;
        centroidShift2 = sum2 / count;
      }
    }

    const gridStyle = layout.grid.style ?? "lines";
    const rawAxis1Lines = resolveGridLines(
      axis1Grid, layout.axis1.source, members, ctx,
      finalT1, spacing, layout.constants, gridStyle,
    );
    const rawAxis2Lines = resolveGridLines(
      axis2Grid, layout.axis2.source, members, ctx,
      t2, spacing, layout.constants, gridStyle,
    );

    // Apply centroid shift to grid line positions
    const axis1Lines = rawAxis1Lines.map(l => ({
      ...l,
      position: l.position - centroidShift1,
    }));
    const axis2Lines = rawAxis2Lines.map(l => ({
      ...l,
      position: l.position - centroidShift2,
    }));

    guide.gridInfo = {
      axis1Lines,
      axis2Lines,
      axis1Shape: axis1Grid.shape,
      axis2Shape: axis2Grid.shape,
      style: layout.grid.style,
      cellShading: layout.grid.cellShading ?? false,
    };

    // Extend bounds to cover all grid line positions so lines aren't clipped
    if (guide.bounds) {
      for (const l of axis1Lines) {
        if (l.position < guide.bounds.xMin) guide.bounds.xMin = l.position;
        if (l.position > guide.bounds.xMax) guide.bounds.xMax = l.position;
      }
      for (const l of axis2Lines) {
        if (l.position < guide.bounds.yMin) guide.bounds.yMin = l.position;
        if (l.position > guide.bounds.yMax) guide.bounds.yMax = l.position;
      }
    }
  }

  return { offsets, guide };
}

// ---------------------------------------------------------------------------
// Grid resolution
// ---------------------------------------------------------------------------

/**
 * Extract category labels from an axis source.
 * Returns sorted unique string values for field/property sources,
 * or undefined for continuous sources.
 */
export function resolveAxisCategories(
  members: GraphNode[],
  source: AxisSource,
  ctx: CoordinateContext,
): string[] | undefined {
  if (source.kind === "field") {
    const rawValues: string[] = [];
    for (const m of members) {
      const vals = getNodeFieldValues(m, source.field);
      rawValues.push(vals[0] ?? "");
    }
    const allNumeric = rawValues.every(v => v === "" || !isNaN(Number(v)));
    if (!allNumeric) {
      return [...new Set(rawValues)].sort();
    }
    return undefined; // numeric field → continuous
  }
  if (source.kind === "property") {
    const rawValues: string[] = [];
    for (const m of members) {
      let val: string | undefined;
      if (ctx.getNodeProperty) {
        val = ctx.getNodeProperty(m.id, source.key);
      }
      if (val === undefined && m.meta) {
        const mv = m.meta[source.key];
        val = mv != null ? String(mv) : undefined;
      }
      rawValues.push(val ?? "");
    }
    const numeric = rawValues.every(v => v === "" || !isNaN(Number(v)));
    if (!numeric) {
      return [...new Set(rawValues)].sort();
    }
    return undefined;
  }
  return undefined;
}

/**
 * Resolve grid line positions and labels for one axis.
 * Positions are returned in the TRANSFORMED coordinate space.
 */
function resolveGridLines(
  gridAxis: GridAxisConfig,
  axisSource: AxisSource,
  members: GraphNode[],
  ctx: CoordinateContext,
  transformedValues: Map<string, number>,
  spacing: number,
  constants?: Record<string, number>,
  gridStyle?: string,
): ResolvedGridLine[] {
  const { positions, ticks } = gridAxis;

  // Compute bounds from transformed values
  let tMin = Infinity, tMax = -Infinity;
  for (const v of transformedValues.values()) {
    if (v < tMin) tMin = v;
    if (v > tMax) tMax = v;
  }
  if (!isFinite(tMin)) { tMin = 0; tMax = spacing; }
  const tRange = tMax - tMin || 1;

  let linePositions: number[] = [];
  let autoLabels: string[] | undefined;

  // Resolve positions
  switch (positions.kind) {
    case "auto": {
      const cats = resolveAxisCategories(members, axisSource, ctx);
      if (cats) {
        // Category-based: collect unique transformed values per category
        const catPositions = collectCategoryPositions(
          members, axisSource, ctx, transformedValues,
        );
        if (catPositions.length > 0 && gridStyle === "table") {
          // Table style: convert N category centers → N+1 cell boundaries
          // so grid lines form cell walls with nodes inside cells
          const centers = catPositions.map(c => c.position);
          const boundaries: number[] = [];
          const halfFirst = centers.length > 1
            ? (centers[1] - centers[0]) / 2
            : spacing / 2;
          boundaries.push(centers[0] - halfFirst);
          for (let i = 0; i + 1 < centers.length; i++) {
            boundaries.push((centers[i] + centers[i + 1]) / 2);
          }
          const halfLast = centers.length > 1
            ? (centers[centers.length - 1] - centers[centers.length - 2]) / 2
            : spacing / 2;
          boundaries.push(centers[centers.length - 1] + halfLast);
          linePositions = boundaries;
          // N labels for N cells (placed "between" pairs of N+1 boundary lines)
          autoLabels = catPositions.map(c => c.label);
        } else if (catPositions.length > 0) {
          // Lines style: grid lines at category centers (original behavior)
          linePositions = catPositions.map(c => c.position);
          autoLabels = catPositions.map(c => c.label);
        }
      } else {
        // Continuous: equal divisions (configurable)
        const divs = ctx.coordinateGridDivisions ?? DEFAULT_RENDER_THRESHOLDS.coordinateGridDivisions;
        for (let i = 0; i <= divs; i++) {
          linePositions.push(tMin + (tRange / divs) * i);
        }
      }
      break;
    }
    case "count": {
      const n = Math.max(positions.n, 1);
      for (let i = 0; i <= n; i++) {
        linePositions.push(tMin + (tRange / n) * i);
      }
      break;
    }
    case "step": {
      const step = Math.abs(positions.step) || 1;
      for (let v = tMin; v <= tMax + step * 0.01; v += step) {
        linePositions.push(v);
      }
      break;
    }
    case "values": {
      linePositions = positions.values;
      break;
    }
    case "field": {
      const fieldSource: AxisSource = { kind: "field", field: positions.field };
      const catPositions = collectCategoryPositions(
        members, fieldSource, ctx, transformedValues,
      );
      if (catPositions.length > 0 && gridStyle === "table") {
        const centers = catPositions.map(c => c.position);
        const boundaries: number[] = [];
        const halfFirst = centers.length > 1
          ? (centers[1] - centers[0]) / 2
          : spacing / 2;
        boundaries.push(centers[0] - halfFirst);
        for (let i = 0; i + 1 < centers.length; i++) {
          boundaries.push((centers[i] + centers[i + 1]) / 2);
        }
        const halfLast = centers.length > 1
          ? (centers[centers.length - 1] - centers[centers.length - 2]) / 2
          : spacing / 2;
        boundaries.push(centers[centers.length - 1] + halfLast);
        linePositions = boundaries;
        autoLabels = catPositions.map(c => c.label);
      } else if (catPositions.length > 0) {
        linePositions = catPositions.map(c => c.position);
        autoLabels = catPositions.map(c => c.label);
      }
      break;
    }
    case "property": {
      const propSource: AxisSource = { kind: "property", key: positions.key };
      const catPositions = collectCategoryPositions(
        members, propSource, ctx, transformedValues,
      );
      if (catPositions.length > 0 && gridStyle === "table") {
        const centers = catPositions.map(c => c.position);
        const boundaries: number[] = [];
        const halfFirst = centers.length > 1
          ? (centers[1] - centers[0]) / 2
          : spacing / 2;
        boundaries.push(centers[0] - halfFirst);
        for (let i = 0; i + 1 < centers.length; i++) {
          boundaries.push((centers[i] + centers[i + 1]) / 2);
        }
        const halfLast = centers.length > 1
          ? (centers[centers.length - 1] - centers[centers.length - 2]) / 2
          : spacing / 2;
        boundaries.push(centers[centers.length - 1] + halfLast);
        linePositions = boundaries;
        autoLabels = catPositions.map(c => c.label);
      } else if (catPositions.length > 0) {
        linePositions = catPositions.map(c => c.position);
        autoLabels = catPositions.map(c => c.label);
      }
      break;
    }
    case "expression": {
      try {
        if (constants) setUserVars(new Set(Object.keys(constants)));
        const ast = parseExpr(positions.expr);
        // Lowercase constant keys for tokenizer compatibility
        const lcGridConsts: Record<string, number> = {};
        if (constants) {
          for (const [k, val2] of Object.entries(constants)) {
            lcGridConsts[k.toLowerCase()] = val2 as number;
          }
        }
        // Generate positions: evaluate expr for t in [0, 1] with 20 sample points
        const samples = 20;
        for (let i = 0; i <= samples; i++) {
          const t = i / samples;
          const val = evalExpr(ast, {
            t, i, n: samples + 1, v: tMin + t * tRange,
            ...lcGridConsts,
          });
          linePositions.push(val);
        }
        // Deduplicate and sort
        linePositions = [...new Set(linePositions.map(v => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
      } catch {
        // Invalid expr — fall back to configurable divisions
        const fallbackDivs = ctx.coordinateGridDivisions ?? DEFAULT_RENDER_THRESHOLDS.coordinateGridDivisions;
        for (let i = 0; i <= fallbackDivs; i++) {
          linePositions.push(tMin + (tRange / fallbackDivs) * i);
        }
      }
      break;
    }
  }

  // Resolve labels from ticks config (default: auto labels with show=true)
  const showLabels = ticks?.show !== false;
  let labels: string[] | undefined = autoLabels;

  const labelSource = ticks?.labels ?? { kind: "auto" as const };
  switch (labelSource.kind) {
    case "auto":
      // Use category-derived autoLabels if available, otherwise format numbers
      if (!labels) {
        labels = linePositions.map(v => formatGridValue(v, spacing));
      }
      break;
    case "field": {
      const fieldCats = resolveAxisCategories(
        members, { kind: "field", field: labelSource.field }, ctx,
      );
      if (fieldCats) labels = fieldCats;
      break;
    }
    case "custom":
      labels = labelSource.values;
      break;
  }

  return linePositions.map((pos, i) => ({
    position: pos,
    label: showLabels ? (labels?.[i] ?? formatGridValue(pos, spacing)) : undefined,
  }));
}

/** Collect unique category positions by matching categories to their transformed values */
function collectCategoryPositions(
  members: GraphNode[],
  source: AxisSource,
  ctx: CoordinateContext,
  transformedValues: Map<string, number>,
): { position: number; label: string }[] {
  // Resolve raw values to get category→index mapping
  const rawMap = resolveAxisValues(members, source, ctx);
  // Group nodes by raw value (category index)
  const groups = new Map<number, { ids: string[]; label: string }>();

  if (source.kind === "field" || source.kind === "property") {
    const rawEntries: { id: string; raw: string }[] = [];
    for (const m of members) {
      if (source.kind === "field") {
        const vals = getNodeFieldValues(m, source.field);
        rawEntries.push({ id: m.id, raw: vals[0] ?? "" });
      } else {
        // property kind — mirror resolveAxisValues logic
        let val: string | undefined;
        if (ctx.getNodeProperty) {
          val = ctx.getNodeProperty(m.id, source.key);
        }
        if (val === undefined && m.meta) {
          const mv = m.meta[source.key];
          val = mv != null ? String(mv) : undefined;
        }
        rawEntries.push({ id: m.id, raw: val ?? "" });
      }
    }
    const allNumeric = rawEntries.every(v => v.raw === "" || !isNaN(Number(v.raw)));
    if (!allNumeric) {
      const sorted = [...new Set(rawEntries.map(v => v.raw))].sort();
      for (let i = 0; i < sorted.length; i++) {
        groups.set(i, { ids: [], label: sorted[i] });
      }
      for (const entry of rawEntries) {
        const idx = rawMap.get(entry.id) ?? 0;
        const g = groups.get(idx);
        if (g) g.ids.push(entry.id);
      }
    }
  }

  if (groups.size === 0) return [];

  // Compute average transformed position per category
  const result: { position: number; label: string }[] = [];
  for (const [, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    let sum = 0, count = 0;
    for (const id of group.ids) {
      const tv = transformedValues.get(id);
      if (tv !== undefined) { sum += tv; count++; }
    }
    if (count > 0) {
      result.push({ position: sum / count, label: group.label });
    }
  }
  return result;
}

/** Format a grid value for display */
function formatGridValue(v: number, spacing: number): string {
  if (spacing > 0) {
    const normalized = v / spacing;
    if (Math.abs(normalized - Math.round(normalized)) < 0.01) {
      return String(Math.round(normalized));
    }
  }
  return Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0);
}

// ---------------------------------------------------------------------------
// Shape-fill algorithms
// ---------------------------------------------------------------------------

interface Point2D { x: number; y: number; }

/** Dispatch to shape-specific packing function */
function computeShapeFill(shape: ShapeFillKind, n: number, sp: number): Point2D[] {
  switch (shape) {
    case "square":   return squareFill(n, sp);
    case "triangle": return triangleFill(n, sp);
    case "hexagon":  return hexagonFill(n, sp);
    case "diamond":  return diamondFill(n, sp);
    case "circle":   return circleFill(n, sp);
  }
}

/** Standard grid: cols = ceil(sqrt(n)), centered around origin */
function squareFill(n: number, sp: number): Point2D[] {
  if (n === 0) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const pts: Point2D[] = [];
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    pts.push({ x: (col - cx) * sp, y: (row - cy) * sp });
  }
  return pts;
}

/**
 * Triangular packing: row k has (k+1) nodes, each row centered.
 * Find numRows where numRows*(numRows+1)/2 >= n.
 */
function triangleFill(n: number, sp: number): Point2D[] {
  if (n === 0) return [];
  // Find minimum rows needed
  let numRows = 1;
  while (numRows * (numRows + 1) / 2 < n) numRows++;
  const rowH = sp * Math.sqrt(3) / 2;
  const totalH = (numRows - 1) * rowH;
  const pts: Point2D[] = [];
  let placed = 0;
  for (let row = 0; row < numRows && placed < n; row++) {
    const nodesInRow = Math.min(row + 1, n - placed);
    const y = row * rowH - totalH / 2;
    const rowWidth = (nodesInRow - 1) * sp;
    for (let j = 0; j < nodesInRow; j++) {
      const x = j * sp - rowWidth / 2;
      pts.push({ x, y });
      placed++;
    }
  }
  return pts;
}

/**
 * Hexagonal rings: center node, then ring 1 (6 nodes), ring 2 (12), etc.
 * Each ring r has 6*r nodes. Interpolate between corner positions.
 */
function hexagonFill(n: number, sp: number): Point2D[] {
  if (n === 0) return [];
  const pts: Point2D[] = [{ x: 0, y: 0 }]; // center node
  if (n === 1) return pts;

  let ring = 1;
  while (pts.length < n) {
    const nodesInRing = 6 * ring;
    // Corner directions for a flat-top hexagon
    const corners: Point2D[] = [];
    for (let c = 0; c < 6; c++) {
      const angle = (Math.PI / 3) * c;
      corners.push({
        x: ring * sp * Math.cos(angle),
        y: ring * sp * Math.sin(angle),
      });
    }
    // Interpolate between corners
    for (let i = 0; i < nodesInRing && pts.length < n; i++) {
      const side = Math.floor(i / ring);
      const step = i % ring;
      const from = corners[side];
      const to = corners[(side + 1) % 6];
      const t = step / ring;
      pts.push({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      });
    }
    ring++;
  }
  return pts;
}

/**
 * Rotated square grid (45 degrees):
 * x = (col - row) * sp * 0.707, y = (col + row) * sp * 0.707, centered.
 */
function diamondFill(n: number, sp: number): Point2D[] {
  if (n === 0) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const factor = sp * Math.SQRT1_2; // 0.707...
  const pts: Point2D[] = [];
  const cCol = (cols - 1) / 2;
  const cRow = (rows - 1) / 2;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dc = col - cCol;
    const dr = row - cRow;
    pts.push({
      x: (dc - dr) * factor,
      y: (dc + dr) * factor,
    });
  }
  return pts;
}

/**
 * Sunflower / golden-angle packing:
 * r = sp * sqrt(i), angle = i * GOLDEN_ANGLE, convert to (x,y).
 */
function circleFill(n: number, sp: number): Point2D[] {
  const GOLDEN_ANGLE = 2.39996322972865332;
  const pts: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const r = sp * Math.sqrt(i);
    const angle = i * GOLDEN_ANGLE;
    pts.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple seeded hash → [0, 1) */
function seededHash(str: string, seed: number): number {
  let h = seed | 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  // Mix bits
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h & 0x7fffffff) / 0x7fffffff;
}

/** Human-readable label for an axis config */
function describeAxis(axis: AxisConfig): string {
  const src = axis.source;
  switch (src.kind) {
    case "index": return "index";
    case "field": return `field:${src.field}`;
    case "property": return `property:${src.key}`;
    case "metric": return `metric:${src.metric}`;
    case "hop": return `hop:${src.from}`;
    case "random": return "random";
    case "const": return `const(${src.value})`;
  }
}
