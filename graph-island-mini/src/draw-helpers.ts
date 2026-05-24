import type { LaidOut, ClusterRect } from "./layout";
import { clusterHue, roundedRectPath, truncateToWidth } from "./canvas-utils";
import {
	CARD_TITLE_FONT_PX,
	CARD_BODY_FONT_PX,
	CARD_LINE_HEIGHT_PX,
	CARD_PAD_X,
	CARD_PAD_Y,
	CARD_TITLE_BODY_GAP,
	CARD_RADIUS_PX,
} from "./types";

// Number of extra cells drawn beyond the actual content extent (cards +
// cluster bboxes). Visible breathing room on the right / bottom + an
// extra header strip on the left / top so column A / row 1 stay empty
// AND there's a "next blank cell" hint at every edge.
const GRID_BUFFER_CELLS = 2;

// Excel-style cell grid covering every card's footprint, every cluster
// bbox, and a 2-cell buffer in each direction. Drawn before any other
// body content so cards / enclosures sit on top.
export function drawCardGrid(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	zoom: number,
): void {
	if (laid.nodes.length === 0) return;
	const W = laid.slotW;
	const H = laid.slotH;
	const channelW = laid.channelW;
	const channelH = laid.channelH;
	if (W <= 0 || H <= 0) return;
	const ext = footprintExtent(laid, W, H);
	const minCol = ext.minCol - GRID_BUFFER_CELLS;
	const maxCol = ext.maxCol + GRID_BUFFER_CELLS;
	const minRow = ext.minRow - GRID_BUFFER_CELLS;
	const maxRow = ext.maxRow + GRID_BUFFER_CELLS;
	const padX = channelW / 2;
	const padY = channelH / 2;

	ctx.strokeStyle = "rgba(120, 140, 160, 0.22)";
	ctx.lineWidth = 1 / zoom;
	ctx.beginPath();
	for (let r = minRow; r <= maxRow; r++) {
		const top = r * H + padY;
		const bottom = (r + 1) * H - padY;
		for (let c = minCol; c <= maxCol; c++) {
			const left = c * W + padX;
			const right = (c + 1) * W - padX;
			ctx.moveTo(left, top);
			ctx.lineTo(right, top);
			ctx.moveTo(left, bottom);
			ctx.lineTo(right, bottom);
			ctx.moveTo(left, top);
			ctx.lineTo(left, bottom);
			ctx.moveTo(right, top);
			ctx.lineTo(right, bottom);
		}
	}
	ctx.stroke();
}

// Frozen-pane row/column headers drawn in SCREEN space (identity
// transform) so they stay glued to the canvas edges regardless of
// pan/zoom — like Excel's frozen header rows / columns.
export function drawGridHeaders(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	canvas: HTMLCanvasElement,
	zoom: number,
	panX: number,
	panY: number,
): void {
	if (laid.nodes.length === 0) return;
	const W = laid.slotW;
	const H = laid.slotH;
	if (W <= 0 || H <= 0) return;
	const ext = footprintExtent(laid, W, H);
	const minCol = ext.minCol - GRID_BUFFER_CELLS;
	const maxCol = ext.maxCol + GRID_BUFFER_CELLS;
	const minRow = ext.minRow - GRID_BUFFER_CELLS;
	const maxRow = ext.maxRow + GRID_BUFFER_CELLS;

	const dpr = window.devicePixelRatio || 1;
	const visW = canvas.width / dpr;
	const visH = canvas.height / dpr;
	const cellScreenW = W * zoom;
	const cellScreenH = H * zoom;
	const headerH = Math.max(22, Math.min(36, cellScreenH * 0.9));
	const headerW = Math.max(32, Math.min(56, cellScreenW * 0.7));

	ctx.fillStyle = "rgba(58, 78, 108, 0.98)";
	ctx.fillRect(0, 0, visW, headerH);
	ctx.fillRect(0, 0, headerW, visH);

	ctx.strokeStyle = "rgba(120, 140, 160, 0.45)";
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let c = minCol; c <= maxCol + 1; c++) {
		const x = c * W * zoom + panX;
		if (x < headerW - 0.5 || x > visW + 0.5) continue;
		ctx.moveTo(x, 0);
		ctx.lineTo(x, headerH);
	}
	for (let r = minRow; r <= maxRow + 1; r++) {
		const y = r * H * zoom + panY;
		if (y < headerH - 0.5 || y > visH + 0.5) continue;
		ctx.moveTo(0, y);
		ctx.lineTo(headerW, y);
	}
	ctx.stroke();

	ctx.strokeStyle = "rgba(180, 200, 230, 0.9)";
	ctx.lineWidth = 1.6;
	ctx.beginPath();
	ctx.moveTo(0, headerH);
	ctx.lineTo(visW, headerH);
	ctx.moveTo(headerW, 0);
	ctx.lineTo(headerW, visH);
	ctx.stroke();

	// Labels with stride so they don't overlap at low zoom.
	// Stride bumped a bit because lat/lon labels are wider than the old
	// "A" / "1" forms.
	const colStride = Math.max(1, Math.ceil(36 / Math.max(1, cellScreenW)));
	const rowStride = Math.max(1, Math.ceil(28 / Math.max(1, cellScreenH)));
	const fontPx = Math.min(headerH * 0.62, headerW * 0.4, 14);
	ctx.font = `700 ${fontPx}px sans-serif`;
	ctx.fillStyle = "rgba(245, 250, 255, 1)";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	for (let c = minCol; c <= maxCol; c += colStride) {
		const xC = c * W * zoom + panX + cellScreenW / 2;
		if (xC < headerW || xC > visW) continue;
		ctx.fillText(longitudeLabel(c), xC, headerH / 2);
	}
	for (let r = minRow; r <= maxRow; r += rowStride) {
		const yC = r * H * zoom + panY + cellScreenH / 2;
		if (yC < headerH || yC > visH) continue;
		ctx.fillText(latitudeLabel(r), headerW / 2, yC);
	}
	ctx.textAlign = "start";
	ctx.textBaseline = "alphabetic";

	// Corner block — slightly darker to anchor the header origin.
	ctx.fillStyle = "rgba(40, 55, 80, 1)";
	ctx.fillRect(0, 0, headerW, headerH);
	ctx.strokeStyle = "rgba(180, 200, 230, 0.9)";
	ctx.lineWidth = 1.6;
	ctx.beginPath();
	ctx.moveTo(0, headerH);
	ctx.lineTo(headerW, headerH);
	ctx.moveTo(headerW, 0);
	ctx.lineTo(headerW, headerH);
	ctx.stroke();
}

// Map a column index to a longitude-style label. The cell at col 0
// (= the column containing world x = 0) is the prime meridian (= "0°").
// Cells to the east of it get "${n}°E"; cells to the west get
// "${n}°W". Beyond ±180 we just keep counting (the grid can extend
// arbitrarily); the layout is a map projection, not a real globe.
function longitudeLabel(col: number): string {
	if (col === 0) return "0°";
	return `${Math.abs(col)}°${col > 0 ? "E" : "W"}`;
}

// Map a row index to a latitude-style label. Rows count DOWN in screen
// coords, so row r > 0 (= below origin) = south, row r < 0 = north.
// Row 0 (= the row containing world y = 0) is the equator (= "0°").
function latitudeLabel(row: number): string {
	if (row === 0) return "0°";
	return `${Math.abs(row)}°${row > 0 ? "S" : "N"}`;
}

// Shared footprint extent: cell range encompassing every node's full
// (multi-cell) footprint AND every cluster bbox. Used by both the grid +
// header drawers.
//
// Cluster bboxes are included because their padding (= clusterSpacing
// + nesting depth) can extend the visible outline 1–3 cells beyond the
// rightmost / bottom-most card. Without that, a cluster border would
// stroke OUTSIDE the lattice — visually "outside the grid".
function footprintExtent(
	laid: LaidOut,
	W: number,
	H: number,
): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
	let minCol = Infinity,
		maxCol = -Infinity,
		minRow = Infinity,
		maxRow = -Infinity;
	for (const n of laid.nodes) {
		const colSpan = Math.max(1, Math.ceil(n.width / W));
		const rowSpan = Math.max(1, Math.ceil(n.height / H));
		const startCol = Math.round(n.x / W - colSpan / 2);
		const startRow = Math.round(n.y / H - rowSpan / 2);
		const endCol = startCol + colSpan - 1;
		const endRow = startRow + rowSpan - 1;
		if (startCol < minCol) minCol = startCol;
		if (endCol > maxCol) maxCol = endCol;
		if (startRow < minRow) minRow = startRow;
		if (endRow > maxRow) maxRow = endRow;
	}
	// Cluster bboxes — their padding can extend beyond the card footprint.
	// Floor / ceil convert the pixel rect back into the cell range it
	// overlaps. (`c.x + c.width` is the bbox right edge; subtract 1 to
	// get the LAST cell it intersects, since cell c spans [c*W, (c+1)*W).)
	for (const c of laid.clusters) {
		const cStartCol = Math.floor(c.x / W);
		const cEndCol = Math.ceil((c.x + c.width) / W) - 1;
		const cStartRow = Math.floor(c.y / H);
		const cEndRow = Math.ceil((c.y + c.height) / H) - 1;
		if (cStartCol < minCol) minCol = cStartCol;
		if (cEndCol > maxCol) maxCol = cEndCol;
		if (cStartRow < minRow) minRow = cStartRow;
		if (cEndRow > maxRow) maxRow = cEndRow;
	}
	return { minCol, maxCol, minRow, maxRow };
}

// Map-style top-left cluster labels with collision avoidance.
// Smaller clusters yield to larger ones (= the larger label keeps its
// natural anchor position). A leader line links a label back to its
// anchor when displacement pushes it more than one line up.
export function drawClusterLabels(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	zoom: number,
): void {
	const groupFontPx = 12 / zoom;
	ctx.font = `${groupFontPx}px sans-serif`;
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "start";
	const lineH = groupFontPx * 1.4;
	const padX = 4 / zoom;
	const insetY = 4 / zoom;

	interface LabelP {
		c: ClusterRect;
		text: string;
		w: number;
		cx: number;
		cy: number;
		anchorX: number;
		anchorY: number;
		pushed: number;
	}
	const labels: LabelP[] = laid.clusters.map((c) => {
		const text = truncateToWidth(ctx, `${c.label} (${c.memberCount})`, c.width);
		const w = ctx.measureText(text).width;
		const anchorX = c.x + padX;
		const anchorY = c.y - insetY;
		return {
			c,
			text,
			w,
			cx: anchorX,
			cy: anchorY,
			anchorX,
			anchorY,
			pushed: 0,
		};
	});
	const order = labels.map((_, i) => i);
	order.sort(
		(a, b) =>
			labels[b].c.width * labels[b].c.height -
			labels[a].c.width * labels[a].c.height,
	);

	const overlap = (a: LabelP, b: LabelP): boolean => {
		const ay0 = a.cy - lineH * 0.8;
		const ay1 = a.cy + lineH * 0.2;
		const by0 = b.cy - lineH * 0.8;
		const by1 = b.cy + lineH * 0.2;
		return (
			a.cx < b.cx + b.w && b.cx < a.cx + a.w && ay0 < by1 && by0 < ay1
		);
	};
	for (let idx = 0; idx < order.length; idx++) {
		const me = labels[order[idx]];
		let attempts = 0;
		while (attempts < 16) {
			let hit = false;
			for (let jdx = 0; jdx < idx; jdx++) {
				if (overlap(me, labels[order[jdx]])) {
					me.cy -= lineH;
					me.pushed++;
					hit = true;
					break;
				}
			}
			if (!hit) break;
			attempts++;
		}
	}
	for (const lab of labels) {
		const hue = clusterHue(lab.c.groupKey);
		if (lab.pushed >= 2) {
			ctx.strokeStyle = `hsla(${hue}, 65%, 70%, 0.55)`;
			ctx.lineWidth = 0.7 / zoom;
			ctx.beginPath();
			ctx.moveTo(lab.cx, lab.cy);
			ctx.lineTo(lab.anchorX, lab.anchorY);
			ctx.stroke();
		}
		ctx.fillStyle = `hsla(${hue}, 65%, 70%, 1)`;
		ctx.fillText(lab.text, lab.cx, lab.cy);
	}
}

// 3-card diagonal stack confined to a SINGLE cell with a small inset
// so the stack never touches the cell boundary, the cluster enclosure,
// or neighbouring cards' strokes.
export function drawAggregateStack(
	ctx: CanvasRenderingContext2D,
	cluster: ClusterRect,
	cardW: number,
	cardH: number,
	count: number,
	zoom: number,
	highlighted = false,
): void {
	const cx = cluster.x + cluster.width / 2;
	const cy = cluster.y + cluster.height / 2;
	const STACK_INSET = 0.07;
	const SUB_SCALE = 0.78;
	const innerW = cardW * (1 - 2 * STACK_INSET);
	const innerH = cardH * (1 - 2 * STACK_INSET);
	const subW = innerW * SUB_SCALE;
	const subH = innerH * SUB_SCALE;
	const stepX = (innerW - subW) / 2;
	const stepY = (innerH - subH) / 2;
	const r = Math.min(CARD_RADIUS_PX, subW / 2, subH / 2);
	for (let i = 0; i <= 2; i++) {
		const isFront = i === 2;
		const centerX = cx + (1 - i) * stepX;
		const centerY = cy + (1 - i) * stepY;
		const x = centerX - subW / 2;
		const y = centerY - subH / 2;
		ctx.beginPath();
		roundedRectPath(ctx, x, y, subW, subH, r);
		ctx.fillStyle = highlighted
			? isFront
				? "#ffe7a8"
				: "#f0d188"
			: isFront
				? "#1d2230"
				: "#1a1f2a";
		ctx.fill();
		ctx.lineWidth = (isFront ? (highlighted ? 1.8 : 1.2) : 0.8) / zoom;
		ctx.strokeStyle = highlighted
			? isFront
				? "#ff9d3f"
				: "#c97e2c"
			: isFront
				? "#5a7ba8"
				: "#3e567a";
		ctx.beginPath();
		roundedRectPath(ctx, x, y, subW, subH, r);
		ctx.stroke();
		if (isFront) {
			ctx.textAlign = "start";
			ctx.textBaseline = "top";
			ctx.font = `600 ${CARD_TITLE_FONT_PX}px sans-serif`;
			ctx.fillStyle = highlighted ? "#1d1100" : "#e6edf3";
			const title = truncateToWidth(
				ctx,
				cluster.label,
				subW - 2 * CARD_PAD_X,
			);
			ctx.fillText(title, x + CARD_PAD_X, y + CARD_PAD_Y);
			ctx.font = `${CARD_BODY_FONT_PX}px sans-serif`;
			ctx.fillStyle = highlighted ? "#3a2400" : "#9eb0c4";
			ctx.fillText(
				`${count} cards`,
				x + CARD_PAD_X,
				y + CARD_PAD_Y + CARD_LINE_HEIGHT_PX + CARD_TITLE_BODY_GAP,
			);
		}
	}
}
