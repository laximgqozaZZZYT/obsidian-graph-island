import { CanvasGraphics } from "./canvas2d";
import type { GraphEdge, Cardinality, CardinalityRule, CardinalityRenderConfig } from "../types";
import {
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_SEQUENCE,
	EDGE_TYPE_HAS_TAG,
	EDGE_TYPE_LINK,
	EDGE_MARKER_SIZE,
	SEQUENCE_ARROW_SIZE,
	GENERIC_ARROW_MIN_SIZE,
	GENERIC_ARROW_RADIUS_FACTOR,
	GENERIC_ARROW_HALF_WIDTH,
	GENERIC_ARROW_TIP_OFFSET,
	ARROW_HALF_WIDTH_FACTOR,
	MARKER_STROKE_WIDTH,
	MARKER_FILL_ALPHA_RATIO,
	MARKER_HALF_WIDTH,
} from "../constants";

// Minimal position data needed for source/target (mirrors local Pos in EdgeRenderer.ts).
interface Pos {
	x: number;
	y: number;
	id?: string;
}

// ---------------------------------------------------------------------------
// Marker drawing
// ---------------------------------------------------------------------------

/**
 * Draw a marker at the end of an ontology edge.
 * - inheritance: hollow triangle at target (UML generalization)
 * - aggregation: hollow diamond at source (UML aggregation)
 */
export function drawEdgeMarker(
	g: CanvasGraphics,
	src: Pos,
	tgt: Pos,
	type: typeof EDGE_TYPE_INHERITANCE | typeof EDGE_TYPE_AGGREGATION,
	color: number,
	alpha: number,
	bgColor: number,
) {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	const sz = EDGE_MARKER_SIZE;

	if (type === EDGE_TYPE_INHERITANCE) {
		const bx = tgt.x - ux * sz;
		const by = tgt.y - uy * sz;
		g.lineStyle({ width: MARKER_STROKE_WIDTH, color, alpha, native: true });
		g.beginFill(bgColor, alpha * MARKER_FILL_ALPHA_RATIO);
		g.moveTo(tgt.x, tgt.y);
		g.lineTo(bx + px * sz * MARKER_HALF_WIDTH, by + py * sz * MARKER_HALF_WIDTH);
		g.lineTo(bx - px * sz * MARKER_HALF_WIDTH, by - py * sz * MARKER_HALF_WIDTH);
		g.closePath();
		g.endFill();
	} else {
		const mx = src.x + ux * sz;
		const my = src.y + uy * sz;
		const fx = src.x + ux * sz * 2;
		const fy = src.y + uy * sz * 2;
		g.lineStyle({ width: MARKER_STROKE_WIDTH, color, alpha, native: true });
		g.beginFill(bgColor, alpha * MARKER_FILL_ALPHA_RATIO);
		g.moveTo(src.x, src.y);
		g.lineTo(mx + px * sz * ARROW_HALF_WIDTH_FACTOR, my + py * sz * ARROW_HALF_WIDTH_FACTOR);
		g.lineTo(fx, fy);
		g.lineTo(mx - px * sz * ARROW_HALF_WIDTH_FACTOR, my - py * sz * ARROW_HALF_WIDTH_FACTOR);
		g.closePath();
		g.endFill();
	}
}

/**
 * Draw a filled arrow at the target end of a sequence edge (→ direction).
 */
export function drawSequenceArrow(g: CanvasGraphics, src: Pos, tgt: Pos, color: number, alpha: number) {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	const sz = SEQUENCE_ARROW_SIZE;

	const bx = tgt.x - ux * sz;
	const by = tgt.y - uy * sz;
	g.lineStyle({ width: 1, color, alpha, native: true });
	g.beginFill(color, alpha);
	g.moveTo(tgt.x, tgt.y);
	g.lineTo(bx + px * sz * ARROW_HALF_WIDTH_FACTOR, by + py * sz * ARROW_HALF_WIDTH_FACTOR);
	g.lineTo(bx - px * sz * ARROW_HALF_WIDTH_FACTOR, by - py * sz * ARROW_HALF_WIDTH_FACTOR);
	g.closePath();
	g.endFill();
}

/**
 * Draw a small filled arrow at the target end of any edge (generic direction indicator).
 * Smaller than the sequence arrow to avoid visual clutter.
 */
export function drawGenericArrow(
	g: CanvasGraphics,
	src: Pos,
	tgt: Pos,
	color: number,
	alpha: number,
	targetRadius: number,
	worldScale = 1,
) {
	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const len = Math.sqrt(dx * dx + dy * dy);
	if (len < 1) return;

	const ux = dx / len;
	const uy = dy / len;
	const px = -uy;
	const py = ux;
	// Scale arrow size: ensure minimum screen-pixel visibility at any zoom
	const minScreenPx = 6;
	const minWorldSize = worldScale > 0 ? minScreenPx / worldScale : GENERIC_ARROW_MIN_SIZE;
	const sz = Math.max(minWorldSize, targetRadius * GENERIC_ARROW_RADIUS_FACTOR);
	const hw = sz * GENERIC_ARROW_HALF_WIDTH;

	// Place arrow tip at the edge of the target node circle
	const tipX = tgt.x - ux * (targetRadius + GENERIC_ARROW_TIP_OFFSET);
	const tipY = tgt.y - uy * (targetRadius + GENERIC_ARROW_TIP_OFFSET);
	const bx = tipX - ux * sz;
	const by = tipY - uy * sz;
	g.lineStyle({ width: 0 });
	g.beginFill(color, alpha);
	g.moveTo(tipX, tipY);
	g.lineTo(bx + px * hw, by + py * hw);
	g.lineTo(bx - px * hw, by - py * hw);
	g.closePath();
	g.endFill();
}

// ---------------------------------------------------------------------------
// Cardinality (crow's foot) helpers
// ---------------------------------------------------------------------------

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
) {
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
