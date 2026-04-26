import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { Pt } from "../utils/geometry";
import { convexHull, clamp, rectsOverlap } from "../utils/geometry";
import { hslToHex, stringHash } from "../utils/graph-helpers";
import { wcagContrastRatio, contrastColor } from "../utils/color";
import { darkenColor } from "./RenderPipeline";
// DEFAULT_COLORS removed (unused)
import { TAG_DISPLAY_ENCLOSURE } from "../constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnclosureConfig {
	tagDisplay: "node" | "enclosure";
	tagMembership: Map<string, Set<string>>;
	nodeColorMap: Map<string, string>;
	tagRelPairsCache: Set<string>;
	resolvePos: (id: string) => (Pt & { radius?: number }) | undefined;
	/** Current world scale (zoom level). Used to adapt rendering style. */
	worldScale: number;
	/** IK: High contrast mode — thicker borders for enclosures */
	highContrast?: boolean;
	/** Total number of nodes in the graph. Used with enclosureMinRatio. */
	totalNodeCount: number;
	/** Minimum fraction (0–1) of totalNodeCount a group must have to show an enclosure. */
	enclosureMinRatio: number;
	/** Called when a tag label is hovered (tag) or unhovered (null). */
	onTagHover?: (tag: string | null) => void;
	/** FJ: Called when a tag enclosure label is clicked. */
	onTagClick?: (tag: string) => void;
	/** Currently hovered tag (used to boost label alpha). */
	hoveredTag?: string | null;
	/** Dedicated container for labels (ensures z-order above nodes). */
	labelContainer?: CanvasContainer;
	/** RenderThresholds for group label styling. */
	groupLabelFontSize?: number;
	groupLabelFontWeight?: string;
	groupLabelLetterSpacing?: number;
	groupLabelAlpha?: number;
	groupLabelHullOffset?: number;
	groupLabelBgAlpha?: number;
	/** IQR multiplier for outlier filtering (default 2.0). Higher = more inclusive. */
	enclosureOutlierFactor?: number;
	/** FU: Label position within enclosure ("top" | "center" | "bottom", default "top") */
	enclosureLabelPosition?: "top" | "center" | "bottom";
	/** FY: Override fill opacity for enclosure (0 = auto, >0 = manual) */
	enclosureFillOpacity?: number;
	/** GC: Override stroke width for enclosure (0 = auto) */
	enclosureStrokeWidth?: number;
	/** S3: Cluster label detail level */
	clusterLabelDetail?: "minimal" | "standard" | "detailed" | "rich";
	/** S3: Cluster summary generator for rich labels */
	getClusterSummary?: (tag: string, memberCount: number) => string;
	/** Zoom threshold below which enclosures switch to outline-only mode (default 0.45). */
	enclosureZoomOutThreshold?: number;
}

/**
 * Mutable overlap cache — owned by GraphViewContainer, passed in by reference.
 * drawEnclosures reads/writes these fields to amortize overlap computation.
 */
export interface OverlapCache {
	frame: number;
	counts: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Internal data
// ---------------------------------------------------------------------------

interface EncData {
	tag: string;
	pts: (Pt & { radius: number })[];
	hex: number;
	expanded: Pt[];
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/** Minimum extra padding beyond node radius for the outline.
 *  These are rendering constants — not user-facing tuning parameters.
 *  They affect hull geometry, not layout behavior. */
const OUTLINE_PAD_MIN = 10;
/** Padding scales with node radius: pad = max(MIN, radius × factor) */
const OUTLINE_PAD_FACTOR = 0.8;
/** Number of sample points around each node circle for hull generation.
 *  Higher = more accurate circle approximation, but more hull vertices. */
const HULL_SAMPLES = 24;

/** Overlap re-computation interval in frames */
const OVERLAP_RECOMPUTE_FRAMES = 30;

/** Size fade divisor: large groups → lower alpha */
const SIZE_FADE_DIVISOR = 200;

/** Base fill alpha for non-overlapping enclosures (zoomed out) */
const FILL_ALPHA_BASE = 0.1;
/** Base fill alpha for overlapping enclosures (zoomed out) */
const FILL_ALPHA_OVERLAP = 0.04;

/** Maximum label collision resolution attempts */
const LABEL_COLLISION_MAX_ATTEMPTS = 6;

/** Stroke alpha for non-overlapping enclosures — bold border like map boundaries */
const STROKE_ALPHA_NO_OVERLAP = 0.85;
/** Minimum stroke alpha for overlapping enclosures */
const STROKE_ALPHA_OVERLAP_MIN = 0.5;
/** Stroke alpha numerator for overlapping enclosures */
const STROKE_ALPHA_OVERLAP_BASE = 0.75;
/** Stroke line width for non-overlapping enclosures — thick border for map-like appearance */
const STROKE_WIDTH_NO_OVERLAP = 4.0;
/** Stroke line width base for overlapping enclosures */
const STROKE_WIDTH_OVERLAP_BASE = 3.5;
/** Minimum stroke width for overlapping enclosures */
const STROKE_WIDTH_OVERLAP_MIN = 2.5;
/** Outer border width for double-line "map border" effect */
const BORDER_OUTER_WIDTH = 7.0;
/** Outer border alpha (darker, behind main stroke — higher = more visible border) */
const BORDER_OUTER_ALPHA_FACTOR = 0.6;
/** Size fade minimum fraction (large groups don't fully disappear) */
const SIZE_FADE_MIN = 0.3;
/** Fill alpha visibility threshold */
const FILL_ALPHA_VISIBILITY_THRESHOLD = 0.005;
/** Radial fill edge alpha factor */
/** Label darken factor for background pill */
const LABEL_DARKEN_FACTOR = 0.25;
/** Label pill padding (horizontal) */
const LABEL_PILL_PAD_X = 8;
/** Label pill padding (vertical) */
const LABEL_PILL_PAD_Y = 3;
/** Collision escape margin factor */
const COLLISION_ESCAPE_MARGIN = 0.15;

/** Compute dynamic padding for a given node radius */
function outlinePad(radius: number, memberCount?: number): number {
	const base = Math.max(OUTLINE_PAD_MIN, radius * OUTLINE_PAD_FACTOR);
	// DQ-10: Shrink padding for very small groups (1-3 members)
	return memberCount != null && memberCount <= 3 ? base * 0.6 : base;
}

/**
 * Zoom threshold: below this worldScale the view is considered "zoomed out".
 * In zoomed-out mode enclosures switch to filled regions with prominent labels.
 */
const ZOOM_OUT_THRESHOLD = 0.45;

// Module-level reusable buffers — reduce per-frame allocations
const _hullInputBuf: Pt[] = [];
const _enclosuresBuf: EncData[] = [];
const _allPtsBuf: (Pt & { radius: number })[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Extracted helpers for drawEnclosures (complexity reduction)
// ---------------------------------------------------------------------------

/** Build EncData for a single tag group. Returns null if group should be skipped. */
function buildEncData(tag: string, memberIds: Set<string>, cfg: EnclosureConfig, minCount: number): EncData | null {
	if (memberIds.size < minCount) return null;

	_allPtsBuf.length = 0;
	for (const id of memberIds) {
		const p = cfg.resolvePos(id);
		if (p) _allPtsBuf.push({ x: p.x, y: p.y, radius: p.radius ?? 12 });
	}
	if (_allPtsBuf.length < 1) return null;

	const pts = filterOutliers(_allPtsBuf, cfg.enclosureOutlierFactor ?? 2.0);
	if (pts.length < 1) return null;

	const hue = stringHash(tag, 360);
	const hex = hslToHex(hue, 0.55, 0.55);

	_hullInputBuf.length = 0;
	const mc = pts.length;
	for (const p of pts) {
		const r = p.radius + outlinePad(p.radius, mc);
		for (let k = 0; k < HULL_SAMPLES; k++) {
			const angle = (k / HULL_SAMPLES) * Math.PI * 2;
			_hullInputBuf.push({ x: p.x + Math.cos(angle) * r, y: p.y + Math.sin(angle) * r });
		}
	}

	let expanded: Pt[];
	if (pts.length === 1) {
		const p = pts[0];
		const r = p.radius + outlinePad(p.radius, mc);
		expanded = [
			{ x: p.x - r, y: p.y - r },
			{ x: p.x + r, y: p.y - r },
			{ x: p.x + r, y: p.y + r },
			{ x: p.x - r, y: p.y + r },
		];
	} else {
		expanded = convexHull(_hullInputBuf);
	}

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const p of expanded) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}

	return { tag, pts, hex, expanded, minX, minY, maxX, maxY };
}

/** Recompute overlap counts between enclosures (amortized every N frames). */
function recomputeOverlapCounts(overlapCache: OverlapCache, enclosures: EncData[], relPairs: Set<string>): void {
	overlapCache.frame++;
	if (overlapCache.frame < OVERLAP_RECOMPUTE_FRAMES) return;
	overlapCache.frame = 0;
	overlapCache.counts.clear();
	for (let i = 0; i < enclosures.length; i++) {
		for (let j = i + 1; j < enclosures.length; j++) {
			const a = enclosures[i],
				b = enclosures[j];
			if (relPairs.has(`${a.tag}\0${b.tag}`)) continue;
			if (a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY) continue;
			overlapCache.counts.set(a.tag, (overlapCache.counts.get(a.tag) || 0) + 1);
			overlapCache.counts.set(b.tag, (overlapCache.counts.get(b.tag) || 0) + 1);
		}
	}
}

/** Compute stroke alpha and line width for an enclosure. */
function computeStrokeStyle(overlaps: number, cfg: EnclosureConfig): { baseLineAlpha: number; lineWidth: number } {
	const baseLineAlpha =
		overlaps === 0
			? STROKE_ALPHA_NO_OVERLAP
			: Math.max(STROKE_ALPHA_OVERLAP_MIN, STROKE_ALPHA_OVERLAP_BASE / (1 + overlaps * 0.1));
	const strokeOverride = cfg.enclosureStrokeWidth ?? 0;
	const hcMul = cfg.highContrast ? 3 : 1;
	const lineWidth =
		(strokeOverride > 0
			? strokeOverride
			: overlaps === 0
				? STROKE_WIDTH_NO_OVERLAP
				: Math.max(STROKE_WIDTH_OVERLAP_MIN, STROKE_WIDTH_OVERLAP_BASE - overlaps * 0.3)) * hcMul;
	return { baseLineAlpha, lineWidth };
}

/** Compute fill alpha for an enclosure based on zoom blend and overlap state. */
function computeFillAlpha(
	blend: number,
	overlaps: number,
	memberCount: number,
	opacityOverride: number | undefined | null,
): number {
	const sizeFade = Math.max(SIZE_FADE_MIN, 1 - memberCount / SIZE_FADE_DIVISOR);
	if (blend > 0.8) return 0;
	if (opacityOverride !== undefined && opacityOverride !== null) {
		return opacityOverride > 0 ? opacityOverride * sizeFade : 0;
	}
	if (blend > 0) {
		const baseFill = overlaps > 0 ? FILL_ALPHA_OVERLAP : FILL_ALPHA_BASE;
		return blend * baseFill * sizeFade;
	}
	return 0;
}

/** Draw the enclosure shape (circle, capsule, or hull polygon) on the graphics context. */
function drawEnclosureShape(
	g: CanvasGraphics,
	pts: (Pt & { radius: number })[],
	expanded: Pt[],
	memberCount: number,
): void {
	if (pts.length === 1) {
		const p = pts[0];
		const r = p.radius + outlinePad(p.radius, memberCount);
		g.drawCircle(p.x, p.y, r);
	} else if (pts.length === 2) {
		const maxR = Math.max(pts[0].radius, pts[1].radius);
		const r = maxR + outlinePad(maxR, memberCount);
		drawCapsule(g, pts[0], pts[1], r);
	} else {
		drawSmoothHull(g, expanded);
	}
}

/** Compute label anchor position (labelCenterX/Y) from the enclosure geometry. */
function computeLabelCenter(
	pts: (Pt & { radius: number })[],
	expanded: Pt[],
): { labelCenterX: number; labelCenterY: number } {
	if (pts.length === 1) {
		return { labelCenterX: pts[0].x, labelCenterY: pts[0].y };
	}
	if (pts.length === 2) {
		return {
			labelCenterX: (pts[0].x + pts[1].x) / 2,
			labelCenterY: (pts[0].y + pts[1].y) / 2,
		};
	}
	let sumX = 0,
		sumY = 0;
	for (const p of expanded) {
		sumX += p.x;
		sumY += p.y;
	}
	return {
		labelCenterX: sumX / expanded.length,
		labelCenterY: sumY / expanded.length,
	};
}

/** Ensure a CanvasText label exists for the given tag, creating one if needed. */
function ensureLabel(
	tag: string,
	hex: number,
	memberCount: number,
	enclosureLabels: Map<string, CanvasText>,
	cfg: EnclosureConfig,
	glFontSize: number,
	glFontWeight: string,
	glLetterSpacing: number,
	glBgAlpha: number,
): CanvasText {
	let txt = enclosureLabels.get(tag);
	if (!txt) {
		const hexStr = "#" + hex.toString(16).padStart(6, "0");
		const detail = cfg.clusterLabelDetail ?? "standard";
		let labelText: string;
		if (detail === "minimal") {
			labelText = `#${tag}`;
		} else if ((detail === "detailed" || detail === "rich") && cfg.getClusterSummary) {
			labelText = cfg.getClusterSummary(tag, memberCount);
		} else {
			labelText = `#${tag} (${memberCount})`;
		}
		txt = new CanvasText(labelText, {
			fontSize: glFontSize,
			fill: hexStr,
			fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
			fontWeight: glFontWeight,
		});
		txt.anchor.set(0.5, 0.5);
		txt.resolution = 2;
		txt.letterSpacing = glLetterSpacing;
		txt.strokeColor = 0x000000;
		txt.strokeWidth = 2;
		enclosureLabels.set(tag, txt);
	}
	// Pill background: darken the enclosure hue
	const bgHex = darkenColor(hex, LABEL_DARKEN_FACTOR);
	txt.bgColor = bgHex;
	txt.bgAlpha = glBgAlpha;
	txt.bgPadX = LABEL_PILL_PAD_X;
	txt.bgPadY = LABEL_PILL_PAD_Y;
	// WCAG contrast auto-correction
	if (wcagContrastRatio(hex, bgHex) < 3.0) {
		txt.style.fill = "#" + contrastColor(bgHex).toString(16).padStart(6, "0");
	}
	return txt;
}

/** Find farthest hull vertex from centroid and return direction unit vector. */
function farthestDirection(
	expanded: Pt[],
	labelCenterX: number,
	labelCenterY: number,
): { farthestX: number; farthestY: number; ux: number; uy: number } {
	let farthestDist = 0;
	let farthestX = labelCenterX;
	let farthestY = labelCenterY - 1;
	for (const p of expanded) {
		const dx = p.x - labelCenterX;
		const dy = p.y - labelCenterY;
		const d = dx * dx + dy * dy;
		if (d > farthestDist) {
			farthestDist = d;
			farthestX = p.x;
			farthestY = p.y;
		}
	}
	const dirX = farthestX - labelCenterX;
	const dirY = farthestY - labelCenterY;
	const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
	return { farthestX, farthestY, ux: dirX / dirLen, uy: dirY / dirLen };
}

/** Position a label according to enclosureLabelPosition setting. */
function positionLabel(
	txt: CanvasText,
	expanded: Pt[],
	labelCenterX: number,
	labelCenterY: number,
	far: { farthestX: number; farthestY: number; ux: number; uy: number },
	glHullOffset: number,
	lpos: "top" | "center" | "bottom",
): void {
	txt.anchor.set(0.5, 0.5);
	if (lpos === "center") {
		txt.x = labelCenterX;
		txt.y = labelCenterY;
	} else if (lpos === "bottom") {
		let bottomY = -Infinity;
		let bottomX = labelCenterX;
		for (const p of expanded) {
			if (p.y > bottomY) {
				bottomY = p.y;
				bottomX = p.x;
			}
		}
		txt.x = bottomX;
		txt.y = bottomY + glHullOffset;
	} else {
		txt.x = far.farthestX + far.ux * glHullOffset;
		txt.y = far.farthestY + far.uy * glHullOffset;
	}
}

/** Get approximate bounding box for a label (in world coords). */
function labelRect(txt: CanvasText): { x: number; y: number; w: number; h: number } {
	const w = txt.width;
	const h = txt.height;
	return { x: txt.x - w * txt.anchor.x, y: txt.y - h * txt.anchor.y, w, h };
}

/** Reparent, scale, and position a label for a single enclosure. */
function applyLabelTransform(
	txt: CanvasText,
	enc: EncData,
	g: CanvasGraphics,
	cfg: EnclosureConfig,
	glFontSize: number,
	glHullOffset: number,
	glAlpha: number,
	glBgAlpha: number,
): void {
	const ws = cfg.worldScale || 1;
	const { pts, expanded, tag } = enc;

	const { labelCenterX, labelCenterY } = computeLabelCenter(pts, expanded);

	// Reparent label if needed
	const targetParent = cfg.labelContainer ?? (g.parent as CanvasContainer | null);
	if (txt.parent !== targetParent && targetParent) {
		targetParent.addChild(txt);
	}

	// Scale + position
	const targetScreenPx = 14;
	const rawLabelScale = targetScreenPx / (glFontSize * ws);
	const labelScale = isFinite(rawLabelScale) ? clamp(rawLabelScale, 1, 300) : 4;

	const far = farthestDirection(expanded, labelCenterX, labelCenterY);
	positionLabel(txt, expanded, labelCenterX, labelCenterY, far, glHullOffset, cfg.enclosureLabelPosition ?? "top");

	txt.scale.set(labelScale);
	const isHovered = cfg.hoveredTag === tag;
	txt.alpha = isHovered ? Math.min(1, glAlpha + 0.3) : glAlpha;
	txt.bgAlpha = isHovered ? glBgAlpha + 0.2 : glBgAlpha;
	txt.visible = true;
}

/** Resolve label-to-label collisions via greedy nudging, hiding unresolvable labels. */
function resolveCollisions(
	usedLabels: Set<string>,
	enclosureLabels: Map<string, CanvasText>,
	tagMembership: Map<string, Set<string>>,
): void {
	const visibleLabels: { tag: string; txt: CanvasText; memberCount: number }[] = [];
	for (const tag of usedLabels) {
		const txt = enclosureLabels.get(tag);
		if (txt && txt.visible) {
			const members = tagMembership.get(tag);
			visibleLabels.push({ tag, txt, memberCount: members?.size ?? 0 });
		}
	}
	visibleLabels.sort((a, b) => b.memberCount - a.memberCount);

	const placedRects: { x: number; y: number; w: number; h: number }[] = [];
	for (const { txt } of visibleLabels) {
		let rect = labelRect(txt);
		let resolved = false;

		for (let attempt = 0; attempt < LABEL_COLLISION_MAX_ATTEMPTS; attempt++) {
			const blocker = placedRects.find((pr) => rectsOverlap(rect, pr));
			if (!blocker) {
				resolved = true;
				break;
			}
			const overlapX = Math.min(rect.x + rect.w - blocker.x, blocker.x + blocker.w - rect.x);
			const overlapY = Math.min(rect.y + rect.h - blocker.y, blocker.y + blocker.h - rect.y);
			if (overlapY <= overlapX) {
				const dy = rect.y + rect.h / 2 > blocker.y + blocker.h / 2 ? 1 : -1;
				txt.y += dy * (overlapY + rect.h * COLLISION_ESCAPE_MARGIN);
			} else {
				const dx = rect.x + rect.w / 2 > blocker.x + blocker.w / 2 ? 1 : -1;
				txt.x += dx * (overlapX + rect.w * COLLISION_ESCAPE_MARGIN);
			}
			rect = labelRect(txt);
		}

		if (!resolved) {
			txt.visible = false;
		} else {
			placedRects.push(rect);
		}
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Draw tag enclosures around node groups.
 *
 * Rendering adapts to zoom level:
 *   - **Zoomed in** (worldScale ≥ threshold): Bold outline strokes hugging
 *     the outer boundary of member nodes. Labels are small.
 *   - **Zoomed out** (worldScale < threshold): Semi-transparent coloured fill
 *     with large, prominent labels so groups are identifiable at a glance.
 */
export function drawEnclosures(
	g: CanvasGraphics,
	enclosureLabels: Map<string, CanvasText>,
	overlapCache: OverlapCache,
	cfg: EnclosureConfig,
): void {
	g.clear();

	if (cfg.tagDisplay !== TAG_DISPLAY_ENCLOSURE) {
		for (const lbl of enclosureLabels.values()) lbl.visible = false;
		return;
	}

	const ws = cfg.worldScale || 1;
	const zoomOutTh = cfg.enclosureZoomOutThreshold ?? ZOOM_OUT_THRESHOLD;
	const blend = ws < zoomOutTh ? Math.min(1, (zoomOutTh - ws) / (zoomOutTh * 0.5)) : 0;

	// Phase 1: Collect enclosure data per tag
	const minCount = Math.max(1, Math.floor(cfg.totalNodeCount * cfg.enclosureMinRatio));
	_enclosuresBuf.length = 0;
	const enclosures = _enclosuresBuf;
	for (const [tag, memberIds] of cfg.tagMembership) {
		const enc = buildEncData(tag, memberIds, cfg, minCount);
		if (enc) enclosures.push(enc);
	}

	// Phase 2: Sort large-first for z-order
	enclosures.sort((a, b) => {
		const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
		const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
		return areaB - areaA;
	});

	// Phase 3: Overlap count (amortized)
	recomputeOverlapCounts(overlapCache, enclosures, cfg.tagRelPairsCache);

	// Phase 4: Draw each enclosure + label
	const usedLabels = new Set<string>();
	const glFontSize = cfg.groupLabelFontSize ?? 12;
	const glFontWeight = cfg.groupLabelFontWeight ?? "500";
	const glLetterSpacing = cfg.groupLabelLetterSpacing ?? 0.15;
	const glAlpha = cfg.groupLabelAlpha ?? 0.6;
	const glBgAlpha = cfg.groupLabelBgAlpha ?? 0.65;
	const glHullOffset = cfg.groupLabelHullOffset ?? 24;

	for (const enc of enclosures) {
		const { tag, pts, hex, expanded } = enc;
		const memberCount = pts.length;
		const overlaps = overlapCache.counts.get(tag) || 0;

		const { baseLineAlpha, lineWidth } = computeStrokeStyle(overlaps, cfg);
		const fillAlpha = computeFillAlpha(blend, overlaps, memberCount, cfg.enclosureFillOpacity);

		// Draw fill
		if (fillAlpha > FILL_ALPHA_VISIBILITY_THRESHOLD) {
			g.lineStyle(0);
			g.beginFill(hex, fillAlpha);
			drawEnclosureShape(g, pts, expanded, memberCount);
			g.endFill();
		}

		// Draw double-border: outer darker + inner colored
		const outerAlpha = baseLineAlpha * BORDER_OUTER_ALPHA_FACTOR;
		const isDark = (hex & 0xffffff) < 0x808080;
		g.lineStyle(BORDER_OUTER_WIDTH, isDark ? 0x222222 : 0x000000, outerAlpha);
		drawEnclosureShape(g, pts, expanded, memberCount);

		g.lineStyle(lineWidth, hex, baseLineAlpha);
		drawEnclosureShape(g, pts, expanded, memberCount);

		// Label
		usedLabels.add(tag);
		const txt = ensureLabel(
			tag,
			hex,
			memberCount,
			enclosureLabels,
			cfg,
			glFontSize,
			glFontWeight,
			glLetterSpacing,
			glBgAlpha,
		);
		applyLabelTransform(txt, enc, g, cfg, glFontSize, glHullOffset, glAlpha, glBgAlpha);
	}

	// Phase 5: Label collision avoidance
	resolveCollisions(usedLabels, enclosureLabels, cfg.tagMembership);

	// Hide unused labels
	for (const [tag, lbl] of enclosureLabels) {
		if (!usedLabels.has(tag)) lbl.visible = false;
	}
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

/** 直線のみの多角形 — 地図の国境スタイル */
export function drawSmoothHull(g: CanvasGraphics, points: Pt[]) {
	if (points.length < 3) return;
	g.moveTo(points[0].x, points[0].y);
	for (let i = 1; i < points.length; i++) {
		g.lineTo(points[i].x, points[i].y);
	}
	g.closePath();
}

export function drawCapsule(g: CanvasGraphics, p0: Pt, p1: Pt, radius: number) {
	const dx = p1.x - p0.x;
	const dy = p1.y - p0.y;
	const len = Math.hypot(dx, dy) || 1;
	const ux = dx / len,
		uy = dy / len;
	const px = -uy,
		py = ux;

	const r = radius;
	const a = { x: p0.x + px * r, y: p0.y + py * r };
	const b = { x: p1.x + px * r, y: p1.y + py * r };
	const c = { x: p1.x - px * r, y: p1.y - py * r };
	const d = { x: p0.x - px * r, y: p0.y - py * r };

	// 直線的な国境スタイル — 角丸なしの矩形カプセル
	g.moveTo(a.x, a.y);
	g.lineTo(b.x, b.y);
	g.lineTo(c.x, c.y);
	g.lineTo(d.x, d.y);
	g.closePath();
}

// Reusable buffers for filterOutliers — eliminates per-call array allocations
const _distBuf: number[] = [];
const _sortBuf: number[] = [];

/**
 * Filter outlier points using IQR on distance from centroid.
 * Keeps only points within Q3 + factor×IQR of the centroid, preventing
 * spatially scattered tag members from inflating the convex hull.
 *
 * @param iqrFactor IQR multiplier for the cutoff (default 2.0). Higher = more inclusive.
 *
 * Uses module-level buffers for distance/sort arrays to reduce GC pressure
 * (~40 tags × 2 arrays = 80 array allocations saved per 3 frames).
 */
export function filterOutliers<T extends Pt>(pts: T[], iqrFactor = 2.0): T[] {
	if (pts.length <= 3) return pts;

	const n = pts.length;
	let cx = 0,
		cy = 0;
	for (let i = 0; i < n; i++) {
		cx += pts[i].x;
		cy += pts[i].y;
	}
	cx /= n;
	cy /= n;

	_distBuf.length = n;
	_sortBuf.length = n;
	for (let i = 0; i < n; i++) {
		const d = Math.hypot(pts[i].x - cx, pts[i].y - cy);
		_distBuf[i] = d;
		_sortBuf[i] = d;
	}
	_sortBuf.sort((a, b) => a - b);
	const q1 = _sortBuf[Math.floor(n * 0.25)];
	const q3 = _sortBuf[Math.floor(n * 0.75)];
	const cutoff = q3 + iqrFactor * (q3 - q1);

	const result: T[] = [];
	for (let i = 0; i < n; i++) {
		if (_distBuf[i] <= cutoff) result.push(pts[i]);
	}
	return result.length >= 1 ? result : pts;
}
