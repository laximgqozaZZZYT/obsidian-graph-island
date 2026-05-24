import { GraphData, GraphEdge, GraphNode, NONE_BUCKET } from "./types";
import {
	type ClusterRankInfo,
	rankClustersByDegree,
	chooseFocusCluster,
	reorderBySharing,
	moveToFront,
	placeAnchorsConcentric,
	placeAnchorsFlow,
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
import { regionLayout } from "./region-layout";
import { placeNodesInRegions } from "./phase-g-place";
import { NONE_BUCKET_KEY } from "./zone-decomp";

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
	x: number;
	y: number;
	width: number;
	height: number;
	memberCount: number;
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
	// inheritFrom: child cluster key → parent cluster key. In the new
	// region-layout pipeline this drives the Phase E nesting penalty
	// (child is OUTER, parent is INNER — matching the legacy
	// expandClustersByInheritance behaviour).
	inheritFrom?: Record<string, string>;
	// Base sets whose members are aggregated into a 3-card stack. In the
	// new region-layout pipeline these become 3 virtual nodes in Phase A
	// so the cluster reserves the right amount of grid space.
	aggregatedSets?: Set<string>;
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
	// and cluster borders. Horizontal and vertical channels share the
	// same width — a previous version scaled channelH by cardH/cardW
	// which produced a vertical channel ~3× narrower than the horizontal
	// one (with the default 120×32 card), so row separations between
	// cards looked cramped against generous column gaps. Uniform channel
	// width keeps the visual breathing room symmetric.
	const channelW = Math.max(8, opts.nodeSpacing);
	const channelH = channelW;
	const slotW = cardW + channelW;
	const slotH = cardH + channelH;
	const gridX = slotW;
	const gridY = slotH;

	const degreeMap = computeDegreeMap(data.edges);

	// === Phase A-F: region layout ===
	// 集合・積集合ダイアグラム算法 (docs/region-layout-spec.md 参照)。
	// 1. ゾーン分解 + 件数集計 + Helly 強制ゾーン検出
	// 2. 目標面積 = Σ node_area / ρ
	// 3. 初期 seed (決定的 hash + force-directed)
	// 4. 交互最適化 (座標降下 + 1D projected gradient)
	// 5. 外側反復 (形状補正)
	const aggregatedSets = opts.aggregatedSets ?? new Set<string>();
	const region = regionLayout(data.nodes, sized, aggregatedSets, {
		cardW,
		cardH,
		gapPx: channelW,
		padPx: channelW * 2,
		emptyZoneTargetMode: "minimal",
		inheritFrom: opts.inheritFrom ?? {},
		minIntervalLen: Math.max(slotW, slotH),
	});

	// === Phase G: ノード配置 ===
	// 多重所属を intersection rect の中に行優先で詰め、排他を setRect 内で
	// spiral 探索でフリーセルへスナップ。
	const positionedNodes = placeNodesInRegions(region.zones, region.setRects, sized, {
		slotW,
		slotH,
		padPx: channelW,
		defaultCardW: cardW,
		defaultCardH: cardH,
	});

	// 既存ヘルパとの互換性のため idToRect / idToSize を構築。
	const idToRect = new Map<string, Rect>();
	const idToSize = new Map<string, SizedNode>();
	for (const n of positionedNodes) {
		idToRect.set(n.id, { x: n.x, y: n.y, w: n.width, h: n.height });
		const sz = sizedById.get(n.id);
		if (sz) idToSize.set(n.id, sz);
	}
	// nodeOffsets を適用 (ユーザー指定の per-node 微調整)。
	for (const n of positionedNodes) {
		const no = nodeOff[n.id];
		if (no) {
			n.x += no.dx;
			n.y += no.dy;
			const r = idToRect.get(n.id);
			if (r) {
				r.x = n.x;
				r.y = n.y;
			}
		}
	}

	// Phase G 後の最終調整: card 同士の重なりが残っていれば spiral で解消。
	snapCardsToGrid(positionedNodes, slotW, slotH, idToRect);

	// === Cluster bbox 構築 ===
	// 新算法ではクラスタ矩形 = region.setRects から直接取得 (= 目標面積から
	// 導出された矩形)。clusterOffsets を適用してから ClusterRect[] へ変換。
	const clusters: ClusterRect[] = [];
	for (const [key, r] of region.setRects) {
		if (key === NONE_BUCKET_KEY) continue; // NONE_BUCKET は表示しない
		const off = clusterOff[key] ?? { dx: 0, dy: 0 };
		let memberCount = 0;
		for (const z of region.zones) {
			if (z.memberships.includes(key)) memberCount += z.count;
		}
		clusters.push({
			groupKey: key,
			label: labels.get(key) ?? key,
			x: r.x + off.dx,
			y: r.y + off.dy,
			width: r.w,
			height: r.h,
			memberCount,
		});
	}
	// clusterOffsets が適用されたので、ノード座標も対応シフト。
	if (Object.keys(clusterOff).length > 0) {
		// 各ノードは「自身が属するゾーンを覆う集合矩形群」の交差に居る。
		// ノードを単純に1つの cluster の offset で動かすと多重所属で破綻するので、
		// 「最大件数のクラスタ」の offset を採用 (= cascade tie-break と同基準)。
		const baseSetCounts = new Map<string, number>();
		for (const z of region.zones) {
			for (const m of z.memberships) {
				baseSetCounts.set(m, (baseSetCounts.get(m) ?? 0) + z.count);
			}
		}
		for (const n of positionedNodes) {
			if (n.memberships.length === 0) continue;
			let best = n.memberships[0];
			let bestCount = baseSetCounts.get(best) ?? 0;
			for (const m of n.memberships) {
				const c = baseSetCounts.get(m) ?? 0;
				if (c > bestCount || (c === bestCount && m < best)) {
					best = m;
					bestCount = c;
				}
			}
			const off = clusterOff[best];
			if (off) {
				n.x += off.dx;
				n.y += off.dy;
				const r = idToRect.get(n.id);
				if (r) {
					r.x = n.x;
					r.y = n.y;
				}
			}
		}
	}

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
