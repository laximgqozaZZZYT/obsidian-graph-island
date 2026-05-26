// UpSet renderer — hybrid world + screen.
//
//   - Cards + matrix DOTS / CONNECTORS live in world space. They pan
//     and zoom with the cards above, so a dot column always sits
//     directly under its card stack.
//   - The row LABEL band (set names + per-set size bars) is pinned
//     to the LEFT edge of the canvas in SCREEN space. Its rows align
//     vertically with the matrix rows by projecting each row's
//     world Y through the current pan/zoom.
//
// Row filter (2026-05-26 spec): only sets that the currently-visible
// columns touch get a row. Fallback to the full set list when no
// column is on-screen so the band never goes empty.
import type { LaidOut } from "./layout";
import { clusterHue } from "./canvas-utils";

const ROW_H_FACTOR = 0.55;
const DOT_R_FACTOR = 0.22;
const MATRIX_GAP_FACTOR = 0.5;
const HIGHLIGHT = "rgba(255, 157, 63, 0.9)";

// Screen-fixed label band geometry.
export const LABEL_BAND_PX = 160;
const LABEL_FONT_PX = 12;
const SMALL_FONT_PX = 10;
const SET_LABEL_BAND_PX = 100;
const SIZE_BAR_BAND_PX = LABEL_BAND_PX - SET_LABEL_BAND_PX - 8;
const ROW_LABEL_PAD = 6;

export interface UpsetWorldLayout {
	matrixTopY: number; // world Y where the matrix starts (below cards)
	rowH: number; // world units
	dotR: number; // world units
	setRows: Array<{ key: string; label: string; size: number; y: number }>;
}

export function computeUpsetWorldLayout(
	laid: LaidOut,
	canvasW: number,
	zoom: number,
	panX: number,
): UpsetWorldLayout | null {
	const u = laid.upset;
	if (!u) return null;
	const cols = u.columns.length;
	let firstIdx = -1;
	let lastIdx = -1;
	for (let i = 0; i < cols; i++) {
		const sx = u.columns[i].xWorld * zoom + panX;
		if (sx >= LABEL_BAND_PX && sx <= canvasW) {
			if (firstIdx < 0) firstIdx = i;
			lastIdx = i;
		}
	}
	const activeKeys = new Set<string>();
	if (firstIdx >= 0) {
		for (let i = firstIdx; i <= lastIdx; i++) {
			for (const k of u.columns[i].signature) activeKeys.add(k);
		}
	}
	const activeSets =
		activeKeys.size > 0
			? u.sets.filter((s) => activeKeys.has(s.key))
			: u.sets;
	const slotH = u.cardSlotH;
	const slotW = u.cardSlotW;
	const rowH = slotH * ROW_H_FACTOR;
	const matrixTopY = u.cardsWorldHeight + slotH * MATRIX_GAP_FACTOR;
	const dotR = Math.max(2, Math.min(rowH, slotW) * DOT_R_FACTOR);
	const setRows = activeSets.map((s, idx) => ({
		key: s.key,
		label: s.label,
		size: s.size,
		y: matrixTopY + (idx + 0.5) * rowH,
	}));
	return { matrixTopY, rowH, dotR, setRows };
}

// World-space pass: matrix dots + connectors. Cards are drawn by the
// caller through the normal card pipeline; this only paints the
// matrix sub-band beneath them.
export function drawUpsetWorld(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	canvasW: number,
	zoom: number,
	panX: number,
	selectedSignatureKey: string | null,
): void {
	const u = laid.upset;
	if (!u) return;
	const L = computeUpsetWorldLayout(laid, canvasW, zoom, panX);
	if (!L) return;
	const setIdx = new Map<string, number>();
	L.setRows.forEach((s, i) => setIdx.set(s.key, i));
	// Row tracks (faint horizontal strips so empty rows still register).
	ctx.fillStyle = "rgba(120, 130, 150, 0.08)";
	const tracksLeft = -u.cardSlotW * 0.3;
	const tracksRight = u.cardsWorldWidth + u.cardSlotW * 0.2;
	for (const set of L.setRows) {
		ctx.fillRect(
			tracksLeft,
			set.y - L.rowH * 0.45,
			tracksRight - tracksLeft,
			L.rowH * 0.9,
		);
	}
	// Dots + connectors per column.
	for (let i = 0; i < u.columns.length; i++) {
		const col = u.columns[i];
		const x = col.xWorld;
		const inCol = new Set(col.signature);
		const key = col.signature.join("|");
		const highlighted = key === selectedSignatureKey;
		let topY = Infinity;
		let botY = -Infinity;
		for (const k of col.signature) {
			const ridx = setIdx.get(k);
			if (ridx == null) continue;
			const y = L.setRows[ridx].y;
			if (y < topY) topY = y;
			if (y > botY) botY = y;
		}
		if (isFinite(topY) && botY > topY) {
			ctx.strokeStyle = highlighted
				? HIGHLIGHT
				: "rgba(180, 195, 220, 0.85)";
			ctx.lineWidth = (highlighted ? 2.4 : 1.6) / zoom;
			ctx.beginPath();
			ctx.moveTo(x, topY);
			ctx.lineTo(x, botY);
			ctx.stroke();
		}
		for (const set of L.setRows) {
			if (inCol.has(set.key)) {
				ctx.fillStyle = highlighted
					? HIGHLIGHT
					: `hsla(${clusterHue(set.key)}, 65%, 65%, 1)`;
				ctx.beginPath();
				ctx.arc(x, set.y, L.dotR, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillStyle = "rgba(70, 80, 95, 0.55)";
				ctx.beginPath();
				ctx.arc(x, set.y, Math.max(0.5, L.dotR * 0.45), 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
}

// Screen-space pass: row label band fixed to the LEFT edge of the
// canvas. Row vertical positions are derived from world Y → screen Y
// so the label tracks its matrix row when the user pans/zooms.
export function drawUpsetScreen(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	canvasW: number,
	canvasH: number,
	dpr: number,
	zoom: number,
	panX: number,
	panY: number,
): void {
	const u = laid.upset;
	if (!u) return;
	const L = computeUpsetWorldLayout(laid, canvasW, zoom, panX);
	if (!L) return;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	// Opaque band background so card edges underneath don't bleed.
	ctx.fillStyle = "rgba(15, 17, 22, 0.94)";
	ctx.fillRect(0, 0, LABEL_BAND_PX, canvasH);
	ctx.strokeStyle = "rgba(120, 130, 150, 0.35)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(LABEL_BAND_PX + 0.5, 0);
	ctx.lineTo(LABEL_BAND_PX + 0.5, canvasH);
	ctx.stroke();
	// Row tracks (faint) inside the band so each row reads as a row.
	ctx.fillStyle = "rgba(120, 130, 150, 0.06)";
	const rowScreenH = L.rowH * zoom;
	const rowDrawH = Math.max(2, rowScreenH * 0.9);
	const labelRightX = SET_LABEL_BAND_PX;
	const sizeBarRightX = LABEL_BAND_PX - 6;
	const sizeBarMaxW = SIZE_BAR_BAND_PX - 8;
	const maxSize = Math.max(1, ...u.sets.map((s) => s.size));
	for (const set of L.setRows) {
		const sy = set.y * zoom + panY;
		if (sy < -rowDrawH || sy > canvasH + rowDrawH) continue;
		ctx.fillStyle = "rgba(120, 130, 150, 0.06)";
		ctx.fillRect(0, sy - rowDrawH / 2, LABEL_BAND_PX, rowDrawH);
		// Set name (right-aligned in its sub-band).
		ctx.font = `${LABEL_FONT_PX}px sans-serif`;
		ctx.textAlign = "end";
		ctx.textBaseline = "middle";
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 80%, 1)`;
		ctx.fillText(
			ellipsise(ctx, set.label, SET_LABEL_BAND_PX - ROW_LABEL_PAD),
			labelRightX - ROW_LABEL_PAD,
			sy,
		);
		// Size bar (in the right sub-band of the label band).
		const barW = (set.size / maxSize) * sizeBarMaxW;
		const barH = Math.max(4, rowScreenH * 0.45);
		const barX = sizeBarRightX - barW;
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 55%, 0.65)`;
		ctx.fillRect(barX, sy - barH / 2, barW, barH);
		ctx.font = `${SMALL_FONT_PX}px sans-serif`;
		ctx.fillStyle = "rgba(220, 225, 235, 0.85)";
		ctx.fillText(String(set.size), barX - 2, sy);
	}
}

function ellipsise(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxW: number,
): string {
	if (ctx.measureText(text).width <= maxW) return text;
	const ell = "…";
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		const s = text.slice(0, mid) + ell;
		if (ctx.measureText(s).width <= maxW) lo = mid;
		else hi = mid - 1;
	}
	return text.slice(0, lo) + ell;
}
