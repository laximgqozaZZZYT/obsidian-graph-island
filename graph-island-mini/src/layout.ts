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
	const gridX = cardW + opts.nodeSpacing;
	const gridY = cardH + opts.nodeSpacing;

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

	// Strict Excel-style cell snap: every card lands at the centre of one
	// cell on a W × H lattice (cell pitch = cardW × cardH, cells touch with
	// no internal gaps). The grid origin is world (0, 0); cell (col, row)
	// spans [col*cardW, (col+1)*cardW] × [row*cardH, (row+1)*cardH] with
	// centre at ((col + 0.5) * cardW, (row + 0.5) * cardH). When the natural
	// cell is occupied, spiral outward to the nearest free cell so each card
	// gets a unique slot (matches the user's "穴に納める" requirement).
	const occupied = new Set<string>();
	for (const n of positionedNodes) {
		let col = Math.floor(n.x / cardW);
		let row = Math.floor(n.y / cardH);
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
		n.x = (col + 0.5) * cardW;
		n.y = (row + 0.5) * cardH;
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
	const clusters: ClusterRect[] = [];
	for (const key of clusterKeys) {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		let count = 0;
		for (const n of positionedNodes) {
			if (!n.memberships.includes(key)) continue;
			count++;
			minX = Math.min(minX, n.x - n.width / 2);
			maxX = Math.max(maxX, n.x + n.width / 2);
			minY = Math.min(minY, n.y - n.height / 2);
			maxY = Math.max(maxY, n.y + n.height / 2);
		}
		if (count === 0) continue;
		const PAD = BASE_PAD + (nestingDepth.get(key) ?? 0) * NEST_PAD;
		// Bisector snap: each enclosure edge is rounded outward to the
		// nearest cell-centre bisector. Borders then ride the invisible
		// guidelines that pass through column / row centres, lining up with
		// the cards inside and the trunk / single-wire routing outside.
		const left = snapBisectorXFloor(minX - PAD, cardW);
		const right = snapBisectorXCeil(maxX + PAD, cardW);
		const top = snapBisectorYFloor(minY - PAD, cardH);
		const bottom = snapBisectorYCeil(maxY + PAD, cardH);
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
					path: routeZ(a, b, lanes, cardH),
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
					path: routeZ(a, b, lanes, cardH),
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
		const trunkA = sidePoint(ra, sideA, cardW, cardH);
		const trunkB = sidePoint(rb, sideB, cardW, cardH);
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
			const path = bundledPath(a, b, trunkA, sideA, trunkB, sideB);
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

	return { nodes: positionedNodes, edges, clusters, trunks };
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
	cellW: number,
	cellH: number,
): { x: number; y: number } {
	// Boundary midpoints get snapped to cell-centre bisectors so every trunk
	// endpoint and the L-bend between two trunks sit on an integer bisector.
	const cx = snapBisectorX(c.x + c.width / 2, cellW);
	const cy = snapBisectorY(c.y + c.height / 2, cellH);
	if (side === "top") return { x: cx, y: c.y };
	if (side === "bottom") return { x: cx, y: c.y + c.height };
	if (side === "left") return { x: c.x, y: cy };
	return { x: c.x + c.width, y: cy };
}

// Orthogonal polyline: card center → bend_a → trunkA → trunkB → bend_b → card.
// The bend point on each side is chosen so the last segment touching the trunk
// is PERPENDICULAR to the cluster boundary (otherwise the stub would run along
// the enclosure border and visually merge with its stroke).
function bundledPath(
	a: Rect,
	b: Rect,
	trunkA: { x: number; y: number },
	sideA: Side,
	trunkB: { x: number; y: number },
	sideB: Side,
): { x: number; y: number }[] {
	const pts: { x: number; y: number }[] = [];
	push(pts, { x: a.x, y: a.y });
	push(pts, bendPoint({ x: a.x, y: a.y }, trunkA, sideA));
	push(pts, trunkA);
	// trunk segment between boundary points; L-bend if they're not axis-aligned.
	if (Math.abs(trunkA.x - trunkB.x) > 0.5 && Math.abs(trunkA.y - trunkB.y) > 0.5) {
		push(pts, { x: trunkB.x, y: trunkA.y });
	}
	push(pts, trunkB);
	push(pts, bendPoint({ x: b.x, y: b.y }, trunkB, sideB));
	push(pts, { x: b.x, y: b.y });
	return pts;
}

// Bend at (cardX, trunkY) for left/right sides so the segment ending at the
// trunk runs HORIZONTALLY (perpendicular to a vertical boundary). Mirrored
// for top/bottom sides.
function bendPoint(
	card: { x: number; y: number },
	trunk: { x: number; y: number },
	side: Side,
): { x: number; y: number } {
	if (side === "left" || side === "right") return { x: card.x, y: trunk.y };
	return { x: trunk.x, y: card.y };
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

// Phase 4 + bisector: orthogonal Z-route. The horizontal middle segment runs
// along a row-centre bisector (= (row + 0.5) * cellH). Parallel edges in the
// same row bucket spread across ADJACENT bisector rows instead of using
// fractional pixel offsets, so every wire still lies on an integer bisector.
function routeZ(
	a: Rect,
	b: Rect,
	lanes: LaneRegistry,
	cellH: number,
): { x: number; y: number }[] {
	if (Math.abs(a.x - b.x) < 0.5) {
		return [{ x: a.x, y: a.y }, { x: a.x, y: b.y }];
	}
	if (Math.abs(a.y - b.y) < 0.5) {
		return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }];
	}
	const midY = (a.y + b.y) / 2;
	const baseRow = Math.round(midY / cellH - 0.5);
	const lane = lanes.next(`h:${baseRow}`);
	// Lane 0 → baseRow, 1 → +1, 2 → −1, 3 → +2, 4 → −2 …
	const laneShift =
		lane === 0
			? 0
			: lane % 2 === 1
				? Math.ceil(lane / 2)
				: -Math.ceil(lane / 2);
	const laneY = (baseRow + laneShift + 0.5) * cellH;
	return [
		{ x: a.x, y: a.y },
		{ x: a.x, y: laneY },
		{ x: b.x, y: laneY },
		{ x: b.x, y: b.y },
	];
}
