// UpSet plot layout.
//
// Given the same `(GraphData, SizedNode[])` input the Euler pipeline
// consumes, this module produces a `LaidOut` where:
//   - Each unique membership signature becomes ONE column.
//   - Every node belonging to that signature is stacked vertically
//     inside the column (one card per row), so every element stays
//     individually visible — the Euler pipeline's aggregation does
//     NOT happen here.
//   - Below the cards a dot-matrix indicates which sets (= clusters)
//     each column belongs to. ≥4-way intersections fall out for free
//     because a column with 4+ filled dots is no different from one
//     with 2.
//   - To the left of the matrix, set labels are right-aligned next to
//     their dot row + a horizontal size bar.
//
// Edges and cluster enclosures are intentionally empty in this mode —
// the matrix carries the relational information.
import type { GraphData } from "./types";
import type { LaidOut, PositionedNode, UpsetMeta } from "./layout";

export interface UpsetLayoutOptions {
	cellW: number;
	cellH: number;
	nodeSpacing: number; // horizontal channel between columns
	clusterLabels: Map<string, string>;
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

	// --- 1. Determine sets (rows) and their total sizes.
	const setSizes = new Map<string, number>();
	for (const n of data.nodes) {
		for (const m of n.memberships) {
			setSizes.set(m, (setSizes.get(m) ?? 0) + 1);
		}
	}
	const setKeys = [...setSizes.keys()].sort((a, b) => {
		// Larger sets first; alphabetical tiebreak so the row order is
		// deterministic between renders.
		const da = setSizes.get(b)! - setSizes.get(a)!;
		return da !== 0 ? da : a.localeCompare(b);
	});

	// --- 2. Bucket nodes by their exact membership signature.
	const sigToNodes = new Map<string, { signature: string[]; nodeIds: string[] }>();
	for (const n of data.nodes) {
		// Empty-membership nodes can't appear in any intersection; skip
		// (they'd otherwise produce a phantom "no set" column).
		if (n.memberships.length === 0) continue;
		const sorted = [...n.memberships].sort();
		const key = sorted.join("");
		const entry = sigToNodes.get(key);
		if (entry) entry.nodeIds.push(n.id);
		else sigToNodes.set(key, { signature: sorted, nodeIds: [n.id] });
	}
	const sigs = [...sigToNodes.values()].sort((a, b) => {
		// Largest intersection first; if tied, smaller-degree set
		// combinations first (= shorter signature), then alphabetical.
		if (b.nodeIds.length !== a.nodeIds.length)
			return b.nodeIds.length - a.nodeIds.length;
		if (a.signature.length !== b.signature.length)
			return a.signature.length - b.signature.length;
		return a.signature.join().localeCompare(b.signature.join());
	});

	// --- 3. Geometry.
	const cardW = opts.cellW > 0 ? opts.cellW : 80;
	const cardH = opts.cellH > 0 ? opts.cellH : 24;
	const channelW = Math.max(12, opts.nodeSpacing);
	const channelH = Math.max(6, Math.round(opts.nodeSpacing / 2));
	const slotW = cardW + channelW;
	const slotH = cardH + channelH;

	// Tallest column dictates the cards band height; matrix begins
	// below that with a small gap.
	const tallestColumnCards = sigs.reduce(
		(m, s) => Math.max(m, s.nodeIds.length),
		1,
	);
	const cardsTopY = 0;
	const cardsBottomY = cardsTopY + tallestColumnCards * slotH;

	const matrixGap = slotH;
	const matrixRowH = Math.max(slotH * 0.7, cardH * 0.9);
	const matrixTopY = cardsBottomY + matrixGap;
	const matrixBottomY = matrixTopY + setKeys.length * matrixRowH;

	// Set label band on the left of the matrix. Width is generous so
	// long labels stay readable; columns start AFTER this band.
	const setLabelWidth = Math.max(cardW * 1.6, 160);
	const setLabelX = setLabelWidth; // right-edge of label band
	const matrixLeftX = setLabelX + channelW;

	// Place each column centre. The leftmost column sits just to the
	// right of the label band.
	const columns: UpsetMeta["columns"] = sigs.map((sig, idx) => ({
		signature: sig.signature,
		nodeIds: sig.nodeIds,
		size: sig.nodeIds.length,
		x: matrixLeftX + slotW / 2 + idx * slotW,
	}));

	// --- 4. Position the cards. Each column's cards stack from the
	// bottom upward so the visual "tower" height encodes intersection
	// size (taller column = bigger intersection — UpSet bar analogue).
	const positionedNodes: PositionedNode[] = [];
	for (const col of columns) {
		// Stable order inside the column: by node id so the same
		// intersection always renders the same way.
		col.nodeIds.sort((a, b) => a.localeCompare(b));
		for (let i = 0; i < col.nodeIds.length; i++) {
			const id = col.nodeIds[i];
			const node = data.nodes.find((n) => n.id === id);
			if (!node) continue;
			const s = sizedById.get(id);
			const w = s?.width ?? cardW;
			const h = s?.height ?? cardH;
			// Stack from bottom: index 0 sits flush with cardsBottomY.
			const cy = cardsBottomY - (i + 0.5) * slotH;
			const cx = col.x;
			positionedNodes.push({
				...node,
				x: cx,
				y: cy,
				width: w,
				height: h,
			} as PositionedNode);
		}
	}

	// --- 5. Set rows: y centres aligned with matrix rows.
	const sets: UpsetMeta["sets"] = setKeys.map((key, idx) => ({
		key,
		label: opts.clusterLabels.get(key) ?? key,
		size: setSizes.get(key) ?? 0,
		y: matrixTopY + (idx + 0.5) * matrixRowH,
	}));

	const dotR = Math.max(4, Math.min(matrixRowH * 0.32, slotW * 0.2));

	const upset: UpsetMeta = {
		sets,
		columns,
		cardsBottomY,
		matrixTopY,
		matrixRowH,
		matrixBottomY,
		setLabelX,
		matrixLeftX,
		dotR,
	};

	return {
		nodes: positionedNodes,
		edges: [],
		clusters: [],
		trunks: [],
		slotW,
		slotH,
		channelW,
		channelH,
		upset,
	};
}
