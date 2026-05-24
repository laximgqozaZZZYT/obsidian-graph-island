import type { ClusterRect } from "./layout";
import { clusterHue } from "./canvas-utils";

// Render cluster enclosures. Larger clusters draw first so the
// smaller / nested ones stay on top — Euler-diagram convention.
//
// Per cluster we draw 2 layers:
//   1. Tinted fill: each cell of the carved polygon, filled with the
//      cluster's hue at low opacity. Overlapping clusters (= cells
//      belonging to multiple memberships) blend additively, so an
//      Euler intersection reads as a slightly more saturated patch.
//   2. Outline: rectilinear polygon boundary, drawn on top of the
//      fills. Stroke at full opacity.
//
// Caller is responsible for the overall z-order: enclosures (this)
// are drawn FIRST in view.ts, then edges, then cards on top.
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

	// Pass 1: fills (cell-aligned). Drawn first so outlines sit cleanly
	// on top of the tinted region. Opacity raised so the cluster
	// territory reads clearly even on a single fill layer — overlapping
	// clusters still blend additively (= intersections look more
	// saturated than single-membership regions).
	for (const c of sortedClusters) {
		if (!c.cells || c.cells.length === 0) continue;
		const hue = clusterHue(c.groupKey);
		const isHigh = highlightedClusters.has(c.groupKey);
		ctx.fillStyle = isHigh
			? "rgba(255, 157, 63, 0.40)"
			: `hsla(${hue}, 60%, 50%, 0.32)`;
		ctx.beginPath();
		for (const cell of c.cells) {
			ctx.rect(cell.x, cell.y, cell.w, cell.h);
		}
		ctx.fill();
	}

	// Pass 2: outlines.
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
