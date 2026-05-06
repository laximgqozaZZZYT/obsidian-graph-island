/**
 * Pure helper for seeding initial node positions before the force simulation
 * starts. Extracted from GraphViewContainer._setupForceLayout to keep that
 * method's cyclomatic complexity below the ESLint threshold and to make the
 * seeding policy testable in isolation.
 *
 * Seeding order per node:
 *   1. Fade-in members → Fermat (golden-angle) spiral around fade origin so
 *      the opening frame already has a pleasing radial composition.
 *   2. Otherwise, reuse a saved position when one is available and within
 *      the canvas range.
 *   3. Otherwise, jitter around the canvas center if the current position is
 *      missing, zero, or out of range.
 *   4. Pinned positions always win — they overwrite x/y and set fx/fy so the
 *      simulation treats the node as fixed.
 */
import type { GraphNode } from "../types";

/** Subset of FadeInTween fields the seeder needs. */
export interface FadeInTweenSeed {
	stagger: Map<string, number>;
	originX: number;
	originY: number;
}

export interface SeedForcePositionsOpts {
	cx: number;
	cy: number;
	W: number;
	H: number;
	fade: FadeInTweenSeed | null | undefined;
	savedPositions: Map<string, { x: number; y: number }>;
	savedPositionsValid: boolean;
	pinnedPositions: Record<string, { x: number; y: number }>;
	/** Injectable for deterministic tests. Defaults to Math.random. */
	random?: () => number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.508°
const FADE_RING_BASE = 22; // world-unit radius for the innermost fade member
const FADE_RING_STEP = 2.4; // radial growth per fade member
const FADE_VELOCITY = 0.8; // tiny outward nudge so the spiral opens up
const JITTER_SPAN = 0.8; // ±40% of W/H around the center

/**
 * Seed initial positions for a force-layout pass. Mutates each node's
 * position/velocity (and fx/fy for pinned nodes) and returns the alpha the
 * caller should use to restart the simulation: 0.5 when reusing valid saved
 * positions (faster convergence), 1 otherwise.
 */
export function seedForceLayoutPositions(nodes: GraphNode[], opts: SeedForcePositionsOpts): number {
	const { cx, cy, W, H, fade, savedPositions, savedPositionsValid, pinnedPositions } = opts;
	const random = opts.random ?? Math.random;
	const restartAlpha = savedPositionsValid && savedPositions.size > 0 ? 0.5 : 1;
	const maxReasonableCoord = Math.max(W, H) * 5;

	let fadeIdx = 0;
	for (const n of nodes) {
		if (fade && fade.stagger.has(n.id)) {
			seedFadeInMember(n, fade, fadeIdx);
			fadeIdx++;
			continue;
		}
		seedRegularNode(n, opts, savedPositionsValid, savedPositions, maxReasonableCoord, random);
		const pinned = pinnedPositions[n.id];
		if (pinned) {
			n.x = pinned.x;
			n.y = pinned.y;
			n.fx = pinned.x;
			n.fy = pinned.y;
		}
	}
	return restartAlpha;

	function seedRegularNode(
		node: GraphNode,
		o: SeedForcePositionsOpts,
		positionsValid: boolean,
		positions: Map<string, { x: number; y: number }>,
		maxCoord: number,
		rand: () => number,
	): void {
		const saved = positionsValid ? positions.get(node.id) : undefined;
		if (saved) {
			node.x = saved.x;
			node.y = saved.y;
			return;
		}
		if (
			!isFinite(node.x) ||
			!isFinite(node.y) ||
			(node.x === 0 && node.y === 0) ||
			Math.abs(node.x) > maxCoord ||
			Math.abs(node.y) > maxCoord
		) {
			node.x = o.cx + (rand() - 0.5) * o.W * JITTER_SPAN;
			node.y = o.cy + (rand() - 0.5) * o.H * JITTER_SPAN;
		}
	}
}

/** Place a fade-in member on the Fermat spiral around the fade origin. */
function seedFadeInMember(node: GraphNode, fade: FadeInTweenSeed, fadeIdx: number): void {
	const r = FADE_RING_BASE + Math.sqrt(fadeIdx) * FADE_RING_STEP * 3;
	const theta = fadeIdx * GOLDEN_ANGLE;
	node.x = fade.originX + Math.cos(theta) * r;
	node.y = fade.originY + Math.sin(theta) * r;
	node.vx = Math.cos(theta) * FADE_VELOCITY;
	node.vy = Math.sin(theta) * FADE_VELOCITY;
}
