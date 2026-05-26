import type { PositionedNode } from "./layout";
import {
	CARD_RADIUS_PX,
	CARD_PAD_X,
	CARD_PAD_Y,
	CARD_TITLE_FONT_PX,
	CARD_BODY_FONT_PX,
	CARD_LINE_HEIGHT_PX,
	CARD_BODY_LINE_HEIGHT_PX,
	CARD_TITLE_BODY_GAP,
} from "./types";
import {
	roundedRectPath,
	truncateToWidth,
	floorWorldFontPx,
} from "./canvas-utils";

// Wrapped + truncated body lines for a card. Computed once by
// `cardFor()` / measureCard, then cached under the (id, mode, scale)
// composite key.
export interface CardBodyCacheEntry {
	bodyLines: string[];
}

export interface DrawCardOptions {
	scale: number;
	bodyLines: string[];
	showBody: boolean;
	highlighted: boolean;
	zoom: number;
	// User-configured minimum SCREEN font size. World-space fonts that
	// would render smaller than this under the current zoom get their
	// world unit bumped up so the actual screen size stays ≥ minFontPx.
	minFontPx: number;
}

// Pure card renderer. Receives the already-resolved scale + body lines
// instead of looking them up by node id, so this function has zero
// dependence on view state. Bug-fix anchor: when a per-cluster
// NODE_DISPLAY override resized a card but the font stayed at the
// global default, the bug lived in the SCALE the caller passed — not
// here. Keeping the function pure makes that diagnosis trivial.
//
// Width / height come from `n.width`, `n.height` (set by layout); the
// caller must NOT pre-scale them. Stroke width and corner radius stay
// FIXED in screen pixels (divided by zoom) so the card outline reads
// identically regardless of card size or zoom level.
export function drawCard(
	ctx: CanvasRenderingContext2D,
	n: PositionedNode,
	opts: DrawCardOptions,
): void {
	const { scale, bodyLines, showBody, highlighted, zoom, minFontPx } = opts;
	const x = n.x - n.width / 2;
	const y = n.y - n.height / 2;
	const w = n.width;
	const h = n.height;
	const r = Math.min(CARD_RADIUS_PX, w / 2, h / 2);

	// Fill first so the stroke below sits cleanly on top.
	ctx.beginPath();
	roundedRectPath(ctx, x, y, w, h, r);
	ctx.fillStyle = highlighted ? "#ffe7a8" : "#1d2230";
	ctx.fill();

	ctx.lineWidth = (highlighted ? 1.8 : 1) / zoom;
	ctx.strokeStyle = highlighted ? "#ff9d3f" : "#5a7ba8";
	ctx.beginPath();
	roundedRectPath(ctx, x, y, w, h, r);
	ctx.stroke();

	// Internal metrics all scale together — padding, font sizes, line
	// heights, gap. Sole source of truth for "what scale does to a card"
	// lives in `visualScale()` + this multiplication.
	const padX = CARD_PAD_X * scale;
	const padY = CARD_PAD_Y * scale;
	const titleFontPx = floorWorldFontPx(
		CARD_TITLE_FONT_PX * scale,
		minFontPx,
		zoom,
	);
	const bodyFontPx = floorWorldFontPx(
		CARD_BODY_FONT_PX * scale,
		minFontPx,
		zoom,
	);
	const titleLineH = CARD_LINE_HEIGHT_PX * scale;
	const bodyLineH = CARD_BODY_LINE_HEIGHT_PX * scale;
	const titleBodyGap = CARD_TITLE_BODY_GAP * scale;
	const innerLeft = x + padX;
	const innerTop = y + padY;
	const innerRight = x + w - padX;

	ctx.textAlign = "start";
	ctx.textBaseline = "top";

	ctx.font = `600 ${titleFontPx}px sans-serif`;
	ctx.fillStyle = highlighted ? "#1d1100" : "#e6edf3";
	const titleFitted = truncateToWidth(ctx, n.label, innerRight - innerLeft);
	ctx.fillText(titleFitted, innerLeft, innerTop);

	if (bodyLines.length > 0 && showBody) {
		ctx.font = `${bodyFontPx}px sans-serif`;
		ctx.fillStyle = highlighted ? "#3a2400" : "#9eb0c4";
		let ly = innerTop + titleLineH + titleBodyGap;
		for (const line of bodyLines) {
			ctx.fillText(line, innerLeft, ly);
			ly += bodyLineH;
		}
	}
}
