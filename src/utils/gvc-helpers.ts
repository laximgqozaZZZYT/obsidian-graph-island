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

// ---- Force-layout node initialization ----
//
// Extracted from GraphViewContainer._setupForceLayout to keep that method
// under the ESLint complexity budget. Pure: mutates the supplied node array
// only; no other side-effects.

/** Golden-angle spiral constants for fade-in member placement. */
export const FADE_GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ~137.508°
export const FADE_RING_BASE = 22; // world-unit radius for the innermost member
export const FADE_RING_STEP = 2.4; // radial growth per member
const FADE_VELOCITY_NUDGE = 0.8; // tiny outward nudge per fade-in node

/** Minimal shape consumed by initializeForceLayoutNodePositions for fade-in members. */
export interface FadeInOriginInput {
	stagger: { has(id: string): boolean };
	originX: number;
	originY: number;
}

/** Mutable node fields touched during force-layout initialization. */
interface ForceInitNode {
	id: string;
	x: number;
	y: number;
	vx: number;
	vy: number;
	fx?: number | null;
	fy?: number | null;
}

export interface ForceLayoutInitOptions {
	fade: FadeInOriginInput | null | undefined;
	savedPositions: Map<string, { x: number; y: number }>;
	savedPositionsValid: boolean;
	pinnedPositions: Record<string, { x: number; y: number }>;
	cx: number;
	cy: number;
	W: number;
	H: number;
	/** Defaults to Math.random; overridable for deterministic tests. */
	random?: () => number;
}

/** True when the node has finite, in-range coordinates that aren't (0,0). */
function hasUsableCoords(n: { x: number; y: number }, maxReasonableCoord: number): boolean {
	if (!isFinite(n.x) || !isFinite(n.y)) return false;
	if (n.x === 0 && n.y === 0) return false;
	if (Math.abs(n.x) > maxReasonableCoord) return false;
	if (Math.abs(n.y) > maxReasonableCoord) return false;
	return true;
}

/** Apply golden-angle spiral placement around fade origin; returns next fadeIdx. */
function placeFadeInNode(n: ForceInitNode, fade: FadeInOriginInput, fadeIdx: number): void {
	const r = FADE_RING_BASE + Math.sqrt(fadeIdx) * FADE_RING_STEP * 3;
	const theta = fadeIdx * FADE_GOLDEN_ANGLE;
	n.x = fade.originX + Math.cos(theta) * r;
	n.y = fade.originY + Math.sin(theta) * r;
	n.vx = Math.cos(theta) * FADE_VELOCITY_NUDGE;
	n.vy = Math.sin(theta) * FADE_VELOCITY_NUDGE;
}

/**
 * Initialize positions for the force layout pass.
 *
 * Per-node precedence (matches the previous inline behavior):
 * 1. fade-in member → spiral placement around fade origin (skip pinned step)
 * 2. saved position (if savedPositionsValid)
 * 3. otherwise, randomize when current x/y is unusable (NaN, (0,0), or out-of-range)
 * 4. pinned position overrides x/y AND sets fx/fy (anchors the node)
 */
export function initializeForceLayoutNodePositions(nodes: ForceInitNode[], opts: ForceLayoutInitOptions): void {
	const { fade, savedPositions, savedPositionsValid, pinnedPositions, cx, cy, W, H } = opts;
	const random = opts.random ?? Math.random;
	const maxReasonableCoord = Math.max(W, H) * 5;
	let fadeIdx = 0;
	for (const n of nodes) {
		if (fade && fade.stagger.has(n.id)) {
			placeFadeInNode(n, fade, fadeIdx);
			fadeIdx++;
			continue;
		}
		const saved = savedPositionsValid ? savedPositions.get(n.id) : undefined;
		if (saved) {
			n.x = saved.x;
			n.y = saved.y;
		} else if (!hasUsableCoords(n, maxReasonableCoord)) {
			n.x = cx + (random() - 0.5) * W * 0.8;
			n.y = cy + (random() - 0.5) * H * 0.8;
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

export function giDiag<T extends { nodes: { length: number }; edges: { length: number } }>(stage: string, data: T): T {
	const w = typeof window !== "undefined" ? (window as { __GI_DIAG__?: boolean }) : null;
	const env = typeof process !== "undefined" && process.env?.NODE_ENV !== "production";
	if (env || w?.__GI_DIAG__ === true) {
		// eslint-disable-next-line no-console -- gated diagnostic; esbuild drops console.* in prod
		console.log(`[graph-island][diag] ${stage} nodes=${data.nodes.length} edges=${data.edges.length}`);
	}
	return data;
}
