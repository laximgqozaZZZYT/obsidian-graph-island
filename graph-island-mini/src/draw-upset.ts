// UpSet plot rendering — the matrix band that sits below the card
// stacks. Cards themselves are rendered by the normal card pipeline;
// this module only paints the auxiliary set-labels / dot-matrix /
// size-bars layer.
import type { LaidOut, UpsetMeta } from "./layout";
import { clusterHue } from "./canvas-utils";

export function drawUpset(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	zoom: number,
): void {
	const u = laid.upset;
	if (!u) return;
	drawSetSizeBars(ctx, u, zoom);
	drawSetLabels(ctx, u, zoom);
	drawColumnGuides(ctx, u, zoom);
	drawMatrixDots(ctx, u, zoom);
	drawColumnCounts(ctx, u, zoom);
}

// Pale grey background bar per matrix row so the dot row reads as a
// horizontal track even when no dots are filled in a region.
function drawColumnGuides(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	zoom: number,
): void {
	if (u.sets.length === 0 || u.columns.length === 0) return;
	const rowH = u.matrixRowH;
	const trackH = Math.max(2, rowH * 0.92);
	const left = u.columns[0].x - rowH * 0.6;
	const right = u.columns[u.columns.length - 1].x + rowH * 0.6;
	ctx.fillStyle = "rgba(120, 130, 150, 0.10)";
	for (const set of u.sets) {
		ctx.fillRect(left, set.y - trackH / 2, right - left, trackH);
	}
	void zoom;
}

// Horizontal bars to the LEFT of the matrix indicating each set's
// total size (= number of nodes that belong to the set, summed across
// all intersection columns). Bars are right-anchored at `setLabelX`.
function drawSetSizeBars(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	zoom: number,
): void {
	if (u.sets.length === 0) return;
	const maxSize = Math.max(1, ...u.sets.map((s) => s.size));
	const maxBarW = Math.max(60, u.setLabelX * 0.45);
	const barH = Math.max(4, u.matrixRowH * 0.45);
	for (const set of u.sets) {
		const w = (set.size / maxSize) * maxBarW;
		const x = u.setLabelX - w;
		const y = set.y - barH / 2;
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 60%, 0.55)`;
		ctx.fillRect(x, y, w, barH);
		ctx.strokeStyle = `hsla(${clusterHue(set.key)}, 65%, 70%, 0.85)`;
		ctx.lineWidth = 1 / zoom;
		ctx.strokeRect(x, y, w, barH);
		// Numeric size at the bar's left edge (for cardinality precision).
		ctx.fillStyle = "rgba(220, 225, 235, 0.85)";
		ctx.font = `${10 / zoom}px sans-serif`;
		ctx.textBaseline = "middle";
		ctx.textAlign = "end";
		ctx.fillText(String(set.size), x - 4 / zoom, set.y);
	}
}

// Set names right-aligned just to the LEFT of the dot matrix.
function drawSetLabels(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	zoom: number,
): void {
	ctx.font = `${12 / zoom}px sans-serif`;
	ctx.textBaseline = "middle";
	ctx.textAlign = "end";
	for (const set of u.sets) {
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 80%, 1)`;
		ctx.fillText(set.label, u.setLabelX - 6 / zoom, set.y);
	}
}

// One dot per (set, column). Filled if the set participates in that
// intersection, empty (= small grey ring) otherwise. Filled dots in
// the same column are connected by a vertical line so the eye picks
// out the intersection at a glance — this is the bit that makes
// ≥4-way intersections legible.
function drawMatrixDots(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	zoom: number,
): void {
	const r = u.dotR;
	const setIndex = new Map<string, number>();
	u.sets.forEach((s, i) => setIndex.set(s.key, i));
	for (const col of u.columns) {
		const inColumn = new Set(col.signature);
		// Find min/max y of filled dots for the connector line.
		let topY = Infinity;
		let botY = -Infinity;
		for (const setKey of col.signature) {
			const i = setIndex.get(setKey);
			if (i == null) continue;
			const y = u.sets[i].y;
			if (y < topY) topY = y;
			if (y > botY) botY = y;
		}
		if (isFinite(topY) && botY > topY) {
			ctx.strokeStyle = "rgba(180, 195, 220, 0.75)";
			// 2 device pixels regardless of zoom — thinner than the dot
			// radius so the dots stay clearly visible on top of the line.
			ctx.lineWidth = 2 / zoom;
			ctx.beginPath();
			ctx.moveTo(col.x, topY);
			ctx.lineTo(col.x, botY);
			ctx.stroke();
		}
		for (const set of u.sets) {
			const y = set.y;
			if (inColumn.has(set.key)) {
				ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 65%, 1)`;
				ctx.beginPath();
				ctx.arc(col.x, y, r, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillStyle = "rgba(70, 80, 95, 0.55)";
				ctx.beginPath();
				ctx.arc(col.x, y, r * 0.55, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
}

// Intersection-size number above each column (= same role as the
// vertical bars in canonical UpSet, but compact since the card stack
// already encodes the size visually by its height).
function drawColumnCounts(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	zoom: number,
): void {
	ctx.font = `${11 / zoom}px sans-serif`;
	ctx.fillStyle = "rgba(220, 225, 235, 0.85)";
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	// Place the count just BELOW the matrix bottom (so it reads naturally
	// "column → count"). Distance scales with row height.
	const y = u.matrixBottomY + u.matrixRowH * 0.85;
	for (const col of u.columns) {
		ctx.fillText(String(col.size), col.x, y);
	}
}
