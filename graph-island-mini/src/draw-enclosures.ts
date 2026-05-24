import type { ClusterRect } from "./layout";
import { clusterHue } from "./canvas-utils";

// Render cluster enclosures. Larger clusters draw first so the
// smaller / nested ones stay on top — Euler-diagram convention.
//
// Outline = rectilinear polygon boundary of the cluster's owned-cell
// closure (= cells with member cards, plus bridge cells linking any
// disconnected groups, plus fills for internal cavities). Single
// closed loop, no exclaves, no internal holes — satisfies the latest
// user spec where both 飛び地 and 空洞 are forbidden. Falls back to
// the AABB rect when outline is absent (e.g. test scenarios).
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
