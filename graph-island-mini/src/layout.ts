import { GraphData, GraphEdge, GraphNode, NONE_BUCKET } from "./types";
import {
	type ClusterRankInfo,
	rankClustersByDegree,
	chooseFocusCluster,
	reorderBySharing,
	moveToFront,
	placeAnchorsConcentric,
	placeAnchorsFlow,
	subgroupHashOffset,
	centroidOf,
} from "./anchor-placement";
import {
	LaneRegistry,
	aggregateEdges,
	routeZ,
	type AggregatedEdge,
	type RouteObstacle,
	type RouteRect,
} from "./edge-routing";

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

	// Cell pitch comes from opts.cellW / opts.cellH (set by the view from
	// the user-configured base node size). Individual sized[] entries may
	// be larger or smaller, but the slot lattice stays uniform.
	const cardW = opts.cellW > 0 ? opts.cellW : sized[0]?.width ?? 80;
	const cardH = opts.cellH > 0 ? opts.cellH : sized[0]?.height ?? 24;
	// Channels (隘路): narrow gaps between slots reserved for wires, trunks
	// and cluster borders. channelH is derived from channelW so the slot
	// aspect ratio EQUALS the card aspect ratio — that way a card scaled
	// to span N × N slots keeps the same w / h ratio as a 1 × 1 card.
	const channelW = Math.max(8, opts.nodeSpacing);
	const channelH = Math.max(1, (channelW * cardH) / cardW);
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

	// Anchor stride: keep anchors as close as possible — just enough that a
	// sub-group placed at one anchor doesn't immediately collide with one
	// placed at the neighbouring anchor. Multi-membership sub-groups land
	// at the centroid of multiple anchors; with the OLD stride (= maxSub +
	// 5 × clusterSpacing) those centroids sat far enough from each
	// individual anchor that the cluster bbox engulfed huge swaths of
	// empty space. With stride = maxSub + clusterSpacing the centroids
	// land within roughly maxSub/2 of each anchor — tight enough that
	// cluster bboxes stay packed.
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

	const positionedNodes: PositionedNode[] = [];
	const idToRect = new Map<string, Rect>();
	const idToSize = new Map<string, SizedNode>();

	// 1) Compute initial sub-group centres from the centroid of their cluster
	//    anchors. Multi-membership sub-groups get a tiny hash perturbation so
	//    coincident centroids have a defined push direction during relaxation.
	// 2) Iterate a collision-resolution loop: for every pair of overlapping
	//    sub-group bboxes, push them apart along the shorter overlap axis.
	//    Single-membership sub-groups are "anchored" with higher pin weight so
	//    they barely drift; multi-membership ones absorb most of the
	//    displacement.
	interface SubPos {
		cx: number;
		cy: number;
		halfW: number;
		halfH: number;
		pin: number; // higher = harder to move
	}
	const subPositions: SubPos[] = packed.map((p) => {
		const centroid = centroidOf(p.memberships, anchors);
		const off = clusterOff[p.memberships[0] ?? ""] ?? { dx: 0, dy: 0 };
		const tinyOff =
			p.memberships.length > 1
				? subgroupHashOffset(p.memberships.join("|"), 4)
				: { x: 0, y: 0 };
		return {
			cx: centroid.x + off.dx + tinyOff.x,
			cy: centroid.y + off.dy + tinyOff.y,
			halfW: p.width / 2,
			halfH: p.height / 2,
			pin: p.memberships.length, // singles pin=1, doubles pin=2, etc.
		};
	});
	// Smaller relax gap = sub-groups can sit closer to each other after
	// collision resolution. Sub-groups in the same group end up touching
	// instead of separated by a full nodeSpacing, which keeps the parent
	// enclosure tight.
	const RELAX_GAP = Math.max(2, Math.floor(opts.nodeSpacing / 4));
	const MAX_ITER = 80;
	for (let iter = 0; iter < MAX_ITER; iter++) {
		let any = false;
		for (let i = 0; i < subPositions.length; i++) {
			for (let j = i + 1; j < subPositions.length; j++) {
				const a = subPositions[i];
				const b = subPositions[j];
				const dx = b.cx - a.cx;
				const dy = b.cy - a.cy;
				const reqX = a.halfW + b.halfW + RELAX_GAP;
				const reqY = a.halfH + b.halfH + RELAX_GAP;
				const overlapX = reqX - Math.abs(dx);
				const overlapY = reqY - Math.abs(dy);
				if (overlapX <= 0 || overlapY <= 0) continue;
				any = true;
				// Singles barely budge; bigger membership sets absorb the push.
				// Push fraction for `a` is proportional to `b`'s pin (and vice
				// versa), so a single (pin=1) vs a double (pin=2) splits 2:1.
				const totalPin = a.pin + b.pin;
				const fracA = b.pin / totalPin;
				const fracB = a.pin / totalPin;
				if (overlapX < overlapY) {
					const push = overlapX + 0.5;
					const sign = dx >= 0 ? 1 : -1;
					a.cx -= sign * push * fracA;
					b.cx += sign * push * fracB;
				} else {
					const push = overlapY + 0.5;
					const sign = dy >= 0 ? 1 : -1;
					a.cy -= sign * push * fracA;
					b.cy += sign * push * fracB;
				}
			}
		}
		if (!any) break;
	}
	// Phase 3: snap sub-group centres to the global grid after relaxation.
	for (const sp of subPositions) {
		sp.cx = Math.round(sp.cx / gridX) * gridX;
		sp.cy = Math.round(sp.cy / gridY) * gridY;
	}

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

	// Excel-style slot snap with FOOTPRINT awareness. Each card reserves
	// ceil(w/slotW) × ceil(h/slotH) cells (= the full grid area it covers),
	// not just one cell. Variable-sized cards (when nodeSizeMode != fixed
	// scales them up) thus occupy multiple cells and never overlap their
	// neighbours. Process big cards first so they grab the prime real
	// estate; small ones fill in the gaps.
	const occupied = new Set<string>();
	const order = positionedNodes
		.map((_, i) => i)
		.sort((a, b) => {
			const A = positionedNodes[a];
			const B = positionedNodes[b];
			return B.width * B.height - A.width * A.height;
		});
	for (const idx of order) {
		const n = positionedNodes[idx];
		const colSpan = Math.max(1, Math.ceil(n.width / slotW));
		const rowSpan = Math.max(1, Math.ceil(n.height / slotH));
		// Snap so the FOOTPRINT is centred around the original (n.x, n.y).
		// Card centre will be at (col + colSpan/2)·slotW.
		let col = Math.floor(n.x / slotW - (colSpan - 1) / 2);
		let row = Math.floor(n.y / slotH - (rowSpan - 1) / 2);
		const isFree = (c: number, r: number): boolean => {
			for (let dc = 0; dc < colSpan; dc++) {
				for (let dr = 0; dr < rowSpan; dr++) {
					if (occupied.has(`${c + dc},${r + dr}`)) return false;
				}
			}
			return true;
		};
		if (!isFree(col, row)) {
			outer: for (let radius = 1; radius < 256; radius++) {
				for (let dc = -radius; dc <= radius; dc++) {
					for (let dr = -radius; dr <= radius; dr++) {
						if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
						if (isFree(col + dc, row + dr)) {
							col += dc;
							row += dr;
							break outer;
						}
					}
				}
			}
		}
		for (let dc = 0; dc < colSpan; dc++) {
			for (let dr = 0; dr < rowSpan; dr++) {
				occupied.add(`${col + dc},${row + dr}`);
			}
		}
		n.x = (col + colSpan / 2) * slotW;
		n.y = (row + rowSpan / 2) * slotH;
		const r = idToRect.get(n.id);
		if (r) {
			r.x = n.x;
			r.y = n.y;
		}
	}

	// Build the member set for each cluster so we can detect nesting and give
	// outer clusters extra padding. Without this, an outer cluster whose
	// rightmost member is shared with an inner cluster would have the same
	// right edge as the inner one, making the inner enclosure appear to lie
	// directly on the outer's border.
	const memberSets = new Map<string, Set<string>>();
	for (const key of clusterKeys) {
		const set = new Set<string>();
		for (const n of positionedNodes) {
			if (n.memberships.includes(key)) set.add(n.id);
		}
		memberSets.set(key, set);
	}
	const nestingDepth = new Map<string, number>();
	for (const x of clusterKeys) {
		const xs = memberSets.get(x)!;
		let depth = 0;
		for (const y of clusterKeys) {
			if (x === y) continue;
			const ys = memberSets.get(y)!;
			if (ys.size < xs.size && isSubset(ys, xs)) depth++;
		}
		nestingDepth.set(x, depth);
	}

	// Base padding around member cards, plus per-nesting-level boost so each
	// containing layer sits clearly outside the layers it encloses.
	const BASE_PAD = Math.max(24, opts.clusterSpacing / 2);
	const NEST_PAD = 18;
	const basePadCellsX = Math.max(0, Math.ceil((BASE_PAD - channelW / 2) / slotW));
	const basePadCellsY = Math.max(0, Math.ceil((BASE_PAD - channelH / 2) / slotH));
	const nestPadCellsX = Math.max(1, Math.ceil(NEST_PAD / slotW));
	const nestPadCellsY = Math.max(1, Math.ceil(NEST_PAD / slotH));
	const clusters: ClusterRect[] = [];
	for (const key of clusterKeys) {
		let cellMinCol = Infinity;
		let cellMaxCol = -Infinity;
		let cellMinRow = Infinity;
		let cellMaxRow = -Infinity;
		let count = 0;
		// Every member of this group affects the bbox — multi-tag nodes
		// belong to all their groups' enclosures (Euler-style), so excluding
		// them from any one group's bbox would visually orphan them.
		for (const n of positionedNodes) {
			if (!n.memberships.includes(key)) continue;
			count++;
			const colSpan = Math.max(1, Math.ceil(n.width / slotW));
			const rowSpan = Math.max(1, Math.ceil(n.height / slotH));
			const startCol = Math.round(n.x / slotW - colSpan / 2);
			const startRow = Math.round(n.y / slotH - rowSpan / 2);
			const endCol = startCol + colSpan - 1;
			const endRow = startRow + rowSpan - 1;
			if (startCol < cellMinCol) cellMinCol = startCol;
			if (endCol > cellMaxCol) cellMaxCol = endCol;
			if (startRow < cellMinRow) cellMinRow = startRow;
			if (endRow > cellMaxRow) cellMaxRow = endRow;
		}
		if (count === 0) continue;
		const nest = nestingDepth.get(key) ?? 0;
		const padCellsX = basePadCellsX + nest * nestPadCellsX;
		const padCellsY = basePadCellsY + nest * nestPadCellsY;
		// Enclosure edges ride the channels between slots — left/right at
		// (col − pad)·slotW and (col + 1 + pad)·slotW, i.e. the channel
		// centres just outside the card cells. Same for top/bottom.
		const left = (cellMinCol - padCellsX) * slotW;
		const right = (cellMaxCol + 1 + padCellsX) * slotW;
		const top = (cellMinRow - padCellsY) * slotH;
		const bottom = (cellMaxRow + 1 + padCellsY) * slotH;
		clusters.push({
			groupKey: key,
			label: labels.get(key) ?? key,
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
			memberCount: count,
		});
	}

	// Clamp every cluster's left/top to the CHANNEL between column A and
	// column B (resp. row 1 and row 2). Column A and row 1 stay completely
	// empty — no enclosure border may enter them. The leftmost card cell
	// is at globalMinCol, so the clamp boundary is globalMinCol * slotW
	// (the channel just to the left of card B / above row 2).
	if (positionedNodes.length > 0 && clusters.length > 0) {
		let globalMinCol = Infinity;
		let globalMinRow = Infinity;
		for (const n of positionedNodes) {
			const colSpan = Math.max(1, Math.ceil(n.width / slotW));
			const rowSpan = Math.max(1, Math.ceil(n.height / slotH));
			const startCol = Math.round(n.x / slotW - colSpan / 2);
			const startRow = Math.round(n.y / slotH - rowSpan / 2);
			if (startCol < globalMinCol) globalMinCol = startCol;
			if (startRow < globalMinRow) globalMinRow = startRow;
		}
		const gridLeft = globalMinCol * slotW;
		const gridTop = globalMinRow * slotH;
		for (const c of clusters) {
			if (c.x < gridLeft) {
				c.width = Math.max(slotW, c.width - (gridLeft - c.x));
				c.x = gridLeft;
			}
			if (c.y < gridTop) {
				c.height = Math.max(slotH, c.height - (gridTop - c.y));
				c.y = gridTop;
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

interface SubGroup {
	memberships: string[]; // sorted
	nodes: GraphNode[];
}

function groupByMembershipSet(nodes: GraphNode[]): SubGroup[] {
	const m = new Map<string, SubGroup>();
	for (const n of nodes) {
		const sorted = [...n.memberships].sort();
		const key = sorted.join("");
		let sg = m.get(key);
		if (!sg) {
			sg = { memberships: sorted, nodes: [] };
			m.set(key, sg);
		}
		sg.nodes.push(n);
	}
	return [...m.values()];
}

function isSubset<T>(small: Set<T>, big: Set<T>): boolean {
	if (small.size > big.size) return false;
	for (const v of small) if (!big.has(v)) return false;
	return true;
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

// Rank clusters by aggregate degree (sum of member node degrees), tie-broken
// by member count. NONE_BUCKET keeps its place at the end as before.

function fallbackSize(n: GraphNode): SizedNode {
	return { ...n, width: 80, height: 24 };
}

// Shelf-pack cards into rows until the row would exceed a sqrt-area target,
// then wrap. Returned positions are top-left-relative centers.
function shelfPack(
	sizes: SizedNode[],
	gap: number,
): {
	positions: { x: number; y: number }[];
	width: number;
	height: number;
} {
	if (sizes.length === 0) return { positions: [], width: 32, height: 24 };
	let totalArea = 0;
	let maxCardW = 0;
	for (const s of sizes) {
		totalArea += (s.width + gap) * (s.height + gap);
		if (s.width > maxCardW) maxCardW = s.width;
	}
	const targetW = Math.max(maxCardW, Math.ceil(Math.sqrt(totalArea) * 1.15));
	const positions: { x: number; y: number }[] = new Array(sizes.length);
	let curX = 0;
	let curY = 0;
	let rowH = 0;
	let maxEnd = 0;
	for (let i = 0; i < sizes.length; i++) {
		const s = sizes[i];
		if (curX > 0 && curX + s.width > targetW) {
			curY += rowH + gap;
			curX = 0;
			rowH = 0;
		}
		positions[i] = { x: curX + s.width / 2, y: curY + s.height / 2 };
		curX += s.width + gap;
		if (s.height > rowH) rowH = s.height;
		if (curX - gap > maxEnd) maxEnd = curX - gap;
	}
	return { positions, width: maxEnd, height: curY + rowH };
}


