import type { ClusterRect } from "./layout";
import { clusterHue } from "./canvas-utils";

// Render outline-only cluster enclosures. Larger clusters draw first so
// the smaller / nested ones stay on top — same as Euler-diagram convention
// where the inner set is always visible.
//
// Bug-fix anchor: Bug #3 ("unrelated nodes in group enclosure") shows up
// HERE as a visual artefact — the stroke rectangle covers cells that
// aren't actually members of the cluster. But the rectangle dimensions
// come from cluster-bbox.ts; this function is only the renderer. Keeping
// the two split means we can rule out "the renderer was wrong" while
// debugging the bbox itself.
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
		ctx.strokeRect(c.x, c.y, c.width, c.height);
	}
}
