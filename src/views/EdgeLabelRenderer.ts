/**
 * Edge label rendering — extracted from EdgeRenderer.ts
 *
 * Handles text label placement, collision avoidance, and drawing on edges.
 */
import { CanvasContainer, CanvasText } from "./canvas2d";
import type { GraphEdge } from "../types";
import { wcagContrastRatio, contrastColor } from "../utils/color";
import {
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_SEQUENCE,
	EDGE_TYPE_SIMILAR,
	EDGE_TYPE_SIBLING,
	EDGE_TYPE_HAS_TAG,
} from "../constants";
import { shouldSkipEdge, shouldSkipByDirection, type EdgeDrawConfig } from "./EdgeRenderer";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EDGE_LABEL_FONT_SIZE_DEFAULT = 10;
/** A11y: edge label background for contrast (WCAG 1.4.3) */
export const EDGE_LABEL_BG_ALPHA = 0.75;
/** Edge label alpha */
export const EDGE_LABEL_ALPHA = 0.7;
/** Edge label resolution */
export const EDGE_LABEL_RESOLUTION = 2;
/** Maximum number of edge labels rendered */
export const MAX_EDGE_LABELS = 200;

const SMART_LABEL_HW = 25; // estimated half-width of a label
const SMART_LABEL_HH = 7; // estimated half-height of a label
const SMART_SHIFT_STEP = 12; // shift distance per collision attempt
const SMART_MAX_SHIFTS = 4; // maximum shift attempts
const PERPENDICULAR_OFFSET = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Pos {
	x: number;
	y: number;
	id?: string;
}

/** A11y: ensure edge label text meets WCAG 4.5:1 contrast against its bg pill */
export function a11yEdgeLabelFill(isDark: boolean): number {
	const bg = isDark ? 0x1a1a2e : 0xf0f0f4;
	const candidate = isDark ? 0xcccccc : 0x444444;
	return wcagContrastRatio(candidate, bg) >= 4.5 ? candidate : contrastColor(bg);
}

// ---------------------------------------------------------------------------
// Label text resolution
// ---------------------------------------------------------------------------

export function getEdgeLabel(e: GraphEdge): string | null {
	if (e.relation) return e.relation;
	switch (e.type) {
		case EDGE_TYPE_INHERITANCE:
			return "is-a";
		case EDGE_TYPE_AGGREGATION:
			return "has-a";
		case EDGE_TYPE_SIMILAR:
			return "\u2248"; // ≈
		case EDGE_TYPE_SIBLING:
			return "sibling";
		case EDGE_TYPE_SEQUENCE:
			return "seq";
		case EDGE_TYPE_HAS_TAG:
			return null;
		default:
			return null; // plain links — no label
	}
}

// ---------------------------------------------------------------------------
// Label collection & filtering
// ---------------------------------------------------------------------------

/** Collect labelable edges, filtering hidden types and those without a label. */
export function collectLabelableEdges(
	edges: GraphEdge[],
	cfg: EdgeDrawConfig,
): { edge: GraphEdge; label: string }[] {
	const labelable: { edge: GraphEdge; label: string }[] = [];
	for (const e of edges) {
		if (shouldSkipEdge(e, cfg)) continue;
		if (shouldSkipByDirection(e, cfg)) continue;
		const label = getEdgeLabel(e);
		if (!label) continue;
		labelable.push({ edge: e, label });
	}
	return labelable;
}

/** Trim labelable list to effectiveMax, prioritizing high-degree endpoints. */
export function trimLabelsByDegree(
	labelable: { edge: GraphEdge; label: string }[],
	effectiveMax: number,
	degrees: Map<string, number>,
): void {
	if (labelable.length <= effectiveMax) return;
	if (degrees.size > 0) {
		labelable.sort((a, b) => {
			const da = (degrees.get(a.edge.source as string) ?? 0) + (degrees.get(a.edge.target as string) ?? 0);
			const db = (degrees.get(b.edge.source as string) ?? 0) + (degrees.get(b.edge.target as string) ?? 0);
			return db - da;
		});
	}
	labelable.length = effectiveMax;
}

// ---------------------------------------------------------------------------
// Label placement
// ---------------------------------------------------------------------------

/** Seed placedRects with node positions to prevent label/node overlap. */
export function seedNodeRects(
	labelable: { edge: GraphEdge }[],
	resolvePos: (ref: string | object) => Pos | undefined,
	nodeRadii: Map<string, number> | null,
): { x: number; y: number; hw: number; hh: number }[] {
	const rects: { x: number; y: number; hw: number; hh: number }[] = [];
	const seenNodes = new Set<string>();
	for (const { edge: e } of labelable) {
		for (const ref of [e.source, e.target]) {
			const id = typeof ref === "string" ? ref : (ref as { id?: string })?.id;
			if (!id || seenNodes.has(id)) continue;
			seenNodes.add(id);
			const pos = resolvePos(ref);
			if (pos) {
				const nr = nodeRadii?.get(id) ?? 15;
				rects.push({ x: pos.x, y: pos.y, hw: nr, hh: nr });
			}
		}
	}
	return rects;
}

/** Compute label position with optional offset and smart collision avoidance. */
export function computeLabelPosition(
	sp: Pos,
	tp: Pos,
	placement: "center" | "offset" | "smart",
	placedRects: { x: number; y: number; hw: number; hh: number }[],
): { x: number; y: number } {
	const mx = (sp.x + tp.x) / 2;
	const my = (sp.y + tp.y) / 2;
	if (placement === "center") return { x: mx, y: my };

	const dx = tp.x - sp.x;
	const dy = tp.y - sp.y;
	const len = Math.sqrt(dx * dx + dy * dy) || 1;
	const nx = -dy / len;
	const ny = dx / len;
	let labelX = mx + nx * PERPENDICULAR_OFFSET;
	let labelY = my + ny * PERPENDICULAR_OFFSET;

	if (placement === "smart") {
		for (let attempt = 0; attempt < SMART_MAX_SHIFTS; attempt++) {
			let collides = false;
			for (const rect of placedRects) {
				if (Math.abs(labelX - rect.x) < SMART_LABEL_HW + rect.hw && Math.abs(labelY - rect.y) < SMART_LABEL_HH + rect.hh) {
					collides = true;
					break;
				}
			}
			if (!collides) break;
			labelX += nx * SMART_SHIFT_STEP;
			labelY += ny * SMART_SHIFT_STEP;
		}
		placedRects.push({ x: labelX, y: labelY, hw: SMART_LABEL_HW, hh: SMART_LABEL_HH });
	}
	return { x: labelX, y: labelY };
}

// ---------------------------------------------------------------------------
// Main draw function
// ---------------------------------------------------------------------------

/**
 * Draw text labels on edges into a dedicated CanvasContainer.
 *
 * Labels are placed at the midpoint of each edge.  When the total number of
 * labelable edges exceeds MAX_EDGE_LABELS the labels are skipped entirely to
 * avoid performance degradation from excessive CanvasText objects.
 */
export function drawEdgeLabels(
	container: CanvasContainer,
	edges: GraphEdge[],
	resolvePos: (ref: string | object) => Pos | undefined,
	cfg: EdgeDrawConfig,
): void {
	// Remove all previous labels
	while (container.children.length > 0) {
		const child = container.children[container.children.length - 1];
		container.removeChild(child);
		child.destroy();
	}

	if (!cfg.showEdgeLabels) return;

	// Auto-hide edge labels at low zoom with gradual fade
	const zoom = cfg.worldScale ?? 1;
	const labelHideZ = cfg.edgeLabelZoomHide ?? 0.15;
	const labelFadeZ = cfg.edgeLabelZoomFade ?? 0.3;
	if (zoom < labelHideZ) return;
	const edgeLabelAlpha = zoom < labelFadeZ ? (zoom - labelHideZ) / (labelFadeZ - labelHideZ) : 1;

	const labelable = collectLabelableEdges(edges, cfg);

	// LOD: Zoom-based label thinning — at low zoom, show fewer labels.
	const zoomScale = Math.min(1, Math.max(0.2, cfg.worldScale ?? 1));
	const effectiveMax = Math.max(10, Math.floor(MAX_EDGE_LABELS * zoomScale));
	trimLabelsByDegree(labelable, effectiveMax, cfg.degrees);

	const fillColor = a11yEdgeLabelFill(cfg.isDark);
	const placement = cfg.edgeLabelPlacement ?? "center";
	const placedRects: { x: number; y: number; hw: number; hh: number }[] =
		placement === "smart" ? seedNodeRects(labelable, resolvePos, cfg.nodeRadii) : [];

	for (const { edge: e, label } of labelable) {
		const sp = resolvePos(e.source);
		const tp = resolvePos(e.target);
		if (!sp || !tp) continue;

		const pos = computeLabelPosition(sp, tp, placement, placedRects);

		const text = new CanvasText(label, {
			fontSize: cfg.edgeLabelFontSize ?? EDGE_LABEL_FONT_SIZE_DEFAULT,
			fill: fillColor,
			fontFamily: "sans-serif",
		});
		text.anchor.set(0.5, 0.5);
		text.x = pos.x;
		text.y = pos.y;
		text.alpha = EDGE_LABEL_ALPHA * edgeLabelAlpha;
		text.resolution = EDGE_LABEL_RESOLUTION;
		// A11y: background pill for edge label contrast
		text.bgColor = cfg.isDark ? 0x1a1a2e : 0xf0f0f4;
		text.bgAlpha = EDGE_LABEL_BG_ALPHA;
		text.bgPadX = 3;
		text.bgPadY = 1;

		container.addChild(text);
	}
}
