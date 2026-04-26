/**
 * group-label-hit-test — extracted from GraphViewContainer L2023-2096.
 *
 * Pure helpers for groupBy label pointer interaction:
 *   - {@link findHoveredGroupLabel}: screen-space hit-test against group labels
 *   - {@link computeGroupZoomTransform}: bbox + zoom-to-fit transform for group members
 *
 * Both functions are pure: they read structural inputs and return plain values,
 * leaving DOM/world-container state mutations to the caller.
 */

/** Default text length used when a label has no `.text` value (fallback only). */
const DEFAULT_LABEL_TEXT_LEN = 10;
/** Approximate per-character width in screen pixels at 14px font (used for hit padding). */
const LABEL_CHAR_WIDTH_PX = 7;
/** Horizontal padding added to the hit-area half-width. */
const LABEL_HIT_PAD_X = 10;
/** Half-height estimate (font size) for the hit area. */
const LABEL_HIT_HALF_H = 14;
/** Vertical padding added to the hit-area half-height. */
const LABEL_HIT_PAD_Y = 5;

/** Maximum scale used when zooming to a group's bounding box. */
const GROUP_ZOOM_MAX_SCALE = 2.0;
/** World-coordinate padding around the group's bounding box. */
const GROUP_ZOOM_PADDING = 100;

/**
 * Minimal CanvasText shape used for hit-testing. Matches the relevant fields of
 * `CanvasText` from `../canvas2d` without coupling this helper to that module.
 */
export interface GroupLabelLike {
	x: number;
	y: number;
	visible: boolean;
	text?: string;
}

/**
 * Minimal PixiNode shape used for bounding-box computation.
 */
export interface GroupMemberLike {
	gfx: { x: number; y: number };
}

export interface GroupZoomTransform {
	scale: number;
	x: number;
	y: number;
}

/**
 * Find the group label currently under the pointer.
 *
 * Mirrors GraphViewContainer's pointermove hit-test: each label's screen position is
 * `(label.x * worldScale + worldX, label.y * worldScale + worldY)` and the hit area is
 * a screen-aligned rectangle sized from the label's text length.
 *
 * @returns the matching group key, or `null` if no label is hit.
 */
export function findHoveredGroupLabel(
	pointerScreenX: number,
	pointerScreenY: number,
	groupByLabels: ReadonlyMap<string, GroupLabelLike>,
	worldX: number,
	worldY: number,
	worldScale: number,
): string | null {
	for (const [key, txt] of groupByLabels) {
		if (!txt.visible) continue;
		const sx = txt.x * worldScale + worldX;
		const sy = txt.y * worldScale + worldY;
		const textLen = txt.text?.length ?? DEFAULT_LABEL_TEXT_LEN;
		const hw = textLen * LABEL_CHAR_WIDTH_PX * 0.5 + LABEL_HIT_PAD_X;
		const hh = LABEL_HIT_HALF_H + LABEL_HIT_PAD_Y;
		if (
			pointerScreenX >= sx - hw &&
			pointerScreenX <= sx + hw &&
			pointerScreenY >= sy - hh &&
			pointerScreenY <= sy + hh
		) {
			return key;
		}
	}
	return null;
}

/**
 * Compute a zoom-to-fit world transform for a set of group members.
 *
 * Returns `null` when the member set is empty, contains no resolvable nodes, or
 * yields a non-finite bounding box. The caller applies `scale`, `x`, `y` to the
 * world container.
 */
export function computeGroupZoomTransform(
	memberIds: ReadonlySet<string>,
	pixiNodes: ReadonlyMap<string, GroupMemberLike>,
	canvasW: number,
	canvasH: number,
): GroupZoomTransform | null {
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
	const pad = GROUP_ZOOM_PADDING;
	const scaleX = canvasW / (maxX - minX + pad * 2);
	const scaleY = canvasH / (maxY - minY + pad * 2);
	const scale = Math.min(scaleX, scaleY, GROUP_ZOOM_MAX_SCALE);
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return {
		scale,
		x: canvasW / 2 - cx * scale,
		y: canvasH / 2 - cy * scale,
	};
}
