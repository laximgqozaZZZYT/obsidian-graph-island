import { GraphData, GraphEdge, GraphNode, NONE_BUCKET } from "./types";
import {
	type ClusterRankInfo,
	rankClustersByDegree,
	chooseFocusCluster,
	reorderBySharing,
	moveToFront,
	placeAnchorsConcentric,
	placeAnchorsFlow,
	computeClusterSharingCounts,
	tightenAnchors,
} from "./anchor-placement";
import {
	LaneRegistry,
	aggregateEdges,
	routeZ,
	type AggregatedEdge,
	type RouteObstacle,
	type RouteRect,
} from "./edge-routing";
import {
	type SubGroup,
	groupByMembershipSet,
	fallbackSize,
	shelfPack,
} from "./subgroup-packing";
import {
	buildInitialSubPositions,
	relaxSubgroups,
	compactToLargestCluster,
	snapSubgroupsToGrid,
} from "./subgroup-relax";
import { snapCardsToGrid } from "./cell-snap";
import {
	computeClusterBBoxes,
	clampClustersToB2,
} from "./cluster-bbox";

export interface SizedNode extends GraphNode {
	width: number;
	height: number;
}

export interface PositionedNode {
	id: string;
	label: string;
	memberships: string[];
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PositionedEdge {
	source: string;
	target: string;
	weight: number;
	path: { x: number; y: number }[];
	// True when this edge represents many individual file-to-file links bundled
	// into a single line between two clusters. The renderer uses this to draw
	// bundled edges with a heavier, brighter stroke than ordinary 1:1 edges.
	bundled: boolean;
	// For bundled edges, the number of underlying file pairs aggregated.
	bundleCount: number;
}

export interface ClusterRect {
	groupKey: string;
	label: string;
	// AABB of the cluster's owned-cell region. Used for label / hit-test
	// fallback. The renderer prefers `outline` when present.
	x: number;
	y: number;
	width: number;
	height: number;
	memberCount: number;
	// Outer boundary segments of the cluster's carved AABB polygon
	// (= AABB with foreign-only cells removed from the boundary).
	outline?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
	// Cell-aligned fill rectangles inside the cluster's polygon
	// (= one entry per cell that survived carving). The renderer
	// fills each with the cluster's hue at low opacity so the
	// enclosure is a tinted region that overlaps neighbours
	// without obscuring them.
	cells?: Array<{ x: number; y: number; w: number; h: number }>;
}

// Trunks have been retired — every wire is a thin single line routed via
// the channel lattice. The TrunkLine interface and the laid.trunks array
// stay (empty / unused) only to keep the rendered code paths in view.ts
// from blowing up while the refactor settles; callers should not depend
// on them.
export interface TrunkLine {
	srcCluster: string;
	tgtCluster: string;
	count: number;
	path: { x: number; y: number }[];
}

export interface LaidOut {
	nodes: PositionedNode[];
	edges: PositionedEdge[];
	clusters: ClusterRect[];
	trunks: TrunkLine[]; // always empty — see note above
	// Slot pitch = card area + channel. Exposed so the view can render the
	// grid, headers, pan clamp and aggregation snap on the same lattice the
	// layout uses internally.
	slotW: number;
	slotH: number;
	channelW: number;
	channelH: number;
}

export interface LayoutOptions {
	clusterSpacing: number;
	nodeSpacing: number;
	// Canonical card dimensions for the W × H lattice. Individual cards in
	// `sized` may be larger or smaller (when nodeSizeMode varies size by
	// degree), but the cell pitch always derives from these base values so
	// the grid stays uniform.
	cellW: number;
	cellH: number;
	clusterOffsets?: Record<string, { dx: number; dy: number }>;
	nodeOffsets?: Record<string, { dx: number; dy: number }>;
	clusterLabels?: Map<string, string>;
	// "concentric" places the focus cluster at origin and fills expanding
	// square rings outward. "flow" places focus top-left and fills columns
	// rightward (main flow direction = toward the focus). Default: concentric.
	anchorPlacement?: "concentric" | "flow";
}

// Local alias so existing internal references continue to compile —
// RouteRect lives in edge-routing.ts so both modules can share the
// shape without a circular import.
type Rect = RouteRect;

// Euler-diagram-style layout:
//  1. Place every distinct cluster on an anchor grid.
//  2. Group nodes by their exact membership set; each sub-group's position is
//     the centroid of its clusters' anchors.
//  3. Cluster rectangles are computed as the bbox of member nodes — clusters
//     whose memberships overlap end up with overlapping rectangles, and
//     multi-tag files land in the overlap regions.
export function layout(data: GraphData, sized: SizedNode[], opts: LayoutOptions): LaidOut {
	const sizedById = new Map<string, SizedNode>();
	for (const s of sized) sizedById.set(s.id, s);
	const labels = opts.clusterLabels ?? new Map<string, string>();
	const clusterOff = opts.clusterOffsets ?? {};
	const nodeOff = opts.nodeOffsets ?? {};

	const clusterKeys = collectClusterKeys(data.nodes, labels);
	const subgroups = groupByMembershipSet(data.nodes);

	// Per-cluster member count (sum of nodes in every sub-group that
	// contains this cluster). Used downstream by compactToLargestCluster
	// to pull multi-tag sub-groups toward their largest member cluster's
	// anchor (Bug #1 / Bug #3 mitigation).
	const clusterSizes = new Map<string, number>();
	for (const sg of subgroups) {
		for (const m of sg.memberships) {
			clusterSizes.set(m, (clusterSizes.get(m) ?? 0) + sg.nodes.length);
		}
	}

	// Cell pitch comes from opts.cellW / opts.cellH (set by the view from
	// the user-configured base node size). Individual sized[] entries may
	// be larger or smaller, but the slot lattice stays uniform.
	const cardW = opts.cellW > 0 ? opts.cellW : sized[0]?.width ?? 80;
	const cardH = opts.cellH > 0 ? opts.cellH : sized[0]?.height ?? 24;
	// Channels (隘路): narrow gaps between slots reserved for wires, trunks
	// and cluster borders. Horizontal and vertical channels share the same
	// width — uniform breathing room (was asymmetric, vertical ~3× narrower).
	// Channel (隘路) width: floor doubled (8 → 24) so the cluster fills
	// have visible breathing room between cells and the enclosure
	// boundary reads more clearly. Multiplier 1.5× lifts user-set
	// `nodeSpacing` further.
	const channelW = Math.max(24, Math.floor(opts.nodeSpacing * 1.5));
	const channelH = channelW;
	const slotW = cardW + channelW;
	const slotH = cardH + channelH;
	const gridX = slotW;
	const gridY = slotH;

	// Every sub-group — single- or multi-membership, big or small — is laid
	// out as an m × n shelf (gymnasium style). The legacy sunflower /
	// radialPack option produced non-grid positions that ended up scattered
	// after the cell snap, especially for multi-membership sub-groups.
	const degreeMap = computeDegreeMap(data.edges);

	interface PackedSubgroup {
		memberships: string[];
		nodes: GraphNode[];
		positions: { x: number; y: number }[]; // relative to centroid (already centered)
		width: number;
		height: number;
		strategy: "gymnasium";
	}
	const packed: PackedSubgroup[] = subgroups.map((sg) => {
		const sizes = sg.nodes.map((n) => sizedById.get(n.id) ?? fallbackSize(n));
		const pp = shelfPack(sizes, opts.nodeSpacing);
		const positions = pp.positions.map((p) => ({
			x: p.x - pp.width / 2,
			y: p.y - pp.height / 2,
		}));
		return {
			memberships: sg.memberships,
			nodes: sg.nodes,
			positions,
			width: pp.width,
			height: pp.height,
			strategy: "gymnasium",
		};
	});

	const maxSubW = packed.reduce((m, p) => Math.max(m, p.width), 0);
	const maxSubH = packed.reduce((m, p) => Math.max(m, p.height), 0);
	const strideX = maxSubW + Math.floor(opts.clusterSpacing / 2);
	const strideY = maxSubH + Math.floor(opts.clusterSpacing / 2);

	// Phase 1: rank clusters by aggregate degree, pick a focus cluster
	// containing the global max-degree node, and place anchors per the chosen
	// strategy. NONE_BUCKET still sits on its own dedicated row to avoid
	// engulfment by other clusters' multi-membership bboxes. (degreeMap was
	// computed earlier for sub-group strategy dispatch — reuse.)
	const clusterRanks = rankClustersByDegree(clusterKeys, data.nodes, degreeMap);
	const focusKey = chooseFocusCluster(data.nodes, degreeMap, clusterRanks);
	if (focusKey) moveToFront(clusterRanks, focusKey);
	// Sharing-aware ordering: reorder ranks so that clusters sharing many
	// members are placed at ADJACENT lattice positions. With the default
	// degree-based ordering, two groups that share most of their members
	// (e.g. scene & talk) could end up on opposite sides of the lattice,
	// putting any multi-tag sub-group {scene, talk} at the centroid (=
	// middle of the lattice). That midpoint position would stretch BOTH
	// scene's and talk's enclosures across the gap. Walking the ranks
	// greedily by "most-shared with anything already placed" packs related
	// groups next to each other, so the multi-tag centroid sits between
	// adjacent anchors — short distance, tight enclosures.
	reorderBySharing(clusterRanks, data.nodes);

	const mainRanks = clusterRanks.filter((r) => r.groupKey !== NONE_BUCKET);
	const hasNone = mainRanks.length !== clusterRanks.length;
	const anchors = new Map<string, { x: number; y: number }>();
	const placement = opts.anchorPlacement ?? "concentric";
	if (placement === "concentric") {
		placeAnchorsConcentric(anchors, mainRanks, strideX, strideY);
	} else {
		placeAnchorsFlow(anchors, mainRanks, strideX, strideY);
	}
	if (hasNone) {
		// Place NONE far away from any other anchor (below all of them).
		let maxY = 0;
		for (const a of anchors.values()) if (a.y > maxY) maxY = a.y;
		anchors.set(NONE_BUCKET, { x: 0, y: maxY + strideY * 2 });
	}

	// Phase 1b: global compactness — pull anchors toward the layout
	// centroid + toward their sharing partners, while a hard-shell
	// repulsion keeps non-overlapping pairs at least `strideX × strideY`
	// apart. Addresses the "exclusive clusters sit far from the shared
	// core" complaint by compacting the outer-ring anchors.
	const sharingCounts = computeClusterSharingCounts(data.nodes);
	tightenAnchors(anchors, sharingCounts, strideX, strideY, 25);

	const positionedNodes: PositionedNode[] = [];
	const idToRect = new Map<string, Rect>();
	const idToSize = new Map<string, SizedNode>();

	// Phase 2: build sub-group centres from cluster-anchor centroids,
	// then relax overlaps. Smaller relax gap (= nodeSpacing/4) keeps
	// sub-groups in the same group touching after collision resolution
	// so the parent enclosure stays tight.
	const subPositions = buildInitialSubPositions(packed, anchors, clusterOff);
	const RELAX_GAP = Math.max(2, Math.floor(opts.nodeSpacing / 4));
	relaxSubgroups(subPositions, RELAX_GAP, 80);
	// Phase 2b: compactness pass — pull each multi-tag sub-group back
	// toward its LARGEST cluster's anchor by 40%.
	compactToLargestCluster(subPositions, anchors, clusterSizes, 0.4);
	// Phase 3: snap sub-group centres to the global grid after relaxation.
	snapSubgroupsToGrid(subPositions, gridX, gridY);

	for (let pi = 0; pi < packed.length; pi++) {
		const p = packed[pi];
		const sp = subPositions[pi];
		const cx = sp.cx;
		const cy = sp.cy;

		p.nodes.forEach((n, i) => {
			const sz = sizedById.get(n.id) ?? fallbackSize(n);
			// p.positions[i] is the card CENTER, already centered around the
			// sub-group centroid. Do not add sz.width/2 here — that was a bug
			// that pushed every card half a card-size to the right/down and
			// distorted every cluster bbox.
			const rel = p.positions[i];
			const no = nodeOff[n.id] ?? { dx: 0, dy: 0 };
			const x = cx + rel.x + no.dx;
			const y = cy + rel.y + no.dy;
			positionedNodes.push({
				id: n.id,
				label: n.label,
				memberships: n.memberships,
				x,
				y,
				width: sz.width,
				height: sz.height,
			});
			idToRect.set(n.id, { x, y, w: sz.width, h: sz.height });
			idToSize.set(n.id, sz);
		});
	}

	// Phase 3.5: snap each card to a free grid cell, reserving its full
	// multi-cell footprint so neighbours can't overlap it.
	snapCardsToGrid(positionedNodes, slotW, slotH, idToRect);

	// Phase 4: compute one bbox per cluster + clamp every left/top to the
	// B2 channel so enclosures don't bleed into the reserved column A /
	// row 1 header strip.
	const { clusters } = computeClusterBBoxes(positionedNodes, {
		clusterKeys,
		labels,
		slotW,
		slotH,
		channelW,
		channelH,
		clusterSpacing: opts.clusterSpacing,
	});
	clampClustersToB2(clusters, positionedNodes, slotW, slotH);

	// Edge bundling: group inter-cluster edges by (srcCluster, tgtCluster). If
	// a pair has multiple file-to-file links, draw ONE bundled line between the
	// two cluster boundaries instead of N parallel card-to-card lines. Intra
	// cluster and singleton inter-cluster edges stay as 1:1.
	const nodeToCluster = new Map<string, string>();
	for (const n of positionedNodes) {
		nodeToCluster.set(n.id, n.memberships[0] ?? "");
	}
	const clusterByKey = new Map<string, ClusterRect>();
	for (const c of clusters) clusterByKey.set(c.groupKey, c);

	// Build per-card footprint rectangles used by routeZ to avoid steering
	// the middle horizontal lane through a multi-cell card that happens to
	// straddle the chosen row boundary.
	const routeObstacles: RouteObstacle[] = [];
	for (const n of positionedNodes) {
		const cs = Math.max(1, Math.ceil(n.width / slotW));
		const rs = Math.max(1, Math.ceil(n.height / slotH));
		const sc = Math.round(n.x / slotW - cs / 2);
		const sr = Math.round(n.y / slotH - rs / 2);
		routeObstacles.push({
			id: n.id,
			startCol: sc,
			endCol: sc + cs - 1,
			startRow: sr,
			endRow: sr + rs - 1,
		});
	}

	const aggregated = aggregateEdges(data.edges, idToRect);
	interface PairGroup {
		intra: boolean;
		items: AggregatedEdge[];
	}
	const pairGroups = new Map<string, PairGroup>();
	for (const e of aggregated) {
		const ca = nodeToCluster.get(e.source) ?? "";
		const cb = nodeToCluster.get(e.target) ?? "";
		let key: string;
		let intra: boolean;
		if (ca === cb && ca !== "") {
			key = `intra:${e.source}:${e.target}`;
			intra = true;
		} else {
			const [a, b] = ca < cb ? [ca, cb] : [cb, ca];
			key = `inter:${a}:${b}`;
			intra = false;
		}
		const pg = pairGroups.get(key);
		if (pg) pg.items.push(e);
		else pairGroups.set(key, { intra, items: [e] });
	}

	const edges: PositionedEdge[] = [];
	const trunks: TrunkLine[] = []; // retired — kept as an empty stub
	// Phase 4: lane registry shared across all intra-cluster + fallback
	// L-routes so edges in the same horizontal gutter spread apart.
	const lanes = new LaneRegistry();
	// Cluster overlap detection: A and B overlap iff some node has BOTH in
	// its memberships. When clusters overlap, the shared members are
	// themselves the visual connection — adding a trunk / cable on top is
	// redundant noise, so we suppress inter-cluster wiring between any
	// overlapping pair.
	const overlappingPairs = new Set<string>();
	const overlapKey = (a: string, b: string): string =>
		a < b ? `${a}|${b}` : `${b}|${a}`;
	for (const n of positionedNodes) {
		const mems = n.memberships;
		if (mems.length < 2) continue;
		for (let i = 0; i < mems.length; i++) {
			for (let j = i + 1; j < mems.length; j++) {
				overlappingPairs.add(overlapKey(mems[i], mems[j]));
			}
		}
	}
	const clustersOverlap = (a: string, b: string): boolean =>
		a !== "" && b !== "" && overlappingPairs.has(overlapKey(a, b));
	for (const pg of pairGroups.values()) {
		// Intra-cluster edges use a Z-route via a lane line between the two
		// cards' rows. The path is entirely inside one cluster, so crossing
		// borders is not a concern; lane separation keeps parallel edges
		// readable as distinct wires.
		if (pg.intra) {
			for (const e of pg.items) {
				const a = idToRect.get(e.source)!;
				const b = idToRect.get(e.target)!;
				edges.push({
					source: e.source,
					target: e.target,
					weight: e.weight,
					path: routeZ(
						a,
						b,
						lanes,
						slotW,
						slotH,
						channelW,
						channelH,
						routeObstacles,
						e.source,
						e.target,
					),
					bundled: false,
					bundleCount: 1,
				});
			}
			continue;
		}
		// Inter-cluster: route via cluster boundary midpoints regardless of how
		// many underlying edges there are. This keeps every inter-cluster
		// connection perpendicular to the cluster borders instead of running
		// diagonally across them. The TRUNK overlay is only emitted when the
		// pair carries 2+ links AND both sides have more than one card — that
		// preserves the bundled vs single-line visual distinction.
		const repE = pg.items[0];
		const caKey = nodeToCluster.get(repE.source) ?? "";
		const cbKey = nodeToCluster.get(repE.target) ?? "";
		// Suppress wiring entirely when the two clusters already share at
		// least one member — the overlap region is the connection. Both
		// trunks and per-edge cables drop here.
		if (clustersOverlap(caKey, cbKey)) continue;
		const ra = clusterByKey.get(caKey);
		const rb = clusterByKey.get(cbKey);
		// Inter-cluster edges route the same way as intra: a single Z-route
		// through the channel lattice. Trunks and bundled cables have been
		// retired — every wire is just a thin single line.
		void ra;
		void rb;
		for (const e of pg.items) {
			const a = idToRect.get(e.source)!;
			const b = idToRect.get(e.target)!;
			edges.push({
				source: e.source,
				target: e.target,
				weight: e.weight,
				path: routeZ(
					a,
					b,
					lanes,
					slotW,
					slotH,
					channelW,
					channelH,
					routeObstacles,
					e.source,
					e.target,
				),
				bundled: false,
				bundleCount: 1,
			});
		}
	}

	return {
		nodes: positionedNodes,
		edges,
		clusters,
		trunks,
		slotW,
		slotH,
		channelW,
		channelH,
	};
}

// Re-export sub-group helpers used by callers that go via layout.ts.
export type { SubGroup } from "./subgroup-packing";

function collectClusterKeys(
	nodes: GraphNode[],
	labels: Map<string, string>,
): string[] {
	const set = new Set<string>();
	for (const n of nodes) for (const m of n.memberships) set.add(m);
	return [...set].sort((a, b) => {
		// NONE_BUCKET sinks to the end.
		if (a === NONE_BUCKET && b !== NONE_BUCKET) return 1;
		if (b === NONE_BUCKET && a !== NONE_BUCKET) return -1;
		const la = labels.get(a) ?? a;
		const lb = labels.get(b) ?? b;
		const cmp = la.localeCompare(lb);
		return cmp !== 0 ? cmp : a.localeCompare(b);
	});
}




// Compute per-node degree (= number of incident edges).
function computeDegreeMap(edges: GraphEdge[]): Map<string, number> {
	const m = new Map<string, number>();
	for (const e of edges) {
		m.set(e.source, (m.get(e.source) ?? 0) + 1);
		m.set(e.target, (m.get(e.target) ?? 0) + 1);
	}
	return m;
}
