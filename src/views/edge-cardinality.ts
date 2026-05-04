import type { CanvasGraphics } from "./canvas2d";
import type { Cardinality, CardinalityRenderConfig, CardinalityRule, GraphEdge } from "../types";
import {
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_HAS_TAG,
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_LINK,
	EDGE_TYPE_SEQUENCE,
} from "../constants";

// Minimal position data needed for source/target endpoints.
interface Pos {
	x: number;
	y: number;
}

/**
 * Resolve which cardinality rule applies to an edge.
 * Checks user-defined rules first (first match wins), then falls back
 * to default cardinality based on edge type.
 */
export function resolveCardinality(edge: GraphEdge, rules: CardinalityRule[]): CardinalityRule | null {
	for (const rule of rules) {
		if (rule.edgeType && rule.edgeType !== edge.type) continue;
		if (rule.relation && !edge.relation?.includes(rule.relation)) continue;
		return rule;
	}
	return getDefaultCardinality(edge);
}

/**
 * Default cardinality inference based on edge type.
 * Returns null for unknown types (no markers drawn).
 */
export function getDefaultCardinality(edge: GraphEdge): CardinalityRule | null {
	switch (edge.type) {
		case EDGE_TYPE_INHERITANCE:
			return { sourceCardinality: "1", targetCardinality: "0..N" };
		case EDGE_TYPE_AGGREGATION:
			return { sourceCardinality: "1", targetCardinality: "0..N" };
		case EDGE_TYPE_HAS_TAG:
			return { sourceCardinality: "N", targetCardinality: "1" };
		case EDGE_TYPE_LINK:
			return { sourceCardinality: "1", targetCardinality: "0..1" };
		case EDGE_TYPE_SEQUENCE:
			return { sourceCardinality: "1", targetCardinality: "1" };
		default:
			return null;
	}
}

/**
 * Draw a cardinality symbol near a node endpoint.
 *
 * @param g         - Graphics context
 * @param nearNode  - The node this symbol is drawn next to
 * @param farNode   - The node on the opposite end
 * @param cardinality - Which symbol to draw
 * @param color     - Line color
 * @param alpha     - Line alpha
 * @param nodeRadius - Radius of the near node
 */
export function drawCardinalityMarker(
	g: CanvasGraphics,
	nearNode: Pos,
	farNode: Pos,
	cardinality: Cardinality,
	color: number,
	alpha: number,
	nodeRadius: number,
	cfg: Required<CardinalityRenderConfig>,
): void {
	const dx = farNode.x - nearNode.x;
	const dy = farNode.y - nearNode.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	// Unit vector from nearNode toward farNode
	const ux = dx / len;
	const uy = dy / len;
	// Perpendicular vector
	const px = -uy;
	const py = ux;

	const sz = Math.max(cfg.markerSizeMin, nodeRadius * cfg.markerSizeRatio);
	const offset = nodeRadius + cfg.markerOffset;

	// Base point: just outside the node boundary
	const bx = nearNode.x + ux * offset;
	const by = nearNode.y + uy * offset;

	g.lineStyle({ width: cfg.lineWidth, color, alpha: alpha * cfg.alpha, native: true });

	switch (cardinality) {
		case "1":
			// Single perpendicular bar
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			break;

		case "0..1":
			// Perpendicular bar + small circle further out
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			g.drawCircle(
				bx + ux * sz * cfg.circleOffsetFactor01,
				by + uy * sz * cfg.circleOffsetFactor01,
				sz * cfg.circleRadiusFactor,
			);
			break;

		case "N": {
			// Crow's foot (three lines converging) + perpendicular bar
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			const forkX = bx + ux * sz * cfg.crowsFootForkFactor;
			const forkY = by + uy * sz * cfg.crowsFootForkFactor;
			g.moveTo(forkX, forkY);
			g.lineTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.moveTo(forkX, forkY);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			g.moveTo(forkX, forkY);
			g.lineTo(bx, by);
			break;
		}

		case "0..N":
			// Crow's foot + small circle
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx + ux * sz * cfg.crowsFootForkFactor, by + uy * sz * cfg.crowsFootForkFactor);
			g.moveTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			g.lineTo(bx + ux * sz * cfg.crowsFootForkFactor, by + uy * sz * cfg.crowsFootForkFactor);
			g.moveTo(bx, by);
			g.lineTo(bx + ux * sz * cfg.crowsFootForkFactor, by + uy * sz * cfg.crowsFootForkFactor);
			g.drawCircle(
				bx + ux * sz * cfg.circleOffsetFactor0N,
				by + uy * sz * cfg.circleOffsetFactor0N,
				sz * cfg.circleRadiusFactor,
			);
			break;

		case "1..N": {
			// Crow's foot + perpendicular bar
			g.moveTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			const forkX2 = bx + ux * sz * cfg.crowsFootForkFactor;
			const forkY2 = by + uy * sz * cfg.crowsFootForkFactor;
			g.moveTo(forkX2, forkY2);
			g.lineTo(bx + px * sz * 0.5, by + py * sz * 0.5);
			g.moveTo(forkX2, forkY2);
			g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
			break;
		}
	}
}
