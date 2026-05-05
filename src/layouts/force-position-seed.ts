/**
 * Pure helper: seed initial node positions for the force-directed layout.
 *
 * Extracted from GraphViewContainer._setupForceLayout to keep that method
 * under the ESLint complexity budget (max 25). Three independent rules are
 * applied per node, in this order:
 *
 *   1. Fade-in spiral — nodes participating in a fade-in tween are placed
 *      on a Fermat (golden-angle) spiral around the tween origin so the
 *      opening frame already has a pleasing radial composition before the
 *      collision force scatters them.
 *   2. Saved-or-random — otherwise reuse the previous render's saved
 *      position when valid, else seed a random offset around (cx, cy)
 *      when the existing coordinate is non-finite, at the origin, or
 *      far outside the canvas bounds.
 *   3. Pinned restore — if the user has pinned the node, force its
 *      x/y AND fx/fy to the pinned coordinate so d3-force keeps it fixed.
 */
import type { GraphNode } from "../types";

export interface FadeInSeed {
	/** member id → stagger delay in ms from startMs (only keys are used here) */
	stagger: Map<string, number>;
	originX: number;
	originY: number;
}

export interface ForcePositionSeedOptions {
	nodes: GraphNode[];
	fade: FadeInSeed | null;
	savedPositions: Map<string, { x: number; y: number }>;
	savedPositionsValid: boolean;
	pinnedPositions: Record<string, { x: number; y: number }>;
	cx: number;
	cy: number;
	W: number;
	H: number;
	/** Optional RNG override (for tests). Defaults to Math.random. */
	random?: () => number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.508°
const FADE_RING_BASE = 22; // world-unit radius for the innermost member
const FADE_RING_STEP = 2.4; // radial growth per member
const FADE_VELOCITY = 0.8; // tiny outward nudge magnitude
const RANDOM_SPREAD_FACTOR = 0.8; // random offset as fraction of W/H

/** True when the node's existing coordinate is unusable and needs a fresh random seed. */
function needsRandomSeed(n: GraphNode, maxReasonableCoord: number): boolean {
	return (
		!isFinite(n.x) ||
		!isFinite(n.y) ||
		(n.x === 0 && n.y === 0) ||
		Math.abs(n.x) > maxReasonableCoord ||
		Math.abs(n.y) > maxReasonableCoord
	);
}

/** Place a single fade-in member on the golden-angle spiral. */
function placeOnFadeSpiral(n: GraphNode, fade: FadeInSeed, fadeIdx: number): void {
	const r = FADE_RING_BASE + Math.sqrt(fadeIdx) * FADE_RING_STEP * 3;
	const theta = fadeIdx * GOLDEN_ANGLE;
	n.x = fade.originX + Math.cos(theta) * r;
	n.y = fade.originY + Math.sin(theta) * r;
	n.vx = Math.cos(theta) * FADE_VELOCITY;
	n.vy = Math.sin(theta) * FADE_VELOCITY;
}

/**
 * Seed (mutate) every node's x/y/vx/vy/fx/fy in-place. Returns nothing.
 * The order — fade > saved > random > pinned — matters: pinned overrides
 * everything because the user explicitly placed the node.
 */
export function seedForceLayoutPositions(opts: ForcePositionSeedOptions): void {
	const { nodes, fade, savedPositions, savedPositionsValid, pinnedPositions, cx, cy, W, H } = opts;
	const random = opts.random ?? Math.random;
	const maxReasonableCoord = Math.max(W, H) * 5;
	let fadeIdx = 0;
	for (const n of nodes) {
		if (fade && fade.stagger.has(n.id)) {
			placeOnFadeSpiral(n, fade, fadeIdx);
			fadeIdx++;
			continue;
		}
		const saved = savedPositionsValid ? savedPositions.get(n.id) : undefined;
		if (saved) {
			n.x = saved.x;
			n.y = saved.y;
		} else if (needsRandomSeed(n, maxReasonableCoord)) {
			n.x = cx + (random() - 0.5) * W * RANDOM_SPREAD_FACTOR;
			n.y = cy + (random() - 0.5) * H * RANDOM_SPREAD_FACTOR;
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
