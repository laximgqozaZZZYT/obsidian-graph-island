/**
 * Label overlap culling helpers extracted from RenderPipeline.ts.
 *
 * These functions implement the AABB-based label placement / displacement /
 * leader-line drawing pipeline used by `cullOverlappingLabels`. All functions
 * are pure — host dependencies (canvas dims, world container) are passed in
 * via parameters, and the single piece of mutable state (`_activeLeaderCount`)
 * is threaded through a `LeaderLineState` object so callers can observe
 * how many leader lines were activated this pass.
 *
 * Extracted as part of the GOD OBJECT decomposition for RenderPipeline.ts
 * (Decomposition Priority 4 — culling logic).
 */
import { CanvasGraphics, CanvasText } from "../canvas2d";
import type { PixiNode } from "../InteractionManager";
import type { RenderThresholds } from "../../types";
import { SpatialHashGrid } from "../../utils/spatial-grid";
import { clamp } from "../../utils/geometry";
import { LABEL_CHAR_WIDTH_FACTOR, LABEL_LAYOUT } from "../../constants";
import { generateDisplacementOffsets } from "../RenderPipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Screen-space label bounding rect for overlap culling. */
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
 * Mutable counter passed to functions that may activate leader lines.
 * Mirrors `RenderPipeline._activeLeaderCount` — the host inspects this after
 * a pass to decide whether to clear leader graphics on the next pass.
 */
export interface LeaderLineState {
	count: number;
}

/** Viewport bounds (world coords) used to skip off-screen nodes when collecting rects. */
export interface ViewportClipBounds {
	canvasWidth: number;
	canvasHeight: number;
	worldX: number;
	worldY: number;
}

// ---------------------------------------------------------------------------
// Rect collection / measurement
// ---------------------------------------------------------------------------

/** Measure label dimensions in screen space, accounting for scale and padding. */
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

/** Build a single label rect (or null when label is hidden/empty) for overlap detection. */
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
 * All x, y, w, h values are in screen pixels (world * zoom).
 */
export function collectLabelRects(
	pixiNodes: Map<string, PixiNode>,
	degrees: Map<string, number>,
	zoom: number,
	maxScreenW: number,
	maxScreenH: number,
	clip: ViewportClipBounds | null,
): CullLabelRect[] {
	const vpMargin = 100;
	const effectiveVpMargin = Math.min(vpMargin / zoom, vpMargin * 5);
	const vpLeft = clip ? -clip.worldX / zoom - effectiveVpMargin : -Infinity;
	const vpTop = clip ? -clip.worldY / zoom - effectiveVpMargin : -Infinity;
	const vpRight = clip ? (clip.canvasWidth - clip.worldX) / zoom + effectiveVpMargin : Infinity;
	const vpBottom = clip ? (clip.canvasHeight - clip.worldY) / zoom + effectiveVpMargin : Infinity;

	const rects: CullLabelRect[] = [];
	for (const pn of pixiNodes.values()) {
		if (pn.data.x < vpLeft || pn.data.x > vpRight || pn.data.y < vpTop || pn.data.y > vpBottom) continue;
		const rect = buildLabelRect(pn, degrees, zoom, maxScreenW, maxScreenH);
		if (rect) rects.push(rect);
	}
	return rects;
}

// ---------------------------------------------------------------------------
// Leader line drawing
// ---------------------------------------------------------------------------

/**
 * Draw a leader line from node edge to the label anchor point.
 * Used for displaced labels and force-show labels. Mutates `state.count`.
 */
export function drawLeaderLine(
	pn: PixiNode,
	r: CullLabelRect,
	zoom: number,
	llWidth: number,
	llAlpha: number,
	state: LeaderLineState,
	alphaMultiplier = 1.0,
): void {
	const nodeR = pn.radius ?? 12;
	if (!pn.leaderLine) {
		pn.leaderLine = new CanvasGraphics();
		pn.gfx.addChild(pn.leaderLine);
	}
	const ll = pn.leaderLine;
	ll.clear();
	ll.visible = true;
	state.count++;
	const lx = r.label.x;
	const ly = r.label.y;
	const worldW = zoom > 0 ? r.w / zoom : r.w;
	const worldH = zoom > 0 ? r.h / zoom : r.h;
	// Compute label bounding box in node-local coords, accounting for anchor
	const labelAnchorX = r.label.anchor?.x ?? 0;
	const labelAnchorY = r.label.anchor?.y ?? 0;
	const labelLeft = lx - worldW * labelAnchorX;
	const labelRight = labelLeft + worldW;
	const labelTop = ly - worldH * labelAnchorY;
	const labelBottom = labelTop + worldH;
	// Closest point on label rect to the node center (0,0 in local space)
	const closestX = clamp(0, labelLeft, labelRight);
	const closestY = clamp(0, labelTop, labelBottom);
	const dist = Math.sqrt(closestX ** 2 + closestY ** 2);
	const edgeX = dist > 0.1 ? (closestX / dist) * nodeR : 0;
	const edgeY = dist > 0.1 ? (closestY / dist) * nodeR : 0;
	ll.lineStyle(llWidth, pn.color, llAlpha * alphaMultiplier);
	ll.moveTo(edgeX, edgeY);
	ll.lineTo(closestX, closestY);
}

// ---------------------------------------------------------------------------
// Displacement
// ---------------------------------------------------------------------------

/**
 * Try to displace a label to avoid overlap. Returns the placed rect on success,
 * or null if no displacement position was found.
 * Applies AP-1 displacement cap and draws leader line when displaced.
 */
export function tryDisplaceLabel(
	r: CullLabelRect,
	zoom: number,
	maxDispRatio: number,
	grid: SpatialHashGrid<CullLabelRect>,
	drawLeader: boolean,
	llWidth: number,
	llAlpha: number,
	state: LeaderLineState,
): CullLabelRect | null {
	const { pn } = r;
	const nodeR = pn.radius ?? 12;
	const screenNodeR = nodeR * zoom;

	const rawOffsets = generateDisplacementOffsets(r.w, r.h, screenNodeR);
	// Adaptive: sort offsets by distance from nearest placed label (farthest first)
	const offsets = rawOffsets
		.map((o) => {
			// Use center point for distance scoring (not top-left corner)
			const testCx = r.x + r.w / 2 + o.dx;
			const testCy = r.y + r.h / 2 + o.dy;
			let minDist = Infinity;
			grid.forEachNear(testCx, testCy, r.w + r.h, (p) => {
				const cx = p.x + p.w / 2;
				const cy = p.y + p.h / 2;
				const d = (testCx - cx) ** 2 + (testCy - cy) ** 2;
				if (d < minDist) minDist = d;
			});
			return { ...o, score: minDist };
		})
		.sort((a, b) => b.score - a.score);

	// Compute normBase for AP-1 displacement cap
	const fontSize = (r.label.style.fontSize as number) ?? 11;
	const charW = fontSize * LABEL_CHAR_WIDTH_FACTOR;
	const scaleX = r.label.scale?.x ?? 1;
	const visualW = (r.label.text?.length ?? 0) * charW * scaleX;
	const normBase = Math.max(nodeR + visualW * 0.3, nodeR, 1);
	const maxWorldDisp = maxDispRatio * normBase;

	const baseLx = r.label.x;
	const baseLy = r.label.y;
	for (const off of offsets) {
		let worldDx = zoom > 0 ? off.dx / zoom : off.dx;
		let worldDy = zoom > 0 ? off.dy / zoom : off.dy;
		// Cap TOTAL distance to maxWorldDisp
		const totalX = baseLx + worldDx;
		const totalY = baseLy + worldDy;
		const totalDist = Math.sqrt(totalX ** 2 + totalY ** 2);
		if (totalDist > maxWorldDisp && totalDist > 0) {
			const s = maxWorldDisp / totalDist;
			worldDx = totalX * s - baseLx;
			worldDy = totalY * s - baseLy;
		}
		const anchorX = r.label.anchor?.x ?? 0;
		const anchorY = r.label.anchor?.y ?? 0;
		const cappedScreenX = (pn.data.x + baseLx + worldDx) * zoom - r.w * anchorX;
		const cappedScreenY = (pn.data.y + baseLy + worldDy) * zoom - r.h * anchorY;
		const alt: CullLabelRect = { ...r, x: cappedScreenX, y: cappedScreenY };
		if (!grid.checkOverlap(alt)) {
			r.label.x = baseLx + worldDx;
			r.label.y = baseLy + worldDy;
			// Sync original rect bounds to avoid stale data in subsequent phases
			r.x = cappedScreenX;
			r.y = cappedScreenY;

			// Draw leader line from node edge to label
			if (drawLeader) {
				drawLeaderLine(pn, alt, zoom, llWidth, llAlpha, state);
			}
			return alt;
		}
	}
	return null;
}

/**
 * Attempt displacement offsets for a force-show candidate label.
 * Displacement is capped to maxRadii × nodeRadius in world space.
 * Returns true if the label was placed (with or without displacement).
 */
export function tryDisplaceForceShow(
	r: CullLabelRect,
	grid: SpatialHashGrid<CullLabelRect>,
	margin: number,
	zoom: number,
	maxRadii: number,
): boolean {
	// AABB overlap check using spatial hash grid (with anchor offset)
	const anchorX = r.label.anchor?.x ?? 0;
	const anchorY = r.label.anchor?.y ?? 0;
	const overlaps = (): boolean => {
		const cx = (r.pn.data.x + r.label.x) * zoom - r.w * anchorX;
		const cy = (r.pn.data.y + r.label.y) * zoom - r.h * anchorY;
		const testRect: CullLabelRect = { ...r, x: cx, y: cy };
		return grid.checkOverlap(testRect);
	};

	if (!overlaps()) return true; // fits without displacement

	const nodeR = r.pn.radius ?? 12;
	const screenNodeR = nodeR * zoom;
	const maxWorldDisp = nodeR * maxRadii;
	const clearX = r.w + margin;
	const clearY = r.h + margin;
	// Systematic 8-direction × 5-multiplier offsets (40 positions, capped)
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
			// Enforce displacement cap
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

/** Make a label visible, register it as placed, and optionally draw a leader line. */
export function showLabelWithLeader(
	r: CullLabelRect,
	placed: CullLabelRect[],
	grid: SpatialHashGrid<CullLabelRect>,
	origLx: number,
	origLy: number,
	drawLeader: boolean,
	zoom: number,
	llWidth: number,
	llAlpha: number,
	state: LeaderLineState,
): void {
	r.label.visible = true;
	placed.push(r);
	grid.insert(r);
	if (drawLeader && (Math.abs(r.label.x - origLx) >= 0.1 || Math.abs(r.label.y - origLy) >= 0.1)) {
		drawLeaderLine(r.pn, r, zoom, llWidth, llAlpha, state);
	}
}

// ---------------------------------------------------------------------------
// Placement floor (AP-4 + AP-5)
// ---------------------------------------------------------------------------

/**
 * AP-5 super-node concession: hide lowest-degree super labels
 * and replace them with regular labels to improve label diversity.
 * Returns updated nonSuperCount.
 */
export function sacrificeSuperLabels(
	placed: CullLabelRect[],
	hiddenRegulars: CullLabelRect[],
	grid: SpatialHashGrid<CullLabelRect>,
	margin: number,
	zoom: number,
	maxRadii: number,
	minNonSuper: number,
	nonSuperCount: number,
	drawLeader: boolean,
	llWidth: number,
	llAlpha: number,
	state: LeaderLineState,
): number {
	const placedSupers = placed.filter((r) => r.isSuper);
	const currentSuperRatio = placed.length > 0 ? placedSupers.length / placed.length : 0;
	const targetNonSuperMin = Math.max(minNonSuper, Math.ceil(placed.length * 0.3));
	if (!(currentSuperRatio > 0.75 && nonSuperCount < targetNonSuperMin && hiddenRegulars.length > 0)) {
		return nonSuperCount;
	}

	const sacrificeable = placedSupers.sort((a, b) => a.degree - b.degree);
	const maxSacrifice = Math.min(sacrificeable.length, Math.ceil(placed.length * 0.25));
	let sacrificed = 0;
	let regIdx = 0;
	for (const sup of sacrificeable) {
		if (sacrificed >= maxSacrifice || nonSuperCount >= targetNonSuperMin) break;
		while (
			regIdx < hiddenRegulars.length &&
			placed.some((p) => p.pn.data.id === hiddenRegulars[regIdx].pn.data.id)
		) {
			regIdx++;
		}
		if (regIdx >= hiddenRegulars.length) break;

		const reg = hiddenRegulars[regIdx++];
		const supScreenX = sup.x;
		const supScreenY = sup.y;

		sup.label.visible = false;
		if (sup.pn.leaderLine) {
			sup.pn.leaderLine.visible = false;
		}
		const idx = placed.indexOf(sup);
		if (idx >= 0) placed.splice(idx, 1);
		sacrificed++;

		const origLx = reg.label.x;
		const origLy = reg.label.y;
		if (tryDisplaceForceShow(reg, grid, margin, zoom, maxRadii)) {
			showLabelWithLeader(reg, placed, grid, origLx, origLy, drawLeader, zoom, llWidth, llAlpha, state);
			nonSuperCount++;
		} else {
			const wdx = zoom > 0 ? (supScreenX - reg.pn.data.x * zoom) / zoom : 0;
			const wdy = zoom > 0 ? (supScreenY - reg.pn.data.y * zoom) / zoom : 0;
			reg.label.x = wdx;
			reg.label.y = wdy;
			reg.x = supScreenX;
			reg.y = supScreenY;
			const testRect: CullLabelRect = { ...reg, x: supScreenX, y: supScreenY };
			if (!grid.checkOverlap(testRect)) {
				showLabelWithLeader(reg, placed, grid, origLx, origLy, drawLeader, zoom, llWidth, llAlpha, state);
				nonSuperCount++;
			} else {
				sup.label.visible = true;
				placed.push(sup);
				sacrificed--;
			}
		}
	}
	return nonSuperCount;
}

/**
 * AP-4 absolute floor: guarantee a minimum number of visible labels
 * by force-showing highest-degree candidates from the combined hidden list.
 */
export function fillLabelsToFloor(
	absoluteFloor: number,
	candidates: CullLabelRect[],
	placed: CullLabelRect[],
	grid: SpatialHashGrid<CullLabelRect>,
	margin: number,
	zoom: number,
	maxRadii: number,
	drawLeader: boolean,
	llWidth: number,
	llAlpha: number,
	state: LeaderLineState,
): void {
	let totalCount = placed.length;
	for (const r of candidates) {
		if (totalCount >= absoluteFloor) break;
		if (placed.some((p) => p.pn.data.id === r.pn.data.id)) continue;
		const origLx = r.label.x;
		const origLy = r.label.y;
		if (tryDisplaceForceShow(r, grid, margin, zoom, maxRadii)) {
			showLabelWithLeader(r, placed, grid, origLx, origLy, drawLeader, zoom, llWidth, llAlpha, state);
			totalCount++;
		}
	}
}

/**
 * Placement floor guarantee (AP-4 + AP-5).
 * Force-shows highest-degree culled candidates without creating AABB overlaps.
 */
export function guaranteePlacementFloor(
	rt: RenderThresholds,
	rects: CullLabelRect[],
	placed: CullLabelRect[],
	grid: SpatialHashGrid<CullLabelRect>,
	zoom: number,
	margin: number,
	minNonSuper: number,
	drawLeader: boolean,
	llWidth: number,
	llAlpha: number,
	state: LeaderLineState,
): void {
	const minPlaced = rt.labelMinPlaced ?? 3;
	const minPlacedRatio = rt.labelMinPlacedRatio ?? 0.18;
	const totalCandidates = rects.length;
	const ratioFloor = minPlacedRatio > 0 ? Math.ceil(totalCandidates * minPlacedRatio) : 0;
	const absoluteFloor = Math.max(minPlaced, ratioFloor);

	const placedNonSuperNow = placed.filter((r) => !r.isSuper).length;

	if (!(absoluteFloor > 0 || minNonSuper > 0)) return;

	const placedSet = new Set<string>();
	for (const r of placed) placedSet.add(r.pn.data.id);
	const hiddenSupers = rects
		.filter((r) => r.isSuper && !placedSet.has(r.pn.data.id))
		.sort((a, b) => b.degree - a.degree);
	const hiddenRegulars = rects
		.filter((r) => !r.isSuper && !placedSet.has(r.pn.data.id))
		.sort((a, b) => b.degree - a.degree);

	const maxRadii = rt.labelForceShowMaxRadii ?? 5;

	// Phase 1: guarantee minNonSuper non-super labels (AP-5)
	let nonSuperCount = placedNonSuperNow;
	for (const r of hiddenRegulars) {
		if (nonSuperCount >= minNonSuper) break;
		const origLx = r.label.x;
		const origLy = r.label.y;
		if (tryDisplaceForceShow(r, grid, margin, zoom, maxRadii)) {
			showLabelWithLeader(r, placed, grid, origLx, origLy, drawLeader, zoom, llWidth, llAlpha, state);
			nonSuperCount++;
		}
	}

	// Phase 2: super-node sacrifice for regular labels (AP-5 concession)
	sacrificeSuperLabels(
		placed,
		hiddenRegulars,
		grid,
		margin,
		zoom,
		maxRadii,
		minNonSuper,
		nonSuperCount,
		drawLeader,
		llWidth,
		llAlpha,
		state,
	);

	// Phase 3: absolute floor guarantee (AP-4)
	fillLabelsToFloor(
		absoluteFloor,
		[...hiddenSupers, ...hiddenRegulars],
		placed,
		grid,
		margin,
		zoom,
		maxRadii,
		drawLeader,
		llWidth,
		llAlpha,
		state,
	);

	// Final visibility sync — reuse placedSet (updated by force-show)
	placedSet.clear();
	for (const r of placed) placedSet.add(r.pn.data.id);
	for (const r of rects) {
		r.label.visible = placedSet.has(r.pn.data.id);
	}
}

/**
 * Draw leader lines for non-displaced labels when counter-scale exceeds threshold.
 * At high zoom-out, even default-position labels are visually far from their node.
 */
export function drawCounterScaleLeaderLines(
	rt: RenderThresholds,
	placed: CullLabelRect[],
	zoom: number,
	drawLeader: boolean,
	llWidth: number,
	llAlpha: number,
	state: LeaderLineState,
): void {
	if (!drawLeader) return;
	const alwaysThreshold = rt.labelLeaderLineAlwaysThreshold ?? 3.0;
	for (const r of placed) {
		const { pn } = r;
		if (pn.leaderLine?.visible) continue; // already has leader line from displacement
		const labelScale = r.label.scale?.x ?? 1;
		if (labelScale < alwaysThreshold) continue;
		drawLeaderLine(pn, r, zoom, llWidth, llAlpha, state, 0.6);
	}
}
