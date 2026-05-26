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
	// Matrix viewport (clipped scroll area). totalH > viewportH ⇒ scroll.
	matrixViewportTopY: number;
	matrixViewportBottomY: number;
	matrixTopY: number; // first set row centre offset by scrollY
	matrixBottomY: number;
	matrixTotalH: number;
	matrixViewportH: number;
	maxScrollY: number;
	setRows: Array<{ key: string; label: string; size: number; y: number }>;
	colXs: number[];
	dotR: number;
	showSetLabels: boolean;
}

// Footer is a screen-fixed MINI-MAP — it always shows ALL columns at
// a uniform pitch regardless of how the user pans / zooms the main
// canvas. A viewport rectangle on top of the matrix shows which
// columns are currently visible above (`drawViewportIndicator`).
// Footer height is locked to canvasH/4; the set-row matrix scrolls
// internally when its total height exceeds the viewport, fonts stay
// constant.
export function computeUpsetScreenLayout(
	u: UpsetMeta,
	canvasW: number,
	canvasH: number,
	zoom: number,
	panX: number,
	scrollY: number,
): UpsetScreenLayout {
	void zoom;
	void panX;
	const sets = u.sets.length;
	const cols = u.columns.length;
	const footerH = Math.max(120, Math.floor(canvasH * 0.25));
	const footerTopY = canvasH - footerH;
	const footerBottomY = canvasH;
	const padTop = 6;
	const barAreaTopY = footerTopY + padTop;
	const barAreaBottomY = barAreaTopY + BAR_AREA_H;
	const matrixViewportTopY = barAreaBottomY + 6;
	const matrixViewportBottomY = footerBottomY - 6;
	const matrixViewportH = Math.max(0, matrixViewportBottomY - matrixViewportTopY);
	const matrixTotalH = sets * ROW_H;
	const maxScrollY = Math.max(0, matrixTotalH - matrixViewportH);
	const clampedScroll = Math.max(0, Math.min(scrollY, maxScrollY));
	const matrixTopY = matrixViewportTopY - clampedScroll;
	const matrixBottomY = matrixTopY + matrixTotalH;
	const leftBandX = 8;
	const matrixLeftX = LEFT_BAND_W;
	// Matrix column pitch = (matrix viewport width) / numCols, capped
	// at IDEAL_COL_W so the matrix doesn't blow up when there are few
	// columns and the bars can stay reasonable. Floor at MIN_COL_W so
	// the dots stay clickable; with too many columns the matrix
	// overflows and the user can h-scroll inside the matrix viewport.
	const matrixUsableW = Math.max(
		MIN_COL_W * Math.max(cols, 1),
		canvasW - matrixLeftX - 16,
	);
	const colW = cols > 0
		? Math.max(MIN_COL_W, Math.min(IDEAL_COL_W, matrixUsableW / cols))
		: IDEAL_COL_W;
	const setRows = u.sets.map((s, idx) => ({
		key: s.key,
		label: s.label,
		size: s.size,
		y: matrixTopY + (idx + 0.5) * ROW_H,
	}));
	// Independent column positions — no longer tied to world panX.
	const colXs = u.columns.map((_, idx) => matrixLeftX + (idx + 0.5) * colW);
	const dotR = Math.max(3, Math.min(ROW_H * 0.32, colW * 0.4));
	const showSetLabels = colW >= MIN_COL_W;
	return {
		footerTopY,
		footerBottomY,
		leftBandX,
		matrixLeftX,
		colW,
		barAreaTopY,
		barAreaBottomY,
		matrixViewportTopY,
		matrixViewportBottomY,
		matrixTopY,
		matrixBottomY,
		matrixTotalH,
		matrixViewportH,
		maxScrollY,
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
	scrollY: number,
	selectedSignatureKey: string | null,
	scrollbarDragActive: boolean,
): void {
	const u = laid.upset;
	if (!u) return;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	const L = computeUpsetScreenLayout(u, canvasW, canvasH, zoom, panX, scrollY);
	// Mark which columns are visible in main — drives the viewport
	// indicator + the dim/bright styling so the user can read off
	// "this is what the cards above are showing right now".
	const visibleCols = computeVisibleColumns(u, canvasW, canvasH, zoom, panX, L);
	ctx.fillStyle = "#0f1116";
	ctx.fillRect(0, L.footerTopY, canvasW, canvasH - L.footerTopY);
	ctx.strokeStyle = "rgba(120, 130, 150, 0.35)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, L.footerTopY + 0.5);
	ctx.lineTo(canvasW, L.footerTopY + 0.5);
	ctx.stroke();
	drawColumnBars(ctx, u, L, visibleCols);
	ctx.save();
	ctx.beginPath();
	ctx.rect(
		0,
		L.matrixViewportTopY,
		canvasW,
		L.matrixViewportBottomY - L.matrixViewportTopY,
	);
	ctx.clip();
	drawRowTracks(ctx, u, L, canvasW);
	drawSetSizeBars(ctx, u, L);
	drawSetLabels(ctx, u, L);
	drawMatrixDots(ctx, u, L, selectedSignatureKey, visibleCols);
	drawViewportIndicator(ctx, L, visibleCols);
	ctx.restore();
	const hScrollbar = computeUpsetHScrollbar(
		L,
		canvasW,
		zoom,
		panX,
		u.cardsWorldWidth,
	);
	drawScrollbars(ctx, L, canvasW, scrollbarDragActive, hScrollbar);
	drawSelectedColumnFrame(ctx, u, L, selectedSignatureKey);
}

// Indices of columns whose card stack is at least partially visible
// in the MAIN canvas area (= above the footer). Used to: (1) draw a
// "what main is showing right now" rectangle on the matrix; (2) dim
// out-of-view dots and bars so the active subset is unmistakable.
function computeVisibleColumns(
	u: UpsetMeta,
	canvasW: number,
	canvasH: number,
	zoom: number,
	panX: number,
	L: UpsetScreenLayout,
): { firstIdx: number; lastIdx: number; xLeft: number; xRight: number } | null {
	if (u.columns.length === 0) return null;
	const mainBottomY = L.footerTopY;
	void mainBottomY;
	void canvasH;
	let firstIdx = -1;
	let lastIdx = -1;
	for (let i = 0; i < u.columns.length; i++) {
		const sx = u.columns[i].xWorld * zoom + panX;
		if (sx >= 0 && sx <= canvasW) {
			if (firstIdx < 0) firstIdx = i;
			lastIdx = i;
		}
	}
	if (firstIdx < 0) return null;
	return {
		firstIdx,
		lastIdx,
		xLeft: L.colXs[firstIdx] - L.colW / 2,
		xRight: L.colXs[lastIdx] + L.colW / 2,
	};
}

function drawViewportIndicator(
	ctx: CanvasRenderingContext2D,
	L: UpsetScreenLayout,
	visibleCols: ReturnType<typeof computeVisibleColumns>,
): void {
	if (!visibleCols) return;
	const top = L.matrixViewportTopY;
	const bottom = L.matrixViewportBottomY;
	const x = visibleCols.xLeft;
	const w = visibleCols.xRight - visibleCols.xLeft;
	ctx.fillStyle = "rgba(255, 200, 80, 0.10)";
	ctx.fillRect(x, top, w, bottom - top);
	ctx.strokeStyle = "rgba(255, 200, 80, 0.55)";
	ctx.lineWidth = 1.5;
	ctx.strokeRect(x + 0.5, top + 0.5, w - 1, bottom - top - 1);
}

// Scrollbar geometry exposed for hit-testing in view.ts.
export interface UpsetScrollbar {
	trackX: number;
	trackY: number;
	trackW: number;
	trackH: number;
	thumbX: number;
	thumbY: number;
	thumbW: number;
	thumbH: number;
	orientation: "vertical" | "horizontal";
}

const SCROLLBAR_W = 10;
const SCROLLBAR_GAP = 4; // padding between scrollbars and canvas edges

export function computeUpsetVScrollbar(
	L: UpsetScreenLayout,
	canvasW: number,
	hasHScroll: boolean,
): UpsetScrollbar | null {
	if (L.maxScrollY <= 0) return null;
	const trackW = SCROLLBAR_W;
	const trackX = canvasW - trackW - SCROLLBAR_GAP;
	const trackY = L.matrixViewportTopY + 2;
	const bottomReserve = hasHScroll ? SCROLLBAR_W + SCROLLBAR_GAP * 2 : 4;
	const trackH = Math.max(40, L.matrixViewportH - bottomReserve);
	const ratio = L.matrixViewportH / L.matrixTotalH;
	const thumbH = Math.max(24, trackH * ratio);
	const scrolled = -(L.matrixTopY - L.matrixViewportTopY);
	const thumbY = trackY + (trackH - thumbH) * (scrolled / L.maxScrollY);
	return {
		trackX,
		trackY,
		trackW,
		trackH,
		thumbX: trackX,
		thumbY,
		thumbW: trackW,
		thumbH,
		orientation: "vertical",
	};
}

// Horizontal scrollbar — represents the world's horizontal panX
// against the total card area's projected screen width.
// `contentW = cardsWorldWidth * zoom`. When content > canvas width
// the bar appears at the bottom of the matrix viewport. Dragging
// the thumb updates world panX (= cards and matrix shift together).
export function computeUpsetHScrollbar(
	L: UpsetScreenLayout,
	canvasW: number,
	zoom: number,
	panX: number,
	cardsWorldWidth: number,
): UpsetScrollbar | null {
	const contentW = cardsWorldWidth * zoom;
	if (contentW <= canvasW) return null;
	const trackH = SCROLLBAR_W;
	const trackX = L.matrixLeftX;
	const trackW = Math.max(
		40,
		canvasW - L.matrixLeftX - SCROLLBAR_GAP - (SCROLLBAR_W + SCROLLBAR_GAP),
	);
	const trackY = L.footerBottomY - trackH - SCROLLBAR_GAP;
	const ratio = canvasW / contentW;
	const thumbW = Math.max(24, trackW * ratio);
	// panX = 0 ⇒ content left flush with canvas left (thumb at start).
	// panX = canvasW - contentW (negative) ⇒ content right flush (thumb end).
	const maxPanX = 0;
	const minPanX = canvasW - contentW;
	const clamped = Math.max(minPanX, Math.min(maxPanX, panX));
	const t = (maxPanX - clamped) / (maxPanX - minPanX);
	const thumbX = trackX + (trackW - thumbW) * t;
	return {
		trackX,
		trackY,
		trackW,
		trackH,
		thumbX,
		thumbY: trackY,
		thumbW,
		thumbH: trackH,
		orientation: "horizontal",
	};
}

function drawScrollbars(
	ctx: CanvasRenderingContext2D,
	L: UpsetScreenLayout,
	canvasW: number,
	dragActive: boolean,
	hScrollbar: UpsetScrollbar | null,
): void {
	const v = computeUpsetVScrollbar(L, canvasW, hScrollbar != null);
	const paintBar = (s: UpsetScrollbar): void => {
		const thinDim = Math.min(s.trackW, s.trackH);
		roundRect(ctx, s.trackX, s.trackY, s.trackW, s.trackH, thinDim / 2);
		ctx.fillStyle = "rgba(100, 110, 130, 0.28)";
		ctx.fill();
		const tThin = Math.min(s.thumbW, s.thumbH);
		roundRect(ctx, s.thumbX, s.thumbY, s.thumbW, s.thumbH, tThin / 2);
		ctx.fillStyle = dragActive
			? "rgba(220, 230, 245, 0.85)"
			: "rgba(180, 195, 220, 0.65)";
		ctx.fill();
	};
	if (v) paintBar(v);
	if (hScrollbar) paintBar(hScrollbar);
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	const rr = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + rr, y);
	ctx.lineTo(x + w - rr, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
	ctx.lineTo(x + w, y + h - rr);
	ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
	ctx.lineTo(x + rr, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
	ctx.lineTo(x, y + rr);
	ctx.quadraticCurveTo(x, y, x + rr, y);
	ctx.closePath();
}

function drawColumnBars(
	ctx: CanvasRenderingContext2D,
	u: UpsetMeta,
	L: UpsetScreenLayout,
	visibleCols: ReturnType<typeof computeVisibleColumns>,
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
		const active =
			visibleCols == null ||
			(i >= visibleCols.firstIdx && i <= visibleCols.lastIdx);
		ctx.fillStyle = active
			? "rgba(150, 170, 200, 0.95)"
			: "rgba(110, 125, 145, 0.45)";
		ctx.fillRect(x - barW / 2, top, barW, h);
		if (h > SMALL_FONT_PX + 4 && L.colW >= 14) {
			ctx.fillStyle = active
				? "rgba(220, 225, 235, 0.95)"
				: "rgba(180, 190, 210, 0.55)";
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
	visibleCols: ReturnType<typeof computeVisibleColumns>,
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
		const active =
			visibleCols == null ||
			(i >= visibleCols.firstIdx && i <= visibleCols.lastIdx);
		const alpha = active ? 1 : 0.35;
		if (isFinite(topY) && botY > topY) {
			ctx.strokeStyle = highlighted
				? HIGHLIGHT
				: `rgba(180, 195, 220, ${0.85 * alpha})`;
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
					: `hsla(${clusterHue(set.key)}, 65%, 65%, ${alpha})`;
				ctx.beginPath();
				ctx.arc(x, y, L.dotR, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillStyle = `rgba(70, 80, 95, ${0.55 * alpha})`;
				ctx.beginPath();
				ctx.arc(x, y, Math.max(1.5, L.dotR * 0.45), 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}
}

// Column count numerals are drawn ABOVE the column bars by
// drawColumnBars (when the bar is tall enough). The separate
// "counts row" was removed when the footer scroll viewport took over
// the bottom band.

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
	scrollY: number,
	screenX: number,
	screenY: number,
): string | null {
	const L = computeUpsetScreenLayout(u, canvasW, canvasH, zoom, panX, scrollY);
	if (screenY < L.barAreaTopY || screenY > L.matrixViewportBottomY) return null;
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
