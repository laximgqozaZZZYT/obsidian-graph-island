import type { ClusterRect } from "./layout";
import { clusterHue } from "./canvas-utils";

// Render cluster enclosures. Larger clusters draw first so the
// smaller / nested ones stay on top — Euler-diagram convention.
//
// Each cluster:
//  - Outer outline: SOLID stroke around the AABB rectangle (= the
//    cluster's bounding rectangle, single connected, no exclaves,
//    always rectangular per the latest user spec).
//  - Holes (cells inside the AABB but not owned by the cluster): a
//    DASHED stroke around each hole cell so users see "this cell is
//    inside the bbox but does NOT belong to the cluster". The dash
//    pattern uses the cluster's own hue at half opacity — visually
//    distinguishable from the solid outer stroke.
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
	const holeStrokeW = 1.0 / zoom;
	const dashLen = 6 / zoom;
	const dashGap = 4 / zoom;

	for (const c of sortedClusters) {
		const hue = clusterHue(c.groupKey);
		const isHigh = highlightedClusters.has(c.groupKey);
		const baseColour = isHigh
			? "#ff9d3f"
			: `hsla(${hue}, 70%, 62%, 0.9)`;
		// Outer solid rectangle.
		ctx.setLineDash([]);
		ctx.strokeStyle = baseColour;
		ctx.lineWidth = isHigh ? accentStrokeW : strokeW;
		ctx.strokeRect(c.x, c.y, c.width, c.height);

		// Hole markers (cells inside AABB but not owned).
		if (c.holes && c.holes.length > 0) {
			ctx.setLineDash([dashLen, dashGap]);
			ctx.strokeStyle = isHigh
				? "rgba(255, 157, 63, 0.45)"
				: `hsla(${hue}, 50%, 55%, 0.45)`;
			ctx.lineWidth = holeStrokeW;
			ctx.beginPath();
			for (const h of c.holes) {
				ctx.rect(h.x, h.y, h.w, h.h);
			}
			ctx.stroke();
		}
	}
	// Reset dash so following draws are unaffected.
	ctx.setLineDash([]);
}
