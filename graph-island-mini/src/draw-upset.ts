// UpSet matrix renderer — WORLD-SPACE integrated with the card stacks.
//
// Cards live in [y=0, y=cardsWorldHeight]. The matrix is laid out
// directly below the cards (= same world transform; pans / zooms with
// them). Row labels and per-set size bars sit on the LEFT side of the
// matrix, also in world coords.
//
// Dynamic row filter (per the 2026-05-26 spec): only sets that the
// CURRENTLY-VISIBLE columns belong to are drawn as rows. Visibility
// is decided by projecting each column's worldX through the live
// pan/zoom and asking whether it falls within the canvas viewport.
import type { LaidOut } from "./layout";
import { clusterHue } from "./canvas-utils";

const ROW_H_FACTOR = 0.55; // matrix row height ÷ card slot height
const DOT_R_FACTOR = 0.22; // dot radius ÷ row height
const LABEL_FONT_FACTOR = 0.5; // label font ÷ row height
const LABEL_BAND_FACTOR = 1.8; // label band width ÷ card slot width
const SIZE_BAR_BAND_FACTOR = 0.9; // size-bar band ÷ card slot width
const MATRIX_GAP_FACTOR = 0.5; // gap below cards ÷ card slot height
const HIGHLIGHT = "rgba(255, 157, 63, 0.9)";

export interface UpsetWorldLayout {
	matrixTopY: number;
	matrixBottomY: number;
	rowH: number;
	dotR: number;
	labelBandX: number; // right edge of label band
	sizeBarRightX: number; // right edge of size-bar band
	leftEdgeX: number; // far left of the whole UpSet "frame"
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
	// Phase 1: which columns are visible in the canvas right now?
	const cols = u.columns.length;
	let firstIdx = -1;
	let lastIdx = -1;
	for (let i = 0; i < cols; i++) {
		const sx = u.columns[i].xWorld * zoom + panX;
		if (sx >= 0 && sx <= canvasW) {
			if (firstIdx < 0) firstIdx = i;
			lastIdx = i;
		}
	}
	// Phase 2: active set keys = union of visible columns' signatures.
	// Fallback to all sets when no column is on-screen (e.g. user
	// panned far away) so the matrix never collapses to nothing.
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
	// Phase 3: world-space geometry.
	const slotW = u.cardSlotW;
	const slotH = u.cardSlotH;
	const rowH = slotH * ROW_H_FACTOR;
	const matrixTopY = u.cardsWorldHeight + slotH * MATRIX_GAP_FACTOR;
	const matrixBottomY = matrixTopY + activeSets.length * rowH;
	const dotR = Math.max(2, Math.min(rowH, slotW) * DOT_R_FACTOR);
	const sizeBarRightX = -slotW * 0.2;
	const labelBandX = sizeBarRightX - slotW * SIZE_BAR_BAND_FACTOR - slotW * 0.2;
	const leftEdgeX = labelBandX - slotW * LABEL_BAND_FACTOR;
	const setRows = activeSets.map((s, idx) => ({
		key: s.key,
		label: s.label,
		size: s.size,
		y: matrixTopY + (idx + 0.5) * rowH,
	}));
	return {
		matrixTopY,
		matrixBottomY,
		rowH,
		dotR,
		labelBandX,
		sizeBarRightX,
		leftEdgeX,
		setRows,
	};
}

export function drawUpset(
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
	const slotW = u.cardSlotW;
	const fontPx = Math.max(slotW * 0.16, L.rowH * LABEL_FONT_FACTOR);
	const setIdx = new Map<string, number>();
	L.setRows.forEach((s, i) => setIdx.set(s.key, i));
	// Row tracks: faint strips so empty rows still read as rows.
	const tracksRight = u.cardsWorldWidth + slotW * 0.2;
	const tracksLeft = L.labelBandX;
	ctx.fillStyle = "rgba(120, 130, 150, 0.08)";
	for (const set of L.setRows) {
		ctx.fillRect(
			tracksLeft,
			set.y - L.rowH * 0.45,
			tracksRight - tracksLeft,
			L.rowH * 0.9,
		);
	}
	// Set size bars (left of labels).
	const maxSize = Math.max(1, ...u.sets.map((s) => s.size));
	const barMaxW = (L.sizeBarRightX - L.labelBandX) * 0.9;
	const barH = L.rowH * 0.45;
	for (const set of L.setRows) {
		const w = (set.size / maxSize) * barMaxW;
		const x = L.sizeBarRightX - w;
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 55%, 0.65)`;
		ctx.fillRect(x, set.y - barH / 2, w, barH);
		ctx.fillStyle = "rgba(220, 225, 235, 0.85)";
		ctx.font = `${fontPx * 0.8}px sans-serif`;
		ctx.textAlign = "end";
		ctx.textBaseline = "middle";
		ctx.fillText(String(set.size), x - 2, set.y);
	}
	// Set labels (right-aligned, sit immediately to the left of the
	// size-bar band).
	ctx.font = `${fontPx}px sans-serif`;
	ctx.textAlign = "end";
	ctx.textBaseline = "middle";
	for (const set of L.setRows) {
		ctx.fillStyle = `hsla(${clusterHue(set.key)}, 65%, 80%, 1)`;
		ctx.fillText(set.label, L.labelBandX, set.y);
	}
	// Matrix dots + connectors. Iterates ALL columns (even off-screen)
	// because they have a stable world position; the canvas viewport
	// itself clips them on the way out.
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
