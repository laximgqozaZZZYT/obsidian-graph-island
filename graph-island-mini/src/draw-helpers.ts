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

// Excel-style cell grid drawn across the entire VISIBLE viewport
// (= not just the content footprint). Combined with the wrap-aware
// lat/lon labels, the grid reads like a digital world map that
// continues seamlessly as the user pans — past "180°E" it shows
// "180°", "179°W", "178°W", ... rather than fading into a void.
//
// Drawn before any other body content so cards / enclosures sit on top.
export function drawCardGrid(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	canvas: HTMLCanvasElement,
	zoom: number,
	panX: number,
	panY: number,
): void {
	const W = laid.slotW;
	const H = laid.slotH;
	const channelW = laid.channelW;
	const channelH = laid.channelH;
	if (W <= 0 || H <= 0) return;
	const padX = channelW / 2;
	const padY = channelH / 2;

	// Visible world rect: invert the (pan, zoom) screen transform.
	// In CSS pixels: world.x = (screen_x − panX) / zoom.
	const dpr = window.devicePixelRatio || 1;
	const visW = canvas.width / dpr;
	const visH = canvas.height / dpr;
	const leftWorld = -panX / zoom;
	const rightWorld = (visW - panX) / zoom;
	const topWorld = -panY / zoom;
	const bottomWorld = (visH - panY) / zoom;

	const minCol = Math.floor(leftWorld / W) - 1;
	const maxCol = Math.ceil(rightWorld / W) + 1;
	const minRow = Math.floor(topWorld / H) - 1;
	const maxRow = Math.ceil(bottomWorld / H) + 1;

	// Safety: cap cell count per draw so an extreme zoom-out doesn't
	// trigger millions of segments.
	const maxCells = 8000;
	const cellCount = (maxCol - minCol + 1) * (maxRow - minRow + 1);
	if (cellCount > maxCells) return;

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
	minFontPx: number = 0,
): void {
	const W = laid.slotW;
	const H = laid.slotH;
	if (W <= 0 || H <= 0) return;

	const dpr = window.devicePixelRatio || 1;
	const visW = canvas.width / dpr;
	const visH = canvas.height / dpr;
	const cellScreenW = W * zoom;
	const cellScreenH = H * zoom;
	// Header labels span the ENTIRE viewport (= the grid below them is
	// continuous like a world map, so the labels must follow). Range
	// derived from inverse pan/zoom — same math as drawCardGrid.
	const leftWorld = -panX / zoom;
	const rightWorld = (visW - panX) / zoom;
	const topWorld = -panY / zoom;
	const bottomWorld = (visH - panY) / zoom;
	const minCol = Math.floor(leftWorld / W) - 1;
	const maxCol = Math.ceil(rightWorld / W) + 1;
	const minRow = Math.floor(topWorld / H) - 1;
	const maxRow = Math.ceil(bottomWorld / H) + 1;
	const headerH = Math.max(22, Math.min(36, cellScreenH * 0.9));
	const headerW = Math.max(32, Math.min(56, cellScreenW * 0.7));
	// Safety cap: at extreme zoom-out the visible cell count explodes.
	// Skip per-cell tick rendering when it would generate too many
	// segments; the corner / band overlays still draw below.
	const headerCellCount = (maxCol - minCol) + (maxRow - minRow);
	const skipTicks = headerCellCount > 4000;

	ctx.fillStyle = "rgba(58, 78, 108, 0.98)";
	ctx.fillRect(0, 0, visW, headerH);
	ctx.fillRect(0, 0, headerW, visH);

	if (!skipTicks) {
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
	}

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
	const fontPx = Math.max(
		minFontPx,
		Math.min(headerH * 0.62, headerW * 0.4, 14),
	);
	ctx.font = `700 ${fontPx}px sans-serif`;
	ctx.fillStyle = "rgba(245, 250, 255, 1)";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	if (!skipTicks) {
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

// Map a column index to a longitude label, wrapped to (−180°, 180°].
// The cell at col 0 (= the column containing world x = 0) is the prime
// meridian ("0°"). Cells east of it get "${n}°E", west cells get
// "${n}°W". The label wraps modulo 360 so col 200 → "160°W" (=
// equivalent meridian on the other side of the date line), reflecting
// the "両端が構造上で繋がる" (toroidal longitude) topology — even
// though rendering stays on a flat plane.
function longitudeLabel(col: number): string {
	const n = wrapTo(col, 360, -180);
	if (n === 0) return "0°";
	if (n === 180 || n === -180) return "180°";
	return `${Math.abs(n)}°${n > 0 ? "E" : "W"}`;
}

// Map a row index to a latitude label, wrapped to (−90°, 90°]. Rows
// count DOWN in screen coords, so row r > 0 (= below origin) = south.
// Row 0 (= the row containing world y = 0) is the equator ("0°"). The
// label wraps modulo 180 so row 100 → "80°N" (= equivalent latitude
// on the antipodal side, as if you continued past the south pole and
// came up the other side of the globe).
function latitudeLabel(row: number): string {
	const n = wrapTo(row, 180, -90);
	if (n === 0) return "0°";
	if (n === 90 || n === -90) return "90°";
	return `${Math.abs(n)}°${n > 0 ? "S" : "N"}`;
}

// Wrap an integer cell index into the half-open interval
// [min, min + period). Used so column/row indices map back into the
// canonical latitude/longitude range regardless of how far the grid
// extends. JS `%` returns negative remainders for negative dividends;
// the double-mod idiom normalises that.
function wrapTo(v: number, period: number, min: number): number {
	const max = min + period;
	const m = (((v - min) % period) + period) % period;
	const out = m + min;
	// Snap the +max boundary back to min so e.g. col 180 → 180 (not −180);
	// but col 540 (= 3 × 180 wraps) lands on -180 / +180 depending on phase.
	// For our labels we want either "180°" or "0°" at the antimeridian
	// rather than a flipped sign, so leave the value as-is here and let
	// the caller render it.
	if (out === max) return min;
	return out;
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
	minFontPx: number = 0,
): void {
	// Cluster labels render at a constant SCREEN size (`baseScreenPx /
	// zoom` → constant ÷ transform scale = constant screen px). Apply
	// the user's min-font floor on the SCREEN size so the label never
	// drops below it.
	const screenPx = Math.max(12, minFontPx);
	const groupFontPx = screenPx / zoom;
	ctx.font = `${groupFontPx}px sans-serif`;
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "start";
	const padX = 4 / zoom;
	const insetY = 4 / zoom;

	interface AnchorInfo {
		c: ClusterRect;
		rectX: number;
		rectY: number;
		rectW: number;
		rectH: number;
		hidden: boolean;
	}
	// Anchor selection: prefer the cluster's MAIN piece (= its "home"
	// rectangle) over any 外局 sub piece, regardless of relative size.
	// Only fall back to the largest sub piece when the cluster has no
	// main rect at all (= every member's mainOf points at another
	// cluster). This keeps a cluster's label on the rectangle the user
	// thinks of as "this cluster", not on whatever rect happens to be
	// biggest.
	const infos: AnchorInfo[] = laid.clusters.map((c) => {
		let rectX = c.x;
		let rectY = c.y;
		let rectW = c.width;
		let rectH = c.height;
		let hasAnchor = false;
		if (c.pieces && c.pieces.length > 0) {
			// First sweep: among the main pieces, pick the largest.
			let bestMain: (typeof c.pieces)[number] | null = null;
			let bestMainArea = -1;
			for (const p of c.pieces) {
				if (p.kind !== "main") continue;
				const a = p.w * p.h;
				if (a > bestMainArea) {
					bestMain = p;
					bestMainArea = a;
				}
			}
			if (bestMain) {
				rectX = bestMain.x;
				rectY = bestMain.y;
				rectW = bestMain.w;
				rectH = bestMain.h;
				hasAnchor = true;
			} else {
				// No main rect — fall back to the largest sub piece.
				let bestSub: (typeof c.pieces)[number] | null = null;
				let bestSubArea = -1;
				for (const p of c.pieces) {
					if (p.kind !== "sub") continue;
					const a = p.w * p.h;
					if (a > bestSubArea) {
						bestSub = p;
						bestSubArea = a;
					}
				}
				if (bestSub) {
					rectX = bestSub.x;
					rectY = bestSub.y;
					rectW = bestSub.w;
					rectH = bestSub.h;
					hasAnchor = true;
				}
			}
		}
		// Hide the label if the cluster has no usable piece (= layout
		// degenerated to a 0-area rect, or pieces are missing). Drawing
		// a label at a stale `c.x, c.y` was the source of the "label
		// floating with no enclosure under it" reports.
		const hidden = !hasAnchor || rectW <= 0 || rectH <= 0;
		return { c, rectX, rectY, rectW, rectH, hidden };
	});
	// Group clusters that share the exact same anchor rectangle. Each
	// such group renders one multi-coloured label line just above the
	// rect — names separated by " · ", one colour per cluster.
	const groups = new Map<string, AnchorInfo[]>();
	for (const info of infos) {
		if (info.hidden) continue;
		const key = `${Math.round(info.rectX)}|${Math.round(info.rectY)}|${Math.round(info.rectW)}|${Math.round(info.rectH)}`;
		const arr = groups.get(key);
		if (arr) arr.push(info);
		else groups.set(key, [info]);
	}
	const sep = " · ";
	const sepW = ctx.measureText(sep).width;
	const moreColor = "rgba(180, 190, 210, 0.9)";
	const sepColor = "rgba(150, 160, 180, 0.7)";
	for (const group of groups.values()) {
		group.sort(
			(a, b) =>
				b.c.width * b.c.height - a.c.width * a.c.height,
		);
		const rect = group[0];
		// Anchor: just above the rect (channel space, no node underneath).
		// Sub-rect anchors land inside their parent main rect because the
		// sub-rect sits inside it by construction (V3 / V5 invariants).
		// Solo labels stay above their own rect; shared rects compose one
		// concatenated line so each name is still individually readable.
		const baseY = rect.rectY - insetY;
		const startX = rect.rectX + padX;
		const rightLimit = rect.rectX + rect.rectW - padX;
		let x = startX;
		for (let i = 0; i < group.length; i++) {
			const info = group[i];
			const text = `${info.c.label} (${info.c.memberCount})`;
			const wText = ctx.measureText(text).width;
			const isLast = i === group.length - 1;
			const trailing = isLast ? 0 : sepW;
			// Reserve room for "(+N more)" when we can't fit the rest.
			const remaining = group.length - i;
			const more = remaining > 1 ? ` (+${remaining - 1})` : "";
			const wMore = remaining > 1 ? ctx.measureText(more).width : 0;
			if (x + wText + trailing > rightLimit) {
				if (i === 0 && wText <= rect.rectW) {
					// Always show at least the largest cluster's name even
					// if it slightly exceeds the channel pad allowance.
					ctx.fillStyle = `hsla(${clusterHue(info.c.groupKey)}, 65%, 70%, 1)`;
					ctx.fillText(text, x, baseY);
					if (remaining > 1) {
						ctx.fillStyle = moreColor;
						ctx.fillText(more, x + wText, baseY);
					}
				} else if (remaining > 0) {
					ctx.fillStyle = moreColor;
					ctx.fillText(`(+${remaining})`, x, baseY);
				}
				break;
			}
			// If the *next* name+sep wouldn't fit but " (+N)" would, leave
			// space for the overflow marker on the next loop.
			if (!isLast && x + wText + sepW + wMore > rightLimit) {
				ctx.fillStyle = `hsla(${clusterHue(info.c.groupKey)}, 65%, 70%, 1)`;
				ctx.fillText(text, x, baseY);
				if (remaining > 1) {
					ctx.fillStyle = moreColor;
					ctx.fillText(more, x + wText, baseY);
				}
				break;
			}
			ctx.fillStyle = `hsla(${clusterHue(info.c.groupKey)}, 65%, 70%, 1)`;
			ctx.fillText(text, x, baseY);
			x += wText;
			if (!isLast) {
				ctx.fillStyle = sepColor;
				ctx.fillText(sep, x, baseY);
				x += sepW;
			}
		}
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
	minFontPx: number = 0,
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
			const titleFontPx = Math.max(CARD_TITLE_FONT_PX, minFontPx / Math.max(0.01, zoom));
			const bodyFontPx = Math.max(CARD_BODY_FONT_PX, minFontPx / Math.max(0.01, zoom));
			ctx.font = `600 ${titleFontPx}px sans-serif`;
			ctx.fillStyle = highlighted ? "#1d1100" : "#e6edf3";
			const title = truncateToWidth(
				ctx,
				cluster.label,
				subW - 2 * CARD_PAD_X,
			);
			ctx.fillText(title, x + CARD_PAD_X, y + CARD_PAD_Y);
			ctx.font = `${bodyFontPx}px sans-serif`;
			ctx.fillStyle = highlighted ? "#3a2400" : "#9eb0c4";
			ctx.fillText(
				`${count} cards`,
				x + CARD_PAD_X,
				y + CARD_PAD_Y + CARD_LINE_HEIGHT_PX + CARD_TITLE_BODY_GAP,
			);
		}
	}
}
