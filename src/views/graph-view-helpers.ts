/**
 * Pure helpers extracted from GraphViewContainer to keep the god-object file
 * under its Max Allowed budget. Functions here MUST stay free of `this`,
 * Obsidian API dependencies, and PixiJS/Canvas side effects.
 */

/**
 * Compute a uniform scale factor via quadratic equation so that, when every
 * node position is multiplied by the returned factor, the resulting bbox
 * (positions + constant node radii) covers exactly `minUtil * vpArea` of the
 * viewport. Falls back to a sqrt ratio when the discriminant is negative.
 *
 * @param bboxW   bounding-box width in world units (post degenerate-axis fix)
 * @param bboxH   bounding-box height in world units
 * @param minUtil minimum viewport utilization ratio (0..1)
 * @param vpArea  viewport area in world units squared
 * @param util    current utilization ratio (used only as fallback denominator)
 * @param avgR    average node radius in world units
 */
export function computeViewportScaleFactor(
	bboxW: number,
	bboxH: number,
	minUtil: number,
	vpArea: number,
	util: number,
	avgR: number,
): number {
	const posSpanW = Math.max(bboxW - 2 * avgR, 1);
	const posSpanH = Math.max(bboxH - 2 * avgR, 1);
	const A = posSpanW * posSpanH;
	const B = 2 * avgR * (posSpanW + posSpanH);
	const C = 4 * avgR * avgR - minUtil * vpArea;
	const disc = B * B - 4 * A * C;
	return disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : Math.sqrt(minUtil / util);
}
