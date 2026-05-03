/**
 * group-label-hit — pure hit-testing helpers for groupBy labels.
 *
 * Extracted from GraphViewContainer to keep the host slim and to make the
 * hit-test math testable in isolation. Functions in this module hold no
 * `this` reference; callers pass state in (labels, world transform, node
 * positions) and receive plain results.
 */

/** Subset of CanvasText needed for screen-space hit testing. */
export interface ScreenHitLabel {
	visible: boolean;
	x: number;
	y: number;
	text?: string;
}

/** Subset of CanvasText needed for world-space hit testing. */
export interface WorldHitLabel {
	visible: boolean;
	x: number;
	y: number;
	width?: number;
	scale?: { x: number };
	_groupKey?: string;
}

/** World container transform (scale + offset) used to project world → screen. */
export interface WorldTransform {
	ws: number;
	worldX: number;
	worldY: number;
}

/** Node position lookup callback used by zoom-to-members computation. */
export type NodePositionLookup = (id: string) => { x: number; y: number } | undefined;

/** New world transform that fits a group of members to the viewport. */
export interface GroupZoomTransform {
	scale: number;
	x: number;
	y: number;
}

/** Result of hit-testing a groupBy label in world coords. */
export interface GroupByLabelHit {
	memberKey?: string;
	cx: number;
	cy: number;
}

const SCREEN_LABEL_CHAR_HALF_WIDTH = 7 * 0.5;
const SCREEN_LABEL_PAD_X = 10;
const SCREEN_LABEL_HALF_HEIGHT = 14;
const SCREEN_LABEL_PAD_Y = 5;
const SCREEN_LABEL_DEFAULT_TEXT_LEN = 10;
const WORLD_LABEL_DEFAULT_WIDTH = 100;
const WORLD_LABEL_HEIGHT = 20;

/**
 * Hit-test screen-space mouse coords against group labels and return the
 * matching key, or null. Mirrors the inline pointermove logic from GVC.
 */
export function findHoveredGroupLabelKey(
	mx: number,
	my: number,
	labels: Iterable<[string, ScreenHitLabel]>,
	transform: WorldTransform,
): string | null {
	const { ws, worldX, worldY } = transform;
	for (const [key, txt] of labels) {
		if (!txt.visible) continue;
		const sx = txt.x * ws + worldX;
		const sy = txt.y * ws + worldY;
		const textLen = txt.text?.length ?? SCREEN_LABEL_DEFAULT_TEXT_LEN;
		const hw = textLen * SCREEN_LABEL_CHAR_HALF_WIDTH + SCREEN_LABEL_PAD_X;
		const hh = SCREEN_LABEL_HALF_HEIGHT + SCREEN_LABEL_PAD_Y;
		if (mx >= sx - hw && mx <= sx + hw && my >= sy - hh && my <= sy + hh) {
			return key;
		}
	}
	return null;
}

/**
 * Apply a hover-key transition: when the hovered label changes, drive the
 * ephemeral-highlight callback with the new member set (or null to clear).
 * Returns the resolved hover key for the caller to store.
 */
export function syncGroupLabelHover(
	hitKey: string | null,
	prevHoverKey: string | null,
	groupByMembers: Map<string, Set<string>>,
	applyHighlight: (ids: Set<string> | null) => void,
): string | null {
	if (hitKey === prevHoverKey) return prevHoverKey;
	if (hitKey) {
		const memberIds = groupByMembers.get(hitKey);
		if (memberIds && memberIds.size > 0) {
			applyHighlight(memberIds);
		}
	} else {
		applyHighlight(null);
	}
	return hitKey;
}

/**
 * Compute a new world transform that frames the bounding box of the given
 * member ids in the viewport with the requested padding. Returns null when
 * no positions could be resolved.
 */
export function computeZoomToGroupMembers(
	memberIds: Iterable<string>,
	getNodePos: NodePositionLookup,
	canvasW: number,
	canvasH: number,
	pad: number,
	maxScale: number,
): GroupZoomTransform | null {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const id of memberIds) {
		const p = getNodePos(id);
		if (!p) continue;
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	if (!isFinite(minX)) return null;
	const scaleX = canvasW / (maxX - minX + pad * 2);
	const scaleY = canvasH / (maxY - minY + pad * 2);
	const scale = Math.min(scaleX, scaleY, maxScale);
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return {
		scale,
		x: canvasW / 2 - cx * scale,
		y: canvasH / 2 - cy * scale,
	};
}

/**
 * Hit-test groupBy labels in world coords. Returns the matching label's
 * member key (when present) and its center, so callers can either zoom to
 * member bounds or fall back to the label position.
 */
export function hitTestGroupByLabelInWorld(
	wx: number,
	wy: number,
	labels: Iterable<[string, WorldHitLabel]>,
): GroupByLabelHit | null {
	for (const [, txt] of labels) {
		if (!txt.visible) continue;
		const cs = txt.scale?.x ?? 1;
		const tw = (txt.width ?? WORLD_LABEL_DEFAULT_WIDTH) * cs;
		const th = WORLD_LABEL_HEIGHT * cs;
		const lx = txt.x - tw / 2;
		const ly = txt.y - th / 2;
		if (wx >= lx && wx <= lx + tw && wy >= ly && wy <= ly + th) {
			return { memberKey: txt._groupKey, cx: txt.x, cy: txt.y };
		}
	}
	return null;
}
