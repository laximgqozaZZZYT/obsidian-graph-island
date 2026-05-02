/**
 * Pure helpers for seeding initial node positions before a force-layout run.
 *
 * Extracted from GraphViewContainer._setupForceLayout to reduce GVC size and
 * to make the seeding logic deterministically testable (random source is
 * injected via parameter).
 */
import type { GraphNode } from "../types";

/** Golden angle (~137.508°) used for Fermat-spiral fade-in placement. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** World-unit radius for the innermost fade-in member. */
const FADE_RING_BASE = 22;
/** Radial growth per fade-in member index. */
const FADE_RING_STEP = 2.4;

export interface FadeInSeed {
	/** member id → stagger delay (only `.has(id)` is consulted here) */
	stagger: { has(id: string): boolean };
	originX: number;
	originY: number;
}

export interface SeedPositionsConfig {
	cx: number;
	cy: number;
	W: number;
	H: number;
	/** Coordinates farther than this (abs) are treated as "garbage" and reseeded. */
	maxReasonableCoord: number;
	/** When false, savedPositions is ignored. */
	savedPositionsValid: boolean;
	/** Defaults to Math.random — override for deterministic tests. */
	random?: () => number;
}

/**
 * Mutate node positions/velocities in place to prepare them for a fresh
 * force-layout pass. Order of precedence per node:
 *   1. Pinned (also sets fx/fy) — always wins
 *   2. Fade-in stagger member → Fermat-spiral seed around fade origin
 *   3. Saved position from prior layout (if savedPositionsValid)
 *   4. Otherwise: keep n.x/n.y when finite & non-zero & in-range; else random
 *      jitter inside canvas
 *
 * Returns the count of nodes that received fade-in spiral seeding (handy for
 * tests but unused by the caller).
 */
export function seedForceLayoutPositions(
	nodes: GraphNode[],
	savedPositions: ReadonlyMap<string, { x: number; y: number }>,
	pinnedPositions: Readonly<Record<string, { x: number; y: number }>>,
	fade: FadeInSeed | null,
	cfg: SeedPositionsConfig,
): number {
	const rand = cfg.random ?? Math.random;
	let fadeIdx = 0;
	for (const n of nodes) {
		if (fade && fade.stagger.has(n.id)) {
			seedFadeInSpiral(n, fade, fadeIdx);
			fadeIdx++;
			continue;
		}
		applySavedOrJitter(n, savedPositions, cfg, rand);
		applyPinned(n, pinnedPositions);
	}
	return fadeIdx;
}

function seedFadeInSpiral(n: GraphNode, fade: FadeInSeed, idx: number): void {
	const r = FADE_RING_BASE + Math.sqrt(idx) * FADE_RING_STEP * 3;
	const theta = idx * GOLDEN_ANGLE;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	n.x = fade.originX + cos * r;
	n.y = fade.originY + sin * r;
	n.vx = cos * 0.8;
	n.vy = sin * 0.8;
}

function applySavedOrJitter(
	n: GraphNode,
	savedPositions: ReadonlyMap<string, { x: number; y: number }>,
	cfg: SeedPositionsConfig,
	rand: () => number,
): void {
	const saved = cfg.savedPositionsValid ? savedPositions.get(n.id) : undefined;
	if (saved) {
		n.x = saved.x;
		n.y = saved.y;
		return;
	}
	if (isPositionGarbage(n, cfg.maxReasonableCoord)) {
		n.x = cfg.cx + (rand() - 0.5) * cfg.W * 0.8;
		n.y = cfg.cy + (rand() - 0.5) * cfg.H * 0.8;
	}
}

function isPositionGarbage(n: GraphNode, maxReasonableCoord: number): boolean {
	return (
		!isFinite(n.x) ||
		!isFinite(n.y) ||
		(n.x === 0 && n.y === 0) ||
		Math.abs(n.x) > maxReasonableCoord ||
		Math.abs(n.y) > maxReasonableCoord
	);
}

function applyPinned(n: GraphNode, pinnedPositions: Readonly<Record<string, { x: number; y: number }>>): void {
	const pinned = pinnedPositions[n.id];
	if (!pinned) return;
	n.x = pinned.x;
	n.y = pinned.y;
	n.fx = pinned.x;
	n.fy = pinned.y;
}
