import { GraphData, GraphEdge, GraphNode, NONE_BUCKET } from "./types";

export interface SizedNode extends GraphNode {
	width: number;
	height: number;
}

export interface PositionedNode {
	id: string;
	label: string;
	groupKey: string;
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
}

interface Rect {
	x: number; // center
	y: number; // center
	w: number;
	h: number;
}

export function layout(data: GraphData, sized: SizedNode[], opts: LayoutOptions): LaidOut {
	const sizedById = new Map<string, SizedNode>();
	for (const s of sized) sizedById.set(s.id, s);

	const buckets = bucketByGroup(data.nodes);
	const groupKeys = [...buckets.keys()].sort();
	const cols = Math.max(1, Math.ceil(Math.sqrt(groupKeys.length)));
	const clusterOff = opts.clusterOffsets ?? {};
	const nodeOff = opts.nodeOffsets ?? {};

	// 1) Pack each cluster's cards (relative coords inside the cluster).
	interface Packed {
		groupKey: string;
		members: {
			node: GraphNode;
			size: SizedNode;
			relX: number;
			relY: number;
			row: number;
		}[];
		rows: { top: number; bottom: number }[]; // cluster-relative
		width: number;
		height: number;
	}
	const packed: Packed[] = groupKeys.map((g) => {
		const members = buckets.get(g) ?? [];
		const sizes = members.map((m) => sizedById.get(m.id) ?? fallbackSize(m));
		const pp = shelfPack(sizes, opts.nodeSpacing);
		return {
			groupKey: g,
			members: members.map((node, i) => ({
				node,
				size: sizes[i],
				relX: pp.positions[i].x,
				relY: pp.positions[i].y,
				row: pp.rows[i],
			})),
			rows: pp.rowBounds,
			width: pp.width,
			height: pp.height,
		};
	});

	// 2) Outer grid: uniform stride = max cluster size. Clusters sit at their cell's
	//    top-left and may leave slack room toward the right/bottom.
	const maxClusterW = Math.max(1, ...packed.map((p) => p.width));
	const maxClusterH = Math.max(1, ...packed.map((p) => p.height));
	const strideX = maxClusterW + opts.clusterSpacing;
	const strideY = maxClusterH + opts.clusterSpacing;

	const nodes: PositionedNode[] = [];
	const clusters: ClusterRect[] = [];
	const idToRect = new Map<string, Rect>();
	const idToCluster = new Map<string, ClusterRect>();
	const idToRow = new Map<string, number>();
	const clusterRows = new Map<string, { top: number; bottom: number }[]>();

	packed.forEach((p, i) => {
		const col = i % cols;
		const row = Math.floor(i / cols);
		const co = clusterOff[p.groupKey] ?? { dx: 0, dy: 0 };
		const cx = col * strideX + co.dx;
		const cy = row * strideY + co.dy;
		const cluster: ClusterRect = {
			groupKey: p.groupKey,
			x: cx,
			y: cy,
			width: p.width,
			height: p.height,
			memberCount: p.members.length,
		};
		clusters.push(cluster);
		clusterRows.set(p.groupKey, p.rows);

		for (const m of p.members) {
			const no = nodeOff[m.node.id] ?? { dx: 0, dy: 0 };
			const x = cx + m.relX + no.dx;
			const y = cy + m.relY + no.dy;
			const n: PositionedNode = {
				id: m.node.id,
				label: m.node.label,
				groupKey: m.node.groupKey,
				x,
				y,
				width: m.size.width,
				height: m.size.height,
			};
			nodes.push(n);
			idToRect.set(n.id, { x, y, w: n.width, h: n.height });
			idToCluster.set(n.id, cluster);
			idToRow.set(n.id, m.row);
		}
	});

	// 3) Edges: aggregate by undirected pair, then route through gaps.
	const aggregated = aggregateEdges(data.edges, idToRect);
	const lanes = new LaneCounter();
	const edges: PositionedEdge[] = aggregated.map((e) => {
		const a = idToRect.get(e.source)!;
		const b = idToRect.get(e.target)!;
		const ca = idToCluster.get(e.source)!;
		const cb = idToCluster.get(e.target)!;
		const intra = ca === cb;
		let path: { x: number; y: number }[];
		if (intra) {
			path = routeWithinCluster(
				a,
				b,
				idToRow.get(e.source)!,
				idToRow.get(e.target)!,
				ca,
				clusterRows.get(ca.groupKey)!,
				opts.nodeSpacing,
				lanes,
			);
		} else {
			path = routeAcrossClusters(
				a,
				ca,
				idToRow.get(e.source)!,
				clusterRows.get(ca.groupKey)!,
				b,
				cb,
				idToRow.get(e.target)!,
				clusterRows.get(cb.groupKey)!,
				opts.nodeSpacing,
				lanes,
			);
		}
		return { source: e.source, target: e.target, weight: e.weight, path };
	});

	return { nodes, edges, clusters };
}

function fallbackSize(n: GraphNode): SizedNode {
	return { ...n, width: 80, height: 24 };
}

function bucketByGroup(ns: GraphNode[]): Map<string, GraphNode[]> {
	const m = new Map<string, GraphNode[]>();
	for (const n of ns) {
		const k = n.groupKey || NONE_BUCKET;
		const arr = m.get(k);
		if (arr) arr.push(n);
		else m.set(k, [n]);
	}
	return m;
}

// Shelf packing: cards fill rows left-to-right, wrapping at a target width
// chosen to make the cluster roughly square. Card x,y in result is the CENTER
// of each card relative to the cluster's top-left.
function shelfPack(
	sizes: SizedNode[],
	gap: number,
): {
	positions: { x: number; y: number }[];
	rows: number[];
	rowBounds: { top: number; bottom: number }[];
	width: number;
	height: number;
} {
	if (sizes.length === 0) {
		return { positions: [], rows: [], rowBounds: [], width: 32, height: 24 };
	}
	let totalArea = 0;
	let maxCardW = 0;
	let maxCardH = 0;
	for (const s of sizes) {
		totalArea += (s.width + gap) * (s.height + gap);
		if (s.width > maxCardW) maxCardW = s.width;
		if (s.height > maxCardH) maxCardH = s.height;
	}
	const targetW = Math.max(maxCardW, Math.ceil(Math.sqrt(totalArea) * 1.15));

	// Pad the cluster so even the top-most and bottom-most rows have a real gap
	// strip above/below for edge routing. Without this, routing through
	// rowYAbove(0) collapses onto the cluster's top boundary and the line
	// appears to "scrape" the card edges.
	const padTop = gap;
	const padBottom = gap;
	const padLeft = gap / 2;
	const padRight = gap / 2;

	const positions: { x: number; y: number }[] = new Array(sizes.length);
	const rows: number[] = new Array(sizes.length);
	const rowBounds: { top: number; bottom: number }[] = [];
	let curX = padLeft;
	let curY = padTop;
	let rowH = 0;
	let rowIdx = 0;
	let maxRowEnd = padLeft;
	rowBounds.push({ top: padTop, bottom: padTop });
	for (let i = 0; i < sizes.length; i++) {
		const s = sizes[i];
		if (curX > padLeft && curX + s.width > padLeft + targetW) {
			rowBounds[rowIdx].bottom = curY + rowH;
			curY += rowH + gap;
			curX = padLeft;
			rowH = 0;
			rowIdx++;
			rowBounds.push({ top: curY, bottom: curY });
		}
		positions[i] = { x: curX + s.width / 2, y: curY + s.height / 2 };
		rows[i] = rowIdx;
		curX += s.width + gap;
		if (s.height > rowH) rowH = s.height;
		if (curX - gap > maxRowEnd) maxRowEnd = curX - gap;
	}
	rowBounds[rowIdx].bottom = curY + rowH;
	const width = Math.max(maxCardW + padLeft + padRight, maxRowEnd + padRight);
	const height = curY + rowH + padBottom;
	return { positions, rows, rowBounds, width, height };
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

// Tracks how many edges have claimed a particular routing "track" (a row gap
// or column gap). Each subsequent edge in the same track gets a small offset
// so lines fan out instead of overlapping.
class LaneCounter {
	private map = new Map<string, number>();
	next(key: string): number {
		const v = this.map.get(key) ?? 0;
		this.map.set(key, v + 1);
		return v;
	}
}

function laneOffset(lane: number, gapWidth: number): number {
	if (gapWidth <= 0) return 0;
	const step = Math.max(1.5, gapWidth / 10);
	const idx = Math.floor((lane + 1) / 2);
	const sign = lane % 2 === 0 ? 1 : -1;
	const limit = gapWidth * 0.4;
	return Math.max(-limit, Math.min(limit, sign * idx * step));
}

function rectEdges(r: Rect) {
	return {
		left: r.x - r.w / 2,
		right: r.x + r.w / 2,
		top: r.y - r.h / 2,
		bottom: r.y + r.h / 2,
	};
}

interface RowGapY {
	(r: number): number;
}

// Build per-cluster row-gap accessors with lane offsets so multiple edges
// sharing the same gap fan out instead of overlapping.
function makeGapAccessors(
	cluster: ClusterRect,
	rowBounds: { top: number; bottom: number }[],
	gap: number,
	lanes: LaneCounter,
	bucket: string,
): { above: RowGapY; below: RowGapY; gapWidth: number } {
	const abs = rowBounds.map((r) => ({
		top: cluster.y + r.top,
		bottom: cluster.y + r.bottom,
	}));
	const gapWidth = gap;
	const aboveCenter = (r: number): { y: number; w: number } => {
		if (r <= 0) {
			// Top padding strip (cluster.y .. abs[0].top).
			const yMid = (cluster.y + abs[0].top) / 2;
			const w = Math.max(2, abs[0].top - cluster.y);
			return { y: yMid, w };
		}
		const yMid = (abs[r - 1].bottom + abs[r].top) / 2;
		const w = Math.max(2, abs[r].top - abs[r - 1].bottom);
		return { y: yMid, w };
	};
	const belowCenter = (r: number): { y: number; w: number } => {
		if (r >= abs.length - 1) {
			const yMid = (abs[r].bottom + cluster.y + cluster.height) / 2;
			const w = Math.max(2, cluster.y + cluster.height - abs[r].bottom);
			return { y: yMid, w };
		}
		const yMid = (abs[r].bottom + abs[r + 1].top) / 2;
		const w = Math.max(2, abs[r + 1].top - abs[r].bottom);
		return { y: yMid, w };
	};
	const above: RowGapY = (r) => {
		const c = aboveCenter(r);
		const lane = lanes.next(`${bucket}:hAbove:${r}`);
		return c.y + laneOffset(lane, c.w);
	};
	const below: RowGapY = (r) => {
		const c = belowCenter(r);
		const lane = lanes.next(`${bucket}:hBelow:${r}`);
		return c.y + laneOffset(lane, c.w);
	};
	return { above, below, gapWidth };
}

// Row-aware orthogonal routing inside a single cluster. All edges travel via
// row gaps so they pass BETWEEN cards rather than along card edges.
function routeWithinCluster(
	a: Rect,
	b: Rect,
	rowA: number,
	rowB: number,
	cluster: ClusterRect,
	rowBounds: { top: number; bottom: number }[],
	gap: number,
	lanes: LaneCounter,
): { x: number; y: number }[] {
	const { above, below } = makeGapAccessors(
		cluster,
		rowBounds,
		gap,
		lanes,
		`intra:${cluster.groupKey}`,
	);
	const ae = rectEdges(a);
	const be = rectEdges(b);

	if (rowA === rowB) {
		// Same row: detour through the gap above (or below, when row 0 has more rows).
		const useAbove = rowA > 0 || rowBounds.length === 1;
		const detourY = useAbove ? above(rowA) : below(rowA);
		const aExitY = useAbove ? ae.top : ae.bottom;
		const bExitY = useAbove ? be.top : be.bottom;
		return [
			{ x: a.x, y: a.y },
			{ x: a.x, y: aExitY },
			{ x: a.x, y: detourY },
			{ x: b.x, y: detourY },
			{ x: b.x, y: bExitY },
			{ x: b.x, y: b.y },
		];
	}

	// Different rows: travel through the gap immediately exiting the source row.
	const downward = rowB > rowA;
	const aExitY = downward ? ae.bottom : ae.top;
	const bExitY = downward ? be.top : be.bottom;
	const yMid1 = downward ? below(rowA) : above(rowA);
	const yMid2 = downward ? above(rowB) : below(rowB);
	if (Math.abs(rowA - rowB) === 1) {
		// Adjacent rows share a gap; route through it with a single horizontal.
		return [
			{ x: a.x, y: a.y },
			{ x: a.x, y: aExitY },
			{ x: a.x, y: yMid1 },
			{ x: b.x, y: yMid1 },
			{ x: b.x, y: bExitY },
			{ x: b.x, y: b.y },
		];
	}
	// Non-adjacent: use a "trunk" near the closer cluster side to bypass middle rows.
	const cxMid = cluster.x + cluster.width / 2;
	const trunkX = b.x >= cxMid ? cluster.x + cluster.width - gap / 2 : cluster.x + gap / 2;
	return [
		{ x: a.x, y: a.y },
		{ x: a.x, y: aExitY },
		{ x: a.x, y: yMid1 },
		{ x: trunkX, y: yMid1 },
		{ x: trunkX, y: yMid2 },
		{ x: b.x, y: yMid2 },
		{ x: b.x, y: bExitY },
		{ x: b.x, y: b.y },
	];
}

// Inter-cluster routing: card-to-port legs use the source/target row gaps so
// they pass BETWEEN cards. The middle "trunk" between cluster boundaries is the
// aggregated section drawn between the two cluster ports.
function routeAcrossClusters(
	a: Rect,
	ca: ClusterRect,
	rowA: number,
	rowBoundsA: { top: number; bottom: number }[],
	b: Rect,
	cb: ClusterRect,
	rowB: number,
	rowBoundsB: { top: number; bottom: number }[],
	gap: number,
	lanes: LaneCounter,
): { x: number; y: number }[] {
	const srcSide = sideTowards(ca, cb);
	const tgtSide = sideTowards(cb, ca);
	const srcPort = clusterPort(ca, srcSide);
	const tgtPort = clusterPort(cb, tgtSide);

	const srcLeg = routeCardToPort(a, rowA, ca, rowBoundsA, gap, srcSide, srcPort, lanes);
	const tgtLeg = routeCardToPort(b, rowB, cb, rowBoundsB, gap, tgtSide, tgtPort, lanes);
	const linkLeg = portToPort(srcPort, srcSide, tgtPort, tgtSide);

	const tgtLegRev = [...tgtLeg].reverse();
	const path: { x: number; y: number }[] = [];
	path.push({ x: a.x, y: a.y });
	for (const p of srcLeg) path.push(p);
	for (let i = 1; i < linkLeg.length - 1; i++) path.push(linkLeg[i]);
	for (const p of tgtLegRev) path.push(p);
	path.push({ x: b.x, y: b.y });
	return path;
}

type Side = "top" | "bottom" | "left" | "right";

function sideTowards(self: ClusterRect, other: ClusterRect): Side {
	const sCx = self.x + self.width / 2;
	const sCy = self.y + self.height / 2;
	const oCx = other.x + other.width / 2;
	const oCy = other.y + other.height / 2;
	const dx = oCx - sCx;
	const dy = oCy - sCy;
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
	return dy >= 0 ? "bottom" : "top";
}

function clusterPort(c: ClusterRect, side: Side): { x: number; y: number } {
	const cx = c.x + c.width / 2;
	const cy = c.y + c.height / 2;
	if (side === "top") return { x: cx, y: c.y };
	if (side === "bottom") return { x: cx, y: c.y + c.height };
	if (side === "left") return { x: c.x, y: cy };
	return { x: c.x + c.width, y: cy };
}

function routeCardToPort(
	card: Rect,
	row: number,
	cluster: ClusterRect,
	rowBounds: { top: number; bottom: number }[],
	gap: number,
	side: Side,
	port: { x: number; y: number },
	lanes: LaneCounter,
): { x: number; y: number }[] {
	const ce = rectEdges(card);
	const { above, below } = makeGapAccessors(
		cluster,
		rowBounds,
		gap,
		lanes,
		`port:${cluster.groupKey}:${side}`,
	);
	// Pick the row gap on the same side as the destination boundary when
	// possible, so the path doesn't backtrack across the card.
	const preferAbove =
		side === "top" || (side !== "bottom" && row > 0);
	const detourY = preferAbove ? above(row) : below(row);
	const cardExitY = preferAbove ? ce.top : ce.bottom;

	if (side === "left" || side === "right") {
		// Row gap → cluster boundary edge → port y along the outside boundary.
		// (port.x == cluster.left/right by construction.)
		const boundaryX = side === "left" ? cluster.x : cluster.x + cluster.width;
		return [
			{ x: card.x, y: cardExitY },
			{ x: card.x, y: detourY },
			{ x: boundaryX, y: detourY },
			{ x: boundaryX, y: port.y },
			{ x: port.x, y: port.y },
		];
	}

	// side === "top" or "bottom": travel through row gap, hop to the cluster's
	// nearer left/right boundary to escape stacked rows, then climb along the
	// outside boundary to the port y.
	const cxMid = cluster.x + cluster.width / 2;
	const escapeX =
		port.x >= cxMid ? cluster.x + cluster.width : cluster.x;
	return [
		{ x: card.x, y: cardExitY },
		{ x: card.x, y: detourY },
		{ x: escapeX, y: detourY },
		{ x: escapeX, y: port.y },
		{ x: port.x, y: port.y },
	];
}

function portToPort(
	src: { x: number; y: number },
	srcSide: Side,
	tgt: { x: number; y: number },
	tgtSide: Side,
): { x: number; y: number }[] {
	if (srcSide === tgtSide && (srcSide === "left" || srcSide === "right")) {
		const outX =
			srcSide === "right" ? Math.max(src.x, tgt.x) + 16 : Math.min(src.x, tgt.x) - 16;
		return [src, { x: outX, y: src.y }, { x: outX, y: tgt.y }, tgt];
	}
	if (srcSide === tgtSide && (srcSide === "top" || srcSide === "bottom")) {
		const outY =
			srcSide === "bottom" ? Math.max(src.y, tgt.y) + 16 : Math.min(src.y, tgt.y) - 16;
		return [src, { x: src.x, y: outY }, { x: tgt.x, y: outY }, tgt];
	}
	// Opposite or perpendicular sides — Z-shape via midpoint.
	const midX = (src.x + tgt.x) / 2;
	const midY = (src.y + tgt.y) / 2;
	if (srcSide === "left" || srcSide === "right") {
		// horizontal exit, then vertical, then horizontal
		return [src, { x: midX, y: src.y }, { x: midX, y: tgt.y }, tgt];
	}
	return [src, { x: src.x, y: midY }, { x: tgt.x, y: midY }, tgt];
}
