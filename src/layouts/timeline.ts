// ---------------------------------------------------------------------------
// Timeline DAG layout — positions nodes on a time axis with branching lanes
// ---------------------------------------------------------------------------
// Supports:
//   - User-specified frontmatter key for temporal ordering
//   - Fictional calendars (string-based lexicographic sort)
//   - Branching, backtracking, and parallel timelines via sequence edges
//   - Automatic lane assignment for parallel branches
// ---------------------------------------------------------------------------

import type { GraphData, GraphNode, GraphEdge } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineLayoutOptions {
  /** Frontmatter key that holds the time value (e.g. "date", "era", "turn") */
  timeKey: string;
  /** Custom sort function for time values. Defaults to lexicographic comparison. */
  timeComparator?: (a: string, b: string) => number;
  /** Horizontal spacing between time steps */
  stepWidth?: number;
  /** Vertical spacing between lanes (branches) */
  laneHeight?: number;
  /** Starting X position */
  startX?: number;
  /** Starting Y position */
  startY?: number;
  /** Accessor for node frontmatter values. In tests, override this. */
  getNodeProperty?: (nodeId: string, key: string) => string | undefined;
}

/** A node placed in the timeline with its assigned time slot and lane */
export interface TimelinePlacement {
  nodeId: string;
  timeValue: string;
  timeIndex: number;  // index in sorted unique time values
  lane: number;       // 0-based lane index for vertical positioning
}

/** Result of timeline layout computation */
export interface TimelineLayoutResult {
  data: GraphData;
  placements: TimelinePlacement[];
  lanes: number;           // total number of lanes used
  timeSteps: string[];     // sorted unique time values
}

// ---------------------------------------------------------------------------
// Default comparator — lexicographic string comparison
// ---------------------------------------------------------------------------

export function defaultTimeComparator(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// DAG construction from sequence edges
// ---------------------------------------------------------------------------

/**
 * Build a DAG from sequence edges. Returns adjacency list (source → targets).
 * Only considers nodes that have a time value.
 */
export function buildTimelineDAG(
  edges: GraphEdge[],
  nodesWithTime: Set<string>,
): Map<string, string[]> {
  const dag = new Map<string, string[]>();
  for (const id of nodesWithTime) {
    dag.set(id, []);
  }
  for (const e of edges) {
    if (e.type !== "sequence") continue;
    if (!nodesWithTime.has(e.source) || !nodesWithTime.has(e.target)) continue;
    dag.get(e.source)!.push(e.target);
  }
  return dag;
}

// ---------------------------------------------------------------------------
// Lane assignment — assigns parallel branches to separate vertical lanes
// ---------------------------------------------------------------------------

/**
 * Assign lanes to nodes for parallel branch visualization.
 *
 * Algorithm:
 * 1. Find root nodes (nodes with no incoming sequence edges among timed nodes)
 * 2. BFS/DFS from each root, assigning lanes
 * 3. When a node has multiple outgoing edges (fork), children get new lanes
 * 4. When a node has multiple incoming edges (merge), it stays on the primary lane
 */
export function assignLanes(
  dag: Map<string, string[]>,
  timeIndex: Map<string, number>,
): Map<string, number> {
  const laneMap = new Map<string, number>();
  const inDegree = new Map<string, number>();

  // Compute in-degree within the DAG
  for (const id of dag.keys()) {
    inDegree.set(id, 0);
  }
  for (const [, targets] of dag) {
    for (const t of targets) {
      inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
    }
  }

  // Find roots (in-degree 0)
  const roots: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) roots.push(id);
  }

  // Sort roots by time index so the earliest appears first
  roots.sort((a, b) => (timeIndex.get(a) ?? 0) - (timeIndex.get(b) ?? 0));

  // If no roots, all nodes form cycles — just put them all in lane 0
  if (roots.length === 0) {
    for (const id of dag.keys()) {
      laneMap.set(id, 0);
    }
    return laneMap;
  }

  let nextLane = 0;

  // BFS from each root
  for (const root of roots) {
    if (laneMap.has(root)) continue;
    const baseLane = nextLane;
    laneMap.set(root, baseLane);

    const queue: string[] = [root];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = dag.get(current) ?? [];

      // Sort children by time index
      const sorted = [...children].sort(
        (a, b) => (timeIndex.get(a) ?? 0) - (timeIndex.get(b) ?? 0)
      );

      for (let i = 0; i < sorted.length; i++) {
        const child = sorted[i];
        if (laneMap.has(child)) continue;

        if (i === 0) {
          // First child continues on same lane as parent
          laneMap.set(child, laneMap.get(current)!);
        } else {
          // Subsequent children (forks) get new lanes
          nextLane++;
          laneMap.set(child, nextLane);
        }
        queue.push(child);
      }
    }

    nextLane++;
  }

  return laneMap;
}

// ---------------------------------------------------------------------------
// Main layout function
// ---------------------------------------------------------------------------

/**
 * Apply timeline layout to a graph.
 * Nodes without a time value are placed at the bottom in a separate row.
 */
export function applyTimelineLayout(
  graph: GraphData,
  options: TimelineLayoutOptions,
): TimelineLayoutResult {
  const {
    timeKey,
    timeComparator = defaultTimeComparator,
    stepWidth = 120,
    laneHeight = 80,
    startX = 60,
    startY = 60,
    getNodeProperty,
  } = options;

  if (graph.nodes.length === 0) {
    return { data: { nodes: [], edges: graph.edges }, placements: [], lanes: 0, timeSteps: [] };
  }

  // 1. Extract time values from nodes
  const nodeTimeValues = new Map<string, string>();
  for (const n of graph.nodes) {
    const val = getNodeProperty?.(n.id, timeKey);
    if (val !== undefined && val !== "") {
      nodeTimeValues.set(n.id, String(val));
    }
  }

  // 2. Compute sorted unique time values
  const uniqueTimes = [...new Set(nodeTimeValues.values())];
  uniqueTimes.sort(timeComparator);
  const timeIndexMap = new Map<string, number>();
  uniqueTimes.forEach((t, i) => timeIndexMap.set(t, i));

  // Map node → time index
  const nodeTimeIndex = new Map<string, number>();
  for (const [nodeId, tv] of nodeTimeValues) {
    nodeTimeIndex.set(nodeId, timeIndexMap.get(tv)!);
  }

  // 3. Build DAG from sequence edges
  const timedNodeIds = new Set(nodeTimeValues.keys());
  const dag = buildTimelineDAG(graph.edges, timedNodeIds);

  // 4. Assign lanes
  const laneMap = assignLanes(dag, nodeTimeIndex);
  const totalLanes = laneMap.size > 0
    ? Math.max(...laneMap.values()) + 1
    : 1;

  // 5. Position timed nodes
  const placements: TimelinePlacement[] = [];
  const positioned = new Map<string, { x: number; y: number }>();

  for (const [nodeId, timeVal] of nodeTimeValues) {
    const ti = nodeTimeIndex.get(nodeId)!;
    const lane = laneMap.get(nodeId) ?? 0;
    const x = startX + ti * stepWidth;
    const y = startY + lane * laneHeight;
    positioned.set(nodeId, { x, y });
    placements.push({ nodeId, timeValue: timeVal, timeIndex: ti, lane });
  }

  // 6. Position non-timed nodes in a row below the timeline
  const untimedNodes = graph.nodes.filter(n => !nodeTimeValues.has(n.id));
  const untimedY = startY + totalLanes * laneHeight + laneHeight;
  untimedNodes.forEach((n, i) => {
    positioned.set(n.id, { x: startX + i * (stepWidth * 0.5), y: untimedY });
  });

  // 7. Apply positions to nodes
  const positionedNodes = graph.nodes.map(n => ({
    ...n,
    x: positioned.get(n.id)?.x ?? n.x,
    y: positioned.get(n.id)?.y ?? n.y,
  }));

  return {
    data: { nodes: positionedNodes, edges: graph.edges },
    placements,
    lanes: totalLanes,
    timeSteps: uniqueTimes,
  };
}
