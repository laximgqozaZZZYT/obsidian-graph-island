// ---------------------------------------------------------------------------
// Edge style resolution — alpha and line thickness per edge
// Extracted from EdgeRenderer.ts to reduce that file's size and isolate the
// pure styling pipeline for unit testing.
// ---------------------------------------------------------------------------

import type { GraphEdge } from "../types";
import type { EdgeDrawConfig } from "./EdgeRenderer";
import {
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_SEQUENCE,
	EDGE_TYPE_SIMILAR,
	EDGE_TYPE_SIBLING,
	EDGE_TYPE_HAS_TAG,
	STRUCTURAL_EDGE_ALPHA,
	NON_STRUCTURAL_EDGE_ALPHA,
	DEFAULT_LINE_THICKNESS,
	WEIGHT_THICKNESS_FACTOR,
	FADE_BY_DEGREE_MIN_ALPHA,
	RELATION_COLOR_ALPHA,
	HIGHLIGHT_THICKNESS_MULTIPLIER,
} from "../constants";

// Minimal position data needed for source/target — kept structurally compatible
// with the `Pos` interface used inside EdgeRenderer.
interface Pos {
	x: number;
	y: number;
	id?: string;
}

/** Resolved visual style for a single edge */
export interface EdgeStyle {
	alpha: number;
	lineThick: number;
	isHighlighted?: boolean;
}

/** Classify an edge type for style resolution. */
function classifyEdgeType(type: string | undefined): {
	isOnto: boolean;
	isSimilar: boolean;
	isBreadcrumbs: boolean;
	isStructural: boolean;
} {
	const isOnto = type === EDGE_TYPE_INHERITANCE || type === EDGE_TYPE_AGGREGATION;
	const isSimilar = type === EDGE_TYPE_SIMILAR;
	const isBreadcrumbs = type === EDGE_TYPE_SIBLING || type === EDGE_TYPE_SEQUENCE;
	const isStructural = isOnto || type === EDGE_TYPE_HAS_TAG || isSimilar || isBreadcrumbs;
	return { isOnto, isSimilar, isBreadcrumbs, isStructural };
}

/** Apply edge weight thickness and alpha boost based on pair count. */
function applyEdgeWeight(
	e: GraphEdge,
	pairCount: Map<string, number>,
	alpha: number,
): { alpha: number; lineThick: number } {
	const pairKey = [e.source, e.target].sort().join(":");
	const weight = pairCount.get(pairKey) ?? 1;
	const lineThick = DEFAULT_LINE_THICKNESS + Math.log2(weight) * WEIGHT_THICKNESS_FACTOR;
	const newAlpha = weight > 2 ? alpha * Math.min(1.3, 1 + (weight - 2) * 0.05) : alpha;
	return { alpha: newAlpha, lineThick };
}

/** Resolve highlight alpha/thickness when a node is hovered. */
function resolveHighlightAlpha(
	sid: string,
	tid: string,
	cfg: EdgeDrawConfig,
	lineThick: number,
): { alpha: number; lineThick: number; isHighlighted: boolean } {
	const highlighted = cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid);
	if (highlighted) {
		return {
			alpha: cfg.highlightEdgeAlpha ?? 1.0,
			lineThick: lineThick * HIGHLIGHT_THICKNESS_MULTIPLIER,
			isHighlighted: true,
		};
	}
	if (cfg.hoverDistMap && cfg.hoverDistMap.size > 0) {
		const dS = cfg.hoverDistMap.get(sid);
		const dT = cfg.hoverDistMap.get(tid);
		if (dS !== undefined || dT !== undefined) {
			const minDist = Math.min(dS ?? 99, dT ?? 99);
			const falloff = cfg.hoverEdgeFalloff ?? 0.6;
			return {
				alpha: Math.max(cfg.edgeHoverFalloffMinAlpha ?? 0.08, Math.pow(falloff, minDist)),
				lineThick,
				isHighlighted: false,
			};
		}
		return { alpha: cfg.highlightEdgeNonMatchAlpha ?? 0.04, lineThick, isHighlighted: false };
	}
	return { alpha: cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA, lineThick, isHighlighted: false };
}

/** Apply zoom-adaptive thickness and type-based alpha fade. */
function applyZoomFade(
	alpha: number,
	lineThick: number,
	isHighlighted: boolean,
	isSimilar: boolean,
	isBreadcrumbs: boolean,
	edgeType: string | undefined,
	cfg: EdgeDrawConfig,
): { alpha: number; lineThick: number } {
	const ws = cfg.worldScale ?? 1;
	const fadeZ = cfg.edgeZoomFadeThreshold ?? 0.5;
	const fadeFloor = cfg.edgeFadeMinAlpha ?? 0.25;
	if (isHighlighted) return { alpha, lineThick };
	if (ws < fadeZ) lineThick *= Math.max(0.6, ws / fadeZ);
	if (ws < fadeZ && (isSimilar || edgeType === EDGE_TYPE_HAS_TAG)) {
		alpha *= Math.max(fadeFloor, ws / fadeZ);
	} else if (ws < fadeZ * 0.6 && isBreadcrumbs) {
		alpha *= Math.max(fadeFloor * 2, ws / (fadeZ * 0.6));
	}
	return { alpha, lineThick };
}

/** Compute alpha multiplier based on minimum endpoint degree. */
function computeDegreeFade(e: GraphEdge, src: Pos, tgt: Pos, cfg: EdgeDrawConfig): number {
	const sid = src.id ?? (e.source as string);
	const tid = tgt.id ?? (e.target as string);
	const minDeg = Math.min(cfg.degrees.get(sid) ?? 0, cfg.degrees.get(tid) ?? 0);
	const t = Math.sqrt(minDeg / cfg.maxDegree);
	return FADE_BY_DEGREE_MIN_ALPHA + (1 - FADE_BY_DEGREE_MIN_ALPHA) * t;
}

/** Compute line thickness multiplier based on target node in-degree. */
function computeStrengthGlow(e: GraphEdge, tgt: Pos, cfg: EdgeDrawConfig): number {
	const tid = tgt.id ?? (e.target as string);
	const t = Math.min(1, (cfg.degrees.get(tid) ?? 0) / cfg.maxDegree);
	const min = cfg.edgeStrengthGlowMin ?? 0.5;
	const max = cfg.edgeStrengthGlowMax ?? 3.0;
	return min + t * (max - min);
}

/**
 * Compute alpha and line thickness for a single edge based on type,
 * relation coloring, degree fading, edge weight, and hover highlight.
 */
export function resolveEdgeStyle(
	e: GraphEdge,
	src: Pos,
	tgt: Pos,
	cfg: EdgeDrawConfig,
	densityScale: number,
	pairCount: Map<string, number> | null,
): EdgeStyle {
	const { isOnto, isSimilar, isBreadcrumbs, isStructural } = classifyEdgeType(e.type);
	let alpha = (isStructural ? STRUCTURAL_EDGE_ALPHA : NON_STRUCTURAL_EDGE_ALPHA) * densityScale;
	let lineThick = DEFAULT_LINE_THICKNESS;

	// Edge weight: thicken based on same source-target pair count
	if (pairCount) {
		const w = applyEdgeWeight(e, pairCount, alpha);
		alpha = w.alpha;
		lineThick = w.lineThick;
	}

	if (!isOnto && e.relation && cfg.colorEdgesByRelation) alpha = RELATION_COLOR_ALPHA * densityScale;

	// Fade by source node degree: low-degree -> faint, high-degree -> opaque
	if (cfg.fadeByDegree && cfg.maxDegree > 0) {
		alpha *= computeDegreeFade(e, src, tgt, cfg);
	}

	// Edge strength glow: scale width by target node in-degree
	if (cfg.edgeStrengthGlow && cfg.maxDegree > 0) {
		lineThick *= computeStrengthGlow(e, tgt, cfg);
	}

	// Track whether this edge is actively highlighted (hovered node's connection)
	let isHighlighted = false;

	if (cfg.highlightedNodeId) {
		const sid = src.id ?? (e.source as string);
		const tid = tgt.id ?? (e.target as string);
		const hl = resolveHighlightAlpha(sid, tid, cfg, lineThick);
		alpha = hl.alpha;
		lineThick = hl.lineThick;
		isHighlighted = hl.isHighlighted;
	}

	// A11y: High contrast mode — double line thickness for visibility
	if (cfg.highContrast) {
		lineThick *= 2;
		alpha = Math.min(1, alpha * 1.3);
	}

	// Zoom-adaptive edge thickness and type fade
	const zf = applyZoomFade(alpha, lineThick, isHighlighted, isSimilar, isBreadcrumbs, e.type, cfg);
	alpha = zf.alpha;
	lineThick = zf.lineThick;

	// GG: Apply global edge alpha multiplier (skip for highlighted — hover takes priority)
	if (cfg.globalEdgeAlpha != null && cfg.globalEdgeAlpha < 1 && !isHighlighted) {
		alpha *= cfg.globalEdgeAlpha;
	}
	return { alpha, lineThick, isHighlighted };
}
