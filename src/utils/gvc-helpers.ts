/**
 * Pure utility functions extracted from GraphViewContainer.ts.
 * These functions are stateless and have no dependency on the GVC class.
 */
import type { ClusterGroupRule, GroupPreset } from "../types";
import { parseQueryExpr, serializeExpr } from "./query-expr";
import { hexToRgb } from "./color";

// ---- Rendering constants ----
const BLEND_LABEL_FACTOR = 0.15;

/**
 * Derive a single ClusterGroupRule from a query string + recursive flag.
 * Supports wildcard patterns like "tag:*" → groupBy: "tag".
 */
export function deriveOneRule(queryText: string, recursive: boolean): ClusterGroupRule | null {
	if (!queryText.trim()) return null;
	const expr = parseQueryExpr(queryText.trim());
	if (!expr) return null;
	if (expr.type === "leaf" && expr.value === "*") {
		return { groupBy: `${expr.field}:?`, recursive };
	}
	return { groupBy: `${expr.type === "leaf" ? expr.field : "tag"}:?`, recursive };
}

/** Derive ClusterGroupRule[] from multiple common queries (pipeline). */
export function deriveClusterRulesFromQueries(queries: { query: string; recursive: boolean }[]): ClusterGroupRule[] {
	const rules: ClusterGroupRule[] = [];
	for (const q of queries) {
		const rule = deriveOneRule(q.query, q.recursive);
		if (rule) rules.push(rule);
	}
	return rules;
}

export function deriveClusterRules(preset: GroupPreset): ClusterGroupRule[] {
	if (preset.commonQueries?.length) {
		return deriveClusterRulesFromQueries(preset.commonQueries);
	}
	const cq = preset.commonQuery;
	if (!cq?.expression) return [];
	const queryText = serializeExpr(cq.expression);
	const rule = deriveOneRule(queryText, preset.recursive ?? false);
	return rule ? [rule] : [];
}

/** Blend bg toward nodeColor at 15% — used for label tinting. */
export function blendThemeLabel(bg: number, nodeColor: number): number {
	const r1 = (bg >> 16) & 0xff,
		g1 = (bg >> 8) & 0xff,
		b1 = bg & 0xff;
	const r2 = (nodeColor >> 16) & 0xff,
		g2 = (nodeColor >> 8) & 0xff,
		b2 = nodeColor & 0xff;
	return (
		(Math.round(r1 + (r2 - r1) * BLEND_LABEL_FACTOR) << 16) |
		(Math.round(g1 + (g2 - g1) * BLEND_LABEL_FACTOR) << 8) |
		Math.round(b1 + (b2 - b1) * BLEND_LABEL_FACTOR)
	);
}

/** Clean sunburst arc name: strip redundant path prefix (e.g. "bible-apocrypha/bible-apocrypha" → "bible-apocrypha") */
export function cleanArcName(name: string): string {
	if (!name.includes("/")) return name;
	const segments = name.split("/");
	if (segments.length >= 2 && segments[segments.length - 1] === segments[segments.length - 2]) {
		return segments[segments.length - 1];
	}
	return segments[segments.length - 1] || name;
}

/** Check if saved positions are within a reasonable coordinate range for force layout reuse. */
export function areSavedPositionsValid(
	positions: Map<string, { x: number; y: number }>,
	canvasW: number,
	canvasH: number,
): boolean {
	if (positions.size === 0) return false;
	const maxCoord = Math.max(canvasW, canvasH) * 5;
	for (const p of positions.values()) {
		if (!isFinite(p.x) || !isFinite(p.y) || Math.abs(p.x) > maxCoord || Math.abs(p.y) > maxCoord) {
			return false;
		}
	}
	return true;
}

/** Lighten a hex color by a factor (0–1). factor=0.2 means 20% lighter. */
export function lightenHex(hex: number, factor: number): number {
	const { r, g, b } = hexToRgb(hex);
	const delta = Math.round(255 * factor);
	const lr = Math.max(0, Math.min(255, r + delta));
	const lg = Math.max(0, Math.min(255, g + delta));
	const lb = Math.max(0, Math.min(255, b + delta));
	return (lr << 16) | (lg << 8) | lb;
}

/**
 * Heatmap color ramp: cold (blue 0x3b82f6) → warm (red 0xef4444).
 * @param degree - node degree
 * @param maxDegree - maximum degree in the graph (for normalization)
 */
export function heatmapColor(degree: number, maxDegree: number): number {
	const t = Math.min(1, degree / Math.max(1, maxDegree));
	const r = Math.round(59 + t * (239 - 59));
	const g = Math.round(130 - t * (130 - 68));
	const b = Math.round(246 - t * (246 - 68));
	return (r << 16) | (g << 8) | b;
}

/** 20-color deterministic palette for community coloring (Tableau 20-inspired). */
export const COMMUNITY_PALETTE: readonly number[] = [
	0x1f77b4, 0xff7f0e, 0x2ca02c, 0xd62728, 0x9467bd, 0x8c564b, 0xe377c2, 0x7f7f7f, 0xbcbd22, 0x17becf, 0xaec7e8,
	0xffbb78, 0x98df8a, 0xff9896, 0xc5b0d5, 0xc49c94, 0xf7b6d2, 0xc7c7c7, 0xdbdb8d, 0x9edae5,
];

/**
 * Find the first GroupPreset whose condition matches the current layout + tagDisplay.
 * Returns the matching preset or null.
 */
export function findMatchingGroupPreset(
	presets: GroupPreset[],
	currentLayout: string,
	tagDisplay: string,
): GroupPreset | null {
	for (const preset of presets) {
		const cond = preset.condition;
		if (cond.layout && cond.layout !== currentLayout) continue;
		if (cond.tagDisplay && cond.tagDisplay !== tagDisplay) continue;
		return preset;
	}
	return null;
}

/**
 * Resolve node color from a colorMap + node data.
 * Pure lookup: category → tag fallback → default.
 */
export function resolveNodeColor(
	node: { category?: string; tags?: string[] },
	colorMap: Map<string, string>,
	defaultColor: string,
): string {
	if (node.category) {
		const css = colorMap.get(node.category);
		if (css) return css;
	}
	if (node.tags && node.tags.length > 0) {
		const tagKey = `tag:${node.tags[0]}`;
		const css = colorMap.get(tagKey);
		if (css) return css;
	}
	return defaultColor;
}

export function giDiag<T extends { nodes: { length: number }; edges: { length: number } }>(stage: string, data: T): T {
	const w = typeof window !== "undefined" ? (window as { __GI_DIAG__?: boolean }) : null;
	const env = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
	if (env || w?.__GI_DIAG__ === true) {
		// eslint-disable-next-line no-console -- gated diagnostic; esbuild drops console.* in prod
		console.log(`[graph-island][diag] ${stage} nodes=${data.nodes.length} edges=${data.edges.length}`);
	}
	return data;
}

// ---------------------------------------------------------------------------
// seedNodePositions — initial position seeding for force-layout restart.
// Extracted from GraphViewContainer._setupForceLayout to reduce its complexity.
// ---------------------------------------------------------------------------

/** Subset of `_fadeInTween` needed to place fade-in members on a Fermat spiral. */
export interface FadeInOrigin {
	stagger: Map<string, number>;
	originX: number;
	originY: number;
}

/** Minimal node shape mutated by {@link seedNodePositions}. */
export interface SeedablePosNode {
	id: string;
	x: number;
	y: number;
	vx?: number;
	vy?: number;
	// Accept `null` to match GraphNode.fx/fy (d3-force convention: null = unpinned).
	fx?: number | null;
	fy?: number | null;
}

/** Inputs for {@link seedNodePositions}. */
export interface SeedNodePositionsOptions {
	fade: FadeInOrigin | null;
	savedPositions: Map<string, { x: number; y: number }>;
	savedPositionsValid: boolean;
	pinnedPositions: Record<string, { x: number; y: number }>;
	cx: number;
	cy: number;
	W: number;
	H: number;
	maxReasonableCoord: number;
	/** Optional RNG seam for deterministic tests. Defaults to Math.random. */
	rng?: () => number;
}

const FADE_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.508°
const FADE_RING_BASE = 22; // world-unit radius for the innermost member
const FADE_RING_STEP = 2.4; // radial growth per member
const FADE_NUDGE = 0.8; // tiny outward velocity nudge

/**
 * Seed initial positions for a force-layout restart.
 *
 * Behaviour mirrors the original loop in `_setupForceLayout`:
 *  1. Fade-in members (present in `fade.stagger`) are placed on a Fermat spiral
 *     around `fade.origin*` with a small outward velocity.
 *  2. Otherwise, valid saved positions are reused.
 *  3. Otherwise (or if current coords are non-finite / origin / out of range),
 *     positions are randomised inside the canvas.
 *  4. Pinned positions override 1–3 and additionally set fx/fy.
 */
export function seedNodePositions(nodes: SeedablePosNode[], opts: SeedNodePositionsOptions): void {
	const rng = opts.rng ?? Math.random;
	let fadeIdx = 0;
	for (const n of nodes) {
		if (placeFadeMember(n, opts.fade, fadeIdx)) {
			fadeIdx++;
			continue;
		}
		seedNonFadeNode(n, opts, rng);
		applyPinned(n, opts.pinnedPositions[n.id]);
	}
}

function placeFadeMember(n: SeedablePosNode, fade: FadeInOrigin | null, fadeIdx: number): boolean {
	if (!fade || !fade.stagger.has(n.id)) return false;
	const r = FADE_RING_BASE + Math.sqrt(fadeIdx) * FADE_RING_STEP * 3;
	const theta = fadeIdx * FADE_GOLDEN_ANGLE;
	const cosT = Math.cos(theta);
	const sinT = Math.sin(theta);
	n.x = fade.originX + cosT * r;
	n.y = fade.originY + sinT * r;
	n.vx = cosT * FADE_NUDGE;
	n.vy = sinT * FADE_NUDGE;
	return true;
}

function seedNonFadeNode(n: SeedablePosNode, opts: SeedNodePositionsOptions, rng: () => number): void {
	const saved = opts.savedPositionsValid ? opts.savedPositions.get(n.id) : undefined;
	if (saved) {
		n.x = saved.x;
		n.y = saved.y;
		return;
	}
	if (needsRandomSeed(n, opts.maxReasonableCoord)) {
		n.x = opts.cx + (rng() - 0.5) * opts.W * 0.8;
		n.y = opts.cy + (rng() - 0.5) * opts.H * 0.8;
	}
}

function needsRandomSeed(n: SeedablePosNode, maxReasonableCoord: number): boolean {
	if (!isFinite(n.x) || !isFinite(n.y)) return true;
	if (n.x === 0 && n.y === 0) return true;
	return Math.abs(n.x) > maxReasonableCoord || Math.abs(n.y) > maxReasonableCoord;
}

function applyPinned(n: SeedablePosNode, pinned: { x: number; y: number } | undefined): void {
	if (!pinned) return;
	n.x = pinned.x;
	n.y = pinned.y;
	n.fx = pinned.x;
	n.fy = pinned.y;
}
