import type { GraphNode } from "../types";

/**
 * Subset of `_fadeInTween` consumed by the seed loop: stagger membership and
 * the spiral origin. Defining a narrow shape keeps callers free to pass any
 * object satisfying these fields without having to import the full tween type.
 */
export interface FadeInSeed {
	stagger: Map<string, number>;
	originX: number;
	originY: number;
}

export interface PositionSeedContext {
	/** Active fade-in animation, or null when no nodes are fading in. */
	fade: FadeInSeed | null;
	/** Whether `savedPositions` is trustworthy (e.g. matches current viewport). */
	savedPositionsValid: boolean;
	/** Per-node positions captured from the previous render. */
	savedPositions: Map<string, { x: number; y: number }>;
	/** User-pinned positions; override saved/random and also set fx/fy. */
	pinnedPositions: Record<string, { x: number; y: number }>;
	/** Viewport center used as the random-reseed origin. */
	cx: number;
	cy: number;
	/** Viewport dimensions used to bound random reseed and outlier detection. */
	W: number;
	H: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FADE_RING_BASE = 22;
const FADE_RING_STEP = 2.4;
const OUTLIER_COORD_MULTIPLIER = 5;
const RANDOM_REPLACE_SPAN = 0.8;

/**
 * Place a fade-in node on a Fermat (golden-angle) spiral around the fade origin.
 * Seeding members on a tight spiral instead of the super-node's exact coordinate
 * gives the opening frame a pleasing radial composition; the collision force
 * then only has to refine, not violently scatter.
 */
function seedFadeInPosition(n: GraphNode, fadeIdx: number, fade: FadeInSeed): void {
	const r = FADE_RING_BASE + Math.sqrt(fadeIdx) * FADE_RING_STEP * 3;
	const theta = fadeIdx * GOLDEN_ANGLE;
	const cosT = Math.cos(theta);
	const sinT = Math.sin(theta);
	n.x = fade.originX + cosT * r;
	n.y = fade.originY + sinT * r;
	n.vx = cosT * 0.8;
	n.vy = sinT * 0.8;
}

/**
 * True when the node's current (x, y) is unusable as a starting position:
 * non-finite, the (0, 0) origin, or wildly outside the viewport.
 *
 * Why: sunburst/concentric layouts use polar coordinates that, if reused as
 * force-layout starting positions, can cause the simulation to diverge.
 */
function needsRandomReseed(n: GraphNode, maxReasonableCoord: number): boolean {
	if (!isFinite(n.x) || !isFinite(n.y)) return true;
	if (n.x === 0 && n.y === 0) return true;
	if (Math.abs(n.x) > maxReasonableCoord) return true;
	if (Math.abs(n.y) > maxReasonableCoord) return true;
	return false;
}

/**
 * Seed all node starting positions for a force-layout run, mutating `nodes`
 * in place. Resolution order per node:
 *   1. fade-in spiral (if the node is part of an active fade-in)
 *   2. saved position from previous render (if `savedPositionsValid`)
 *   3. random reseed (if current position is non-finite/origin/outlier)
 *   4. pinned position (always wins; also sets fx/fy)
 */
export function seedForceLayoutPositions(nodes: readonly GraphNode[], ctx: PositionSeedContext): void {
	const { fade, savedPositionsValid, savedPositions, pinnedPositions, cx, cy, W, H } = ctx;
	const maxReasonableCoord = Math.max(W, H) * OUTLIER_COORD_MULTIPLIER;
	let fadeIdx = 0;

	for (const n of nodes) {
		if (fade && fade.stagger.has(n.id)) {
			seedFadeInPosition(n, fadeIdx, fade);
			fadeIdx++;
			continue;
		}

		const saved = savedPositionsValid ? savedPositions.get(n.id) : undefined;
		if (saved) {
			n.x = saved.x;
			n.y = saved.y;
		} else if (needsRandomReseed(n, maxReasonableCoord)) {
			n.x = cx + (Math.random() - 0.5) * W * RANDOM_REPLACE_SPAN;
			n.y = cy + (Math.random() - 0.5) * H * RANDOM_REPLACE_SPAN;
		}

		const pinned = pinnedPositions[n.id];
		if (pinned) {
			n.x = pinned.x;
			n.y = pinned.y;
			n.fx = pinned.x;
			n.fy = pinned.y;
		}
	}
}
