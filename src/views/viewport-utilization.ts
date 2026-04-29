/**
 * Viewport utilization helpers — extracted from GraphViewContainer to keep the
 * god-object compact and to allow direct unit testing of the math.
 *
 * The flow ensures node positions occupy at least `minUtil` of the viewport
 * before auto-fit. Three stages, each pure (or position-mutating only):
 *   1. Same-position fallback — spread nodes radially when bbox area ≈ 0.
 *   2. Degenerate-axis spread — push line-shaped distributions onto a 2-D plane.
 *   3. Uniform scale — solve a quadratic so scaled bbox + radii hit `minUtil`.
 */

import { computeNodeBBox } from "../utils/graph-helpers";

/** Minimal node shape required by the viewport-utilization helpers. */
export interface ViewportNode {
	data: { x: number; y: number };
	radius: number;
}

/** Average radius across an iterable of nodes (default 12 if none). */
export function computeAvgNodeRadius(nodes: Iterable<ViewportNode>): number {
	let sum = 0;
	let count = 0;
	for (const pn of nodes) {
		sum += pn.radius ?? 12;
		count++;
	}
	return count > 0 ? sum / count : 12;
}

/**
 * Quadratic-solver scale factor so that scaled positions + constant radii
 * exactly meet the `minUtil` threshold. Falls back to sqrt(minUtil/util) on a
 * negative discriminant (theoretically unreachable for positive inputs but
 * kept for robustness).
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

/**
 * Spread nodes along the secondary axis when the primary span is far wider
 * than the threshold. Mutates `nodes[i].data.x` or `data.y` in place.
 */
export function spreadDegenerateAxis<T extends ViewportNode>(
	nodes: T[],
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
 * Scale node world positions outward so the graph fills at least `minUtil`
 * of the viewport at z=1.0. Mutates positions in place. Idempotent: repeat
 * calls converge to the same final layout.
 */
export function ensureViewportUtilization<T extends ViewportNode>(
	nodes: T[],
	vpW: number,
	vpH: number,
	minUtil: number,
): void {
	if (minUtil <= 0 || nodes.length < 2) return;

	const bboxItems = nodes.map((pn) => ({ x: pn.data.x, y: pn.data.y, radius: pn.radius }));
	const bbox = computeNodeBBox(bboxItems);
	const bboxW = bbox.maxX - bbox.minX;
	const bboxH = bbox.maxY - bbox.minY;
	const bboxArea = bboxW * bboxH;
	const vpArea = vpW * vpH;
	if (vpArea <= 0) return;

	const util = bboxArea / vpArea;
	if (util >= minUtil) return;

	const cx = (bbox.minX + bbox.maxX) / 2;
	const cy = (bbox.minY + bbox.maxY) / 2;

	if (bboxArea < 1) {
		const defaultR = Math.sqrt(vpW * vpH * minUtil) / 2;
		const n = nodes.length;
		nodes.forEach((pn, i) => {
			const angle = (2 * Math.PI * i) / n;
			pn.data.x = cx + defaultR * Math.cos(angle);
			pn.data.y = cy + defaultR * Math.sin(angle);
		});
		return;
	}

	const avgNodeR = computeAvgNodeRadius(nodes);
	const degenerateThreshold = avgNodeR * 4;
	spreadDegenerateAxis(nodes, cx, cy, bboxW, bboxH, degenerateThreshold, minUtil, vpArea);

	const bboxItems2 = nodes.map((pn) => ({ x: pn.data.x, y: pn.data.y, radius: pn.radius }));
	const bbox2 = computeNodeBBox(bboxItems2);
	const bboxArea2 = (bbox2.maxX - bbox2.minX) * (bbox2.maxY - bbox2.minY);
	const util2 = bboxArea2 / vpArea;
	if (util2 >= minUtil) return;

	const cx2 = (bbox2.minX + bbox2.maxX) / 2;
	const cy2 = (bbox2.minY + bbox2.maxY) / 2;
	const scaleFactor = computeViewportScaleFactor(
		bbox2.maxX - bbox2.minX,
		bbox2.maxY - bbox2.minY,
		minUtil,
		vpArea,
		util2,
		avgNodeR,
	);
	for (const pn of nodes) {
		pn.data.x = cx2 + (pn.data.x - cx2) * scaleFactor;
		pn.data.y = cy2 + (pn.data.y - cy2) * scaleFactor;
	}
}
