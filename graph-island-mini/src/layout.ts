import { GraphData, GraphEdge, GraphNode, NONE_BUCKET } from "./types";

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

// A trunk is the heavy "cable" drawn ONLY between two cluster boundaries.
// Nodes never touch trunks directly — they connect to the trunk via thin
// stub LINEs (the per-edge polylines below).
export interface TrunkLine {
	srcCluster: string;
	tgtCluster: string;
	count: number; // number of underlying file-to-file links carried
	path: { x: number; y: number }[];
}

export interface LaidOut {
	nodes: PositionedNode[];
	edges: PositionedEdge[];
	clusters: ClusterRect[];
	trunks: TrunkLine[];
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
	clusterOffsets?: Record<string, { dx: number; dy: number }>;
	nodeOffsets?: Record<string, { dx: number; dy: number }>;
	clusterLabels?: Map<string, string>;
	// "concentric" places the focus cluster at origin and fills expanding
	// square rings outward. "flow" places focus top-left and fills columns
	// rightward (main flow direction = toward the focus). Default: concentric.
	anchorPlacement?: "concentric" | "flow";
}

interface ClusterRankInfo {
	groupKey: string;
	totalDegree: number;
	memberCount: number;
}

interface Rect {
	x: number; // center
	y: number; // center
	w: number;
	h: number;
}

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

	// Phase 3: derive a single grid step from the unified card size. View.ts
	// has already normalised every sized[].width/height to the same maximum,
	// so any element gives us the canonical card dimensions.
	const cardW = sized[0]?.width ?? 80;
	const cardH = sized[0]?.height ?? 24;
	// Channels (隘路): narrow gaps between slots reserved for wires, trunks
	// and cluster borders. slotW = card area + channel, so each slot holds
	// one card centred within it with a half-channel margin on each side.
	const channelW = Math.max(8, opts.nodeSpacing);
	const channelH = Math.max(6, Math.min(opts.nodeSpacing, Math.floor(cardH * 0.4)));
	const slotW = cardW + channelW;
	const slotH = cardH + channelH;
	const gridX = slotW;
	const gridY = slotH;

	// Phase 2: strategy dispatch per sub-group. Large sub-groups (≥
	// GYM_NODE_THRESHOLD) use 体育館型 (shelfPack — tight grid). Small ones use
	// 校庭型 (radialPack — sunflower around the highest-degree member).
	const degreeMap = computeDegreeMap(data.edges);
	const GYM_NODE_THRESHOLD = 12;

	interface PackedSubgroup {
		memberships: string[];
		nodes: GraphNode[];
		positions: { x: number; y: number }[]; // relative to centroid (already centered)
		width: number;
		height: number;
		strategy: "gymnasium" | "schoolyard";
	}
	const packed: PackedSubgroup[] = subgroups.map((sg) => {
		const sizes = sg.nodes.map((n) => sizedById.get(n.id) ?? fallbackSize(n));
		const strategy: "gymnasium" | "schoolyard" =
			sg.nodes.length >= GYM_NODE_THRESHOLD ? "gymnasium" : "schoolyard";
		let pp: { positions: { x: number; y: number }[]; width: number; height: number };
		if (strategy === "gymnasium") {
			pp = shelfPack(sizes, opts.nodeSpacing);
		} else {
			// Anchor = highest-degree member ("壇上 within this sub-group")
			let anchorIdx = 0;
			let topDeg = -1;
			for (let i = 0; i < sg.nodes.length; i++) {
				const d = degreeMap.get(sg.nodes[i].id) ?? 0;
				if (d > topDeg) {
					topDeg = d;
					anchorIdx = i;
				}
			}
			pp = radialPack(sizes, anchorIdx, opts.nodeSpacing, gridX, gridY);
		}
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
			strategy,
		};
	});

	// Anchor stride: derived from largest sub-group so neighbors don't collide.
	const maxSubW = packed.reduce((m, p) => Math.max(m, p.width), 0);
	const maxSubH = packed.reduce((m, p) => Math.max(m, p.height), 0);
	// Stride is the anchor-to-anchor distance. We want it >= 2 × maxSub so
	// that a sub-group placed at the midpoint of two adjacent anchors has
	// room on both sides; the extra clusterSpacing * 2 adds breathing room
	// between clusters so their bbox overlaps stay small relative to the
	// overall layout.
	const strideX = maxSubW + opts.clusterSpacing * 5;
	const strideY = maxSubH + opts.clusterSpacing * 5;

	// Phase 1: rank clusters by aggregate degree, pick a focus cluster
	// containing the global max-degree node, and place anchors per the chosen
	// strategy. NONE_BUCKET still sits on its own dedicated row to avoid
	// engulfment by other clusters' multi-membership bboxes. (degreeMap was
	// computed earlier for sub-group strategy dispatch — reuse.)
	const clusterRanks = rankClustersByDegree(clusterKeys, data.nodes, degreeMap);
	const focusKey = chooseFocusCluster(data.nodes, degreeMap, clusterRanks);
	if (focusKey) moveToFront(clusterRanks, focusKey);

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
	const RELAX_GAP = opts.nodeSpacing;
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

	// Excel-style slot snap. Slot pitch = (cardW + channelW) × (cardH +
	// channelH); each slot holds ONE card centred with a half-channel
	// margin on every side. The empty channel rim between slots is what
	// trunks, single wires, and cluster borders route through.
	const occupied = new Set<string>();
	for (const n of positionedNodes) {
		let col = Math.floor(n.x / slotW);
		let row = Math.floor(n.y / slotH);
		let key = `${col},${row}`;
		if (occupied.has(key)) {
			outer: for (let radius = 1; radius < 128; radius++) {
				for (let dc = -radius; dc <= radius; dc++) {
					for (let dr = -radius; dr <= radius; dr++) {
						if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
						const k2 = `${col + dc},${row + dr}`;
						if (!occupied.has(k2)) {
							col += dc;
							row += dr;
							key = k2;
							break outer;
						}
					}
				}
			}
		}
		occupied.add(key);
		n.x = (col + 0.5) * slotW;
		n.y = (row + 0.5) * slotH;
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
		for (const n of positionedNodes) {
			if (!n.memberships.includes(key)) continue;
			count++;
			const col = Math.floor(n.x / slotW);
			const row = Math.floor(n.y / slotH);
			if (col < cellMinCol) cellMinCol = col;
			if (col > cellMaxCol) cellMaxCol = col;
			if (row < cellMinRow) cellMinRow = row;
			if (row > cellMaxRow) cellMaxRow = row;
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
	const trunks: TrunkLine[] = [];
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
					path: routeZ(a, b, lanes, slotW, slotH, channelW, channelH),
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
		if (!ra || !rb) {
			for (const e of pg.items) {
				const a = idToRect.get(e.source)!;
				const b = idToRect.get(e.target)!;
				edges.push({
					source: e.source,
					target: e.target,
					weight: e.weight,
					path: routeZ(a, b, lanes, slotW, slotH, channelW, channelH),
					bundled: false,
					bundleCount: 1,
				});
			}
			continue;
		}
		const aSingleton = ra.memberCount <= 1;
		const bSingleton = rb.memberCount <= 1;
		const showTrunk = pg.items.length >= 2 && !aSingleton && !bSingleton;
		const sideA = sideTowards(ra, rb);
		const sideB = sideTowards(rb, ra);
		const trunkA = sidePoint(ra, sideA, slotW, slotH);
		const trunkB = sidePoint(rb, sideB, slotW, slotH);
		const bundleCount = pg.items.length;
		if (showTrunk) {
			trunks.push({
				srcCluster: caKey,
				tgtCluster: cbKey,
				count: bundleCount,
				path: trunkPathBetween(trunkA, trunkB),
			});
		}
		for (const e of pg.items) {
			const a = idToRect.get(e.source)!;
			const b = idToRect.get(e.target)!;
			// Always route via trunkA/trunkB so the line approaches each
			// cluster perpendicular to its boundary. When showTrunk is false
			// (singletons / single-member clusters) the same polyline is drawn
			// without the heavy trunk overlay, so it reads as a thin line that
			// happens to detour through the cluster gap.
			const path = bundledPath(a, b, trunkA, sideA, trunkB, sideB, slotW, slotH);
			edges.push({
				source: e.source,
				target: e.target,
				weight: e.weight,
				path,
				bundled: showTrunk,
				bundleCount,
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

// L-shape polyline between two trunk boundary points. Used by the trunk
// renderer; the per-edge polylines already trace the same path internally so
// the trunk overlay sits cleanly on top of them.
function trunkPathBetween(
	a: { x: number; y: number },
	b: { x: number; y: number },
): { x: number; y: number }[] {
	if (Math.abs(a.x - b.x) < 0.5) return [a, b];
	if (Math.abs(a.y - b.y) < 0.5) return [a, b];
	return [a, { x: b.x, y: a.y }, b];
}

type Side = "top" | "bottom" | "left" | "right";

// Which side of `self` faces `other`?
function sideTowards(self: ClusterRect, other: ClusterRect): Side {
	const sx = self.x + self.width / 2;
	const sy = self.y + self.height / 2;
	const ox = other.x + other.width / 2;
	const oy = other.y + other.height / 2;
	const dx = ox - sx;
	const dy = oy - sy;
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
	return dy >= 0 ? "bottom" : "top";
}

function sidePoint(
	c: ClusterRect,
	side: Side,
	slotW: number,
	slotH: number,
): { x: number; y: number } {
	// Boundary midpoints snap to channel centres (= slot boundaries) so the
	// trunk segment leaving the enclosure runs cleanly along a channel.
	const cx = Math.round((c.x + c.width / 2) / slotW) * slotW;
	const cy = Math.round((c.y + c.height / 2) / slotH) * slotH;
	if (side === "top") return { x: cx, y: c.y };
	if (side === "bottom") return { x: cx, y: c.y + c.height };
	if (side === "left") return { x: c.x, y: cy };
	return { x: c.x + c.width, y: cy };
}

// Bundled per-edge polyline: card center → vertical channel adjacent to A →
// trunkA's horizontal channel → trunkA → (trunkA → trunkB L-bend) → trunkB →
// trunkB's horizontal channel → vertical channel adjacent to B → card B
// center. Every orthogonal segment lies in a channel; nothing runs through
// a card column.
function bundledPath(
	a: Rect,
	b: Rect,
	trunkA: { x: number; y: number },
	_sideA: Side,
	trunkB: { x: number; y: number },
	_sideB: Side,
	slotW: number,
	slotH: number,
): { x: number; y: number }[] {
	const pts: { x: number; y: number }[] = [];
	push(pts, { x: a.x, y: a.y });

	// Pick the vertical channel adjacent to card A on the side facing trunkA.
	const colA = Math.floor(a.x / slotW);
	const exitXA =
		trunkA.x >= a.x ? (colA + 1) * slotW : colA * slotW;
	push(pts, { x: exitXA, y: a.y });           // exit card → channel
	push(pts, { x: exitXA, y: trunkA.y });      // vertical in channel
	push(pts, { x: trunkA.x, y: trunkA.y });    // horizontal in trunk's row channel

	// Trunk-to-trunk L-bend (both endpoints already on slot boundaries).
	if (Math.abs(trunkA.x - trunkB.x) > 0.5 && Math.abs(trunkA.y - trunkB.y) > 0.5) {
		push(pts, { x: trunkB.x, y: trunkA.y });
	}
	push(pts, { x: trunkB.x, y: trunkB.y });

	// Card B entry: mirror of the A side.
	const colB = Math.floor(b.x / slotW);
	const exitXB =
		trunkB.x >= b.x ? (colB + 1) * slotW : colB * slotW;
	push(pts, { x: exitXB, y: trunkB.y });
	push(pts, { x: exitXB, y: b.y });
	push(pts, { x: b.x, y: b.y });
	return pts;
}

// Append `next` if it differs from the last point already in the list (keeps
// polylines clean for renderers that don't like duplicate vertices).
function push(pts: { x: number; y: number }[], next: { x: number; y: number }): void {
	const last = pts[pts.length - 1];
	if (last && Math.abs(last.x - next.x) < 0.5 && Math.abs(last.y - next.y) < 0.5) return;
	pts.push(next);
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
function rankClustersByDegree(
	clusterKeys: string[],
	nodes: GraphNode[],
	degree: Map<string, number>,
): ClusterRankInfo[] {
	const byKey = new Map<string, { totalDegree: number; memberCount: number }>();
	for (const k of clusterKeys) byKey.set(k, { totalDegree: 0, memberCount: 0 });
	for (const n of nodes) {
		const d = degree.get(n.id) ?? 0;
		for (const m of n.memberships) {
			const rec = byKey.get(m);
			if (rec) {
				rec.totalDegree += d;
				rec.memberCount++;
			}
		}
	}
	const ranks: ClusterRankInfo[] = clusterKeys.map((k) => ({
		groupKey: k,
		totalDegree: byKey.get(k)?.totalDegree ?? 0,
		memberCount: byKey.get(k)?.memberCount ?? 0,
	}));
	ranks.sort((a, b) => {
		if (a.groupKey === NONE_BUCKET && b.groupKey !== NONE_BUCKET) return 1;
		if (b.groupKey === NONE_BUCKET && a.groupKey !== NONE_BUCKET) return -1;
		if (b.totalDegree !== a.totalDegree) return b.totalDegree - a.totalDegree;
		return b.memberCount - a.memberCount;
	});
	return ranks;
}

// Pick the "stage" cluster: the one that contains the GLOBAL max-degree node.
// (Per spec: 焦点 = グローバル最大次数ノードの所属クラスタ.)
function chooseFocusCluster(
	nodes: GraphNode[],
	degree: Map<string, number>,
	ranks: ClusterRankInfo[],
): string {
	if (degree.size === 0) return ranks[0]?.groupKey ?? "";
	let bestId = "";
	let bestDeg = -1;
	for (const [id, d] of degree) {
		if (d > bestDeg) {
			bestDeg = d;
			bestId = id;
		}
	}
	const node = nodes.find((n) => n.id === bestId);
	const primary = node?.memberships[0];
	if (primary && primary !== NONE_BUCKET) return primary;
	return ranks[0]?.groupKey ?? "";
}

function moveToFront(ranks: ClusterRankInfo[], key: string): void {
	const idx = ranks.findIndex((r) => r.groupKey === key);
	if (idx <= 0) return;
	const [r] = ranks.splice(idx, 1);
	ranks.unshift(r);
}

// Concentric: focus at (0,0), then expanding square rings (8, 16, 24 ... cells).
// Within each ring, fill clockwise starting from the top.
function placeAnchorsConcentric(
	anchors: Map<string, { x: number; y: number }>,
	ranks: ClusterRankInfo[],
	strideX: number,
	strideY: number,
): void {
	if (ranks.length === 0) return;
	anchors.set(ranks[0].groupKey, { x: 0, y: 0 });
	const cells: { x: number; y: number }[] = [];
	for (let r = 1; cells.length < ranks.length - 1 && r <= 32; r++) {
		// Walk the perimeter of the rxr ring clockwise starting at top-left.
		for (let dx = -r; dx <= r; dx++) cells.push({ x: dx * strideX, y: -r * strideY });
		for (let dy = -r + 1; dy <= r; dy++) cells.push({ x: r * strideX, y: dy * strideY });
		for (let dx = r - 1; dx >= -r; dx--) cells.push({ x: dx * strideX, y: r * strideY });
		for (let dy = r - 1; dy >= -r + 1; dy--) cells.push({ x: -r * strideX, y: dy * strideY });
	}
	for (let i = 1; i < ranks.length && i - 1 < cells.length; i++) {
		anchors.set(ranks[i].groupKey, cells[i - 1]);
	}
}

// Flow: focus at top-left, columns growing rightward. Within each column,
// ranks descend (rank 1 directly below focus). Column height ≈ sqrt(N).
function placeAnchorsFlow(
	anchors: Map<string, { x: number; y: number }>,
	ranks: ClusterRankInfo[],
	strideX: number,
	strideY: number,
): void {
	if (ranks.length === 0) return;
	const total = ranks.length;
	const colHeight = Math.max(1, Math.ceil(Math.sqrt(total)));
	for (let i = 0; i < total; i++) {
		const col = Math.floor(i / colHeight);
		const row = i % colHeight;
		anchors.set(ranks[i].groupKey, { x: col * strideX, y: row * strideY });
	}
}

// Deterministic radial offset from a sub-group's membership signature. The
// angle is derived from an FNV-1a hash so different membership sets are
// pushed in different directions even when their grid centroid coincides.
function subgroupHashOffset(key: string, magnitude: number): { x: number; y: number } {
	if (magnitude <= 0) return { x: 0, y: 0 };
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	const u = (h >>> 0) / 0xffffffff;
	const angle = u * Math.PI * 2;
	return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
}

function centroidOf(
	memberships: string[],
	anchors: Map<string, { x: number; y: number }>,
): { x: number; y: number } {
	let x = 0, y = 0, n = 0;
	for (const m of memberships) {
		const a = anchors.get(m);
		if (!a) continue;
		x += a.x;
		y += a.y;
		n++;
	}
	if (n === 0) return { x: 0, y: 0 };
	return { x: x / n, y: y / n };
}

function fallbackSize(n: GraphNode): SizedNode {
	return { ...n, width: 80, height: 24 };
}

// Sunflower-style radial packing (校庭型) with grid-cell snap. The
// highest-degree member sits at the centre cell ("壇上"); the rest are placed
// at the Vogel sequence
//   r = c√i,  θ = i · φ   (φ = golden angle ≈ 137.508°)
// and each ideal point is snapped to the nearest FREE grid cell via spiral
// search (no concentric rings).
function radialPack(
	sizes: SizedNode[],
	anchorIdx: number,
	gap: number,
	gridX: number,
	gridY: number,
): {
	positions: { x: number; y: number }[];
	width: number;
	height: number;
} {
	const n = sizes.length;
	if (n === 0) return { positions: [], width: 32, height: 24 };
	const positions: { x: number; y: number }[] = new Array(n);
	if (n === 1) {
		positions[0] = { x: sizes[0].width / 2, y: sizes[0].height / 2 };
		return { positions, width: sizes[0].width, height: sizes[0].height };
	}
	const occupied = new Set<string>();
	const claim = (col: number, row: number): { col: number; row: number } => {
		const ideal = `${col},${row}`;
		if (!occupied.has(ideal)) {
			occupied.add(ideal);
			return { col, row };
		}
		for (let d = 1; d < 64; d++) {
			for (let dr = -d; dr <= d; dr++) {
				for (let dc = -d; dc <= d; dc++) {
					if (Math.max(Math.abs(dc), Math.abs(dr)) !== d) continue;
					const k = `${col + dc},${row + dr}`;
					if (!occupied.has(k)) {
						occupied.add(k);
						return { col: col + dc, row: row + dr };
					}
				}
			}
		}
		// Should never reach here for reasonable n
		const key = `${col},${row}.${Math.random()}`;
		occupied.add(key);
		return { col, row };
	};

	// Anchor occupies (0, 0).
	claim(0, 0);
	positions[anchorIdx] = { x: 0, y: 0 };

	const spacing = Math.max(gridX, gridY);
	const golden = Math.PI * (3 - Math.sqrt(5));
	let step = 1;
	for (let i = 0; i < n; i++) {
		if (i === anchorIdx) continue;
		const r = spacing * Math.sqrt(step);
		const theta = step * golden;
		const idealCol = Math.round((r * Math.cos(theta)) / gridX);
		const idealRow = Math.round((r * Math.sin(theta)) / gridY);
		const cell = claim(idealCol, idealRow);
		positions[i] = { x: cell.col * gridX, y: cell.row * gridY };
		step++;
	}

	// Shift so the tightest bbox's top-left is (0, 0).
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (let i = 0; i < n; i++) {
		const s = sizes[i];
		const l = positions[i].x - s.width / 2;
		const right = positions[i].x + s.width / 2;
		const t = positions[i].y - s.height / 2;
		const b = positions[i].y + s.height / 2;
		if (l < minX) minX = l;
		if (right > maxX) maxX = right;
		if (t < minY) minY = t;
		if (b > maxY) maxY = b;
	}
	for (let i = 0; i < n; i++) {
		positions[i] = { x: positions[i].x - minX, y: positions[i].y - minY };
	}
	return { positions, width: maxX - minX, height: maxY - minY };
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

interface AggregatedEdge {
	source: string;
	target: string;
	weight: number;
}

function aggregateEdges(
	edges: GraphEdge[],
	idToRect: Map<string, Rect>,
): AggregatedEdge[] {
	const counts = new Map<string, AggregatedEdge>();
	for (const e of edges) {
		if (e.source === e.target) continue;
		if (!idToRect.has(e.source) || !idToRect.has(e.target)) continue;
		const [a, b] = e.source < e.target ? [e.source, e.target] : [e.target, e.source];
		const key = a + " " + b;
		const cur = counts.get(key);
		if (cur) cur.weight++;
		else counts.set(key, { source: e.source, target: e.target, weight: 1 });
	}
	return [...counts.values()];
}

// Phase 4: lane registry — assigns successive integer indices per "gutter"
// bucket so parallel orthogonal wires can fan apart instead of overlapping
// on the same y/x line.
class LaneRegistry {
	private counters = new Map<string, number>();
	next(key: string): number {
		const c = this.counters.get(key) ?? 0;
		this.counters.set(key, c + 1);
		return c;
	}
}

// Symmetric lane spreader: 0, +1, −1, +2, −2 … Used to fan parallel wires
// out within a channel without leaving the channel rim.
function laneShiftSpread(lane: number): number {
	if (lane === 0) return 0;
	return lane % 2 === 1 ? Math.ceil(lane / 2) : -Math.ceil(lane / 2);
}

// Cell-centre bisector snap. Bisectors run through column/row centres at
// x = (col + 0.5) * W (vertical) and y = (row + 0.5) * H (horizontal). These
// are the "invisible guidelines" the user wants every enclosure edge, single
// wire, and trunk cable to ride.
function snapBisectorX(x: number, cellW: number): number {
	return (Math.round(x / cellW - 0.5) + 0.5) * cellW;
}
function snapBisectorY(y: number, cellH: number): number {
	return (Math.round(y / cellH - 0.5) + 0.5) * cellH;
}
function snapBisectorXFloor(x: number, cellW: number): number {
	return (Math.floor(x / cellW - 0.5) + 0.5) * cellW;
}
function snapBisectorXCeil(x: number, cellW: number): number {
	return (Math.ceil(x / cellW - 0.5) + 0.5) * cellW;
}
function snapBisectorYFloor(y: number, cellH: number): number {
	return (Math.floor(y / cellH - 0.5) + 0.5) * cellH;
}
function snapBisectorYCeil(y: number, cellH: number): number {
	return (Math.ceil(y / cellH - 0.5) + 0.5) * cellH;
}

// Full-Manhattan channel routing. Every orthogonal segment lies inside a
// channel (= slot boundary): the vertical pieces ride the channel adjacent
// to A and B (so they never traverse card columns), and the horizontal
// piece rides a channel between rows (never crosses card rows). Lane
// offsets within each channel let parallel wires fan apart while staying
// in the channel rim.
function routeZ(
	a: Rect,
	b: Rect,
	lanes: LaneRegistry,
	slotW: number,
	slotH: number,
	channelW: number,
	channelH: number,
): { x: number; y: number }[] {
	if (
		Math.abs(a.x - b.x) < 0.5 &&
		Math.abs(a.y - b.y) < 0.5
	) {
		return [{ x: a.x, y: a.y }];
	}
	const colA = Math.floor(a.x / slotW);
	const colB = Math.floor(b.x / slotW);
	const rowA = Math.floor(a.y / slotH);
	const rowB = Math.floor(b.y / slotH);

	// Vertical channels adjacent to A and B. When B is to the right, exit
	// A through its right channel and enter B through its left channel
	// (mirror for the opposite direction). Same column ⇒ both endpoints
	// share one vertical channel.
	let aSide: number;
	let bSide: number;
	if (colB > colA) {
		aSide = (colA + 1) * slotW;
		bSide = colB * slotW;
	} else if (colB < colA) {
		aSide = colA * slotW;
		bSide = (colB + 1) * slotW;
	} else {
		aSide = (colA + 1) * slotW;
		bSide = (colA + 1) * slotW;
	}

	// Horizontal channel for the middle segment. Same row ⇒ detour through
	// the channel just below the shared row so the wire doesn't traverse
	// card cells on that row.
	let hIdx: number;
	if (rowA === rowB) {
		hIdx = rowA + 1;
	} else {
		hIdx = Math.round((a.y + b.y) / 2 / slotH);
	}

	// Lane offsets inside each channel — always clamped so |offset| stays
	// strictly less than half the channel width / height. Beyond that the
	// wire would leak out of the channel and into an adjacent card cell.
	const hStep = Math.max(0.5, channelH / 12);
	const hMaxShift = Math.max(1, Math.floor((channelH / 2 - 1) / hStep));
	const hLane = lanes.next(`h:${hIdx}`);
	const hShift = Math.max(-hMaxShift, Math.min(hMaxShift, laneShiftSpread(hLane)));
	const laneY = hIdx * slotH + hShift * hStep;

	const vStep = Math.max(0.5, channelW / 12);
	const vMaxShift = Math.max(1, Math.floor((channelW / 2 - 1) / vStep));
	const aIdx = Math.round(aSide / slotW);
	const aLane = lanes.next(`v:${aIdx}`);
	const aShift = Math.max(-vMaxShift, Math.min(vMaxShift, laneShiftSpread(aLane)));
	const aLaneX = aSide + aShift * vStep;

	const bIdx = Math.round(bSide / slotW);
	let bLaneX: number;
	if (aIdx === bIdx) {
		bLaneX = aLaneX;
	} else {
		const bLane = lanes.next(`v:${bIdx}`);
		const bShift = Math.max(-vMaxShift, Math.min(vMaxShift, laneShiftSpread(bLane)));
		bLaneX = bSide + bShift * vStep;
	}

	const pts: { x: number; y: number }[] = [];
	const pushPt = (p: { x: number; y: number }) => {
		const last = pts[pts.length - 1];
		if (
			last &&
			Math.abs(last.x - p.x) < 0.5 &&
			Math.abs(last.y - p.y) < 0.5
		)
			return;
		pts.push(p);
	};
	pushPt({ x: a.x, y: a.y });
	pushPt({ x: aLaneX, y: a.y });
	pushPt({ x: aLaneX, y: laneY });
	pushPt({ x: bLaneX, y: laneY });
	pushPt({ x: bLaneX, y: b.y });
	pushPt({ x: b.x, y: b.y });
	return pts;
}
