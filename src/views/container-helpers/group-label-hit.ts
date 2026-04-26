/**
 * Pure hit-testing helpers + thin interaction wiring for groupBy labels.
 *
 * Extracted from GraphViewContainer L2023-2096 (inline pointermove/click handlers)
 * and L5022-5063 (`hitTestAndZoomGroupLabel`). All math is pure; side-effects flow
 * through a host interface so callers retain ownership of mutable state.
 *
 * Two distinct hit-test flows live here:
 *   1. SCREEN-SPACE — pointermove/click handlers on the canvas. The label position
 *      is in world coords, so we project to screen via `txt.x * ws + worldX`.
 *   2. WORLD-SPACE — `hitTestAndZoomGroupByLabel` already receives world coords
 *      from the caller (e.g. context-menu handler), so we test directly.
 */

import type { CanvasText } from "../canvas2d";
import type { AggregateHitRegion } from "../../utils/geometry";
import { hitTestAggregateRegions, computeGroupMemberBounds } from "../../utils/geometry";

// ---------------------------------------------------------------------------
// Constants (mirror the inline magic numbers from GVC handlers)
// ---------------------------------------------------------------------------

/** Approximate pixel half-width per character at the default 14px label font. */
const SCREEN_LABEL_CHAR_HALF_WIDTH = 7 * 0.5;
/** Extra screen-pixel padding added around the label hit rectangle (each side). */
const SCREEN_LABEL_HIT_PAD_X = 10;
/** Default 14px font height contribution to the screen hit rectangle. */
const SCREEN_LABEL_HIT_HALF_HEIGHT = 14;
/** Extra screen-pixel padding added vertically around the label hit rectangle. */
const SCREEN_LABEL_HIT_PAD_Y = 5;
/** Default text-length fallback when `txt.text` is unset. */
const SCREEN_LABEL_DEFAULT_TEXT_LEN = 10;

/** World-space label half-height used by the world-coord hit-test path. */
const WORLD_LABEL_HEIGHT = 20;
/** Fallback world-space label width when measurement is missing. */
const WORLD_LABEL_FALLBACK_WIDTH = 100;

/** Padding (graphics units) added around member bounds before fitting to canvas. */
const ZOOM_TO_GROUP_PAD = 100;
/** Maximum scale factor when zooming to a group's members. */
const ZOOM_TO_GROUP_MAX_SCALE = 2.0;

// ---------------------------------------------------------------------------
// Pure helpers — hit-testing math
// ---------------------------------------------------------------------------

export interface ScreenHitContext {
	/** World scale (worldContainer.scale.x). Must be > 0 and finite. */
	ws: number;
	/** World container x in screen coords. */
	worldX: number;
	/** World container y in screen coords. */
	worldY: number;
}

/**
 * Find the first visible group label whose screen-space hit rectangle contains
 * `(mx, my)`. Iteration order is the Map's insertion order — first match wins.
 * Returns the label key, or null if no label is hit.
 */
export function findHoveredGroupLabel(
	mx: number,
	my: number,
	ctx: ScreenHitContext,
	labels: ReadonlyMap<string, CanvasText>,
): string | null {
	for (const [key, txt] of labels) {
		if (!txt.visible) continue;
		// Screen position of label center
		const sx = txt.x * ctx.ws + ctx.worldX;
		const sy = txt.y * ctx.ws + ctx.worldY;
		// Screen-space hit area (target 14px font, ~7px char width)
		const textLen = txt.text?.length ?? SCREEN_LABEL_DEFAULT_TEXT_LEN;
		const hw = textLen * SCREEN_LABEL_CHAR_HALF_WIDTH + SCREEN_LABEL_HIT_PAD_X;
		const hh = SCREEN_LABEL_HIT_HALF_HEIGHT + SCREEN_LABEL_HIT_PAD_Y;
		if (mx >= sx - hw && mx <= sx + hw && my >= sy - hh && my <= sy + hh) {
			return key;
		}
	}
	return null;
}

export interface MemberPositionLookup {
	get(id: string): { gfx: { x: number; y: number } } | undefined;
}

export interface GroupMembersBBox {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

/**
 * Compute the axis-aligned bounding box of the members' graphics positions.
 * Returns null when no member is found in `pixiNodes`.
 */
export function computeGroupMembersBoundingBox(
	memberIds: ReadonlySet<string>,
	pixiNodes: MemberPositionLookup,
): GroupMembersBBox | null {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const id of memberIds) {
		const pn = pixiNodes.get(id);
		if (!pn) continue;
		minX = Math.min(minX, pn.gfx.x);
		maxX = Math.max(maxX, pn.gfx.x);
		minY = Math.min(minY, pn.gfx.y);
		maxY = Math.max(maxY, pn.gfx.y);
	}
	if (!isFinite(minX)) return null;
	return { minX, maxX, minY, maxY };
}

export interface ZoomTransform {
	scale: number;
	x: number;
	y: number;
}

/**
 * Compute a world transform that fits `bbox` (graphics coords) into a canvas
 * of `(canvasW, canvasH)` with `pad` units of margin on every side, capped at
 * `maxScale`.
 */
export function computeZoomTransformForBounds(
	bbox: GroupMembersBBox,
	canvasW: number,
	canvasH: number,
	pad: number,
	maxScale: number,
): ZoomTransform {
	const scaleX = canvasW / (bbox.maxX - bbox.minX + pad * 2);
	const scaleY = canvasH / (bbox.maxY - bbox.minY + pad * 2);
	const scale = Math.min(scaleX, scaleY, maxScale);
	const cx = (bbox.minX + bbox.maxX) / 2;
	const cy = (bbox.minY + bbox.maxY) / 2;
	return {
		scale,
		x: canvasW / 2 - cx * scale,
		y: canvasH / 2 - cy * scale,
	};
}

export interface WorldLabelHit {
	/** The CanvasText that was hit. */
	txt: CanvasText;
	/** The label key recorded on `_groupKey` (if any). */
	memberKey: string | undefined;
}

/**
 * Hit-test world-space coords against the visible groupBy labels. Used by the
 * world-coord context-menu / programmatic flow (vs. the pointermove flow which
 * works in screen space).
 */
export function hitTestGroupByLabelAt(
	wx: number,
	wy: number,
	labels: ReadonlyMap<string, CanvasText>,
): WorldLabelHit | null {
	for (const [, txt] of labels) {
		if (!txt.visible) continue;
		const cs = txt.scale?.x ?? 1;
		const tw = (txt.width ?? WORLD_LABEL_FALLBACK_WIDTH) * cs;
		const th = WORLD_LABEL_HEIGHT * cs;
		const lx = txt.x - tw / 2;
		const ly = txt.y - th / 2;
		if (wx >= lx && wx <= lx + tw && wy >= ly && wy <= ly + th) {
			const memberKey = (txt as CanvasText & { _groupKey?: string })._groupKey;
			return { txt, memberKey };
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Side-effect host + interaction wiring
// ---------------------------------------------------------------------------

/**
 * State + callbacks the interaction handlers and hit-test orchestrator need
 * from `GraphViewContainer`. Keep this surface minimal.
 */
export interface GroupLabelHitHost {
	/** World container — null while the canvas is being torn down. */
	worldContainer: {
		scale: { x: number; set(s: number): void };
		x: number;
		y: number;
	} | null;
	/** Element used for canvas size lookup (`clientWidth` / `clientHeight`). */
	canvasWrap: HTMLElement | null;
	/** Live map of placed groupBy labels. */
	groupByLabels: ReadonlyMap<string, CanvasText>;
	/** Live map of group-key → member node IDs. */
	groupByMembers: ReadonlyMap<string, ReadonlySet<string>>;
	/** Live map of node ID → pixi node (read for `gfx.x` / `gfx.y`). */
	pixiNodes: MemberPositionLookup;
	/** Currently hovered groupBy label key (mutable). */
	_hoveredGroupLabel: string | null;
	/** Apply / clear the multi-node ephemeral highlight. */
	applyEphemeralHighlight(ids: ReadonlySet<string> | null): void;
	/** Mark the viewport as dirty so the next frame redraws. */
	markDirty(forceFullRedraw?: boolean): void;
}

/** Read once: defaulted-canvas size used for zoom-fit math. */
function getCanvasSize(host: GroupLabelHitHost): { w: number; h: number } {
	return {
		w: host.canvasWrap?.clientWidth ?? 800,
		h: host.canvasWrap?.clientHeight ?? 600,
	};
}

/**
 * Wire pointermove (hover→highlight) and click (zoom-to-members) handlers for
 * groupBy labels onto `canvas`. The handlers no-op when no labels exist.
 *
 * Returns a detach function that removes both listeners.
 */
export function attachGroupLabelInteractions(
	canvas: HTMLCanvasElement,
	host: GroupLabelHitHost,
): () => void {
	const onPointerMove = (e: PointerEvent) => {
		if (!host.groupByLabels.size || !host.worldContainer) return;
		const rect = canvas.getBoundingClientRect();
		const mx = e.clientX - rect.left;
		const my = e.clientY - rect.top;
		const ws = host.worldContainer.scale.x;
		if (!isFinite(ws) || ws <= 0) return;
		const hitKey = findHoveredGroupLabel(
			mx,
			my,
			{ ws, worldX: host.worldContainer.x, worldY: host.worldContainer.y },
			host.groupByLabels,
		);
		if (hitKey === host._hoveredGroupLabel) return;
		host._hoveredGroupLabel = hitKey;
		if (hitKey) {
			const memberIds = host.groupByMembers.get(hitKey);
			if (memberIds && memberIds.size > 0) {
				host.applyEphemeralHighlight(memberIds);
				return;
			}
		}
		host.applyEphemeralHighlight(null);
	};

	const onClick = (e: MouseEvent) => {
		if (!host._hoveredGroupLabel || !host.worldContainer) return;
		const memberIds = host.groupByMembers.get(host._hoveredGroupLabel);
		if (!memberIds || memberIds.size === 0) return;
		e.stopPropagation();
		const bbox = computeGroupMembersBoundingBox(memberIds, host.pixiNodes);
		if (!bbox) return;
		const { w: canvasW, h: canvasH } = getCanvasSize(host);
		const tf = computeZoomTransformForBounds(
			bbox,
			canvasW,
			canvasH,
			ZOOM_TO_GROUP_PAD,
			ZOOM_TO_GROUP_MAX_SCALE,
		);
		host.worldContainer.scale.set(tf.scale);
		host.worldContainer.x = tf.x;
		host.worldContainer.y = tf.y;
		host.applyEphemeralHighlight(null);
		host._hoveredGroupLabel = null;
		host.markDirty(true);
	};

	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("click", onClick);

	return () => {
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("click", onClick);
	};
}

// ---------------------------------------------------------------------------
// World-coord hit-test → zoom (replaces hitTestAndZoomGroupLabel body)
// ---------------------------------------------------------------------------

/** Minimal node shape used for filePath-prefix-based bounds computation. */
export type PrefixBoundsNode = { data: { filePath?: string; id?: string; x: number; y: number } };

export interface ZoomTargetHost {
	/** Read-only lookups used during hit-testing. */
	groupByLabels: ReadonlyMap<string, CanvasText>;
	/** Iterable of pixi nodes — used for filePath/id prefix matching. */
	pixiNodes: Iterable<PrefixBoundsNode>;
	aggregateHitRegions: readonly AggregateHitRegion[];
	/** Animate zoom to a world-coordinate rectangle. */
	zoomToWorldRect(wx: number, wy: number, ww: number, wh: number): void;
}

/** Padding (world units) for the bbox computed from a member-key prefix match. */
const ZOOM_TO_MEMBERS_PAD = 50;

/**
 * Hit-test the aggregate hit regions and groupBy labels at world coords
 * `(wx, wy)`. On match, calls `host.zoomToWorldRect(...)` and returns true.
 *
 * Mirrors the prior `GVC.hitTestAndZoomGroupLabel` behavior, including the
 * fallback to a fixed-size rect (`zoomToLabelRect`) when no member key is
 * found on the label.
 */
export function hitTestAndZoomGroupByLabel(
	wx: number,
	wy: number,
	host: ZoomTargetHost,
	zoomToLabelRect: number,
): boolean {
	// 1. Aggregate hit regions (zoom-out folder summaries)
	const hitRegion = hitTestAggregateRegions(wx, wy, host.aggregateHitRegions);
	if (hitRegion) {
		host.zoomToWorldRect(
			hitRegion.cx - hitRegion.r,
			hitRegion.cy - hitRegion.r,
			hitRegion.r * 2,
			hitRegion.r * 2,
		);
		return true;
	}

	// 2. groupBy labels
	const labelHit = hitTestGroupByLabelAt(wx, wy, host.groupByLabels);
	if (!labelHit) return false;

	if (labelHit.memberKey) {
		const bounds = computeGroupMemberBounds(host.pixiNodes, labelHit.memberKey, ZOOM_TO_MEMBERS_PAD);
		if (bounds) {
			host.zoomToWorldRect(bounds.x, bounds.y, bounds.w, bounds.h);
			return true;
		}
	}
	// Fallback: zoom to label position with a fixed rect size
	host.zoomToWorldRect(
		labelHit.txt.x - zoomToLabelRect / 2,
		labelHit.txt.y - zoomToLabelRect / 2,
		zoomToLabelRect,
		zoomToLabelRect,
	);
	return true;
}
