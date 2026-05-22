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

	// Pack each sub-group locally so we know how much room each centroid needs.
	interface PackedSubgroup {
		memberships: string[];
		nodes: GraphNode[];
		positions: { x: number; y: number }[]; // relative to centroid (already centered)
		width: number;
		height: number;
	}
	const packed: PackedSubgroup[] = subgroups.map((sg) => {
		const sizes = sg.nodes.map((n) => sizedById.get(n.id) ?? fallbackSize(n));
		const pp = shelfPack(sizes, opts.nodeSpacing);
		const positions = pp.positions.map((p) => ({
			x: p.x - pp.width / 2,
			y: p.y - pp.height / 2,
		}));
		return { memberships: sg.memberships, nodes: sg.nodes, positions, width: pp.width, height: pp.height };
	});

	// Anchor stride: derived from largest sub-group so neighbors don't collide.
	const maxSubW = packed.reduce((m, p) => Math.max(m, p.width), 0);
	const maxSubH = packed.reduce((m, p) => Math.max(m, p.height), 0);
	// Wider stride so the corridor between adjacent anchors is visible enough
	// for edge routing to pass through without grazing enclosure borders.
	const strideX = maxSubW + opts.clusterSpacing * 3;
	const strideY = maxSubH + opts.clusterSpacing * 3;

	// NONE_BUCKET is exclusive (never appears in a multi-membership sub-group)
	// so it doesn't belong on the main anchor grid: when placed there, other
	// clusters' multi-membership centroids can land at NONE's position and
	// those clusters' bboxes end up engulfing NONE. We put NONE_BUCKET into a
	// dedicated row below the main grid instead.
	const mainKeys = clusterKeys.filter((k) => k !== NONE_BUCKET);
	const hasNone = mainKeys.length !== clusterKeys.length;
	const cols = Math.max(1, Math.ceil(Math.sqrt(mainKeys.length || 1)));
	const anchors = new Map<string, { x: number; y: number }>();
	mainKeys.forEach((k, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		anchors.set(k, { x: col * strideX, y: row * strideY });
	});
	if (hasNone) {
		const mainRows = Math.max(1, Math.ceil(mainKeys.length / cols));
		const noneCol = Math.floor((cols - 1) / 2); // centred under the main grid
		// +1 gives a full extra row of empty space between the grid and NONE.
		anchors.set(NONE_BUCKET, { x: noneCol * strideX, y: (mainRows + 1) * strideY });
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
		clusters.push({
			groupKey: key,
			label: labels.get(key) ?? key,
			x: minX - PAD,
			y: minY - PAD,
			width: maxX - minX + 2 * PAD,
			height: maxY - minY + 2 * PAD,
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
	for (const pg of pairGroups.values()) {
		// Intra-cluster edges stay as a simple L between card centres (the
		// path is entirely inside one cluster, where there's no risk of
		// crossing another cluster's border).
		if (pg.intra) {
			for (const e of pg.items) {
				const a = idToRect.get(e.source)!;
				const b = idToRect.get(e.target)!;
				edges.push({
					source: e.source,
					target: e.target,
					weight: e.weight,
					path: lShape(a, b),
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
					path: lShape(a, b),
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
		const trunkA = sidePoint(ra, sideA);
		const trunkB = sidePoint(rb, sideB);
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

function sidePoint(c: ClusterRect, side: Side): { x: number; y: number } {
	const cx = c.x + c.width / 2;
	const cy = c.y + c.height / 2;
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

// Simple orthogonal L-shape: go horizontal first, then vertical. The card
// renderer draws on top of these segments so the inside-card portions are
// hidden visually.
function lShape(a: Rect, b: Rect): { x: number; y: number }[] {
	if (Math.abs(a.x - b.x) < 0.5) {
		return [{ x: a.x, y: a.y }, { x: a.x, y: b.y }];
	}
	if (Math.abs(a.y - b.y) < 0.5) {
		return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }];
	}
	return [
		{ x: a.x, y: a.y },
		{ x: b.x, y: a.y },
		{ x: b.x, y: b.y },
	];
}
