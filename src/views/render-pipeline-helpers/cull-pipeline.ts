/**
 * Pure helpers extracted from RenderPipeline for label overlap / density culling.
 *
 * All functions here are pure (no `this` dependency) and operate on data passed
 * in via parameters. Callbacks are used where outer state mutation is required
 * (e.g. fading out a label, drawing a leader line).
 *
 * Extracted in service of CLAUDE.md "GOD OBJECT Policy" Decomposition Priority 4
 * (RenderPipeline.ts — extract LOD logic / culling logic).
 */
import type { CanvasText } from "../canvas2d";
import type { PixiNode } from "../InteractionManager";
import { SpatialHashGrid } from "../../utils/spatial-grid";
import { LABEL_CHAR_WIDTH_FACTOR, LABEL_LAYOUT } from "../../constants";
import { isDensityTooClose } from "../render-pipeline-utils";

/** Screen-space label bounding rect for overlap culling */
export interface CullLabelRect {
	pn: PixiNode;
	label: CanvasText;
	x: number;
	y: number;
	w: number;
	h: number;
	degree: number;
	isSuper: boolean;
}

/**
 * Fade out a label by reducing its alpha; hide it when alpha drops below 0.05.
 * Mutates the passed-in label.
 */
export function fadeOutLabel(label: CanvasText, fadeRate?: number): void {
	label.alpha = Math.max(0, (label.alpha ?? 1) - (fadeRate ?? 0.15));
	if (label.alpha <= 0.05) label.visible = false;
}

/**
 * Measure label dimensions in screen space, accounting for scale and padding.
 * Result is clamped by maxScreenW / maxScreenH (0/negative = unbounded).
 */
export function measureLabelDims(
	label: CanvasText,
	fontSize: number,
	charW: number,
	zoom: number,
	maxScreenW: number,
	maxScreenH: number,
): { w: number; h: number } {
	const scaleX = label.scale?.x ?? 1;
	const scaleY = label.scale?.y ?? 1;
	const padX = label.bgPadX ?? 0;
	const padY = label.bgPadY ?? 0;
	const measuredW = label.width && label.width > 0 ? label.width : 0;
	const measuredH = label.height && label.height > 0 ? label.height : 0;
	const baseW = measuredW > 0 ? measuredW : label.text.length * charW + padX * 2;
	const baseH = measuredH > 0 ? measuredH : fontSize * LABEL_LAYOUT.LINE_HEIGHT_FACTOR + padY * 2;
	return {
		w: Math.min(baseW * scaleX * zoom, maxScreenW > 0 ? maxScreenW : Infinity),
		h: Math.min(baseH * scaleY * zoom, maxScreenH > 0 ? maxScreenH : Infinity),
	};
}

/**
 * Build a screen-space label rect for a single PixiNode (hover label preferred
 * when visible). Returns null if the node has no visible label.
 */
export function buildLabelRect(
	pn: PixiNode,
	degrees: Map<string, number>,
	zoom: number,
	maxScreenW: number,
	maxScreenH: number,
): CullLabelRect | null {
	const isHoverLabel = !!(pn.hoverLabel && pn.hoverLabel.visible);
	const label = isHoverLabel ? pn.hoverLabel : pn.label;
	if (!label || !label.text || !label.visible) return null;
	const fontSize = (label.style.fontSize as number) ?? 11;
	const boldFactor = isHoverLabel ? 1.1 : 1.0;
	const charW = fontSize * LABEL_CHAR_WIDTH_FACTOR * boldFactor;
	const { w, h } = measureLabelDims(label, fontSize, charW, zoom, maxScreenW, maxScreenH);
	const anchorX = label.anchor?.x ?? 0;
	const anchorY = label.anchor?.y ?? 0;
	return {
		pn,
		label,
		x: (pn.data.x + label.x) * zoom - w * anchorX,
		y: (pn.data.y + label.y) * zoom - h * anchorY,
		w,
		h,
		degree: degrees.get(pn.data.id) ?? 0,
		isSuper: !!(pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0),
	};
}

/**
 * Collect all visible labels into screen-space rects for overlap detection.
 * Off-screen nodes (outside the canvas viewport plus a margin) are skipped.
 *
 * `world` is the world container providing `x`, `y` offsets; pass null to
 * disable viewport culling (treats every node as visible).
 */
export function collectLabelRects(
	pixiNodes: Map<string, PixiNode>,
	degrees: Map<string, number>,
	zoom: number,
	canvasDims: { width: number; height: number },
	world: { x: number; y: number } | null,
	maxScreenW: number,
	maxScreenH: number,
): CullLabelRect[] {
	const vpMargin = 100;
	const effectiveVpMargin = Math.min(vpMargin / zoom, vpMargin * 5);
	const vpLeft = world ? -world.x / zoom - effectiveVpMargin : -Infinity;
	const vpTop = world ? -world.y / zoom - effectiveVpMargin : -Infinity;
	const vpRight = world ? (canvasDims.width - world.x) / zoom + effectiveVpMargin : Infinity;
	const vpBottom = world ? (canvasDims.height - world.y) / zoom + effectiveVpMargin : Infinity;

	const rects: CullLabelRect[] = [];
	for (const pn of pixiNodes.values()) {
		if (pn.data.x < vpLeft || pn.data.x > vpRight || pn.data.y < vpTop || pn.data.y > vpBottom) continue;
		const rect = buildLabelRect(pn, degrees, zoom, maxScreenW, maxScreenH);
		if (rect) rects.push(rect);
	}
	return rects;
}

/**
 * Density culling sub-pass — additionally fades labels whose centers are too
 * close to a higher-priority label. Mutates `placed` in place (kept labels
 * remain; faded ones are removed). Calls `onFade` for each label that gets
 * faded out.
 *
 * `densityMinDist` is the minimum screen-pixel distance between label centers
 * (the caller computes this via `computeDensityMinDist` from RenderPipeline,
 * which we don't import here to avoid circular module deps).
 */
export function runDensityCulling(
	rt: { labelFadeRate: number },
	placed: CullLabelRect[],
	densityMinDist: number,
	onFade: (label: CanvasText, fadeRate: number) => void,
): void {
	if (placed.length <= 10) return;
	const densityMinDist2 = densityMinDist * densityMinDist;
	placed.sort((a, b) =>
		b.pn.priorityScore + (b.pn.hoverForcedLabel ? 80 : 0)
		- (a.pn.priorityScore + (a.pn.hoverForcedLabel ? 80 : 0)),
	);
	const kept: CullLabelRect[] = [];
	const bucketSize = Math.max(densityMinDist, 50);
	const densityGrid = new Map<string, { cx: number; cy: number }[]>();
	for (const r of placed) {
		const cx = r.x + r.w / 2;
		const cy = r.y + r.h / 2;
		if (isDensityTooClose(cx, cy, bucketSize, densityMinDist2, densityGrid)) {
			onFade(r.label, rt.labelFadeRate);
		} else {
			kept.push(r);
			const key = `${Math.floor(cx / bucketSize)},${Math.floor(cy / bucketSize)}`;
			const arr = densityGrid.get(key);
			if (arr) arr.push({ cx, cy });
			else densityGrid.set(key, [{ cx, cy }]);
		}
	}
	placed.length = 0;
	placed.push(...kept);
}

/**
 * Force-show displacement for AP-4 / AP-5 placement floor.
 *
 * Tries the original position first; if that overlaps existing rects, sweeps
 * 8 directions × 5 multipliers (40 candidate positions, capped to
 * `maxRadii * nodeRadius` in world space). Mutates `r.label.x/y` and
 * `r.x/y` to reflect the chosen position; restores the originals if no
 * non-overlapping position was found.
 *
 * Returns true when the label was placed (with or without displacement).
 */
export function tryDisplaceForceShow(
	r: CullLabelRect,
	grid: SpatialHashGrid<CullLabelRect>,
	margin: number,
	zoom: number,
	maxRadii: number,
): boolean {
	const anchorX = r.label.anchor?.x ?? 0;
	const anchorY = r.label.anchor?.y ?? 0;
	const overlaps = (): boolean => {
		const cx = (r.pn.data.x + r.label.x) * zoom - r.w * anchorX;
		const cy = (r.pn.data.y + r.label.y) * zoom - r.h * anchorY;
		const testRect: CullLabelRect = { ...r, x: cx, y: cy };
		return grid.checkOverlap(testRect);
	};

	if (!overlaps()) return true;

	const nodeR = r.pn.radius ?? 12;
	const screenNodeR = nodeR * zoom;
	const maxWorldDisp = nodeR * maxRadii;
	const clearX = r.w + margin;
	const clearY = r.h + margin;
	const dirs = [
		{ dx: 1, dy: 0 },
		{ dx: -1, dy: 0 },
		{ dx: 0, dy: 1 },
		{ dx: 0, dy: -1 },
		{ dx: 1, dy: 1 },
		{ dx: -1, dy: -1 },
		{ dx: 1, dy: -1 },
		{ dx: -1, dy: 1 },
	];

	const origLx = r.label.x;
	const origLy = r.label.y;

	for (let m = 1; m <= 5; m++) {
		for (const d of dirs) {
			const wdx = zoom > 0 ? (d.dx * (clearX + screenNodeR) * m) / zoom : 0;
			const wdy = zoom > 0 ? (d.dy * (clearY + screenNodeR) * m) / zoom : 0;
			const totalDist = Math.sqrt((origLx + wdx) ** 2 + (origLy + wdy) ** 2);
			if (totalDist > maxWorldDisp) continue;

			r.label.x = origLx + wdx;
			r.label.y = origLy + wdy;

			if (!overlaps()) {
				r.x = (r.pn.data.x + r.label.x) * zoom - r.w * anchorX;
				r.y = (r.pn.data.y + r.label.y) * zoom - r.h * anchorY;
				return true;
			}
		}
	}
	r.label.x = origLx;
	r.label.y = origLy;
	return false;
}
