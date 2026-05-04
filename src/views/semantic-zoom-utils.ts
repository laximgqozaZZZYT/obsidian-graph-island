/**
 * Pure helpers for semantic-zoom rendering.
 * Extracted from semantic-zoom-renderer.ts so they can be unit-tested
 * without a CanvasGraphics / PixiNode dependency.
 */

export const SEMANTIC_TIER_DOT = 1;
export const SEMANTIC_TIER_CIRCLE = 2;
export const SEMANTIC_TIER_COMPACT = 3;
export const SEMANTIC_TIER_FULL = 4;

export type SemanticTier =
	| typeof SEMANTIC_TIER_DOT
	| typeof SEMANTIC_TIER_CIRCLE
	| typeof SEMANTIC_TIER_COMPACT
	| typeof SEMANTIC_TIER_FULL;

/**
 * Decide which LOD tier to render based on the node's screen-space pixel size.
 * Thresholds are read from RenderThresholds in the calling site.
 *
 *   tier 1: screenPx < dotPx              → colored dot
 *   tier 2: dotPx ≤ screenPx < compactPx  → circle + label
 *   tier 3: compactPx ≤ screenPx < fullPx → compact card
 *   tier 4: fullPx ≤ screenPx             → full card
 */
export function getSemanticZoomTier(screenPx: number, dotPx: number, compactPx: number, fullPx: number): SemanticTier {
	if (screenPx < dotPx) return SEMANTIC_TIER_DOT;
	if (screenPx < compactPx) return SEMANTIC_TIER_CIRCLE;
	if (screenPx < fullPx) return SEMANTIC_TIER_COMPACT;
	return SEMANTIC_TIER_FULL;
}

/**
 * Clamp a card font size so it stays readable across zoom levels.
 *
 * The base font scales inversely with worldScale (so it stays a constant size
 * on screen as the user zooms), but is bounded:
 *   - lower bound: fontMin (never smaller than this in world units)
 *   - upper bound: fontBase * scaleCap (never larger than scaleCap× base)
 */
export function clampCardFontSize(fontMin: number, fontBase: number, scaleCap: number, worldScale: number): number {
	if (worldScale <= 0 || !Number.isFinite(worldScale)) {
		return fontBase * scaleCap;
	}
	return Math.min(Math.max(fontMin, fontBase / worldScale), fontBase * scaleCap);
}

/**
 * Apply the timeline-filter dimming multiplier when a node is "filtered out"
 * but still rendered (e.g. greyed during a timeline scrub).
 */
export function computeNodeAlpha(baseAlpha: number, isFiltered: boolean, filteredMultiplier: number): number {
	return isFiltered ? baseAlpha * filteredMultiplier : baseAlpha;
}
