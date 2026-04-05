/**
 * Pure-function tooltip overlap detection and repositioning.
 * Extracted from GraphViewContainer._adjustTooltipForOverlap to reduce god-object complexity.
 */

/** Axis-aligned rectangle in canvas-local coordinates. */
export interface PanelRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface TooltipAdjustInput {
	/** Node data position (world coords) */
	nodeX: number;
	nodeY: number;
	nodeRadius: number;

	/** Current tooltip offset from node centre (gfx-scaled) */
	tipOffsetX: number;
	tipOffsetY: number;

	/** Tooltip dimensions (unscaled) */
	tipWidth: number;
	tipHeight: number;

	/** Transform parameters */
	worldScale: number;
	worldX: number;
	worldY: number;
	gfxScale: number;
	counterScale: number;

	/** Canvas viewport dimensions */
	canvasWidth: number;
	canvasHeight: number;

	/** Bounding rects of visible DOM panels (canvas-local coords) */
	panelRects: PanelRect[];

	/** Card display mode */
	isCard: boolean;
	cardAspectRatio: number;
}

interface TooltipAdjustResult {
	x: number;
	y: number;
}

/**
 * Determine whether the tooltip (at its current position) overlaps any panel
 * or extends beyond the canvas viewport.
 */
export function tooltipNeedsFlip(
	tipScrX: number,
	tipScrY: number,
	tipW: number,
	tipH: number,
	canvasWidth: number,
	canvasHeight: number,
	panelRects: PanelRect[],
): boolean {
	for (const p of panelRects) {
		if (tipScrX < p.x + p.w && tipScrX + tipW > p.x && tipScrY < p.y + p.h && tipScrY + tipH > p.y) {
			return true;
		}
	}
	return tipScrX + tipW > canvasWidth || tipScrY + tipH > canvasHeight;
}

/**
 * Compute the flipped tooltip offset when the original position overlaps.
 *
 * Priority order:
 *  1. Flip to left side of node (card-aware offset)
 *  2. If left-flipped position overflows left edge → place below node
 *  3. If original screen-Y is negative → push down
 *
 * @param tipScrY - The ORIGINAL screen-Y of the tooltip (before any flip),
 *                  used for the top-overflow check.
 */
export function computeFlippedOffset(input: TooltipAdjustInput, tipScrY: number): TooltipAdjustResult {
	const { nodeRadius, gfxScale, counterScale, worldScale, worldX, nodeX, isCard, cardAspectRatio } = input;

	const estW = input.tipWidth * counterScale;
	const cardHW = isCard ? Math.max(nodeRadius * 2, (nodeRadius * 2 * cardAspectRatio) / 2) : 0;
	const flipOffset = isCard ? cardHW + 8 + estW : nodeRadius + 4 + estW;

	let x = -flipOffset * gfxScale;
	let y = input.tipOffsetY;

	// Check if flipped position overflows left edge
	const flippedScrX = (nodeX + x * (1 / gfxScale)) * worldScale + worldX;
	if (flippedScrX < 0) {
		x = 0;
		y = (nodeRadius + 4) * gfxScale;
	}

	// If original screen-Y was above viewport, push down
	if (tipScrY < 0) {
		y = (nodeRadius * 0.4 + 2) * gfxScale;
	}

	return { x, y };
}

/**
 * Full tooltip position adjustment — checks overlap then flips if needed.
 * Returns null if no adjustment is needed, or the new {x, y} offset to apply.
 */
export function adjustTooltipPosition(input: TooltipAdjustInput): TooltipAdjustResult | null {
	const { nodeX, nodeY, worldScale, worldX, worldY, gfxScale, counterScale } = input;

	const tipScrX = (nodeX + input.tipOffsetX * (1 / gfxScale)) * worldScale + worldX;
	const tipScrY = (nodeY + input.tipOffsetY * (1 / gfxScale)) * worldScale + worldY;
	const tipW = input.tipWidth * counterScale * worldScale;
	const tipH = input.tipHeight * counterScale * worldScale;

	const needsFlip = tooltipNeedsFlip(
		tipScrX,
		tipScrY,
		tipW,
		tipH,
		input.canvasWidth,
		input.canvasHeight,
		input.panelRects,
	);

	if (!needsFlip) return null;

	return computeFlippedOffset(input, tipScrY);
}
