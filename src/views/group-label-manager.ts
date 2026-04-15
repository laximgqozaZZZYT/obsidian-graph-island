/**
 * GroupLabelManager — extracted from GraphViewContainer.
 * Handles groupBy label computation, collision avoidance, cluster boundary drawing,
 * and zoom-aggregate rendering (folder summaries at extreme zoom-out).
 *
 * All heavy logic lives in pure(-ish) functions; GVC passes state via host interfaces.
 */

import { CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import { addToMapSet } from "../utils/map-helpers";
import { convexHull } from "../utils/geometry";
import {
	AGGREGATE_ZOOM_THRESHOLD,
	GROUP_LABEL_PALETTE as PALETTE,
	AGGREGATE_PALETTE,
	HULL_DRIFT_THRESHOLD,
	GROUP_LABEL_FILL,
	GROUP_LABEL_FILL_HOVERED,
	GROUP_LABEL_STROKE_COLOR,
	GROUP_LABEL_STROKE_WIDTH,
	GROUP_LABEL_STROKE_WIDTH_AGGREGATE,
	GROUP_LABEL_BG_COLOR,
	GROUP_LABEL_BG_COLOR_AGGREGATE,
	GROUP_LABEL_BG_COLOR_HOVERED,
	GROUP_LABEL_BG_ALPHA,
	GROUP_LABEL_BG_ALPHA_AGGREGATE,
	GROUP_LABEL_BG_ALPHA_HOVERED,
	GROUP_LABEL_PAD_X,
	GROUP_LABEL_PAD_Y,
	GROUP_LABEL_PAD_X_AGGREGATE,
	GROUP_LABEL_PAD_Y_AGGREGATE,
	GROUP_LABEL_MIN_FONT_SIZE,
	AGGREGATE_FONT_SCALE_FACTOR,
	AGGREGATE_FILL_ALPHA,
	AGGREGATE_OUTLINE_WIDTH,
	AGGREGATE_OUTLINE_ALPHA,
	AGGREGATE_LABEL_FONT_SIZE,
	AGGREGATE_LABEL_FILL,
	AGGREGATE_LABEL_BG_ALPHA,
	AGGREGATE_LABEL_PAD_X,
	AGGREGATE_LABEL_PAD_Y,
	AGGREGATE_LABEL_STROKE_WIDTH,
	AGGREGATE_LABEL_Y_OFFSET,
	AGGREGATE_MAX_COUNTER_SCALE,
	AGGREGATE_CHAR_WIDTH_EST,
	AGGREGATE_HIT_HEIGHT_EST,
} from "../constants";

export { AGGREGATE_ZOOM_THRESHOLD };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroupCentroid {
	x: number;
	y: number;
	memberCount: number;
}

interface HullCache {
	cx: number;
	cy: number;
	hull: { x: number; y: number }[];
}

export interface AggregateHitRegion {
	x: number;
	y: number;
	w: number;
	h: number;
	cx: number;
	cy: number;
	r: number;
}

/** Minimal node info needed for group label computation */
export interface GroupNodeInfo {
	id: string;
	filePath?: string;
	tags?: string[];
	meta?: Record<string, unknown>;
	x: number;
	y: number;
	gfxX: number;
	gfxY: number;
	collapsedMembers?: string[];
}

// ---------------------------------------------------------------------------
// 1. Collect group centroids + members
// ---------------------------------------------------------------------------

/** Resolve a single groupBy field value from a node */
function resolveGroupFieldValue(field: string, pn: GroupNodeInfo): string {
	if (field === "folder") {
		const fp = pn.filePath;
		if (!fp || !fp.includes("/")) return "root";
		return fp.replace(/\/[^/]*$/, "");
	}
	if (field === "tag") return pn.tags?.[0] || "ungrouped";
	return (pn.meta?.[field] as string | undefined) || "ungrouped";
}

/** Build a composite groupBy key from multiple fields */
function buildCompositeGroupKey(fields: string[], pn: GroupNodeInfo): string {
	return fields.map((f) => resolveGroupFieldValue(f, pn)).join(" · ");
}

/** Incrementally update a running centroid with a new member */
function addGroupMember(
	groups: Map<string, GroupCentroid>,
	members: Map<string, Set<string>>,
	key: string,
	nodeId: string,
	px: number,
	py: number,
): void {
	const existing = groups.get(key);
	if (existing) {
		const n = existing.memberCount + 1;
		existing.x += (px - existing.x) / n;
		existing.y += (py - existing.y) / n;
		existing.memberCount = n;
	} else {
		groups.set(key, { x: px, y: py, memberCount: 1 });
	}
	addToMapSet(members, key, nodeId);
}

/**
 * Collect group centroids and member sets from nodes based on groupBy fields,
 * tag enclosures, or auto-folder grouping.
 */
export function collectGroupCentroids(
	nodes: Iterable<GroupNodeInfo>,
	opts: {
		hasGroupBy: boolean;
		groupByFields: string[];
		hasTagEnclosures: boolean;
		autoFolderGroups: boolean;
	},
): { groups: Map<string, GroupCentroid>; members: Map<string, Set<string>> } {
	const groups = new Map<string, GroupCentroid>();
	const members = new Map<string, Set<string>>();

	if (opts.hasGroupBy) {
		for (const pn of nodes) {
			if (pn.id.startsWith("__super__")) {
				const key = pn.id.replace("__super__", "");
				groups.set(key, {
					x: pn.gfxX,
					y: pn.gfxY,
					memberCount: pn.collapsedMembers?.length ?? 1,
				});
				if (pn.collapsedMembers) {
					members.set(key, new Set(pn.collapsedMembers));
				}
				continue;
			}
			const compositeKey = buildCompositeGroupKey(opts.groupByFields, pn);
			addGroupMember(groups, members, compositeKey, pn.id, pn.gfxX, pn.gfxY);
		}
	} else if (opts.hasTagEnclosures || opts.autoFolderGroups) {
		for (const pn of nodes) {
			const path = pn.filePath ?? "";
			const folder = path.split("/")[0] || "root";
			if (!folder || folder === "root") continue;
			addGroupMember(groups, members, `folder:${folder}`, pn.id, pn.gfxX, pn.gfxY);
		}
	}

	return { groups, members };
}

// ---------------------------------------------------------------------------
// 2. Draw cluster boundary outlines (convex hulls with Catmull-Rom splines)
// ---------------------------------------------------------------------------

/**
 * Draw smooth cluster boundary outlines around groups with enough members.
 * Uses cached convex hulls that are only recomputed when centroid drifts.
 */
export function drawClusterBoundaries(
	gfx: CanvasGraphics,
	members: Map<string, Set<string>>,
	nodePositions: Map<string, { x: number; y: number }>,
	totalNodeCount: number,
	hoveredGroupLabel: string | null,
	cachedHulls: Map<string, HullCache>,
): void {
	gfx.clear();
	const minMembers = Math.max(5, Math.floor(totalNodeCount * 0.01));
	let colorIdx = 0;

	for (const [key, memberIds] of members) {
		if (memberIds.size < minMembers) continue;
		// Compute current centroid (lightweight O(M) — just x/y avg)
		let sumX = 0,
			sumY = 0,
			count = 0;
		for (const id of memberIds) {
			const pos = nodePositions.get(id);
			if (pos) {
				sumX += pos.x;
				sumY += pos.y;
				count++;
			}
		}
		if (count < 3) continue;
		const cx = sumX / count,
			cy = sumY / count;

		// Check hull cache — reuse if centroid hasn't drifted
		let cached = cachedHulls.get(key);
		if (
			!cached ||
			Math.abs(cached.cx - cx) > HULL_DRIFT_THRESHOLD ||
			Math.abs(cached.cy - cy) > HULL_DRIFT_THRESHOLD
		) {
			// Recompute hull
			const pts: { x: number; y: number }[] = [];
			for (const id of memberIds) {
				const pos = nodePositions.get(id);
				if (pos) pts.push({ x: pos.x, y: pos.y });
			}
			const pad = 80;
			const hullInput: { x: number; y: number }[] = [];
			for (const p of pts) {
				const dx = p.x - cx,
					dy = p.y - cy;
				const dist = Math.sqrt(dx * dx + dy * dy) || 1;
				hullInput.push({ x: p.x + (dx / dist) * pad, y: p.y + (dy / dist) * pad });
			}
			const hull = convexHull(hullInput);
			if (hull.length < 3) continue;
			cached = { cx, cy, hull };
			cachedHulls.set(key, cached);
		}
		const hull = cached.hull;
		const color = PALETTE[colorIdx % PALETTE.length];
		colorIdx++;
		const isHovered = key === hoveredGroupLabel;
		gfx.lineStyle(isHovered ? 3 : 1.5, color, isHovered ? 0.6 : 0.25);
		gfx.beginFill(color, isHovered ? 0.08 : 0.03);
		// Catmull-Rom spline through hull points for smooth boundary
		const n = hull.length;
		const pt = (i: number) => hull[((i % n) + n) % n];
		const tension = 0.5;
		gfx.moveTo((pt(0).x + pt(1).x) / 2, (pt(0).y + pt(1).y) / 2);
		for (let i = 0; i < n; i++) {
			const p0 = pt(i),
				p1 = pt(i + 1);
			const cp1x = p0.x + ((pt(i + 1).x - pt(i - 1).x) * tension) / 3;
			const cp1y = p0.y + ((pt(i + 1).y - pt(i - 1).y) * tension) / 3;
			const cp2x = p1.x - ((pt(i + 2).x - p0.x) * tension) / 3;
			const cp2y = p1.y - ((pt(i + 2).y - p0.y) * tension) / 3;
			gfx.bezierCurveTo(
				cp1x,
				cp1y,
				cp2x,
				cp2y,
				(p0.x + p1.x) / 2 + (p1.x - p0.x) * 0.5,
				(p0.y + p1.y) / 2 + (p1.y - p0.y) * 0.5,
			);
		}
		gfx.closePath();
		gfx.endFill();
	}
}

// ---------------------------------------------------------------------------
// 3. Compute label layout (collision-aware placement)
// ---------------------------------------------------------------------------

interface LabelPlacement {
	key: string;
	displayName: string;
	labelText: string;
	worldX: number;
	worldY: number;
	isAggregateMode: boolean;
}

/**
 * Compute label placements for groups, with collision avoidance via spiral nudge.
 * Returns an ordered array of placements (largest groups first) and a set of
 * visible keys (keys that survived the second-pass overlap cull).
 */
export function computeGroupLabelPlacements(
	groups: Map<string, GroupCentroid>,
	totalNodeCount: number,
	ws: number,
	worldX: number,
	worldY: number,
	canvasW: number,
	canvasH: number,
): { placements: LabelPlacement[]; visibleKeys: Set<string> } {
	const targetScreenPx = 14;
	const estCharW = targetScreenPx * 0.55;
	const labelH = targetScreenPx + 10;

	// Sort groups by member count descending (larger groups get priority)
	const sorted = [...groups.entries()]
		.filter(([, g]) => g.memberCount >= Math.max(5, Math.floor(totalNodeCount * 0.01)))
		.sort((a, b) => b[1].memberCount - a[1].memberCount);

	// Collision avoidance: track placed label screen rects
	const placed: { x: number; y: number; hw: number; hh: number }[] = [];
	const margin = 20;
	const placements: LabelPlacement[] = [];

	for (const [key, g] of sorted) {
		// Strip field prefix for single-field keys (e.g. "tag:character" -> "character")
		const displayName = key.includes(":") && !key.includes(" · ") ? key.replace(/^[^:]+:/, "") : key;
		const labelText = `${displayName} (${g.memberCount})`;

		const hw = labelText.length * estCharW * 0.5;
		const hh = labelH * 0.5;

		// Place label, nudging away from collisions (screen space)
		const originSx = g.x * ws + worldX;
		const originSy = g.y * ws + worldY;
		let sx = originSx;
		let sy = originSy;

		const collides = (tx: number, ty: number) =>
			placed.some((p) => Math.abs(tx - p.x) < hw + p.hw && Math.abs(ty - p.y) < hh + p.hh);

		// Multi-directional spiral search
		const DIRS = [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
			[1, 1],
			[-1, 1],
			[1, -1],
			[-1, -1],
		];
		const step = Math.max(labelH + 4, hw * 1.5);
		if (collides(sx, sy)) {
			outer: for (let radius = 1; radius <= 12; radius++) {
				for (const [ddx, ddy] of DIRS) {
					const tx = originSx + ddx * step * radius;
					const ty = originSy + ddy * step * radius;
					const clampedTx = Math.max(hw + margin, Math.min(canvasW - hw - margin, tx));
					const clampedTy = Math.max(hh + margin, Math.min(canvasH - hh - margin, ty));
					if (!collides(clampedTx, clampedTy)) {
						sx = clampedTx;
						sy = clampedTy;
						break outer;
					}
				}
			}
		}
		// Clamp final position within visible canvas area
		sx = Math.max(hw + margin, Math.min(canvasW - hw - margin, sx));
		sy = Math.max(hh + margin, Math.min(canvasH - hh - margin, sy));
		const lx = (sx - worldX) / ws;
		const ly = (sy - worldY) / ws;

		const isAggregateMode = ws < AGGREGATE_ZOOM_THRESHOLD;
		placements.push({ key, displayName, labelText, worldX: lx, worldY: ly, isAggregateMode });
		placed.push({ x: sx, y: sy, hw, hh });
	}

	// Second pass: hide labels that still overlap after spiral nudge
	const finalRects: { x: number; y: number; hw: number; hh: number }[] = [];
	const visibleKeys = new Set<string>();
	for (const p of placements) {
		const lblSx = p.worldX * ws + worldX;
		const lblSy = p.worldY * ws + worldY;
		const lblHw = p.labelText.length * estCharW * 0.5;
		const lblHh = labelH * 0.5;
		const overlaps = finalRects.some(
			(r) => Math.abs(lblSx - r.x) < lblHw + r.hw && Math.abs(lblSy - r.y) < lblHh + r.hh,
		);
		if (!overlaps) {
			visibleKeys.add(p.key);
			finalRects.push({ x: lblSx, y: lblSy, hw: lblHw, hh: lblHh });
		}
	}

	return { placements, visibleKeys };
}

// ---------------------------------------------------------------------------
// 4. Apply placements to CanvasText objects (mutating — thin GVC bridge)
// ---------------------------------------------------------------------------

/**
 * Apply computed placements to CanvasText label objects.
 * Creates new labels as needed, updates existing ones, hides stale ones.
 */
export function applyGroupLabelPlacements(
	placements: LabelPlacement[],
	visibleKeys: Set<string>,
	groupByLabels: Map<string, CanvasText>,
	labelContainer: CanvasContainer,
	ws: number,
	alpha: number,
	hoveredGroupLabel: string | null,
): void {
	const targetScreenPx = GROUP_LABEL_MIN_FONT_SIZE;
	const baseFontSize = Math.max(GROUP_LABEL_MIN_FONT_SIZE, Math.round(GROUP_LABEL_MIN_FONT_SIZE / Math.max(ws, 0.01)));
	const rawScale = targetScreenPx / (baseFontSize * ws);
	const labelScale = isFinite(rawScale) ? Math.max(1, rawScale) : 4;

	const usedKeys = new Set<string>();

	for (const p of placements) {
		usedKeys.add(p.key);
		const visible = visibleKeys.has(p.key);

		let txt = groupByLabels.get(p.key);
		if (!txt) {
			txt = new CanvasText(p.labelText, {
				fontSize: baseFontSize,
				fill: GROUP_LABEL_FILL,
				fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
				fontWeight: "600",
			});
			txt.anchor.set(0.5, 0.5);
			txt.resolution = 2;
			txt.strokeColor = GROUP_LABEL_STROKE_COLOR;
			txt.strokeWidth = GROUP_LABEL_STROKE_WIDTH;
			txt.bgColor = GROUP_LABEL_BG_COLOR;
			txt.bgAlpha = GROUP_LABEL_BG_ALPHA;
			txt.bgPadX = GROUP_LABEL_PAD_X;
			txt.bgPadY = GROUP_LABEL_PAD_Y;
			groupByLabels.set(p.key, txt);
			labelContainer.addChild(txt);
		} else {
			txt.text = p.labelText;
			txt.style.fontSize = baseFontSize;
		}

		// Aggregate mode: enlarge labels into prominent summary bars
		if (p.isAggregateMode) {
			const scaledFontSize = Math.max(
				GROUP_LABEL_MIN_FONT_SIZE,
				Math.round((GROUP_LABEL_MIN_FONT_SIZE / Math.max(ws, 0.001)) * AGGREGATE_FONT_SCALE_FACTOR),
			);
			txt.style.fontSize = scaledFontSize;
			txt.bgPadX = GROUP_LABEL_PAD_X_AGGREGATE;
			txt.bgPadY = GROUP_LABEL_PAD_Y_AGGREGATE;
			txt.strokeWidth = GROUP_LABEL_STROKE_WIDTH_AGGREGATE;
		} else {
			txt.style.fontSize = baseFontSize;
			txt.bgPadX = GROUP_LABEL_PAD_X;
			txt.bgPadY = GROUP_LABEL_PAD_Y;
			txt.strokeWidth = GROUP_LABEL_STROKE_WIDTH;
		}

		txt.scale.set(labelScale);
		txt.alpha = alpha;
		// Visual feedback for hovered label
		const isHovered = p.key === hoveredGroupLabel;
		txt.bgColor = isHovered ? GROUP_LABEL_BG_COLOR_HOVERED : p.isAggregateMode ? GROUP_LABEL_BG_COLOR_AGGREGATE : GROUP_LABEL_BG_COLOR;
		txt.bgAlpha = isHovered ? GROUP_LABEL_BG_ALPHA_HOVERED : p.isAggregateMode ? GROUP_LABEL_BG_ALPHA_AGGREGATE : GROUP_LABEL_BG_ALPHA;
		txt.style.fill = isHovered ? GROUP_LABEL_FILL_HOVERED : GROUP_LABEL_FILL;

		txt.x = p.worldX;
		txt.y = p.worldY;
		txt.visible = visible;
	}

	// Hide stale labels
	for (const [key, lbl] of groupByLabels) {
		if (!usedKeys.has(key)) lbl.visible = false;
	}
}

// ---------------------------------------------------------------------------
// 5. Zoom-aggregate renderer (folder summaries at extreme zoom-out)
// ---------------------------------------------------------------------------

interface AggregateGroup {
	folder: string;
	cx: number;
	cy: number;
	radius: number;
	nodeCount: number;
}

/**
 * Compute folder-based aggregate groups from node positions.
 * Returns groups with centroids and spread radii.
 */
export function computeAggregateGroups(nodes: Iterable<{ filePath?: string; x: number; y: number }>): AggregateGroup[] {
	const groups = new Map<string, { xs: number[]; ys: number[]; sumX: number; sumY: number }>();

	for (const pn of nodes) {
		const fp = pn.filePath ?? "";
		const slash = fp.indexOf("/");
		const folder = slash > 0 ? fp.substring(0, slash) : "(root)";
		let grp = groups.get(folder);
		if (!grp) {
			grp = { xs: [], ys: [], sumX: 0, sumY: 0 };
			groups.set(folder, grp);
		}
		grp.xs.push(pn.x);
		grp.ys.push(pn.y);
		grp.sumX += pn.x;
		grp.sumY += pn.y;
	}

	const result: AggregateGroup[] = [];
	for (const [folder, grp] of groups) {
		if (grp.xs.length < 3) continue;
		const cx = grp.sumX / grp.xs.length;
		const cy = grp.sumY / grp.ys.length;
		let maxDist = 0;
		for (let i = 0; i < grp.xs.length; i++) {
			const dx = grp.xs[i] - cx;
			const dy = grp.ys[i] - cy;
			const d = Math.sqrt(dx * dx + dy * dy);
			if (d > maxDist) maxDist = d;
		}
		result.push({ folder, cx, cy, radius: Math.max(maxDist * 0.8, 50), nodeCount: grp.xs.length });
	}
	return result;
}

/**
 * Draw aggregate circles and labels for folder groups.
 * Returns the hit regions for click-to-zoom interaction.
 */
export function drawAggregateGroups(
	aggregateGroups: AggregateGroup[],
	gfx: CanvasGraphics,
	worldContainer: CanvasContainer,
	aggregateLabels: CanvasText[],
	ws: number,
): { hitRegions: AggregateHitRegion[]; labelCount: number } {
	gfx.clear();
	const hitRegions: AggregateHitRegion[] = [];
	let labelIdx = 0;

	for (const ag of aggregateGroups) {
		const color = AGGREGATE_PALETTE[labelIdx % AGGREGATE_PALETTE.length];

		// Draw filled circle with outline
		gfx.beginFill(color, AGGREGATE_FILL_ALPHA);
		gfx.drawCircle(ag.cx, ag.cy, ag.radius);
		gfx.endFill();
		gfx.lineStyle(AGGREGATE_OUTLINE_WIDTH, color, AGGREGATE_OUTLINE_ALPHA);
		gfx.drawCircle(ag.cx, ag.cy, ag.radius);

		// Create or reuse label
		const labelText = `${ag.folder} (${ag.nodeCount})`;
		let lbl: CanvasText;
		if (labelIdx < aggregateLabels.length) {
			lbl = aggregateLabels[labelIdx];
			lbl.text = labelText;
			lbl.visible = true;
		} else {
			lbl = new CanvasText(labelText, {
				fontSize: AGGREGATE_LABEL_FONT_SIZE,
				fill: AGGREGATE_LABEL_FILL,
				fontWeight: "bold",
			});
			lbl.anchor.set(0.5, 0.5);
			lbl.bgAlpha = AGGREGATE_LABEL_BG_ALPHA;
			lbl.bgPadX = AGGREGATE_LABEL_PAD_X;
			lbl.bgPadY = AGGREGATE_LABEL_PAD_Y;
			lbl.strokeColor = GROUP_LABEL_STROKE_COLOR;
			lbl.strokeWidth = AGGREGATE_LABEL_STROKE_WIDTH;
			worldContainer.addChild(lbl);
			aggregateLabels.push(lbl);
		}
		lbl.bgColor = color;
		lbl.x = ag.cx;
		lbl.y = ag.cy - ag.radius - AGGREGATE_LABEL_Y_OFFSET;
		const counterScale = Math.min(AGGREGATE_MAX_COUNTER_SCALE, 1 / ws);
		lbl.scale.set(counterScale);

		// Store hit region for click-to-zoom (in world coords)
		const estW = labelText.length * AGGREGATE_CHAR_WIDTH_EST * counterScale;
		const estH = AGGREGATE_HIT_HEIGHT_EST * counterScale;
		hitRegions.push({
			x: ag.cx - estW / 2,
			y: ag.cy - ag.radius - AGGREGATE_LABEL_Y_OFFSET - estH / 2,
			w: estW,
			h: estH,
			cx: ag.cx,
			cy: ag.cy,
			r: ag.radius,
		});

		labelIdx++;
	}

	// Hide unused labels
	for (let i = labelIdx; i < aggregateLabels.length; i++) {
		aggregateLabels[i].visible = false;
	}

	return { hitRegions, labelCount: labelIdx };
}

// ---------------------------------------------------------------------------
// 6. Crossfade alpha computation
// ---------------------------------------------------------------------------

/**
 * Compute the crossfade alpha for group labels based on world scale.
 * Labels fade in over a zone: fully hidden above fadeStart, fully visible below fadeFull.
 */
export function computeGroupLabelAlpha(ws: number, fadeThreshold: number): number {
	const fadeStart = fadeThreshold;
	const fadeFull = fadeThreshold * 0.6;
	const rawAlpha = (fadeStart - ws) / (fadeStart - fadeFull);
	return isFinite(rawAlpha) ? Math.max(0, Math.min(1, rawAlpha)) : 1;
}

// Re-export parseGroupByFields so callers can import from this module
export { parseGroupByFields } from "../utils/graph-helpers";
