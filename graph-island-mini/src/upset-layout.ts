// UpSet plot layout.
//
// Two coexisting visual layers:
//   - MAIN area (world space): card stacks — one card per node, stacked
//     vertically inside each intersection column. Every element is
//     individually visible.
//   - FOOTER (screen space, rendered by draw-upset.ts): dot matrix +
//     bars + labels. Always readable; tracks the cards horizontally
//     via the current pan/zoom transform.
//
// The matrix column's `xWorld` and the card column's x are the same
// number — that's what keeps "this column's stack" and "this column's
// dots" visually under each other at every zoom.
import type { GraphData } from "./types";
import type {
	LaidOut,
	PositionedNode,
	PositionedEdge,
	UpsetMeta,
} from "./layout";
import { computeChannelDims } from "./card-sizing";
import { snapCardsToGrid } from "./cell-snap";
import {
	LaneRegistry,
	aggregateEdges,
	routeZ,
	type RouteObstacle,
	type RouteRect,
} from "./edge-routing";

export interface UpsetLayoutOptions {
	cellW: number;
	cellH: number;
	nodeSpacing: number;
	clusterLabels: Map<string, string>;
	columnSort?: "size" | "degree";
	minColumnSize?: number;
}

interface Sized {
	id: string;
	width: number;
	height: number;
}

export function layoutUpset(
	data: GraphData,
	sized: Sized[],
	opts: UpsetLayoutOptions,
): LaidOut {
	const sizedById = new Map<string, Sized>();
	for (const s of sized) sizedById.set(s.id, s);

	// --- 1. Set sizes (rows). HAVING already filtered upstream.
	const setSizes = new Map<string, number>();
	for (const n of data.nodes) {
		for (const m of n.memberships) {
			setSizes.set(m, (setSizes.get(m) ?? 0) + 1);
		}
	}
	const setKeys = [...setSizes.keys()].sort((a, b) => {
		const da = setSizes.get(b)! - setSizes.get(a)!;
		return da !== 0 ? da : a.localeCompare(b);
	});

	// --- 2. Signature buckets — "|" separator avoids the {ab,c}/{a,bc}
	// collision the naive `.join("")` would produce.
	const sigToBucket = new Map<
		string,
		{ signature: string[]; nodeIds: string[] }
	>();
	for (const n of data.nodes) {
		if (n.memberships.length === 0) continue;
		const sorted = [...n.memberships].sort();
		const key = sorted.join("|");
		const entry = sigToBucket.get(key);
		if (entry) entry.nodeIds.push(n.id);
		else sigToBucket.set(key, { signature: sorted, nodeIds: [n.id] });
	}

	// --- 3. Min-size cull.
	const minSize = Math.max(1, opts.minColumnSize ?? 1);
	const buckets = [...sigToBucket.values()].filter(
		(b) => b.nodeIds.length >= minSize,
	);

	// --- 4. Sort columns by `columnSort` setting.
	const sortMode = opts.columnSort ?? "size";
	buckets.sort((a, b) => {
		if (sortMode === "degree") {
			if (a.signature.length !== b.signature.length)
				return a.signature.length - b.signature.length;
			if (b.nodeIds.length !== a.nodeIds.length)
				return b.nodeIds.length - a.nodeIds.length;
		} else {
			if (b.nodeIds.length !== a.nodeIds.length)
				return b.nodeIds.length - a.nodeIds.length;
			if (a.signature.length !== b.signature.length)
				return a.signature.length - b.signature.length;
		}
		return a.signature.join().localeCompare(b.signature.join());
	});

	// Stable per-column node order (by id) so the same intersection
	// always lists the same files in the same order — important for
	// the detail panel + reproducible rendering.
	for (const bucket of buckets) {
		bucket.nodeIds.sort((a, b) => a.localeCompare(b));
	}

	// --- 5. Card-stack geometry. Cell size = the SAME canonical
	// `opts.cellW × opts.cellH` Euler uses for one grid cell. With
	// NODE_DISPLAY size = 1×1 (the default), one UpSet card occupies
	// exactly one grid cell — matching Euler's "one cell per card"
	// behaviour the user pointed out.
	// Bar width = grid cell as a baseline, BUT grows when nodes have
	// been size-scaled (indegree / outdegree mode) so the widest
	// node fits inside its column. Uniform width across all columns
	// = the maximum observed card size, matching a real Pareto bar
	// chart where every bar shares one width.
	const baseW = opts.cellW > 0 ? opts.cellW : 80;
	const baseH = opts.cellH > 0 ? opts.cellH : 24;
	let cardW = baseW;
	let cardH = baseH;
	for (const s of sized) {
		if (s.width > cardW) cardW = s.width;
		if (s.height > cardH) cardH = s.height;
	}
	// Horizontal channel = Euler grid pitch (so column separation
	// matches the grid). Vertical channel = 0: cards in the same
	// column touch, forming a CONTINUOUS PARETO BAR. routeZ still
	// works because all inter-column wiring uses the horizontal
	// channel (channelW) — no vertical lanes are required in UpSet.
	const { channelW } = computeChannelDims(opts.nodeSpacing);
	const channelH = 0;
	const slotW = cardW + channelW;
	const slotH = cardH + channelH;

	const tallestColumn = Math.max(1, ...buckets.map((b) => b.nodeIds.length));
	const cardsWorldHeight = tallestColumn * slotH;
	const cardsWorldWidth = buckets.length * slotW;

	// --- 6. Place cards on the slot lattice — cell-centre coords so
	// `snapAndBuildRouteData` (= shared Euler path) is a no-op for the
	// well-formed UpSet placement but still validates the snap. Column
	// index `ci` → column world x = `(ci + 0.5) * slotW`.
	const positionedNodes: PositionedNode[] = [];
	const columns: UpsetMeta["columns"] = buckets.map((bucket, ci) => {
		const xWorld = (ci + 0.5) * slotW;
		for (let j = 0; j < bucket.nodeIds.length; j++) {
			const id = bucket.nodeIds[j];
			const node = data.nodes.find((n) => n.id === id);
			if (!node) continue;
			const s = sizedById.get(id);
			const w = s?.width ?? cardW;
			const h = s?.height ?? cardH;
			// Stack BOTTOM-UP per Pareto convention: the j=0 card
			// (alphabetically first by id) lands on the BOTTOM-most
			// cell row; each subsequent card piles on top of it.
			// All columns therefore share the same baseline at row
			// `tallestColumn - 1` and grow upward by their count.
			const rowIdx = tallestColumn - 1 - j;
			const yCentre = (rowIdx + 0.5) * slotH;
			positionedNodes.push({
				...node,
				x: xWorld,
				y: yCentre,
				width: w,
				height: h,
			} as PositionedNode);
		}
		return {
			signature: bucket.signature,
			nodeIds: bucket.nodeIds,
			size: bucket.nodeIds.length,
			xWorld,
		};
	});

	const sets: UpsetMeta["sets"] = setKeys.map((key) => ({
		key,
		label: opts.clusterLabels.get(key) ?? key,
		size: setSizes.get(key) ?? 0,
	}));

	// Post-placement: snap, build routing data, route edges.
	// INTENTIONALLY DUPLICATED from `layout-shared.ts` (per user
	// spec) so UpSet's pipeline can evolve independently of Euler's
	// — no implicit coupling through a shared helper.
	const idToRect = new Map<string, RouteRect>();
	for (const n of positionedNodes) {
		idToRect.set(n.id, { x: n.x, y: n.y, w: n.width, h: n.height });
	}
	snapCardsToGrid(positionedNodes, slotW, slotH, idToRect);
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
	const lanes = new LaneRegistry();
	const edges: PositionedEdge[] = [];
	for (const e of aggregated) {
		const a = idToRect.get(e.source);
		const b = idToRect.get(e.target);
		if (!a || !b) continue;
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

	return {
		nodes: positionedNodes,
		edges,
		clusters: [],
		trunks: [],
		slotW,
		slotH,
		channelW,
		channelH,
		upset: {
			sets,
			columns,
			// Cards now span world x = 0 .. numCols*slotW (no leftPad
			// margin) because the placement is on cell centres.
			cardsWorldWidth,
			cardsWorldHeight,
			cardSlotW: slotW,
			cardSlotH: slotH,
		},
	};
}
