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

export interface LaidOut {
	nodes: PositionedNode[];
	edges: PositionedEdge[];
	clusters: ClusterRect[];
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

	for (const p of packed) {
		const centroid = centroidOf(p.memberships, anchors);
		// Cluster offsets piggyback onto the first membership of the sub-group:
		// dragging a single-tag cluster shifts only that anchor's worth of files.
		const off = clusterOff[p.memberships[0] ?? ""] ?? { dx: 0, dy: 0 };
		const cx = centroid.x + off.dx;
		const cy = centroid.y + off.dy;

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

	// Edges: simple L-shape routing. Cards drawn over the endpoints hide the
	// "stub" segments inside each card.
	const aggregated = aggregateEdges(data.edges, idToRect);
	const edges: PositionedEdge[] = aggregated.map((e) => {
		const a = idToRect.get(e.source)!;
		const b = idToRect.get(e.target)!;
		return { source: e.source, target: e.target, weight: e.weight, path: lShape(a, b) };
	});

	return { nodes: positionedNodes, edges, clusters };
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
