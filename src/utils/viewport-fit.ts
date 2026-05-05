/**
 * Pure helpers used by GraphViewContainer.ensureViewportUtilization.
 *
 * Extracted from GraphViewContainer.ts to keep the god-object trim and
 * to make the geometry math independently unit-testable.
 *
 * Each function operates on plain `{ data: { x, y }, radius? }` shapes
 * so it does not depend on PixiNode/Map internals.
 */

interface SpreadNode {
	data: { x: number; y: number };
}

interface RadiusNode {
	radius?: number | null;
}

/** Average radius across the given nodes; returns `fallback` for an empty set. */
export function computeAvgRadius(nodes: readonly RadiusNode[], fallback = 12): number {
	if (nodes.length === 0) return fallback;
	let sum = 0;
	for (const n of nodes) sum += n.radius ?? fallback;
	return sum / nodes.length;
}

/**
 * If the bbox is degenerate along one axis (≈ a line), redistribute
 * positions along the thin axis so the bbox becomes roughly 2D before
 * uniform scaling.
 *
 * Mutates `nodes[i].data.{x,y}` in iteration order.
 */
export function spreadDegenerateAxis(
	nodes: readonly SpreadNode[],
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
		nodes.forEach((pn, i) => {
			const t = n > 1 ? i / (n - 1) - 0.5 : 0;
			pn.data.y = cy + t * targetH;
		});
	} else if (bboxH > degenerateThreshold && bboxW < degenerateThreshold) {
		const targetW = Math.max(bboxH * 0.3, (minUtil * vpArea) / bboxH);
		nodes.forEach((pn, i) => {
			const t = n > 1 ? i / (n - 1) - 0.5 : 0;
			pn.data.x = cx + t * targetW;
		});
	}
}

/**
 * Solve the quadratic in `s`:
 *   (s·posSpanW + 2·avgR) · (s·posSpanH + 2·avgR) = minUtil · vpArea
 * so that scaling positions by `s` and keeping radii constant yields a
 * post-scale bbox area that exactly meets the minimum utilization target.
 *
 * Falls back to an area-ratio approximation when the discriminant is
 * negative (degenerate geometry).
 */
export function computeViewportScaleFactor(
	bboxW: number,
	bboxH: number,
	avgR: number,
	minUtil: number,
	vpArea: number,
	util: number,
): number {
	const posSpanW = Math.max(bboxW - 2 * avgR, 1);
	const posSpanH = Math.max(bboxH - 2 * avgR, 1);
	const A = posSpanW * posSpanH;
	const B = 2 * avgR * (posSpanW + posSpanH);
	const C = 4 * avgR * avgR - minUtil * vpArea;
	const disc = B * B - 4 * A * C;
	return disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : Math.sqrt(minUtil / util);
}
