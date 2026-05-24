import type { ClusterRect } from "./layout";
import { clusterHue } from "./canvas-utils";

// Render cluster enclosures.
//
// Per current user spec (2026-05-24): each cluster's enclosure is the
// union of one or more axis-aligned rectangles (= `cluster.pieces`).
// Multiple pieces (= 離れ島 / exclaves) are permitted, provided no
// piece overlaps a non-member's cell (= V1 = 0 by construction in
// cluster-bbox.ts).
//
// Render order per cluster:
//   1. Fill each piece with the cluster hue at moderate opacity.
//      Overlapping pieces from different clusters blend additively, so
//      Euler intersections look more saturated.
//   2. Stroke each piece's outline on top of the fill.
//
// Caller (view.ts) is responsible for the overall z-order: enclosures
// run FIRST in the body draw, then edges, then cards on top.
//
// Fallback (only when `pieces` is not populated): use the legacy
// `outline` segments or the AABB rect — kept so test scenes that don't
// run the orchestrator still draw something.
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

	// Pass 1: fills. Draw all clusters' fills first so outlines (pass 2)
	// sit cleanly on top.
	for (const c of sortedClusters) {
		const hue = clusterHue(c.groupKey);
		const isHigh = highlightedClusters.has(c.groupKey);
		ctx.fillStyle = isHigh
			? "rgba(255, 157, 63, 0.40)"
			: `hsla(${hue}, 60%, 50%, 0.32)`;
		if (c.pieces && c.pieces.length > 0) {
			ctx.beginPath();
			for (const p of c.pieces) ctx.rect(p.x, p.y, p.w, p.h);
			ctx.fill();
		} else if (c.cells && c.cells.length > 0) {
			ctx.beginPath();
			for (const cell of c.cells) ctx.rect(cell.x, cell.y, cell.w, cell.h);
			ctx.fill();
		}
	}

	// Pass 2: outlines.
	for (const c of sortedClusters) {
		const hue = clusterHue(c.groupKey);
		const isHigh = highlightedClusters.has(c.groupKey);
		ctx.strokeStyle = isHigh
			? "#ff9d3f"
			: `hsla(${hue}, 70%, 62%, 0.9)`;
		ctx.lineWidth = isHigh ? accentStrokeW : strokeW;
		if (c.pieces && c.pieces.length > 0) {
			for (const p of c.pieces) ctx.strokeRect(p.x, p.y, p.w, p.h);
		} else if (c.outline && c.outline.length > 0) {
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
