import type { GraphData, GraphNode, GraphEdge } from "../types";
import { hexToRgb } from "./color";

/**
 * Extract node ID from a d3-force edge endpoint.
 * During simulation, d3 replaces string IDs with node objects.
 */
export function edgeSourceId(e: { source: string | { id: string } }): string {
  return typeof e.source === "string" ? e.source : e.source.id;
}

export function edgeTargetId(e: { target: string | { id: string } }): string {
  return typeof e.target === "string" ? e.target : e.target.id;
}

export function yieldFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export function buildAdj(gd: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of gd.nodes) adj.set(n.id, new Set());
  for (const e of gd.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  return adj;
}

// ---------------------------------------------------------------------------
// BFS utilities — consolidated from 5 duplicate implementations
// ---------------------------------------------------------------------------

/** BFS N-hop neighbor set from a starting node. Returns Set of reachable node IDs (including start). */
export function bfsNeighborSet(adj: Map<string, Set<string>>, startId: string, maxHops: number): Set<string> {
  const visited = new Set<string>();
  visited.add(startId);
  let frontier = [startId];
  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      const nb = adj.get(id);
      if (!nb) continue;
      for (const n of nb) {
        if (!visited.has(n)) { visited.add(n); next.push(n); }
      }
    }
    frontier = next;
  }
  return visited;
}

/** BFS shortest path between two nodes. Returns node ID array (start→end), or empty if unreachable. */
export function bfsShortestPath(adj: Map<string, Set<string>>, startId: string, endId: string): string[] {
  if (startId === endId) return [startId];
  const prev = new Map<string, string>();
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const nb = adj.get(current);
    if (!nb) continue;
    for (const n of nb) {
      if (visited.has(n)) continue;
      visited.add(n);
      prev.set(n, current);
      if (n === endId) {
        // Reconstruct path
        const path: string[] = [endId];
        let cursor = endId;
        while (prev.has(cursor)) { cursor = prev.get(cursor)!; path.unshift(cursor); }
        return path;
      }
      queue.push(n);
    }
  }
  return []; // Unreachable
}

/**
 * Yen's K-shortest simple paths algorithm (unweighted BFS variant).
 * Returns up to `k` shortest paths from start to end, each as a node ID array.
 * Falls back to BFS for k=1.
 */
export function kShortestPaths(
  adj: Map<string, Set<string>>,
  startId: string,
  endId: string,
  k = 3,
): string[][] {
  // First shortest path via BFS
  const first = bfsShortestPath(adj, startId, endId);
  if (first.length === 0 || k <= 1) return first.length > 0 ? [first] : [];

  const A: string[][] = [first]; // confirmed k-shortest
  const B: { path: string[]; cost: number }[] = []; // candidate pool
  const pathSet = new Set<string>([first.join("→")]);

  for (let ki = 1; ki < k; ki++) {
    const prevPath = A[ki - 1];
    for (let i = 0; i < prevPath.length - 1; i++) {
      const spurNode = prevPath[i];
      const rootPath = prevPath.slice(0, i + 1);

      // Build restricted adjacency: remove edges used by existing paths at this spur
      const removedEdges = new Set<string>();
      for (const p of A) {
        if (p.length > i && p.slice(0, i + 1).join("→") === rootPath.join("→")) {
          removedEdges.add(`${p[i]}→${p[i + 1]}`);
        }
      }
      const removedNodes = new Set(rootPath.slice(0, -1)); // except spurNode

      // BFS from spurNode to endId with restrictions
      const spurPath = _bfsRestricted(adj, spurNode, endId, removedEdges, removedNodes);
      if (spurPath.length > 0) {
        const total = [...rootPath.slice(0, -1), ...spurPath];
        const key = total.join("→");
        if (!pathSet.has(key)) {
          pathSet.add(key);
          B.push({ path: total, cost: total.length });
        }
      }
    }

    if (B.length === 0) break;
    // Pick shortest candidate
    B.sort((a, b) => a.cost - b.cost);
    A.push(B.shift()!.path);
  }

  return A;
}

/** BFS with edge and node restrictions (helper for Yen's) */
function _bfsRestricted(
  adj: Map<string, Set<string>>,
  startId: string,
  endId: string,
  removedEdges: Set<string>,
  removedNodes: Set<string>,
): string[] {
  const prev = new Map<string, string>();
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (visited.has(nb) || removedNodes.has(nb)) continue;
      if (removedEdges.has(`${cur}→${nb}`)) continue;
      visited.add(nb);
      prev.set(nb, cur);
      if (nb === endId) {
        const path: string[] = [endId];
        let c = endId;
        while (prev.has(c)) { c = prev.get(c)!; path.unshift(c); }
        return path;
      }
      queue.push(nb);
    }
  }
  return [];
}

export function cssColorToHex(css: string): number {
  if (css.startsWith("#")) {
    return parseInt(css.slice(1), 16);
  }
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
  }
  return 0x6366f1;
}

/**
 * Shift the hue of a 0xRRGGBB color by `degrees` (0–360).
 * Used to generate enclosure colors that are visually distinct from node colors.
 */
export function shiftHue(hex: number, degrees: number): number {
  const { r: ri, g: gi, b: bi } = hexToRgb(hex);
  const r = ri / 255;
  const g = gi / 255;
  const b = bi / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  h = ((h * 360 + degrees) % 360) / 360;
  if (h < 0) h += 1;

  // HSV to RGB
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let ro: number, go: number, bo: number;
  switch (i % 6) {
    case 0: ro = v; go = t; bo = p; break;
    case 1: ro = q; go = v; bo = p; break;
    case 2: ro = p; go = v; bo = t; break;
    case 3: ro = p; go = q; bo = v; break;
    case 4: ro = t; go = p; bo = v; break;
    default: ro = v; go = p; bo = q; break;
  }

  return ((Math.round(ro * 255) << 16) | (Math.round(go * 255) << 8) | Math.round(bo * 255));
}

/**
 * Convert HSL values to a 0xRRGGBB hex color.
 * h: 0–360, s: 0–1, l: 0–1.
 */
export function hslToHex(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else               { r = c; b = x; }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

/**
 * Deterministic hash of a string to a number in [0, range).
 * Uses djb2 algorithm for fast, well-distributed hashing.
 */
export function stringHash(str: string, range: number): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return ((hash % range) + range) % range;
}

// ---------------------------------------------------------------------------
// Feature CY: Subgraph Export
// ---------------------------------------------------------------------------

/**
 * Collect an N-hop subgraph around a starting node.
 * Returns the subset of nodes and edges within the hop radius.
 */
export function collectSubgraph(
  adj: Map<string, Set<string>>,
  startId: string,
  hops: number,
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeSet = bfsNeighborSet(adj, startId, hops);
  const subNodes = nodes.filter((n) => nodeSet.has(n.id));
  const subEdges = edges.filter(
    (e) => nodeSet.has(e.source) && nodeSet.has(e.target),
  );
  return { nodes: subNodes, edges: subEdges };
}

/**
 * Serialize a subgraph to a clean JSON string for export.
 */
export function exportSubgraphJSON(subgraph: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}): string {
  return JSON.stringify(
    {
      nodes: subgraph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        tags: n.tags,
        category: n.category,
      })),
      edges: subgraph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
      })),
    },
    null,
    2,
  );
}

/** Export full graph as JSON with coordinates and metadata */
export function exportFullGraphJSON(
  nodes: GraphNode[],
  edges: GraphEdge[],
): string {
  return JSON.stringify(
    {
      nodes: nodes.map((n) => ({
        id: n.id,
        label: n.label,
        x: Math.round(n.x * 10) / 10,
        y: Math.round(n.y * 10) / 10,
        tags: n.tags,
        category: n.category,
        filePath: n.filePath,
        isTag: n.isTag,
        meta: n.meta,
      })),
      edges: edges.map((e) => ({
        source: typeof e.source === "object" ? (e.source as any).id : e.source,
        target: typeof e.target === "object" ? (e.target as any).id : e.target,
        type: e.type,
        label: e.label,
      })),
      exportedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    null,
    2,
  );
}

/** Export graph as CSV (nodes + edges). Accessible format for data tools. */
export function exportGraphCSV(
  nodes: GraphNode[],
  edges: GraphEdge[],
): string {
  const lines: string[] = [];
  lines.push("# Nodes");
  lines.push("id,label,category,tags,x,y");
  for (const n of nodes) {
    const tags = (n.tags ?? []).join(";");
    const label = n.label.replace(/,/g, " ");
    lines.push(`${n.id},${label},${n.category ?? ""},${tags},${Math.round(n.x)},${Math.round(n.y)}`);
  }
  lines.push("");
  lines.push("# Edges");
  lines.push("source,target,type,label");
  for (const e of edges) {
    const src = typeof e.source === "object" ? (e.source as any).id : e.source;
    const tgt = typeof e.target === "object" ? (e.target as any).id : e.target;
    lines.push(`${src},${tgt},${e.type ?? "link"},${(e.label ?? "").replace(/,/g, " ")}`);
  }
  return lines.join("\n");
}

/** Export graph as Mermaid flowchart syntax (max 200 nodes, 500 edges). */
export function exportGraphMermaid(
  nodes: GraphNode[],
  edges: GraphEdge[],
): string {
  const lines: string[] = ["graph LR"];
  const nodeSlice = nodes.slice(0, 200);
  const nodeIds = new Set(nodeSlice.map(n => n.id));
  for (const n of nodeSlice) {
    const safe = n.label.replace(/["\[\]()]/g, "");
    const mid = n.id.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
    lines.push(`  ${mid}["${safe}"]`);
  }
  let ec = 0;
  for (const e of edges) {
    if (ec >= 500) break;
    const src = typeof e.source === "object" ? (e.source as any).id : e.source;
    const tgt = typeof e.target === "object" ? (e.target as any).id : e.target;
    if (!nodeIds.has(src) || !nodeIds.has(tgt)) continue;
    const srcM = src.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
    const tgtM = tgt.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
    const arrow = e.type === "inheritance" ? "-->|is-a|" : e.type === "aggregation" ? "-->|has-a|" : "-->";
    lines.push(`  ${srcM} ${arrow} ${tgtM}`);
    ec++;
  }
  return lines.join("\n");
}
