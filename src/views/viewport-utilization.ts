/**
 * Viewport utilization helpers.
 *
 * Pure functions extracted from GraphViewContainer.ensureViewportUtilization
 * so the math is testable without a Pixi/Canvas runtime.
 */

/** Mutable position used by spreadDegenerateAxis. */
export interface MutablePoint {
	x: number;
	y: number;
}

/**
 * Compute average node radius across the supplied nodes.
 * Returns `defaultRadius` when the list is empty (avoids division by zero).
 */
export function computeAvgNodeRadius(nodes: readonly { radius?: number }[], defaultRadius = 12): number {
	if (nodes.length === 0) return defaultRadius;
	let sum = 0;
	for (const n of nodes) sum += n.radius ?? defaultRadius;
	return sum / nodes.length;
}

/**
 * Spread nodes along a degenerate (near-zero) axis so the bbox becomes
 * roughly square before uniform scaling. Mutates `nodes[i].x|y` in place.
 *
 * - When width is wide and height is collapsed, spread along Y.
 * - When height is tall and width is collapsed, spread along X.
 * - Otherwise no-op.
 */
export function spreadDegenerateAxis(
	nodes: MutablePoint[],
	cx: number,
	cy: number,
	bboxW: number,
	bboxH: number,
	degenerateThreshold: number,
	minUtil: number,
	vpArea: number,
): void {
	const n = nodes.length;
	if (bboxW > degenerateThreshold && bboxH < degenerateThreshold) {
		const targetH = Math.max(bboxW * 0.3, (minUtil * vpArea) / bboxW);
		nodes.forEach((node, i) => {
			const t = n > 1 ? i / (n - 1) - 0.5 : 0;
			node.y = cy + t * targetH;
		});
	} else if (bboxH > degenerateThreshold && bboxW < degenerateThreshold) {
		const targetW = Math.max(bboxH * 0.3, (minUtil * vpArea) / bboxH);
		nodes.forEach((node, i) => {
			const t = n > 1 ? i / (n - 1) - 0.5 : 0;
			node.x = cx + t * targetW;
		});
	}
}

/**
 * Compute the uniform scale factor via quadratic equation so that
 * scaled positions + constant radii meet the minUtil threshold exactly.
 *
 * Solves `A x^2 + B x + C = 0` where x is the scale factor.
 * Falls back to `sqrt(minUtil / util)` when the discriminant is negative
 * (no real root means the constant-radius padding alone already exceeds
 * the target — caller proceeds with the geometric mean estimate).
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
