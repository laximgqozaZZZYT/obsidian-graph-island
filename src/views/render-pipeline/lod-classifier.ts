/**
 * LOD (Level of Detail) classification + tier-rendering helpers.
 *
 * Pure functions extracted from RenderPipeline.ts for testability and to keep
 * the god object under its line budget. All tier thresholds and floor values
 * are passed in via parameters — no implicit RenderThresholds reads here.
 *
 * Spec: docs/lod_spec_v21.md (project memory: project_lod_spec_v21.md).
 */
import type { CanvasGraphics } from "../canvas2d";
import type { PixiNode } from "../InteractionManager";
import { MIN_WORLD_RADIUS_PX, NODE_SCREEN_PX_BASE } from "../../constants";

// ---------------------------------------------------------------------------
// Pure scalar helpers
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

/**
 * Compute the LOD (Level of Detail) tier based on node screen-space pixel size.
 *
 * @param nodeScreenPx  Screen-space pixel size of a node (NODE_SCREEN_PX_BASE * worldScale)
 * @param thresholds    LOD threshold values from render settings
 * @returns LOD level 0–5 (0 = extreme zoom-out dots, 5 = full card mode)
 */
export function computeLodLevel(
	nodeScreenPx: number,
	thresholds: {
		cardLODExtremePx: number;
		cardLODMidLabelPx: number;
		cardLODNormalPx: number;
		cardLODCompactPx: number;
		cardLODFullCardPx: number;
	},
): number {
	if (nodeScreenPx < thresholds.cardLODExtremePx) return 0;
	if (nodeScreenPx < thresholds.cardLODMidLabelPx) return 1;
	if (nodeScreenPx < thresholds.cardLODNormalPx) return 2;
	if (nodeScreenPx < thresholds.cardLODCompactPx) return 3;
	if (nodeScreenPx < thresholds.cardLODFullCardPx) return 4;
	return 5;
}

/**
 * Apply the mobile-platform floor to a computed LOD level.
 * Mobile devices skip the heaviest gradient/glow paths regardless of zoom.
 */
export function applyMobileLodFloor(lodLevel: number, isMobile: boolean): number {
	return isMobile && lodLevel < 3 ? 3 : lodLevel;
}

/**
 * Compute density-adaptive culling scale factor for label spacing.
 * At low zoom: aggressive spacing (sqrt scaling). At high zoom: mild spacing.
 */
export function computeDensityScale(zoom: number, threshold: number): number {
	if (zoom < threshold) {
		return 1 + Math.sqrt((threshold - zoom) / threshold) * 1.5;
	}
	return Math.max(0.3, 1 - (zoom - threshold) * 0.5);
}

/** Compute minimum distance for density culling, capped by `maxDist`. */
export function computeDensityMinDist(baseDist: number, maxDist: number, zoom: number, threshold: number): number {
	return Math.min(baseDist * computeDensityScale(zoom, threshold), maxDist);
}

/**
 * Compute the minimum world-radius floor for node rendering at a given zoom.
 * At extreme zoom-out we guarantee at least 1 screen-pixel; otherwise we
 * fall back to the standard MIN_WORLD_RADIUS_PX baseline.
 */
export function computeMinWorldRadius(isExtremeZoom: boolean, worldScale: number): number {
	if (isExtremeZoom) return Math.max(0.5 / worldScale, 1);
	return Math.max(0, MIN_WORLD_RADIUS_PX / worldScale);
}

// ---------------------------------------------------------------------------
// LOD tier classification — composed result for redrawNodeBatch
// ---------------------------------------------------------------------------

export interface LodTiers {
	nodeScreenPx: number;
	isExtremeZoom: boolean;
	isMidZoom: boolean;
	minWorldRadius: number;
	lodLevel: number;
}

/**
 * Classify the current view into LOD tiers used by redrawNodeBatch.
 * Encapsulates the screen-pixel calc + tier flags + 5-level lodLevel + mobile floor.
 */
export function classifyLodTiers(
	worldScale: number,
	thresholds: {
		cardLODExtremePx: number;
		cardLODMidLabelPx: number;
		cardLODNormalPx: number;
		cardLODCompactPx: number;
		cardLODFullCardPx: number;
	},
	isMobile: boolean,
): LodTiers {
	const nodeScreenPx = NODE_SCREEN_PX_BASE * worldScale;
	const isExtremeZoom = nodeScreenPx < thresholds.cardLODExtremePx;
	const isMidZoom = !isExtremeZoom && nodeScreenPx < thresholds.cardLODNormalPx;
	const minWorldRadius = computeMinWorldRadius(isExtremeZoom, worldScale);
	const lodLevel = applyMobileLodFloor(computeLodLevel(nodeScreenPx, thresholds), isMobile);
	return { nodeScreenPx, isExtremeZoom, isMidZoom, minWorldRadius, lodLevel };
}

// ---------------------------------------------------------------------------
// Label helpers used by LOD-aware rendering
// ---------------------------------------------------------------------------

/**
 * Generate label displacement offset candidates for overlap avoidance.
 * Returns 12 offsets sorted by distance from label center (farthest first by default).
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

/** Simple deterministic hash of a string to a hue value (0–360). */
export function hashStringToHue(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
	}
	return ((hash % 360) + 360) % 360;
}

/** Truncate a label to maxChars, appending "…" if truncated. 0 or negative maxChars means no truncation. */
export function truncateLabel(label: string, maxChars: number): string {
	return maxChars > 0 && label.length > maxChars ? label.slice(0, maxChars) + "…" : label;
}

// ---------------------------------------------------------------------------
// Tier-application: extreme / mid zoom node rendering
// ---------------------------------------------------------------------------

/**
 * Extreme zoom-out (LOD 0): individual nodes hidden, only super-nodes draw as fixed-size dots.
 * Cluster summary bars rendered by _updateGroupByLabels replace individual nodes for a cleaner overview.
 */
export function renderExtremeZoomDots(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	worldScale: number,
	filteredNodeAlpha: number,
): void {
	const dotRadius = Math.max(1.5, 2 / worldScale);
	const strokeW = Math.max(0.5, 0.8 / worldScale);
	for (const pn of visible) {
		const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		if (!isSuperNode) {
			pn.gfx.visible = false;
			continue;
		}
		const nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * filteredNodeAlpha : alpha;
		g.lineStyle(strokeW, 0x000000, nodeAlpha * 0.4);
		g.beginFill(pn.color, nodeAlpha);
		g.drawCircle(pn.data.x, pn.data.y, dotRadius);
		g.endFill();
	}
	g.lineStyle(0);
}

/**
 * Mid zoom (LOD 1–2): all circles, skipping shape lookup + gradient for speed.
 * SuperNodes (collapsed groups) render at full alpha; individual nodes fade to 0.4× to reduce clumping.
 */
export function renderMidZoomCircles(
	g: CanvasGraphics,
	visible: PixiNode[],
	tlFilteredOut: Set<string> | null,
	alpha: number,
	minWorldRadius: number,
	filteredNodeAlpha: number,
): void {
	g.lineStyle(0);
	for (const pn of visible) {
		const isSuperNode = !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0);
		const effR = Math.max(pn.radius, minWorldRadius);
		let nodeAlpha = tlFilteredOut && tlFilteredOut.has(pn.data.id) ? alpha * filteredNodeAlpha : alpha;
		if (!isSuperNode) nodeAlpha *= 0.4;
		g.beginFill(pn.color, nodeAlpha);
		g.drawCircle(pn.data.x, pn.data.y, effR);
		g.endFill();
	}
}
