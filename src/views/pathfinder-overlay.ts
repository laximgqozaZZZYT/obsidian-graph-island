/**
 * Pathfinder overlay — pure-function renderer for shortest-path visualisation.
 * Extracted from GraphViewContainer to reduce god-object size.
 */

// ---- Constants ----
export const PATHFINDER_COLOR = 0x00ced1;
export const PATHFINDER_COLOR_CSS = "#00CED1";
export const PATHFINDER_PULSE_SPEED = 0.06;
export const PATHFINDER_PULSE_AMPLITUDE = 0.1;
export const PATHFINDER_GLOW_ALPHA_BASE = 0.45;
export const PATHFINDER_SOLID_ALPHA_BASE = 0.85;
export const PATHFINDER_GLOW_STROKE_WIDTH = 8;
export const PATHFINDER_SOLID_STROKE_WIDTH = 3;
export const PATHFINDER_DOT_RADIUS = 5;
export const PATHFINDER_LABEL_FONT_SIZE = 11;
export const PATHFINDER_LABEL_OFFSET_X = 6;
export const PATHFINDER_LABEL_OFFSET_Y = -14;

/** A single line segment between two nodes. */
export interface PathSegment {
	ax: number;
	ay: number;
	bx: number;
	by: number;
}

/** Describes what the pathfinder overlay should draw in a given frame. */
export interface PathfinderDrawData {
	segments: PathSegment[];
	glowAlpha: number;
	solidAlpha: number;
	dots: { x: number; y: number }[];
	label: {
		text: string;
		x: number;
		y: number;
	};
}

/**
 * Compute the pulse alpha values for glow and solid strokes.
 * @param frame The current animation frame counter.
 */
export function computePathfinderPulse(frame: number): { glowAlpha: number; solidAlpha: number } {
	const pulse = Math.sin(frame * PATHFINDER_PULSE_SPEED) * PATHFINDER_PULSE_AMPLITUDE;
	return {
		glowAlpha: PATHFINDER_GLOW_ALPHA_BASE + pulse,
		solidAlpha: PATHFINDER_SOLID_ALPHA_BASE + pulse,
	};
}

/**
 * Build segments from consecutive path node positions.
 * @param pathIds Ordered node IDs along the shortest path.
 * @param positionOf Lookup function returning {x,y} for a node ID, or undefined.
 */
export function buildPathSegments(
	pathIds: string[],
	positionOf: (id: string) => { x: number; y: number } | undefined,
): PathSegment[] {
	const segments: PathSegment[] = [];
	for (let i = 0; i < pathIds.length - 1; i++) {
		const a = positionOf(pathIds[i]);
		const b = positionOf(pathIds[i + 1]);
		if (a && b) {
			segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
		}
	}
	return segments;
}

/**
 * Compute the complete draw-data for a pathfinder overlay frame.
 * Returns null when there is nothing to draw (fewer than 2 nodes, no segments).
 *
 * @param pathIds Ordered node IDs along the shortest path.
 * @param frame   Current animation frame counter.
 * @param positionOf Lookup for node positions.
 */
export function computePathfinderDrawData(
	pathIds: string[],
	frame: number,
	positionOf: (id: string) => { x: number; y: number } | undefined,
): PathfinderDrawData | null {
	if (pathIds.length < 2) return null;

	const segments = buildPathSegments(pathIds, positionOf);
	if (segments.length === 0) return null;

	const { glowAlpha, solidAlpha } = computePathfinderPulse(frame);

	// Dot positions for each node in the path
	const dots: { x: number; y: number }[] = [];
	for (const id of pathIds) {
		const pos = positionOf(id);
		if (pos) dots.push({ x: pos.x, y: pos.y });
	}

	// Label at midpoint segment
	const midIdx = Math.floor(segments.length / 2);
	const mid = segments[midIdx];
	const hops = pathIds.length - 1;
	const label = {
		text: `${hops} hop${hops !== 1 ? "s" : ""}`,
		x: (mid.ax + mid.bx) / 2 + PATHFINDER_LABEL_OFFSET_X,
		y: (mid.ay + mid.by) / 2 + PATHFINDER_LABEL_OFFSET_Y,
	};

	return { segments, glowAlpha, solidAlpha, dots, label };
}
