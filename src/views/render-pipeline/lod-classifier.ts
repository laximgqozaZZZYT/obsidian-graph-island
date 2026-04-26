/**
 * LOD (Level of Detail) classification helpers extracted from RenderPipeline.
 *
 * Pure functions — no DOM/Canvas state, no `this`. Implements the project_lod_spec_v21.md
 * tier model:
 *   - LOD 0: extreme zoom-out dots (super-nodes only)
 *   - LOD 1: small dots, no labels
 *   - LOD 2: small circles with selective labels
 *   - LOD 3: standard nodes with labels
 *   - LOD 4: compact cards
 *   - LOD 5: full card mode
 *
 * RenderThresholds and other parameters are passed by argument so this module
 * has no dependency on RenderHost / class state.
 */
import type { CanvasGraphics } from "../canvas2d";
import type { PixiNode } from "../InteractionManager";
import { MIN_WORLD_RADIUS_PX, SUB_LABEL } from "../../constants";

// ---------------------------------------------------------------------------
// Zoom / world-space conversion helpers
// ---------------------------------------------------------------------------

/** Convert a screen-pixel size to world units, floored at `floor`. */
export function screenToWorld(screenPx: number, ws: number, floor: number): number {
	return Math.max(floor, ws > 0 ? screenPx / ws : floor);
}

/**
 * Compute a fade-out alpha for individual nodes/intra-group cables at extreme zoom-out.
 * Returns 1.0 at zoom >= fadeStart, linearly fading to fadeFloor at zoom <= fadeEnd.
 * Does NOT affect trunks (inter-group cables).
 */
export function computeZoomFadeAlpha(zoom: number, fadeStart = 0.7, fadeEnd = 0.15, fadeFloor = 0.03): number {
	if (zoom >= fadeStart) return 1;
	if (zoom <= fadeEnd) return fadeFloor;
	return fadeFloor + ((1 - fadeFloor) * (zoom - fadeEnd)) / (fadeStart - fadeEnd);
}

// ---------------------------------------------------------------------------
// LOD tier classification (the core of project_lod_spec_v21.md)
// ---------------------------------------------------------------------------

/** LOD threshold subset required for tier classification. */
export interface LodThresholds {
	cardLODExtremePx: number;
	cardLODMidLabelPx: number;
	cardLODNormalPx: number;
	cardLODCompactPx: number;
	cardLODFullCardPx: number;
}

/**
 * Compute the LOD (Level of Detail) tier based on node screen-space pixel size.
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

/** Compute the minimum world-space radius so nodes never disappear at extreme zoom-out. */
export function computeMinWorldRadius(worldScale: number, isExtremeZoom: boolean): number {
	if (isExtremeZoom) {
		// At extreme zoom, guarantee at least 1 px on screen
		return Math.max(0.5 / worldScale, 1);
	}
	return Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);
}

/** Combined LOD tier evaluation result. */
export interface LodTier {
	isExtremeZoom: boolean;
	isMidZoom: boolean;
	minWorldRadius: number;
	lodLevel: number;
}

/**
 * Compute the full LOD tier (extreme/mid flags, min world radius, level).
 * Consolidates the boilerplate previously inlined in `_buildBatchContext`.
 *
 * @param worldScale         Current world scale (worldContainer.scale.x)
 * @param thresholds         LOD threshold values from render settings
 * @param nodeScreenPxBase   Base screen pixel size for a 1:1 zoom (NODE_SCREEN_PX_BASE)
 * @param isMobile           Whether platform is mobile — forces LOD ≥ 3 for performance
 */
export function computeLodTier(
	worldScale: number,
	thresholds: LodThresholds,
	nodeScreenPxBase: number,
	isMobile: boolean,
): LodTier {
	const nodeScreenPx = nodeScreenPxBase * worldScale;
	const isExtremeZoom = nodeScreenPx < thresholds.cardLODExtremePx;
	const isMidZoom = !isExtremeZoom && nodeScreenPx < thresholds.cardLODNormalPx;
	const minWorldRadius = computeMinWorldRadius(worldScale, isExtremeZoom);
	let lodLevel = computeLodLevel(nodeScreenPx, thresholds);
	// Mobile lightweight mode: force simplified rendering (no gradients/glow/complex shapes)
	if (isMobile && lodLevel < 3) {
		lodLevel = 3;
	}
	return { isExtremeZoom, isMidZoom, minWorldRadius, lodLevel };
}

// ---------------------------------------------------------------------------
// Density-adaptive culling (label spacing depends on zoom)
// ---------------------------------------------------------------------------

/**
 * Compute density-adaptive culling scale factor for label spacing.
 * At low zoom: aggressive spacing (sqrt scaling). At high zoom: mild spacing.
 *
 * @param zoom       Current zoom level (worldContainer.scale.x)
 * @param threshold  Zoom level that separates "low" from "high" (labelDensityZoomThreshold)
 * @returns Scale factor (>1 = more aggressive, <1 = more lenient)
 */
export function computeDensityScale(zoom: number, threshold: number): number {
	if (zoom < threshold) {
		return 1 + Math.sqrt((threshold - zoom) / threshold) * 1.5;
	}
	return Math.max(0.3, 1 - (zoom - threshold) * 0.5);
}

/**
 * Compute minimum distance for density culling.
 *
 * @param baseDist  Base screen-space distance (labelDensityMinScreenDist)
 * @param maxDist   Maximum allowed distance (labelDensityMaxDist)
 * @param zoom      Current zoom level
 * @param threshold Zoom threshold for density scaling
 * @returns Minimum distance in screen pixels
 */
export function computeDensityMinDist(baseDist: number, maxDist: number, zoom: number, threshold: number): number {
	return Math.min(baseDist * computeDensityScale(zoom, threshold), maxDist);
}

/**
 * Generate label displacement offset candidates for overlap avoidance.
 * Returns 12 offsets sorted by distance from label center (farthest first by default).
 *
 * @param labelW       Label width in screen pixels
 * @param labelH       Label height in screen pixels
 * @param nodeScreenR  Node radius in screen pixels
 * @returns Array of {dx, dy} offsets in screen coordinates
 */
export function generateDisplacementOffsets(
	labelW: number,
	labelH: number,
	nodeScreenR: number,
): Array<{ dx: number; dy: number }> {
	const hw = labelW * 0.5;
	const pad = nodeScreenR + 2;
	return [
		{ dx: hw + pad, dy: pad + labelH }, // bottom-right
		{ dx: -(labelW + pad), dy: 0 }, // left
		{ dx: 0, dy: pad + labelH * 1.2 }, // below
		{ dx: hw + pad, dy: -(pad + labelH) }, // top-right
		{ dx: -(labelW + pad), dy: -(pad + labelH) }, // top-left
		{ dx: -(labelW + pad), dy: pad + labelH }, // bottom-left
		{ dx: hw + pad, dy: -(pad + labelH * 1.2) }, // above-right
		{ dx: -(hw + pad), dy: -(pad + labelH * 1.2) }, // above-left
		{ dx: labelW + pad * 2, dy: 0 }, // far right
		{ dx: 0, dy: -(pad + labelH * 1.5) }, // far above
		{ dx: -(labelW + pad * 2), dy: pad + labelH * 0.5 }, // far bottom-left
		{ dx: hw + pad, dy: pad + labelH * 1.5 }, // far below-right
	];
}

// ---------------------------------------------------------------------------
// LOD-tier renderers (extreme / mid / compact-card)
// ---------------------------------------------------------------------------

/** Card render config subset used by LOD-tier renderers. */
interface LodTierRenderConfig {
	filteredNodeAlpha: number;
}

/**
 * Extreme zoom-out tier renderer (LOD 0).
 *
 * Hides individual non-super nodes (cluster summary bars rendered elsewhere
 * replace them for a cleaner overview) and draws fixed-size dots with stroke
 * for super-nodes (collapsed groups).
 */
export function renderExtremeZoomTier(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	worldScale: number,
	crc: LodTierRenderConfig,
): void {
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
 * Mid zoom tier renderer (LOD 1–2): all circles, skip shape lookup + gradient for speed.
 * SuperNodes (collapsed groups) render at full alpha; individual nodes fade out.
 */
export function renderMidZoomTier(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	minWorldRadius: number,
	crc: LodTierRenderConfig,
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

/** Compact card config subset used by LOD 4 background renderer. */
interface CompactCardConfig {
	compactCardWidthRatio: number;
	compactCardHeightRatio: number;
	compactCardStrokeAlpha: number;
	compactCardFillAlpha: number;
	cardCornerRadius: number;
}

/**
 * Render compact card background (rounded rect) behind a node for LOD 4.
 * A1: Height expands to accommodate sub-labels when present.
 */
export function renderCompactCardBg(g: CanvasGraphics, pn: PixiNode, crc: CompactCardConfig): void {
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
