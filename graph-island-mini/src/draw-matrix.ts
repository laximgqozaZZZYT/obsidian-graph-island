// Connection-matrix renderer. Screen-space (frozen panes): a left band of
// row (note) labels, a top band of column (tag) labels, and the cell grid in
// between. The grid pans/zooms; only the rows and columns currently in the
// viewport are drawn (virtualization). Row labels are prioritised — the left
// band is wide and uses a readable screen-fixed font; column labels are
// rotated and abbreviated, dropping out (LOD) when columns get too narrow.
import type { MatrixMeta } from "./layout";
import { clusterHue, truncateToWidth } from "./canvas-utils";

export interface MatrixGeom {
	labelBand: number; // left row-label band width (CSS px)
	headerH: number; // top column-label band height (CSS px)
	rowScreenH: number; // rowH * zoom
	colScreenW: number; // colW * zoom
}

// Shared geometry so the renderer and hit-testing agree. Row labels get a
// generously wide band (priority), clamped to a sane range.
export function matrixGeom(
	matrix: MatrixMeta,
	zoom: number,
	canvasCssW: number,
): MatrixGeom {
	const labelBand = Math.min(380, Math.max(170, canvasCssW * 0.27));
	return {
		labelBand,
		headerH: 92,
		rowScreenH: matrix.rowH * zoom,
		colScreenW: matrix.colW * zoom,
	};
}

export function drawMatrix(
	ctx: CanvasRenderingContext2D,
	matrix: MatrixMeta,
	zoom: number,
	panX: number,
	panY: number,
	canvas: HTMLCanvasElement,
	selectedCol: string | null,
	minFontPx: number,
): void {
	const dpr = window.devicePixelRatio || 1;
	const visW = canvas.width / dpr;
	const visH = canvas.height / dpr;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // CSS-px screen space
	ctx.fillStyle = "#0f1116";
	ctx.fillRect(0, 0, visW, visH);

	const { rows, cols, bits } = matrix;
	const nRows = rows.length;
	const nCols = cols.length;
	const { labelBand, headerH, rowScreenH, colScreenW } = matrixGeom(
		matrix,
		zoom,
		visW,
	);
	if (rowScreenH <= 0 || colScreenW <= 0) return;

	// Visible row / column window (virtualization).
	const r0 = Math.max(0, Math.floor((headerH - panY) / rowScreenH));
	const r1 = Math.min(nRows - 1, Math.ceil((visH - panY) / rowScreenH));
	const c0 = Math.max(0, Math.floor((labelBand - panX) / colScreenW));
	const c1 = Math.min(nCols - 1, Math.ceil((visW - panX) / colScreenW));

	const selIdx =
		selectedCol != null ? cols.findIndex((c) => c.key === selectedCol) : -1;

	// Selected-column band (behind cells).
	if (selIdx >= 0) {
		const x = selIdx * colScreenW + panX;
		if (x + colScreenW > labelBand && x < visW) {
			ctx.fillStyle = "rgba(255, 157, 63, 0.16)";
			ctx.fillRect(Math.max(labelBand, x), headerH, colScreenW, visH - headerH);
		}
	}

	// CELLS (clipped to the data area).
	ctx.save();
	ctx.beginPath();
	ctx.rect(labelBand, headerH, visW - labelBand, visH - headerH);
	ctx.clip();
	for (let r = r0; r <= r1; r++) {
		const y = r * rowScreenH + panY;
		if (r % 2 === 0) {
			ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
			ctx.fillRect(labelBand, y, visW - labelBand, rowScreenH);
		}
	}
	const dotR = Math.max(1.5, Math.min(rowScreenH, colScreenW) * 0.32);
	for (let r = r0; r <= r1; r++) {
		const cy = r * rowScreenH + panY + rowScreenH / 2;
		const b = bits[r];
		for (let c = c0; c <= c1; c++) {
			if (!((b[c >> 3] >> (c & 7)) & 1)) continue;
			const cx = c * colScreenW + panX + colScreenW / 2;
			ctx.fillStyle =
				c === selIdx
					? "#ffd49d"
					: `hsl(${clusterHue(cols[c].key)}, 65%, 62%)`;
			ctx.beginPath();
			ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	ctx.restore();

	// LEFT band — row (note) labels. Frozen in x, scroll with y.
	ctx.fillStyle = "rgba(20, 24, 33, 0.97)";
	ctx.fillRect(0, headerH, labelBand, visH - headerH);
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, headerH, labelBand, visH - headerH);
	ctx.clip();
	const rowFont = Math.max(minFontPx, 13);
	ctx.font = `${rowFont}px sans-serif`;
	ctx.textAlign = "start";
	ctx.textBaseline = "middle";
	ctx.fillStyle = "#e6edf3";
	for (let r = r0; r <= r1; r++) {
		const cy = r * rowScreenH + panY + rowScreenH / 2;
		const t = truncateToWidth(ctx, rows[r].label, labelBand - 14);
		ctx.fillText(t, 8, cy);
	}
	ctx.restore();

	// TOP band — column (tag) labels, rotated. Frozen in y, scroll with x.
	ctx.fillStyle = "rgba(20, 24, 33, 0.97)";
	ctx.fillRect(0, 0, visW, headerH);
	ctx.save();
	ctx.beginPath();
	ctx.rect(labelBand, 0, visW - labelBand, headerH);
	ctx.clip();
	const colFont = Math.max(minFontPx, 11);
	// LOD: when columns get too narrow, skip every other label.
	const colStride = colScreenW < 9 ? Math.ceil(9 / Math.max(1, colScreenW)) : 1;
	for (let c = c0; c <= c1; c += colStride) {
		const x = c * colScreenW + panX + colScreenW / 2;
		if (x < labelBand) continue;
		const sel = c === selIdx;
		ctx.save();
		ctx.translate(x, headerH - 6);
		ctx.rotate(-Math.PI / 2);
		ctx.font = `${sel ? 700 : 400} ${colFont}px sans-serif`;
		ctx.textAlign = "start";
		ctx.textBaseline = "middle";
		ctx.fillStyle = sel ? "#ffd49d" : `hsl(${clusterHue(cols[c].key)}, 60%, 74%)`;
		const t = truncateToWidth(ctx, `${cols[c].label} (${cols[c].size})`, headerH - 12);
		ctx.fillText(t, 0, 0);
		ctx.restore();
	}
	ctx.restore();

	// Corner + frozen-pane separators.
	ctx.fillStyle = "rgba(14, 17, 22, 1)";
	ctx.fillRect(0, 0, labelBand, headerH);
	ctx.strokeStyle = "rgba(180, 200, 230, 0.55)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(labelBand + 0.5, 0);
	ctx.lineTo(labelBand + 0.5, visH);
	ctx.moveTo(0, headerH + 0.5);
	ctx.lineTo(visW, headerH + 0.5);
	ctx.stroke();

	ctx.textAlign = "start";
	ctx.textBaseline = "alphabetic";
}
