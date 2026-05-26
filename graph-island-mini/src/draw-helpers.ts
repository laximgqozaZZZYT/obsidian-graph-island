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
// A placed label's final world-space box (after merge + de-confliction).
// Returned so the caller can debug overlaps against nodes / each other.
export interface PlacedLabelBox {
	x1: number;
	x2: number;
	top: number;
	bot: number;
	text: string;
	anchorX: number;
	anchorY: number;
}

export function drawClusterLabels(
	ctx: CanvasRenderingContext2D,
	laid: LaidOut,
	zoom: number,
	minFontPx: number = 0,
): PlacedLabelBox[] {
	// Cluster labels render at a constant SCREEN size (`baseScreenPx /
	// zoom` → constant ÷ transform scale = constant screen px), floored by
	// the user's min-font setting. BUT the world height is CAPPED to one
	// CELL interior (cardH) so a label sits INSIDE an empty grid cell (区画),
	// never spilling into the surrounding 隘路 — labels are placed in cells,
	// like nodes, not in the aisles. So at low zoom the label shrinks to fit
	// a cell rather than spilling over its borders.
	const channelH = laid.channelH;
	const slotH = laid.slotH;
	const cellH = Math.max(1, slotH - channelH);
	const screenPx = Math.max(12, minFontPx);
	let groupFontPx = screenPx / zoom;
	groupFontPx = Math.min(groupFontPx, cellH * 0.86);
	ctx.font = `${groupFontPx}px sans-serif`;
	ctx.textBaseline = "alphabetic";
	ctx.textAlign = "start";
	const padX = 4 / zoom;

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
	// Group clusters by ANCHOR PROXIMITY (not exact rect). Deeply nested
	// enclosures share almost the same top-left corner, so giving each its
	// own de-conflicted row built a tall TOWER of labels. Merging anchors
	// that fall within a couple of cells into ONE concatenated line
	// ("a · b · c …", truncated to the widest member's rect with a "(+N)"
	// overflow) keeps each spot to a single line, so the vertical
	// de-confliction below only separates the few genuinely distinct lines
	// and the stack stays short. Greedy: each label joins the first group
	// whose representative (top-left-most, = `g[0]`) anchor is near enough,
	// which bounds every group's spread to one threshold from its rep.
	const mergeX = laid.slotW * 1.8;
	const mergeY = laid.slotH * 1.4;
	const groupList: AnchorInfo[][] = [];
	const sortedInfos = infos
		.filter((i) => !i.hidden)
		.sort((a, b) => a.rectY - b.rectY || a.rectX - b.rectX);
	for (const info of sortedInfos) {
		let joined = false;
		for (const g of groupList) {
			const rep = g[0];
			if (
				Math.abs(info.rectX - rep.rectX) <= mergeX &&
				Math.abs(info.rectY - rep.rectY) <= mergeY
			) {
				g.push(info);
				joined = true;
				break;
			}
		}
		if (!joined) groupList.push([info]);
	}
	const sep = " · ";
	const sepW = ctx.measureText(sep).width;
	const moreColor = "rgba(180, 190, 210, 0.9)";
	const sepColor = "rgba(150, 160, 180, 0.7)";
	// Opaque tab drawn BEHIND every label. Euler enclosures nest and
	// overlap, so a label anchored just above its own rect frequently
	// lands over a PARENT enclosure's nodes. The tab occludes whatever
	// sits behind the text. Labels already paint AFTER the cards.
	const labelBg = "rgba(13, 15, 20, 0.88)";
	const tabAsc = groupFontPx * 0.82;
	const tabDesc = groupFontPx * 0.22;
	const tabH = tabAsc + tabDesc;

	// Phase A: lay out each group's segments + horizontal tab extent,
	// anchored in the CELL (区画) just above its rect's top edge — centred on
	// a cell centre `(row+0.5)·slotH`, NOT on a row boundary (that would put
	// it in the 隘路, which is forbidden). Phase B then finds an EMPTY such
	// cell.
	interface LabelLine {
		baseY: number;
		naturalBaseY: number;
		anchorX: number;
		anchorY: number;
		area: number;
		x1: number;
		x2: number;
		segs: { text: string; x: number; color: string }[];
	}
	const lines: LabelLine[] = [];
	for (const group of groupList) {
		group.sort(
			(a, b) =>
				b.c.width * b.c.height - a.c.width * a.c.height,
		);
		const rect = group[0];
		// Cell centre of the row just ABOVE the enclosure's top edge. The
		// top node sits in row ≈ round(rectY/slotH); the cell above is one
		// row up, centred at (topRow − 0.5)·slotH. Baseline offset centres
		// the tab box in that cell.
		const topRow = Math.round(rect.rectY / slotH);
		const cellCenter = (topRow - 0.5) * slotH;
		const baseY = cellCenter + (tabAsc - tabDesc) / 2;
		const startX = rect.rectX + padX;
		const rightLimit = rect.rectX + rect.rectW - padX;

		const segs: { text: string; x: number; color: string }[] = [];
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
			const hue = `hsla(${clusterHue(info.c.groupKey)}, 65%, 70%, 1)`;
			if (x + wText + trailing > rightLimit) {
				if (i === 0 && wText <= rect.rectW) {
					// Always show at least the largest cluster's name even
					// if it slightly exceeds the channel pad allowance.
					segs.push({ text, x, color: hue });
					if (remaining > 1)
						segs.push({ text: more, x: x + wText, color: moreColor });
				} else if (remaining > 0) {
					segs.push({ text: `(+${remaining})`, x, color: moreColor });
				}
				break;
			}
			// If the *next* name+sep wouldn't fit but " (+N)" would, leave
			// space for the overflow marker on the next loop.
			if (!isLast && x + wText + sepW + wMore > rightLimit) {
				segs.push({ text, x, color: hue });
				if (remaining > 1)
					segs.push({ text: more, x: x + wText, color: moreColor });
				break;
			}
			segs.push({ text, x, color: hue });
			x += wText;
			if (!isLast) {
				segs.push({ text: sep, x, color: sepColor });
				x += sepW;
			}
		}
		if (segs.length === 0) continue;
		const last = segs[segs.length - 1];
		const lineEnd = last.x + ctx.measureText(last.text).width;
		lines.push({
			baseY,
			naturalBaseY: baseY,
			anchorX: rect.rectX,
			anchorY: rect.rectY,
			area: rect.rectW * rect.rectH,
			x1: startX - padX,
			x2: lineEnd + padX,
			segs,
		});
	}

	// Phase B: place each label in an EMPTY CELL (区画). Candidates are cell
	// centres `(row+0.5)·slotH` above the enclosure; a candidate is valid
	// only if no card occupies those cells (per-column card-rect bucket,
	// O(cards-in-column)) AND no already-placed label overlaps. A taken
	// candidate steps UP one whole grid cell and retries — opening up a
	// cell of space each time — until a free cell is found. Largest
	// enclosures place first and keep the nearest cell; smaller ones yield.
	const colBuckets = new Map<number, { t: number; b: number }[]>();
	for (const n of laid.nodes) {
		const c0 = Math.floor((n.x - n.width / 2) / laid.slotW);
		const c1 = Math.floor((n.x + n.width / 2) / laid.slotW);
		const r = { t: n.y - n.height / 2, b: n.y + n.height / 2 };
		for (let c = c0; c <= c1; c++) {
			const arr = colBuckets.get(c);
			if (arr) arr.push(r);
			else colBuckets.set(c, [r]);
		}
	}
	const hitsCard = (x1: number, x2: number, top: number, bot: number): boolean => {
		const c0 = Math.floor(x1 / laid.slotW);
		const c1 = Math.floor(x2 / laid.slotW);
		for (let c = c0; c <= c1; c++) {
			const arr = colBuckets.get(c);
			if (!arr) continue;
			for (const r of arr) if (top < r.b && bot > r.t) return true;
		}
		return false;
	};
	lines.sort((a, b) => b.area - a.area || a.anchorX - b.anchorX);
	const placed: { x1: number; x2: number; top: number; bot: number }[] = [];
	// Step up one grid cell at a time until the label sits in an empty cell.
	// Node test is INFLATED by one grid cell (`slotW` × `slotH`) so the
	// label keeps a ≥1-cell gap from every card; the label-vs-label test is
	// exact (labels just may not share a cell). No tight cap — open up
	// another cell of space until clear. (Safety bound avoids infinite loop.)
	const gapX = 0;
	const gapY = 0;
	const maxChannels = 6;
	for (const ln of lines) {
		const clear = (by: number): boolean => {
			const top = by - tabAsc;
			const bot = by + tabDesc;
			// ≥1 grid cell clearance from any card.
			if (hitsCard(ln.x1 - gapX, ln.x2 + gapX, top - gapY, bot + gapY))
				return false;
			for (const p of placed) {
				if (ln.x1 < p.x2 && ln.x2 > p.x1 && top < p.bot && bot > p.top)
					return false;
			}
			return true;
		};
		let by = ln.naturalBaseY;
		for (let k = 0; k <= maxChannels; k++) {
			const cand = ln.naturalBaseY - k * slotH;
			if (clear(cand)) {
				by = cand;
				break;
			}
		}
		ln.baseY = by;
		placed.push({
			x1: ln.x1,
			x2: ln.x2,
			top: ln.baseY - tabAsc,
			bot: ln.baseY + tabDesc,
		});
	}

	// Phase C: draw tabs then text at the de-conflicted positions, and
	// collect the final boxes (for overlap debugging by the caller).
	const boxes: PlacedLabelBox[] = [];
	for (const ln of lines) {
		ctx.fillStyle = labelBg;
		ctx.fillRect(ln.x1, ln.baseY - tabAsc, ln.x2 - ln.x1, tabH);
		for (const sg of ln.segs) {
			ctx.fillStyle = sg.color;
			ctx.fillText(sg.text, sg.x, ln.baseY);
		}
		boxes.push({
			x1: ln.x1,
			x2: ln.x2,
			top: ln.baseY - tabAsc,
			bot: ln.baseY + tabDesc,
			text: ln.segs.map((s) => s.text).join(""),
			anchorX: ln.anchorX,
			anchorY: ln.anchorY,
		});
	}
	return boxes;
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
