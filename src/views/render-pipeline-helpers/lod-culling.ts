/**
 * LOD (Level of Detail) and culling helpers extracted from RenderPipeline.
 *
 * The math helpers (computeLodLevel, computeDensityScale, etc.) are pure —
 * no DOM/Canvas dependency, easy to unit-test. The tier renderers
 * (renderExtremeZoomTier, renderMidZoomTier) accept all state via parameters
 * (no `this`) and act on a CanvasGraphics passed in by the caller, so they
 * remain side-effect-local to that graphics instance.
 */
import type { CanvasGraphics } from "../canvas2d";
import type { PixiNode } from "../InteractionManager";
import type { CardRenderConfig } from "../../types";

// ---------------------------------------------------------------------------
// Coordinate / fade helpers
// ---------------------------------------------------------------------------

/** Convert a screen-pixel size to world units, floored at `floor`. */
export function screenToWorld(screenPx: number, ws: number, floor: number): number {
	return Math.max(floor, ws > 0 ? screenPx / ws : floor);
}

/**
 * Compute a fade-out alpha for individual nodes/intra-group cables at extreme zoom-out.
 * Returns 1.0 at zoom >= fadeStart, linearly fading to fadeFloor at zoom <= fadeEnd.
 * Does NOT affect trunks (inter-group cables).
 */
export function computeZoomFadeAlpha(zoom: number, fadeStart = 0.7, fadeEnd = 0.15, fadeFloor = 0.03): number {
	if (zoom >= fadeStart) return 1;
	if (zoom <= fadeEnd) return fadeFloor;
	return fadeFloor + ((1 - fadeFloor) * (zoom - fadeEnd)) / (fadeStart - fadeEnd);
}

// ---------------------------------------------------------------------------
// LOD tier classification
// ---------------------------------------------------------------------------

/**
 * Compute the LOD (Level of Detail) tier based on node screen-space pixel size.
 * Pure function — no DOM/Canvas dependency.
 *
 * @param nodeScreenPx  Screen-space pixel size of a node (NODE_SCREEN_PX_BASE * worldScale)
 * @param thresholds    LOD threshold values from render settings
 * @returns LOD level 0–5 (0 = extreme zoom-out dots, 5 = full card mode)
 */
export function computeLodLevel(
	nodeScreenPx: number,
	thresholds: {
		cardLODExtremePx: number;
		cardLODMidLabelPx: number;
		cardLODNormalPx: number;
		cardLODCompactPx: number;
		cardLODFullCardPx: number;
	},
): number {
	if (nodeScreenPx < thresholds.cardLODExtremePx) return 0;
	if (nodeScreenPx < thresholds.cardLODMidLabelPx) return 1;
	if (nodeScreenPx < thresholds.cardLODNormalPx) return 2;
	if (nodeScreenPx < thresholds.cardLODCompactPx) return 3;
	if (nodeScreenPx < thresholds.cardLODFullCardPx) return 4;
	return 5;
}

// ---------------------------------------------------------------------------
// Density / culling helpers
// ---------------------------------------------------------------------------

/**
 * Compute density-adaptive culling scale factor for label spacing.
 * At low zoom: aggressive spacing (sqrt scaling). At high zoom: mild spacing.
 *
 * @param zoom  Current zoom level (worldContainer.scale.x)
 * @param threshold  Zoom level that separates "low" from "high" (labelDensityZoomThreshold)
 * @returns Scale factor (>1 = more aggressive, <1 = more lenient)
 */
export function computeDensityScale(zoom: number, threshold: number): number {
	if (zoom < threshold) {
		return 1 + Math.sqrt((threshold - zoom) / threshold) * 1.5;
	}
	return Math.max(0.3, 1 - (zoom - threshold) * 0.5);
}

/**
 * Compute minimum distance for density culling.
 *
 * @param baseDist  Base screen-space distance (labelDensityMinScreenDist)
 * @param maxDist   Maximum allowed distance (labelDensityMaxDist)
 * @param zoom      Current zoom level
 * @param threshold Zoom threshold for density scaling
 * @returns Minimum distance in screen pixels
 */
export function computeDensityMinDist(baseDist: number, maxDist: number, zoom: number, threshold: number): number {
	return Math.min(baseDist * computeDensityScale(zoom, threshold), maxDist);
}

/**
 * Generate label displacement offset candidates for overlap avoidance.
 * Returns 12 offsets sorted by distance from label center (farthest first by default).
 *
 * @param labelW  Label width in screen pixels
 * @param labelH  Label height in screen pixels
 * @param nodeScreenR  Node radius in screen pixels
 * @returns Array of {dx, dy} offsets in screen coordinates
 */
export function generateDisplacementOffsets(
	labelW: number,
	labelH: number,
	nodeScreenR: number,
): Array<{ dx: number; dy: number }> {
	const hw = labelW * 0.5;
	const pad = nodeScreenR + 2;
	return [
		{ dx: hw + pad, dy: pad + labelH }, // bottom-right
		{ dx: -(labelW + pad), dy: 0 }, // left
		{ dx: 0, dy: pad + labelH * 1.2 }, // below
		{ dx: hw + pad, dy: -(pad + labelH) }, // top-right
		{ dx: -(labelW + pad), dy: -(pad + labelH) }, // top-left
		{ dx: -(labelW + pad), dy: pad + labelH }, // bottom-left
		{ dx: hw + pad, dy: -(pad + labelH * 1.2) }, // above-right
		{ dx: -(hw + pad), dy: -(pad + labelH * 1.2) }, // above-left
		{ dx: labelW + pad * 2, dy: 0 }, // far right
		{ dx: 0, dy: -(pad + labelH * 1.5) }, // far above
		{ dx: -(labelW + pad * 2), dy: pad + labelH * 0.5 }, // far bottom-left
		{ dx: hw + pad, dy: pad + labelH * 1.5 }, // far below-right
	];
}

// ---------------------------------------------------------------------------
// quickSelect — O(n) average k-th smallest element (Hoare's selection)
// ---------------------------------------------------------------------------

export function quickSelect(arr: number[], k: number): number {
	if (arr.length <= 1) return arr[0] ?? 0;
	let lo = 0,
		hi = arr.length - 1;
	while (lo < hi) {
		const pivot = arr[(lo + hi) >> 1];
		let i = lo,
			j = hi;
		while (i <= j) {
			while (arr[i] < pivot) i++;
			while (arr[j] > pivot) j--;
			if (i <= j) {
				const tmp = arr[i];
				arr[i] = arr[j];
				arr[j] = tmp;
				i++;
				j--;
			}
		}
		if (j < k) lo = i;
		if (i > k) hi = j;
	}
	return k >= 0 && k < arr.length ? arr[k] : 0;
}

// ---------------------------------------------------------------------------
// LOD tier renderers
// ---------------------------------------------------------------------------

/** Subset of CardRenderConfig used by the LOD tier renderers. */
type TierCardConfig = Pick<Required<CardRenderConfig>, "filteredNodeAlpha">;

/**
 * Extreme zoom-out tier: draw fixed-size dots with stroke for visibility.
 * Hides individual (non-super) nodes — cluster summary bars rendered by
 * _updateGroupByLabels replace them for a cleaner overview. Super-nodes
 * (collapsed groups) still render as dots since they represent aggregated
 * clusters.
 */
export function renderExtremeZoomTier(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	worldScale: number,
	crc: TierCardConfig,
): void {
	const dotRadius = Math.max(1.5, 2 / worldScale);
	const strokeW = Math.max(0.5, 0.8 / worldScale);
	for (const pn of visible) {
		const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		if (!isSuperNode) {
			pn.gfx.visible = false;
			continue;
		}
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
		g.lineStyle(strokeW, 0x000000, nodeAlpha * 0.4);
		g.beginFill(pn.color, nodeAlpha);
		g.drawCircle(pn.data.x, pn.data.y, dotRadius);
		g.endFill();
	}
	g.lineStyle(0);
}

/**
 * Mid zoom tier: all circles (skip shape lookup + gradient for speed).
 * SuperNodes (collapsed groups) render at full alpha; individual nodes fade out.
 */
export function renderMidZoomTier(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	minWorldRadius: number,
	crc: TierCardConfig,
): void {
	g.lineStyle(0);
	for (const pn of visible) {
		const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		const effR = Math.max(pn.radius, minWorldRadius);
		let nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
		// Individual (non-super) nodes get extra fade at mid-zoom to reduce clumping
		if (!isSuperNode) nodeAlpha *= 0.4;
		g.beginFill(pn.color, nodeAlpha);
		g.drawCircle(pn.data.x, pn.data.y, effR);
		g.endFill();
	}
}
