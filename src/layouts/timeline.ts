// ---------------------------------------------------------------------------
// Timeline layout — positions nodes on a time axis with hierarchical lanes
// ---------------------------------------------------------------------------
// Uses:
//   - Frontmatter time key (start-date, story_order, etc.) for X position
//   - parent_id for hierarchical lane grouping (parent → children in adjacent lanes)
//   - Tags for secondary grouping when parent_id is absent
//   - Folder path for work-level grouping (e.g. classic-hamlet, mythology-norse)
// ---------------------------------------------------------------------------

import type { GraphData, GraphNode, GraphEdge } from "../types";
import { EDGE_TYPE_SEQUENCE } from "../constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_STEP_WIDTH = 120;
const DEFAULT_LANE_HEIGHT = 28;
const DEFAULT_START_X = 60;
const DEFAULT_START_Y = 60;
const DEFAULT_STACK_SPACING = 20;
const MAX_DESIRED_COLS = 40;
const MIN_STEP_WIDTH = 1;
const UNTIMED_NODE_SPACING_FACTOR = 0.6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineLayoutOptions {
	timeKey: string;
	timeComparator?: (a: string, b: string) => number;
	stepWidth?: number;
	laneHeight?: number;
	startX?: number;
	startY?: number;
	getNodeProperty?: (nodeId: string, key: string) => string | undefined;
	stackSpacing?: number;
}

export interface TimelinePlacement {
	nodeId: string;
	timeValue: string;
	timeIndex: number;
	lane: number;
}

interface TimelineLayoutResult {
	data: GraphData;
	placements: TimelinePlacement[];
	lanes: number;
	timeSteps: string[];
}

// ---------------------------------------------------------------------------
// Comparators
// ---------------------------------------------------------------------------

export function defaultTimeComparator(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// DAG construction (kept for API compat)
// ---------------------------------------------------------------------------

export function buildTimelineDAG(edges: GraphEdge[], nodesWithTime: Set<string>): Map<string, string[]> {
	const dag = new Map<string, string[]>();
	for (const id of nodesWithTime) dag.set(id, []);
	for (const e of edges) {
		if (e.type !== EDGE_TYPE_SEQUENCE) continue;
		if (!nodesWithTime.has(e.source) || !nodesWithTime.has(e.target)) continue;
		dag.get(e.source)!.push(e.target);
	}
	return dag;
}

// ---------------------------------------------------------------------------
// Legacy assignLanes (kept for test compat)
// ---------------------------------------------------------------------------

export function assignLanes(dag: Map<string, string[]>, timeIndex: Map<string, number>): Map<string, number> {
	const laneMap = new Map<string, number>();
	const inDegree = new Map<string, number>();
	for (const id of dag.keys()) inDegree.set(id, 0);
	for (const [, targets] of dag) {
		for (const t of targets) inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
	}
	const roots: string[] = [];
	for (const [id, deg] of inDegree) {
		if (deg === 0) roots.push(id);
	}
	roots.sort((a, b) => (timeIndex.get(a) ?? 0) - (timeIndex.get(b) ?? 0));
	if (roots.length === 0) {
		for (const id of dag.keys()) laneMap.set(id, 0);
		return laneMap;
	}
	let nextLane = 0;
	for (const root of roots) {
		if (laneMap.has(root)) continue;
		laneMap.set(root, nextLane);
		const queue: string[] = [root];
		while (queue.length > 0) {
			const current = queue.shift()!;
			const sorted = [...(dag.get(current) ?? [])].sort(
				(a, b) => (timeIndex.get(a) ?? 0) - (timeIndex.get(b) ?? 0),
			);
			for (let i = 0; i < sorted.length; i++) {
				const child = sorted[i];
				if (laneMap.has(child)) continue;
				laneMap.set(child, i === 0 ? laneMap.get(current)! : ++nextLane);
				queue.push(child);
			}
		}
		nextLane++;
	}
	return laneMap;
}

// ---------------------------------------------------------------------------
// Hierarchical lane assignment using parent_id + work grouping
// ---------------------------------------------------------------------------

/**
 * Assign lanes based on:
 * 1. Work group (folder: classic-hamlet, mythology-norse, etc.)
 * 2. Parent hierarchy (parent_id → children grouped under parent)
 * 3. Story order within parent
 *
 * Structure: each work gets a block of lanes. Within a work:
 *   - parent nodes get their own lane
 *   - children of the same parent share adjacent lanes, sorted by story_order
 */
function assignHierarchicalLanes(
	nodes: GraphNode[],
	timedNodeIds: Set<string>,
	getNodeProp: (id: string, key: string) => string | undefined,
): Map<string, number> {
	const laneMap = new Map<string, number>();
	const timedNodes = nodes.filter((n) => timedNodeIds.has(n.id));

	// 1. Derive work group from folder path
	function workGroup(n: GraphNode): string {
		const fp = (n as any).filePath || n.id;
		const segs = fp.split("/").filter((s: string) => s.length > 0);
		// Find the "work" folder: skip root vault folder (e.g. "開発"), use next
		for (const seg of segs) {
			if (
				seg.startsWith("classic-") ||
				seg.startsWith("mythology-") ||
				seg.startsWith("bible-") ||
				seg.includes("-")
			) {
				return seg;
			}
		}
		return segs.length >= 2 ? segs[segs.length - 2] : (segs[0] ?? "other");
	}

	// 2. Get parent_id for each node
	const parentMap = new Map<string, string>(); // nodeId → parentId
	const childrenMap = new Map<string, string[]>(); // parentId → [childIds]
	const orderMap = new Map<string, number>(); // nodeId → story_order

	for (const n of timedNodes) {
		const parentId = getNodeProp(n.id, "parent_id");
		const order = getNodeProp(n.id, "story_order");
		if (parentId) {
			parentMap.set(n.id, parentId);
			if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
			childrenMap.get(parentId)!.push(n.id);
		}
		if (order) orderMap.set(n.id, parseFloat(order) || 0);
	}

	// Sort children by story_order
	for (const [, children] of childrenMap) {
		children.sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
	}

	// 3. Group by work
	const workGroups = new Map<string, GraphNode[]>();
	for (const n of timedNodes) {
		const w = workGroup(n);
		if (!workGroups.has(w)) workGroups.set(w, []);
		workGroups.get(w)!.push(n);
	}

	// Sort works for deterministic layout
	const sortedWorks = [...workGroups.keys()].sort();

	// 4. Assign lanes: all nodes in same work share one lane
	//    Post-process in GVC resolves Y overlaps by shifting down
	let nextLane = 0;
	for (const work of sortedWorks) {
		const workNodes = workGroups.get(work)!;
		for (const n of workNodes) {
			laneMap.set(n.id, nextLane);
		}
		nextLane++;
	}

	return laneMap;
}

/** Extract short node name from ID for parent_id matching */
function extractNodeName(nodeId: string, nodes: GraphNode[]): string {
	const n = nodes.find((n) => n.id === nodeId);
	const fp = (n as any)?.filePath || nodeId;
	const filename = fp.split("/").pop()?.replace(".md", "") ?? nodeId;
	return filename;
}

// ---------------------------------------------------------------------------
// Main layout function
// ---------------------------------------------------------------------------

export function applyTimelineLayout(graph: GraphData, options: TimelineLayoutOptions): TimelineLayoutResult {
	const {
		timeKey,
		timeComparator = defaultTimeComparator,
		stepWidth = DEFAULT_STEP_WIDTH,
		laneHeight = DEFAULT_LANE_HEIGHT,
		startX = DEFAULT_START_X,
		startY = DEFAULT_START_Y,
		stackSpacing = DEFAULT_STACK_SPACING,
		getNodeProperty,
	} = options;

	if (graph.nodes.length === 0) {
		return { data: { nodes: [], edges: graph.edges }, placements: [], lanes: 0, timeSteps: [] };
	}

	// 1. Extract time values
	const nodeTimeValues = new Map<string, string>();
	for (const n of graph.nodes) {
		const val = getNodeProperty?.(n.id, timeKey);
		if (val !== undefined && val !== "") {
			nodeTimeValues.set(n.id, String(val));
		}
	}

	// 2. Sorted unique time values + step width
	const uniqueTimes = [...new Set(nodeTimeValues.values())];
	const effectiveStepWidth =
		uniqueTimes.length > MAX_DESIRED_COLS
			? Math.max(MIN_STEP_WIDTH, Math.round((MAX_DESIRED_COLS * stepWidth) / uniqueTimes.length))
			: stepWidth;
	uniqueTimes.sort(timeComparator);
	const timeIndexMap = new Map<string, number>();
	uniqueTimes.forEach((t, i) => timeIndexMap.set(t, i));

	const nodeTimeIndex = new Map<string, number>();
	for (const [nodeId, tv] of nodeTimeValues) {
		const idx = timeIndexMap.get(tv);
		if (idx !== undefined) nodeTimeIndex.set(nodeId, idx);
	}

	// 3. Assign lanes — priority: hierarchical (parent_id) > sequence DAG > fallback
	const timedNodeIds = new Set(nodeTimeValues.keys());
	let laneMap: Map<string, number>;

	// Check if parent_id data exists
	let hasParentIds = false;
	if (getNodeProperty) {
		for (const id of timedNodeIds) {
			if (getNodeProperty(id, "parent_id")) {
				hasParentIds = true;
				break;
			}
		}
	}

	if (hasParentIds && getNodeProperty) {
		// Use parent_id hierarchy for lane grouping
		laneMap = assignHierarchicalLanes(graph.nodes, timedNodeIds, getNodeProperty);
	} else {
		// Fallback: sequence DAG or folder-based
		const dag = buildTimelineDAG(graph.edges, timedNodeIds);
		let hasSeq = false;
		for (const [, t] of dag) {
			if (t.length > 0) {
				hasSeq = true;
				break;
			}
		}
		laneMap = hasSeq ? assignLanes(dag, nodeTimeIndex) : assignFallbackLanes(graph.nodes, timedNodeIds);
	}
	const totalLanes = laneMap.size > 0 ? Math.max(...laneMap.values()) + 1 : 1;

	// 4. Position timed nodes
	const placements: TimelinePlacement[] = [];
	const positioned = new Map<string, { x: number; y: number }>();
	const cellCount = new Map<string, number>();

	for (const [nodeId, timeVal] of nodeTimeValues) {
		const ti = nodeTimeIndex.get(nodeId)!;
		const lane = laneMap.get(nodeId) ?? 0;
		const cellKey = `${ti}:${lane}`;
		const stackIdx = cellCount.get(cellKey) ?? 0;
		cellCount.set(cellKey, stackIdx + 1);

		const x = startX + ti * effectiveStepWidth;
		const y = startY + lane * laneHeight + stackIdx * stackSpacing;
		positioned.set(nodeId, { x, y });
		placements.push({ nodeId, timeValue: timeVal, timeIndex: ti, lane });
	}

	// 5. Untimed nodes
	const untimedNodes = graph.nodes.filter((n) => !nodeTimeValues.has(n.id));
	if (nodeTimeValues.size === 0 && untimedNodes.length > 0) {
		const sorted = [...untimedNodes].sort((a, b) => (a.filePath || a.id).localeCompare(b.filePath || b.id));
		const cols = Math.ceil(Math.sqrt(sorted.length));
		sorted.forEach((n, i) => {
			positioned.set(n.id, {
				x: startX + (i % cols) * effectiveStepWidth,
				y: startY + Math.floor(i / cols) * laneHeight,
			});
		});
	} else if (untimedNodes.length > 0) {
		const untimedX = startX + uniqueTimes.length * effectiveStepWidth + effectiveStepWidth;
		const cols = Math.max(1, Math.ceil(Math.sqrt(untimedNodes.length)));
		untimedNodes.forEach((n, i) => {
			positioned.set(n.id, {
				x: untimedX + (i % cols) * (effectiveStepWidth * UNTIMED_NODE_SPACING_FACTOR),
				y: startY + Math.floor(i / cols) * laneHeight,
			});
		});
	}

	// 6. Apply positions
	const positionedNodes = graph.nodes.map((n) => ({
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

// ---------------------------------------------------------------------------
// Fallback lane assignment (no parent_id, no sequence edges)
// ---------------------------------------------------------------------------

function assignFallbackLanes(nodes: GraphNode[], timedNodeIds: Set<string>): Map<string, number> {
	const laneMap = new Map<string, number>();
	const groupLanes = new Map<string, number>();
	let nextLane = 0;
	const timedNodes = nodes.filter((n) => timedNodeIds.has(n.id));

	function groupKey(n: GraphNode): string {
		const fp = (n as any).filePath || n.id;
		const segs = fp.split("/").filter((s: string) => s.length > 0);
		if (segs.length >= 3) return segs[segs.length - 3];
		if (segs.length >= 2) return segs[0];
		if (n.category) return n.category;
		return "other";
	}

	const groups = [...new Set(timedNodes.map((n) => groupKey(n)))].sort();
	for (const g of groups) groupLanes.set(g, nextLane++);
	for (const n of timedNodes) laneMap.set(n.id, groupLanes.get(groupKey(n)) ?? 0);
	return laneMap;
}
