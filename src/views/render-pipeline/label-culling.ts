/**
 * Label overlap culling — extracted from RenderPipeline to keep that file
 * within its god-object size budget. All functions here mutate label
 * visibility/positions and leader-line graphics on PixiNode instances.
 *
 * The single piece of shared mutable state — the count of currently visible
 * leader lines — is threaded through as a `LabelCullState` parameter rather
 * than a class field, so the helpers stay independently testable.
 */
import { CanvasContainer, CanvasGraphics, CanvasText } from "../canvas2d";
import type { IApp } from "../canvas2d/interfaces";
import type { PixiNode } from "../InteractionManager";
import type { RenderThresholds } from "../../types";
import { SpatialHashGrid } from "../../utils/spatial-grid";
import { LABEL_CHAR_WIDTH_FACTOR, LABEL_LAYOUT, OVERLAP_GRID_CELL_SIZE } from "../../constants";
import { clamp } from "../../utils/geometry";
import { isDensityTooClose } from "../render-pipeline-utils";

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

/** Quality stats produced by a single culling pass. */
export interface LabelCullStats {
	totalLabels: number;
	visibleLabels: number;
	culledLabels: number;
	collisionRate: number;
}

/** Subset of RenderHost the culling pass needs. */
export interface LabelCullingHost {
	getPixiApp(): IApp | null;
	getEnclosureLabels?(): Map<string, CanvasText>;
	getWorldContainer(): CanvasContainer | null;
	getCanvasDimensions(): { width: number; height: number };
	getPixiNodes(): Map<string, PixiNode>;
	getDegrees(): Map<string, number>;
	updateDensityCulledBadge?(count: number): void;
}

/** Mutable state shared across one culling pass (leader-line bookkeeping). */
export interface LabelCullState {
	activeLeaderCount: number;
}

// ---------------------------------------------------------------------------
// Density helpers (also re-exported from RenderPipeline for backward compat)
// ---------------------------------------------------------------------------

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

/** Compute minimum distance for density culling (screen pixels). */
export function computeDensityMinDist(
	baseDist: number,
	maxDist: number,
	zoom: number,
	threshold: number,
): number {
	return Math.min(baseDist * computeDensityScale(zoom, threshold), maxDist);
}

/**
 * Generate label displacement offset candidates for overlap avoidance.
 * Returns 12 offsets in screen coordinates (top-left first).
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
// Internal helpers
// ---------------------------------------------------------------------------

function fadeOutLabel(label: CanvasText, fadeRate?: number): void {
	label.alpha = Math.max(0, (label.alpha ?? 1) - (fadeRate ?? 0.15));
	if (label.alpha <= 0.05) label.visible = false;
}

function reserveDomExclusionZones(grid: SpatialHashGrid<CullLabelRect>, app: IApp | null): void {
	if (!app?.view) return;
	const canvasRect = app.view.getBoundingClientRect();
	const panels = [".gi-graph-stats", ".gi-legend", ".gi-minimap-wrap", ".gi-node-info"];
	for (const sel of panels) {
		const el = app.view.parentElement?.querySelector<HTMLElement>(sel);
		if (!el || el.style.display === "none" || !el.offsetParent) continue;
		const r = el.getBoundingClientRect();
		grid.insert({
			x: r.left - canvasRect.left,
			y: r.top - canvasRect.top,
			w: r.width,
			h: r.height,
			label: null as unknown as CanvasText,
			pn: null as unknown as PixiNode,
			degree: 999,
			isSuper: false,
		});
	}
}

function reserveEnclosureLabelZones(
	grid: SpatialHashGrid<CullLabelRect>,
	encLabels: Map<string, CanvasText> | undefined,
	world: CanvasContainer | null,
): void {
	if (!encLabels || encLabels.size === 0) return;
	if (!world) return;
	for (const lbl of encLabels.values()) {
		if (!lbl.visible) continue;
		const sx = lbl.x * world.scale.x + world.x;
		const sy = lbl.y * world.scale.y + world.y;
		const sw = (lbl.width ?? 60) * lbl.scale.x;
		const sh = (lbl.height ?? 14) * lbl.scale.y;
		grid.insert({
			x: sx - sw / 2,
			y: sy - sh / 2,
			w: sw,
			h: sh,
			label: null as unknown as CanvasText,
			pn: null as unknown as PixiNode,
			degree: 500,
			isSuper: false,
		});
	}
}

function runDensityCulling(
	rt: Required<RenderThresholds>,
	placed: CullLabelRect[],
	zoom: number,
): void {
	if (placed.length <= 10) return;
	const densityMinDist = computeDensityMinDist(
		rt.labelDensityMinScreenDist,
		rt.labelDensityMaxDist,
		zoom,
		rt.labelDensityZoomThreshold,
	);
	const densityMinDist2 = densityMinDist * densityMinDist;
	placed.sort(
		(a, b) =>
			b.pn.priorityScore +
			(b.pn.hoverForcedLabel ? 80 : 0) -
			(a.pn.priorityScore + (a.pn.hoverForcedLabel ? 80 : 0)),
	);
	const kept: CullLabelRect[] = [];
	const bucketSize = Math.max(densityMinDist, 50);
	const densityGrid = new Map<string, { cx: number; cy: number }[]>();
	for (const r of placed) {
		const cx = r.x + r.w / 2;
		const cy = r.y + r.h / 2;
		if (isDensityTooClose(cx, cy, bucketSize, densityMinDist2, densityGrid)) {
			fadeOutLabel(r.label, rt.labelFadeRate);
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

function measureLabelDims(
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

function buildLabelRect(
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

function collectLabelRects(
	pixiNodes: Map<string, PixiNode>,
	degrees: Map<string, number>,
	zoom: number,
	maxScreenW: number,
	maxScreenH: number,
	dims: { width: number; height: number },
	world: CanvasContainer | null,
): CullLabelRect[] {
	const vpMargin = 100;
	const effectiveVpMargin = Math.min(vpMargin / zoom, vpMargin * 5);
	const vpLeft = world ? -world.x / zoom - effectiveVpMargin : -Infinity;
	const vpTop = world ? -world.y / zoom - effectiveVpMargin : -Infinity;
	const vpRight = world ? (dims.width - world.x) / zoom + effectiveVpMargin : Infinity;
	const vpBottom = world ? (dims.height - world.y) / zoom + effectiveVpMargin : Infinity;

	const rects: CullLabelRect[] = [];
	for (const pn of pixiNodes.values()) {
		if (pn.data.x < vpLeft || pn.data.x > vpRight || pn.data.y < vpTop || pn.data.y > vpBottom) continue;
		const rect = buildLabelRect(pn, degrees, zoom, maxScreenW, maxScreenH);
		if (rect) rects.push(rect);
	}
	return rects;
}

function drawLeaderLine(
	pn: PixiNode,
	r: CullLabelRect,
	zoom: number,
	llWidth: number,
	llAlpha: number,
	state: LabelCullState,
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
	state.activeLeaderCount++;
	const lx = r.label.x;
	const ly = r.label.y;
	const worldW = zoom > 0 ? r.w / zoom : r.w;
	const worldH = zoom > 0 ? r.h / zoom : r.h;
	const labelAnchorX = r.label.anchor?.x ?? 0;
	const labelAnchorY = r.label.anchor?.y ?? 0;
	const labelLeft = lx - worldW * labelAnchorX;
	const labelRight = labelLeft + worldW;
	const labelTop = ly - worldH * labelAnchorY;
	const labelBottom = labelTop + worldH;
	const closestX = clamp(0, labelLeft, labelRight);
	const closestY = clamp(0, labelTop, labelBottom);
	const dist = Math.sqrt(closestX ** 2 + closestY ** 2);
	const edgeX = dist > 0.1 ? (closestX / dist) * nodeR : 0;
	const edgeY = dist > 0.1 ? (closestY / dist) * nodeR : 0;
	ll.lineStyle(llWidth, pn.color, llAlpha * alphaMultiplier);
	ll.moveTo(edgeX, edgeY);
	ll.lineTo(closestX, closestY);
}

function tryDisplaceLabel(
	r: CullLabelRect,
	zoom: number,
	maxDispRatio: number,
	grid: SpatialHashGrid<CullLabelRect>,
	drawLeader: boolean,
	llWidth: number,
	llAlpha: number,
	state: LabelCullState,
): CullLabelRect | null {
	const { pn } = r;
	const nodeR = pn.radius ?? 12;
	const screenNodeR = nodeR * zoom;

	const rawOffsets = generateDisplacementOffsets(r.w, r.h, screenNodeR);
	// Adaptive: sort offsets by distance from nearest placed label (farthest first)
	const offsets = rawOffsets
		.map((o) => {
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

	// AP-1 displacement cap
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
			r.x = cappedScreenX;
			r.y = cappedScreenY;
			if (drawLeader) {
				drawLeaderLine(pn, alt, zoom, llWidth, llAlpha, state);
			}
			return alt;
		}
	}
	return null;
}

function tryDisplaceForceShow(
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

function showLabelWithLeader(
	r: CullLabelRect,
	placed: CullLabelRect[],
	grid: SpatialHashGrid<CullLabelRect>,
	origLx: number,
	origLy: number,
	drawLeader: boolean,
	zoom: number,
	llWidth: number,
	llAlpha: number,
	state: LabelCullState,
): void {
	r.label.visible = true;
	placed.push(r);
	grid.insert(r);
	if (drawLeader && (Math.abs(r.label.x - origLx) >= 0.1 || Math.abs(r.label.y - origLy) >= 0.1)) {
		drawLeaderLine(r.pn, r, zoom, llWidth, llAlpha, state);
	}
}

/**
 * AP-5 super-node concession: hide lowest-degree super labels and replace
 * them with regular labels to improve label diversity.
 */
function sacrificeSuperLabels(
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
	state: LabelCullState,
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
 * AP-4 absolute floor: guarantee a minimum number of visible labels by
 * force-showing highest-degree candidates from the combined hidden list.
 */
function fillLabelsToFloor(
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
	state: LabelCullState,
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
function guaranteePlacementFloor(
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
	state: LabelCullState,
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
 * Draw leader lines for non-displaced labels when counter-scale exceeds
 * threshold. At high zoom-out, even default-position labels are visually
 * far from their node.
 */
function drawCounterScaleLeaderLines(
	rt: RenderThresholds,
	placed: CullLabelRect[],
	zoom: number,
	drawLeader: boolean,
	llWidth: number,
	llAlpha: number,
	state: LabelCullState,
): void {
	if (!drawLeader) return;
	const alwaysThreshold = rt.labelLeaderLineAlwaysThreshold ?? 3.0;
	for (const r of placed) {
		const { pn } = r;
		if (pn.leaderLine?.visible) continue;
		const labelScale = r.label.scale?.x ?? 1;
		if (labelScale < alwaysThreshold) continue;
		drawLeaderLine(pn, r, zoom, llWidth, llAlpha, state, 0.6);
	}
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Run the full label-culling pass: collect rects, resolve overlaps via spatial
 * hash + displacement, run density culling, guarantee placement floor, and draw
 * leader lines as needed. Mutates `label.visible`, `label.x`/`label.y`, and
 * `pn.leaderLine` graphics. Returns stats for the caller to display.
 *
 * The caller must check `rt.labelOverlapCulling` before invoking; this
 * function does not gate itself.
 */
export function runLabelCulling(
	host: LabelCullingHost,
	rt: Required<RenderThresholds>,
	state: LabelCullState,
): LabelCullStats {
	const zoom = host.getWorldContainer()?.scale.x ?? 1;
	const zoomMarginScale = zoom < 0.5 ? Math.min(4, 1 + (0.5 - zoom) * 6) : 1;
	const margin = rt.labelOverlapMargin * zoomMarginScale;
	const pixiNodes = host.getPixiNodes();
	const degrees = host.getDegrees();
	const dims = host.getCanvasDimensions();
	const world = host.getWorldContainer();

	const rects = collectLabelRects(
		pixiNodes,
		degrees,
		zoom,
		rt.labelOverlapMaxScreenW,
		rt.labelOverlapMaxScreenH,
		dims,
		world,
	);
	const grid = new SpatialHashGrid<CullLabelRect>(OVERLAP_GRID_CELL_SIZE, margin);

	reserveDomExclusionZones(grid, host.getPixiApp());
	reserveEnclosureLabelZones(grid, host.getEnclosureLabels?.(), world);

	rects.sort((a, b) => {
		const aBoost = a.pn.hoverForcedLabel ? 80 : 0;
		const bBoost = b.pn.hoverForcedLabel ? 80 : 0;
		return b.pn.priorityScore + bBoost - (a.pn.priorityScore + aBoost);
	});

	const placed: CullLabelRect[] = [];
	const drawLeader = rt.labelLeaderLines;
	const llAlpha = rt.labelLeaderLineAlpha;
	const llWidth = rt.labelLeaderLineWidth;

	if (state.activeLeaderCount > 0) {
		for (const pn of pixiNodes.values()) {
			if (pn.leaderLine) {
				pn.leaderLine.clear();
				pn.leaderLine.visible = false;
			}
		}
		state.activeLeaderCount = 0;
	}

	for (const r of rects) {
		if (!grid.checkOverlap(r)) {
			placed.push(r);
			grid.insert(r);
			continue;
		}
		const found = tryDisplaceLabel(
			r,
			zoom,
			rt.labelMaxDisplacementRatio,
			grid,
			drawLeader,
			llWidth,
			llAlpha,
			state,
		);
		if (found) {
			placed.push(found);
			grid.insert(found);
		} else {
			fadeOutLabel(r.label, rt.labelFadeRate);
		}
	}

	runDensityCulling(rt, placed, zoom);

	guaranteePlacementFloor(
		rt,
		rects,
		placed,
		grid,
		zoom,
		margin,
		rt.labelMinNonSuper,
		drawLeader,
		llWidth,
		llAlpha,
		state,
	);
	drawCounterScaleLeaderLines(rt, placed, zoom, drawLeader, llWidth, llAlpha, state);

	const totalVisible = rects.filter((r) => r.label.visible).length;
	const densityCulled = rects.length - totalVisible;
	host.updateDensityCulledBadge?.(densityCulled);
	return {
		totalLabels: rects.length,
		visibleLabels: totalVisible,
		culledLabels: densityCulled,
		collisionRate: rects.length > 0 ? densityCulled / rects.length : 0,
	};
}
