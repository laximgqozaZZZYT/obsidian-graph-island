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
import type { LaidOut, PositionedNode, UpsetMeta } from "./layout";

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

	// --- 5. Card-stack geometry. Use the LARGEST observed card so the
	// slot pitch never under-sizes its content (a card with body lines
	// would otherwise spill into the next slot).
	const fallbackW = opts.cellW > 0 ? opts.cellW : 80;
	const fallbackH = opts.cellH > 0 ? opts.cellH : 24;
	let maxCardW = fallbackW;
	let maxCardH = fallbackH;
	for (const s of sized) {
		if (s.width > maxCardW) maxCardW = s.width;
		if (s.height > maxCardH) maxCardH = s.height;
	}
	const cardW = maxCardW;
	const cardH = maxCardH;
	const channelW = Math.max(12, opts.nodeSpacing);
	const channelH = Math.max(6, Math.round(opts.nodeSpacing / 2));
	const slotW = cardW + channelW;
	const slotH = cardH + channelH;

	const tallestColumn = Math.max(1, ...buckets.map((b) => b.nodeIds.length));
	const cardsWorldHeight = tallestColumn * slotH;
	const cardsWorldWidth = buckets.length * slotW;

	// --- 6. Place cards. Column x = leftPad + (i+0.5)*slotW; cards
	// stack DOWNWARD from y=0 (bottom of the stack ends at
	// cardsWorldHeight). Bottom-card-first ordering reads naturally as
	// "small intersections near the matrix, mass piles up at the top".
	const leftPad = slotW * 0.5;
	const positionedNodes: PositionedNode[] = [];
	const columns: UpsetMeta["columns"] = buckets.map((bucket, ci) => {
		const xWorld = leftPad + ci * slotW + slotW / 2;
		for (let j = 0; j < bucket.nodeIds.length; j++) {
			const id = bucket.nodeIds[j];
			const node = data.nodes.find((n) => n.id === id);
			if (!node) continue;
			const s = sizedById.get(id);
			const w = s?.width ?? cardW;
			const h = s?.height ?? cardH;
			// Bottom-most card at j=last; top-most at j=0.
			const yCentre = cardsWorldHeight - (bucket.nodeIds.length - j - 0.5) * slotH;
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

	return {
		nodes: positionedNodes,
		edges: [],
		clusters: [],
		trunks: [],
		slotW,
		slotH,
		channelW,
		channelH,
		upset: {
			sets,
			columns,
			cardsWorldWidth: cardsWorldWidth + leftPad * 2,
			cardsWorldHeight,
			cardSlotW: slotW,
			cardSlotH: slotH,
		},
	};
}
