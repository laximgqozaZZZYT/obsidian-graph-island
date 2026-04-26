/**
 * LOD (Level of Detail) — pure functions for screen-space tier classification
 * and tier-specific node rendering.
 *
 * Extracted from RenderPipeline.ts as part of the GOD OBJECT decomposition
 * (CLAUDE.md priority 4). All thresholds come from RenderThresholds; no
 * hardcoded magic numbers introduced here.
 */
import { Platform } from "obsidian";
import { MIN_WORLD_RADIUS_PX, NODE_SCREEN_PX_BASE, SUB_LABEL } from "../../constants";
import type { CardRenderConfig } from "../../types";
import type { CanvasGraphics } from "../canvas2d";
import type { PixiNode } from "../InteractionManager";

/** LOD threshold subset of RenderThresholds (only the LOD-relevant fields). */
export interface LodThresholds {
	cardLODExtremePx: number;
	cardLODMidLabelPx: number;
	cardLODNormalPx: number;
	cardLODCompactPx: number;
	cardLODFullCardPx: number;
}

/**
 * Compute the LOD (Level of Detail) tier based on node screen-space pixel size.
 * Pure function — no DOM/Canvas dependency.
 *
 * @param nodeScreenPx  Screen-space pixel size of a node (NODE_SCREEN_PX_BASE * worldScale)
 * @param thresholds    LOD threshold values from render settings
 * @returns LOD level 0–5 (0 = extreme zoom-out dots, 5 = full card mode)
 */
export function computeLodLevel(nodeScreenPx: number, thresholds: LodThresholds): number {
	if (nodeScreenPx < thresholds.cardLODExtremePx) return 0;
	if (nodeScreenPx < thresholds.cardLODMidLabelPx) return 1;
	if (nodeScreenPx < thresholds.cardLODNormalPx) return 2;
	if (nodeScreenPx < thresholds.cardLODCompactPx) return 3;
	if (nodeScreenPx < thresholds.cardLODFullCardPx) return 4;
	return 5;
}

/**
 * Compute the LOD-aware minimum world-space radius for visibility (A11y guarantee).
 * At extreme zoom-out, ensures at least 1 screen pixel; otherwise floors to MIN_WORLD_RADIUS_PX.
 */
export function computeMinWorldRadius(worldScale: number, isExtremeZoom: boolean): number {
	return isExtremeZoom ? Math.max(0.5 / worldScale, 1) : Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);
}

/** Combined LOD tier classification (booleans + minRadius + final lodLevel with mobile clamp). */
export interface LodTiers {
	nodeScreenPx: number;
	isExtremeZoom: boolean;
	isMidZoom: boolean;
	minWorldRadius: number;
	lodLevel: number;
}

/**
 * Compute the full LOD tier set for a given world scale.
 * Centralizes the boolean tier flags, minWorldRadius, and the mobile lodLevel clamp.
 */
export function computeLodTiers(worldScale: number, thresholds: LodThresholds): LodTiers {
	const nodeScreenPx = NODE_SCREEN_PX_BASE * worldScale;
	const isExtremeZoom = nodeScreenPx < thresholds.cardLODExtremePx;
	const isMidZoom = !isExtremeZoom && nodeScreenPx < thresholds.cardLODNormalPx;
	const minWorldRadius = computeMinWorldRadius(worldScale, isExtremeZoom);
	let lodLevel = computeLodLevel(nodeScreenPx, thresholds);
	// Mobile lightweight mode: force simplified rendering (no gradients/glow/complex shapes)
	if (Platform.isMobile && lodLevel < 3) lodLevel = 3;
	return { nodeScreenPx, isExtremeZoom, isMidZoom, minWorldRadius, lodLevel };
}

/**
 * Predicate: should the card display mode fall back to node mode at this LOD?
 * Used by the density-fallback dispatch to prevent overlap at low zoom / high density.
 */
export function shouldFallbackToNodeMode(lodLevel: number, visibleCount: number, tLow: number, tHigh: number): boolean {
	return lodLevel < 3 || (lodLevel === 3 && visibleCount > tLow) || (lodLevel === 4 && visibleCount > tHigh);
}

/** Extreme zoom-out: hide individual nodes; render super-nodes as fixed-size dots. */
export function renderExtremeZoom(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	worldScale: number,
	crc: { filteredNodeAlpha: number },
): void {
	// At extreme zoom, hide individual (non-super) nodes — cluster summary bars
	// rendered by _updateGroupByLabels replace them for a cleaner overview.
	// Super-nodes (collapsed groups) still render as dots since they already
	// represent aggregated clusters.
	const dotRadius = Math.max(1.5, 2 / worldScale);
	const strokeW = Math.max(0.5, 0.8 / worldScale);
	for (const pn of visible) {
		const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		if (!isSuperNode) {
			pn.gfx.visible = false;
			continue;
		}
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
		g.lineStyle(strokeW, 0x000000, nodeAlpha * 0.4);
		g.beginFill(pn.color, nodeAlpha);
		g.drawCircle(pn.data.x, pn.data.y, dotRadius);
		g.endFill();
	}
	g.lineStyle(0);
}

/**
 * Mid zoom: all circles (skip shape lookup + gradient for speed).
 * SuperNodes (collapsed groups) render at full alpha; individual nodes fade out.
 */
export function renderMidZoom(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	minWorldRadius: number,
	crc: { filteredNodeAlpha: number },
): void {
	g.lineStyle(0);
	for (const pn of visible) {
		const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		const effR = Math.max(pn.radius, minWorldRadius);
		let nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * crc.filteredNodeAlpha : alpha;
		// Individual (non-super) nodes get extra fade at mid-zoom to reduce clumping
		if (!isSuperNode) nodeAlpha *= 0.4;
		g.beginFill(pn.color, nodeAlpha);
		g.drawCircle(pn.data.x, pn.data.y, effR);
		g.endFill();
	}
}

/**
 * Render a compact card background (rounded rect) behind a node for LOD 4.
 * Height expands to accommodate sub-labels when present.
 */
export function renderCompactCardBg(g: CanvasGraphics, pn: PixiNode, crc: Required<CardRenderConfig>): void {
	const w = pn.radius * crc.compactCardWidthRatio;
	const subCount = pn.subLabels?.length ?? 0;
	const h = pn.radius * crc.compactCardHeightRatio + subCount * (SUB_LABEL.FONT_SIZE + SUB_LABEL.GAP) * 0.06;
	const x = pn.data.x - w / 2;
	const y = pn.data.y - h / 2;
	g.lineStyle(1, pn.color, crc.compactCardStrokeAlpha);
	g.beginFill(pn.color, crc.compactCardFillAlpha);
	g.drawRoundedRect(x, y, w, h, crc.cardCornerRadius);
	g.endFill();
	g.lineStyle(0);
}
