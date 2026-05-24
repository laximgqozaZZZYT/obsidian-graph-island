import type { ClusterRect } from "./layout";
import { clusterHue } from "./canvas-utils";

// Render outline-only cluster enclosures. Larger clusters draw first so
// the smaller / nested ones stay on top — same as Euler-diagram convention
// where the inner set is always visible.
//
// Two render modes per cluster:
//  (a) `outline` set: stroke each line segment in the per-cell boundary
//      (= rectilinear polygon following the owned cells exactly). This
//      naturally produces holes (= cells inside the bbox but not owned)
//      and exclaves (= disconnected groups of owned cells), so non-
//      intersecting clusters never visually overlap.
//  (b) fallback: stroke the AABB rectangle. Used when the cluster has
//      no precomputed outline (= some test scenarios).
export function drawEnclosures(
	ctx: CanvasRenderingContext2D,
	clusters: ClusterRect[],
	highlightedClusters: Set<string>,
	zoom: number,
): void {
	const sortedClusters = [...clusters].sort(
		(a, b) => b.width * b.height - a.width * a.height,
	);
	const strokeW = 1.6 / zoom;
	const accentStrokeW = 3.2 / zoom;
	for (const c of sortedClusters) {
		const hue = clusterHue(c.groupKey);
		const isHigh = highlightedClusters.has(c.groupKey);
		ctx.strokeStyle = isHigh
			? "#ff9d3f"
			: `hsla(${hue}, 70%, 62%, 0.9)`;
		ctx.lineWidth = isHigh ? accentStrokeW : strokeW;
		if (c.outline && c.outline.length > 0) {
			ctx.beginPath();
			for (const seg of c.outline) {
				ctx.moveTo(seg.x1, seg.y1);
				ctx.lineTo(seg.x2, seg.y2);
			}
			ctx.stroke();
		} else {
			ctx.strokeRect(c.x, c.y, c.width, c.height);
		}
	}
}
