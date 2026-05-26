// UpSet plot renderer — screen-space footer.
//
// The UpSet plot is pinned to the BOTTOM of the canvas in SCREEN
// pixels: fonts, dots, bars, paddings all keep a constant physical
// size regardless of the user's world-space pan/zoom. The plot's
// total height is computed from its content (set rows + column bar
// band + numerals) — when the plot's natural height exceeds the
// canvas, the top of the plot just extends upward into the canvas
// area (cards aren't drawn in UpSet mode, so there's nothing to
// collide with).
//
// LOD trigger is COLUMN WIDTH IN SCREEN PIXELS, not zoom — that
// keeps Phase B (min font size) and Phase D (LOD) on the same axis
// instead of fighting each other.
import type { LaidOut, UpsetMeta } from "./layout";
import { clusterHue } from "./canvas-utils";

const FONT_PX = 12;
const SMALL_FONT_PX = 10;
const ROW_H = 22;
const BAR_AREA_H = 80;
const COL_COUNT_H = 18;
const SET_LABEL_PAD = 8;
const SET_LABEL_BAND_W = 140;
const SET_SIZE_BAR_BAND_W = 70;
const LEFT_BAND_W = SET_LABEL_BAND_W + SET_SIZE_BAR_BAND_W + 16;
const MIN_COL_W = 6;
const IDEAL_COL_W = 22;
const HIGHLIGHT = "rgba(255, 157, 63, 0.9)";

export interface UpsetScreenLayout {
	footerTopY: number;
	footerBottomY: number;
	leftBandX: number;
	matrixLeftX: number;
	colW: number;
	barAreaTopY: number;
	barAreaBottomY: number;
	matrixTopY: number;
	matrixBottomY: number;
	countsTopY: number;
	setRows: Array<{ key: string; label: string; size: number; y: number }>;
	colXs: number[];
	dotR: number;
	showSetLabels: boolean;
}

// Footer screen layout. Column x positions are derived from the
// CARDS' world-space column x via the current pan/zoom transform, so
// the matrix dot column always sits directly under its card stack.
export function computeUpsetScreenLayout(
	u: UpsetMeta,
	canvasW: number,
	canvasH: number,
	zoom: number,
	panX: number,
): UpsetScreenLayout {
	const cols = u.columns.length;
	const sets = u.sets.length;
	const colW = Math.max(MIN_COL_W, u.cardSlotW * zoom);
	const totalH = BAR_AREA_H + sets * ROW_H + COL_COUNT_H + 24;
	const footerTopY = Math.max(0, canvasH - totalH);
	const footerBottomY = canvasH;
	const barAreaTopY = footerTopY + 8;
	const barAreaBottomY = barAreaTopY + BAR_AREA_H;
	const matrixTopY = barAreaBottomY + 8;
	const matrixBottomY = matrixTopY + sets * ROW_H;
	const countsTopY = matrixBottomY + 2;
	const leftBandX = 8;
	const matrixLeftX = LEFT_BAND_W;
	const setRows = u.sets.map((s, idx) => ({
		key: s.key,
		label: s.label,
		size: s.size,
		y: matrixTopY + (idx + 0.5) * ROW_H,
	}));
	// Screen x for each column = world x * zoom + panX. Same transform
	// the card pipeline uses, so cards and dots stay vertically aligned.
	const colXs = u.columns.map((c) => c.xWorld * zoom + panX);
	const dotR = Math.max(3, Math.min(ROW_H * 0.32, colW * 0.4));
	const showSetLabels = colW >= MIN_COL_W;
	void cols;
	return {
		footerTopY,
		footerBottomY,
		leftBandX,
		matrixLeftX,
		colW,
		barAreaTopY,
		barAreaBottomY,
		matrixTopY,
		matrixBottomY,
		countsTopY,
		setRows,
		colXs,
		dotR,
		showSetLabels,
	};
}

export function drawUpset(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	canvasW: number,
	canvasH: number,
	dpr: number,
	zoom: number,
	panX: number,
	selectedSignatureKey: string | null,
): void {
	const u = laid.upset;
	if (!u) return;
	// Detach from the world transform: SCREEN-space rendering.
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	const L = computeUpsetScreenLayout(u, canvasW, canvasH, zoom, panX);
	// Footer background — subtle so it reads as a distinct band over
	// the world canvas above.
	ctx.fillStyle = "rgba(15, 17, 22, 0.92)";
	ctx.fillRect(0, L.footerTopY, canvasW, canvasH - L.footerTopY);
	ctx.strokeStyle = "rgba(120, 130, 150, 0.35)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, L.footerTopY + 0.5);
	ctx.lineTo(canvasW, L.footerTopY + 0.5);
	ctx.stroke();
	drawColumnBars(ctx, u, L);
	drawRowTracks(ctx, u, L, canvasW);
	drawSetSizeBars(ctx, u, L);
	drawSetLabels(ctx, u, L);
	drawMatrixDots(ctx, u, L, selectedSignatureKey);
	drawColumnCounts(ctx, u, L);
	drawSelectedColumnFrame(ctx, u, L, selectedSignatureKey);
}

function drawColumnBars(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
): void {
	if (u.columns.length === 0) return;
	const maxSize = Math.max(1, ...u.columns.map((c) => c.size));
	const usableH = L.barAreaBottomY - L.barAreaTopY - 16;
	ctx.textAlign = "center";
	ctx.textBaseline = "bottom";
	ctx.font = `${SMALL_FONT_PX}px sans-serif`;
	for (let i = 0; i < u.columns.length; i++) {
		const c = u.columns[i];
		const x = L.colXs[i];
		const h = (c.size / maxSize) * usableH;
		const top = L.barAreaBottomY - h;
		const barW = Math.max(3, Math.min(L.colW * 0.7, 14));
		ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
		ctx.fillRect(x - barW / 2, top, barW, h);
		// Numeral above the bar (only when there's vertical room).
		if (h > SMALL_FONT_PX + 4 && L.colW >= 14) {
			ctx.fillStyle = "rgba(220, 225, 235, 0.9)";
			ctx.fillText(String(c.size), x, top - 2);
		}
	}
}

function drawRowTracks(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
	canvasW: number,
): void {
	const trackH = ROW_H * 0.92;
	ctx.fillStyle = "rgba(120, 130, 150, 0.08)";
	for (const set of L.setRows) {
		ctx.fillRect(
			L.matrixLeftX,
			set.y - trackH / 2,
			canvasW - L.matrixLeftX - 4,
			trackH,
		);
		void u;
	}
}

function drawSetSizeBars(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
): void {
	if (u.sets.length === 0) return;
	const maxSize = Math.max(1, ...u.sets.map((s) => s.size));
	const maxBarW = SET_SIZE_BAR_BAND_W - 8;
	const barH = Math.max(4, ROW_H * 0.5);
	const rightX = SET_LABEL_BAND_W + SET_SIZE_BAR_BAND_W;
	ctx.font = `${SMALL_FONT_PX}px sans-serif`;
	ctx.textAlign = "end";
	ctx.textBaseline = "middle";
	for (const set of L.setRows) {
		const w = (set.size / maxSize) * maxBarW;
		const x = rightX - w;
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 55%, 0.65)`;
		ctx.fillRect(x, set.y - barH / 2, w, barH);
		ctx.fillStyle = "rgba(220, 225, 235, 0.85)";
		ctx.fillText(String(set.size), x - 4, set.y);
	}
}

function drawSetLabels(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
): void {
	if (!L.showSetLabels) return;
	ctx.font = `${FONT_PX}px sans-serif`;
	ctx.textAlign = "end";
	ctx.textBaseline = "middle";
	for (const set of L.setRows) {
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 80%, 1)`;
		const label = ellipsise(ctx, set.label, SET_LABEL_BAND_W - SET_LABEL_PAD);
		ctx.fillText(label, SET_LABEL_BAND_W - SET_LABEL_PAD, set.y);
	}
	void u;
}

function drawMatrixDots(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
	selectedSignatureKey: string | null,
): void {
	const setIdx = new Map<string, number>();
	u.sets.forEach((s, i) => setIdx.set(s.key, i));
	for (let i = 0; i < u.columns.length; i++) {
		const col = u.columns[i];
		const x = L.colXs[i];
		const inCol = new Set(col.signature);
		let topY = Infinity;
		let botY = -Infinity;
		for (const k of col.signature) {
			const ridx = setIdx.get(k);
			if (ridx == null) continue;
			const y = L.setRows[ridx].y;
			if (y < topY) topY = y;
			if (y > botY) botY = y;
		}
		const key = col.signature.join("|");
		const highlighted = selectedSignatureKey === key;
		if (isFinite(topY) && botY > topY) {
			ctx.strokeStyle = highlighted ? HIGHLIGHT : "rgba(180, 195, 220, 0.85)";
			ctx.lineWidth = highlighted ? 2.4 : 1.8;
			ctx.beginPath();
			ctx.moveTo(x, topY);
			ctx.lineTo(x, botY);
			ctx.stroke();
		}
		for (const set of L.setRows) {
			const y = set.y;
			if (inCol.has(set.key)) {
				ctx.fillStyle = highlighted
					? HIGHLIGHT
					: `hsla(${clusterHue(set.key)}, 65%, 65%, 1)`;
				ctx.beginPath();
				ctx.arc(x, y, L.dotR, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillStyle = "rgba(70, 80, 95, 0.55)";
				ctx.beginPath();
				ctx.arc(x, y, Math.max(1.5, L.dotR * 0.45), 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
}

function drawColumnCounts(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
): void {
	// Counts are also drawn above the column bars; this row is the
	// LAST resort when columns are too narrow for that. Skip
	// entirely when the column is narrower than the numeral itself.
	if (L.colW < 14) return;
	ctx.font = `${SMALL_FONT_PX}px sans-serif`;
	ctx.fillStyle = "rgba(180, 190, 210, 0.75)";
	ctx.textAlign = "center";
	ctx.textBaseline = "top";
	const y = L.countsTopY;
	for (let i = 0; i < u.columns.length; i++) {
		ctx.fillText(String(u.columns[i].size), L.colXs[i], y);
	}
}

function drawSelectedColumnFrame(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
	selectedSignatureKey: string | null,
): void {
	if (!selectedSignatureKey) return;
	const idx = u.columns.findIndex(
		(c) => c.signature.join("|") === selectedSignatureKey,
	);
	if (idx < 0) return;
	const x = L.colXs[idx];
	const w = L.colW;
	ctx.strokeStyle = HIGHLIGHT;
	ctx.lineWidth = 1.5;
	ctx.strokeRect(
		x - w / 2,
		L.barAreaTopY,
		w,
		L.matrixBottomY - L.barAreaTopY,
	);
}

// Hit-test helper used by the canvas click handler in view.ts. Returns
// the column's signature key when the click landed on a column.
export function hitTestUpsetColumn(
	u: UpsetMeta,
	canvasW: number,
	canvasH: number,
	zoom: number,
	panX: number,
	screenX: number,
	screenY: number,
): string | null {
	const L = computeUpsetScreenLayout(u, canvasW, canvasH, zoom, panX);
	if (screenY < L.barAreaTopY || screenY > L.matrixBottomY) return null;
	for (let i = 0; i < u.columns.length; i++) {
		const x = L.colXs[i];
		if (Math.abs(screenX - x) <= L.colW / 2) {
			return u.columns[i].signature.join("|");
		}
	}
	return null;
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
		const slice = text.slice(0, mid) + ell;
		if (ctx.measureText(slice).width <= maxW) lo = mid;
		else hi = mid - 1;
	}
	return text.slice(0, lo) + ell;
}
