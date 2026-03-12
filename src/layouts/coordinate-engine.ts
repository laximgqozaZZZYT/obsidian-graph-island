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
} from "../types";
import { getNodeFieldValues } from "../utils/node-grouping";
import type { ArrangementResult } from "./cluster-force";

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
}

/** Guide data for generic coordinate layout */
export interface CoordinateGuide {
  type: "coordinate";
  system: CoordinateSystem;
  axis1Label: string;
  axis2Label: string;
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
        result.set(id, bin * spacing);
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
      let maxVal = 0;
      for (const v of rawValues.values()) {
        if (v > maxVal) maxVal = v;
      }
      const divisor = maxVal > 0 ? maxVal + 1 : 1;
      for (const [id, v] of rawValues) {
        result.set(id, (v / divisor) * totalRad);
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

  // Phase 1: resolve raw values for both axes
  const raw1 = resolveAxisValues(members, layout.axis1.source, ctx);
  const raw2 = resolveAxisValues(members, layout.axis2.source, ctx);

  // Phase 2: apply transforms
  // For stack-avoid, we need to pass the other axis's transformed values
  // Do axis1 first, then axis2 with axis1 results available for stack-avoid
  const t1 = applyTransform(raw1, layout.axis1.transform, spacing);

  // For stack-avoid on axis2, pass transformed axis1 values
  const t2 = layout.axis2.transform.kind === "stack-avoid"
    ? applyTransform(raw2, layout.axis2.transform, spacing, t1)
    : applyTransform(raw2, layout.axis2.transform, spacing);

  // Similarly for axis1 if it has stack-avoid (unusual but supported)
  const finalT1 = layout.axis1.transform.kind === "stack-avoid"
    ? applyTransform(raw1, layout.axis1.transform, spacing, t2)
    : t1;

  // Phase 3: convert to Cartesian (dx, dy)
  const offsets = toCartesian(finalT1, t2, layout.system);

  const guide: CoordinateGuide = {
    type: "coordinate",
    system: layout.system,
    axis1Label: describeAxis(layout.axis1),
    axis2Label: describeAxis(layout.axis2),
  };

  return { offsets, guide };
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
