/**
 * Node decoration rendering functions extracted from RenderPipeline.
 *
 * Each function draws an overlay/marker on top of existing nodes:
 * pathfinder markers, compare rings, bookmark stars, missing-neighbor rings,
 * tag badges, importance rings, recency markers, bridge nodes, articulation
 * points, entropy overlays, multi-select rings, hierarchy overlays,
 * ontology backbones, and gap edges.
 */

import type { CanvasGraphics } from "./canvas2d";
import type { PixiNode } from "./InteractionManager";
import type { ShapeRule } from "../utils/node-shapes";
import { getNodeShape, drawShapeAt } from "../utils/node-shapes";
import { hslToHex } from "../utils/graph-helpers";
import { screenToWorld, hashStringToHue, type RenderHost } from "./RenderPipeline";

// ---------------------------------------------------------------------------
// Constants (moved from RenderPipeline.ts)
// ---------------------------------------------------------------------------

/** Hold ring / pathfinder ring stroke alpha */
const INDICATOR_RING_ALPHA = 0.9;
/** Pathfinder line width for start/end nodes */
const PF_ENDPOINT_LINE_WIDTH = 3;
/** Pathfinder line width for intermediate path nodes */
const PF_INTERMEDIATE_LINE_WIDTH = 2;
/** Pathfinder radius padding for start/end nodes */
const PF_ENDPOINT_RADIUS_PAD = 6;
/** Pathfinder radius padding for intermediate path nodes */
const PF_INTERMEDIATE_RADIUS_PAD = 3;

/** 比較選択リングの線幅 */
const COMPARE_RING_LINE_WIDTH = 2.5;
/** 比較選択リングの半径パディング */
const COMPARE_RING_RADIUS_PAD = 8;
/** 比較選択リングの色 (マゼンタ系) */
const COMPARE_RING_COLOR = 0xe879f9;
/** 比較選択リングのアルファ */
const COMPARE_RING_ALPHA = 0.85;
/** 比較選択リングの破線セグメント数 */
const COMPARE_RING_SEGMENTS = 8;
/** 比較選択リングの破線ギャップ比率 */
const COMPARE_RING_GAP = 0.3;

// ---------------------------------------------------------------------------
// Decoration context types
// ---------------------------------------------------------------------------

interface DecorationCtx {
	visible: PixiNode[];
	shapeRules: ShapeRule[];
	worldScale: number;
	minWorldRadius: number;
}

// ---------------------------------------------------------------------------
// Pass 4: Pathfinder start/end node markers
// ---------------------------------------------------------------------------

export function renderPathfinderMarkers(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible" | "shapeRules">,
): void {
	const pfNodes = host.getPathfinderNodeSet?.() ?? null;
	const pfState = host.getPathfinderState?.();
	if (!pfNodes || pfNodes.size === 0) return;

	const rtt = host.getRenderThresholds?.();
	const pfStartColor = rtt?.pathfinderStartColor;
	const pfEndColor = rtt?.pathfinderEndColor;
	const { visible, shapeRules } = ctx;
	for (const pn of visible) {
		if (!pfNodes.has(pn.data.id)) continue;
		const shape = getNodeShape(pn.data, shapeRules);
		const isStart = pfState?.startId === pn.data.id;
		const isEnd = pfState?.endId === pn.data.id;
		const ringColor = isStart ? pfStartColor : isEnd ? pfEndColor : pfStartColor;
		g.lineStyle(
			isStart || isEnd ? PF_ENDPOINT_LINE_WIDTH : PF_INTERMEDIATE_LINE_WIDTH,
			ringColor,
			INDICATOR_RING_ALPHA,
		);
		g.beginFill(0, 0);
		drawShapeAt(
			g,
			shape,
			pn.data.x,
			pn.data.y,
			pn.radius + (isStart || isEnd ? PF_ENDPOINT_RADIUS_PAD : PF_INTERMEDIATE_RADIUS_PAD),
		);
		g.endFill();
	}
}

// ---------------------------------------------------------------------------
// Pass 5: Compare selection rings (dashed style)
// ---------------------------------------------------------------------------

export function renderCompareRings(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible">,
): void {
	const compareIds = host.getCompareNodeIds?.() ?? [];
	if (compareIds.length === 0) return;
	const compareSet = new Set(compareIds);

	const { visible } = ctx;
	for (const pn of visible) {
		if (!compareSet.has(pn.data.id)) continue;
		const ringRadius = pn.radius + COMPARE_RING_RADIUS_PAD;
		g.lineStyle(COMPARE_RING_LINE_WIDTH, COMPARE_RING_COLOR, COMPARE_RING_ALPHA);
		g.beginFill(0, 0);
		for (let i = 0; i < COMPARE_RING_SEGMENTS; i++) {
			const startAngle = (i / COMPARE_RING_SEGMENTS) * Math.PI * 2;
			const endAngle = startAngle + ((1 - COMPARE_RING_GAP) / COMPARE_RING_SEGMENTS) * Math.PI * 2;
			g.arc(pn.data.x, pn.data.y, ringRadius, startAngle, endAngle);
			g.moveTo(pn.data.x + Math.cos(endAngle) * ringRadius, pn.data.y + Math.sin(endAngle) * ringRadius);
		}
		g.endFill();
	}
}

// ---------------------------------------------------------------------------
// Pass 6: Bookmark star overlay
// ---------------------------------------------------------------------------

export function renderBookmarkStars(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible">,
): void {
	const bookmarked = host.getBookmarkedNodeIds?.() ?? null;
	if (!bookmarked || bookmarked.size === 0) return;

	const { visible } = ctx;
	const starColor = host.getRenderThresholds?.()?.bookmarkStarColor ?? 0xf5c542;
	const starAlpha = 0.9;
	for (const pn of visible) {
		if (!bookmarked.has(pn.data.id)) continue;
		const sr = Math.max(4, pn.radius * 0.35);
		const cx = pn.data.x + pn.radius * 0.7;
		const cy = pn.data.y - pn.radius * 0.7;
		g.beginFill(starColor, starAlpha);
		g.lineStyle(0);
		const spikes = 5;
		const outerR = sr;
		const innerR = sr * 0.4;
		for (let i = 0; i < spikes * 2; i++) {
			const angle = (i * Math.PI) / spikes - Math.PI / 2;
			const r = i % 2 === 0 ? outerR : innerR;
			const px = cx + Math.cos(angle) * r;
			const py = cy + Math.sin(angle) * r;
			if (i === 0) g.moveTo(px, py);
			else g.lineTo(px, py);
		}
		g.closePath();
		g.endFill();
	}
}

// ---------------------------------------------------------------------------
// Pass 7: Missing neighbor orange dashed rings
// ---------------------------------------------------------------------------

export function renderMissingNeighborRings(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible">,
): void {
	const missingSet = host.getMissingNeighborNodeIds?.() ?? null;
	if (!missingSet || missingSet.size === 0) return;

	const { visible } = ctx;
	const ringColor = host.getRenderThresholds?.()?.missingNeighborRingColor ?? 0xff8c00;
	const ringAlpha = 0.85;
	const lineWidth = 2;
	const dashSegments = 10;
	const gapFraction = 0.35;
	const radiusPad = 4;

	for (const pn of visible) {
		if (!missingSet.has(pn.data.id)) continue;
		const r = pn.radius + radiusPad;
		const cx = pn.data.x;
		const cy = pn.data.y;
		g.lineStyle(lineWidth, ringColor, ringAlpha);
		g.beginFill(0, 0);
		const segAngle = (2 * Math.PI) / dashSegments;
		const drawAngle = segAngle * (1 - gapFraction);
		for (let i = 0; i < dashSegments; i++) {
			const startA = i * segAngle;
			const endA = startA + drawAngle;
			g.moveTo(cx + Math.cos(startA) * r, cy + Math.sin(startA) * r);
			const steps = 4;
			for (let s = 1; s <= steps; s++) {
				const a = startA + (endA - startA) * (s / steps);
				g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
			}
		}
		g.endFill();
	}
}

// ---------------------------------------------------------------------------
// Pass 8: Tag badges — colored pills on node circumference
// ---------------------------------------------------------------------------

export function renderTagBadges(
	_host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible" | "worldScale" | "minWorldRadius">,
): void {
	const MAX_BADGES = 4;
	const minScreenPx = 3;
	const ws = ctx.worldScale || 1;
	const BADGE_R = screenToWorld(minScreenPx, ws, 3);
	const PAD = BADGE_R * 0.7;

	for (const pn of ctx.visible) {
		const tags = pn.data.tags;
		if (!tags || tags.length === 0) continue;
		const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
		const cx = pn.data.x;
		const cy = pn.data.y;
		const count = Math.min(tags.length, MAX_BADGES);
		const startAngle = -Math.PI / 2;

		for (let i = 0; i < count; i++) {
			const angle = startAngle + (i / count) * Math.PI * 2;
			const bx = cx + Math.cos(angle) * (nodeR + PAD + BADGE_R);
			const by = cy + Math.sin(angle) * (nodeR + PAD + BADGE_R);
			const hue = hashStringToHue(tags[i]);
			const color = hslToHex(hue, 0.7, 0.5);
			g.lineStyle(0);
			g.beginFill(color, 0.9);
			g.drawCircle(bx, by, BADGE_R);
			g.endFill();
		}
		if (tags.length > MAX_BADGES) {
			const angle = startAngle + (MAX_BADGES / (MAX_BADGES + 1)) * Math.PI * 2;
			const bx = cx + Math.cos(angle) * (nodeR + PAD + BADGE_R);
			const by = cy + Math.sin(angle) * (nodeR + PAD + BADGE_R);
			g.lineStyle(screenToWorld(1, ws, 1), 0x888888, 0.7);
			g.beginFill(0x888888, 0.4);
			g.drawCircle(bx, by, BADGE_R);
			g.endFill();
		}
	}
}

// ---------------------------------------------------------------------------
// Pass 9: Importance ring — metric-proportional ring around nodes
// ---------------------------------------------------------------------------

export function renderImportanceRings(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible" | "worldScale" | "minWorldRadius">,
): void {
	const config = host.getShowImportanceRing?.();
	if (!config) return;

	const degrees = host.getDegrees();
	let metricMap: Map<string, number>;
	if (config.metric === "betweenness") {
		metricMap = host.getBetweennessCache?.() ?? degrees;
	} else {
		metricMap = degrees;
	}
	if (metricMap.size === 0) return;

	let maxVal = 0;
	for (const v of metricMap.values()) {
		if (v > maxVal) maxVal = v;
	}
	if (maxVal === 0) return;

	const ws = ctx.worldScale || 1;
	const minRingPx = 2;
	const RING_PAD = screenToWorld(minRingPx, ws, 3);
	const MAX_RING_WIDTH = screenToWorld(4, ws, 4);

	for (const pn of ctx.visible) {
		const val = metricMap.get(pn.data.id) ?? 0;
		if (val === 0) continue;
		const t = val / maxVal;
		const ringWidth = Math.max(ws > 0 ? 1 / ws : 1, 1 + t * MAX_RING_WIDTH);
		const hue = (1 - t) * 240;
		const color = hslToHex(hue, 0.8, 0.6);
		g.lineStyle(ringWidth, color, 0.6);
		const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
		g.drawCircle(pn.data.x, pn.data.y, nodeR + RING_PAD);
		g.lineStyle(0);
	}
}

// ---------------------------------------------------------------------------
// Pass 10: Recency marker — green dot for recent, fade for old
// ---------------------------------------------------------------------------

export function renderRecencyMarkers(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible">,
): void {
	const config = host.getRecencyConfig?.();
	if (!config) return;

	const now = Date.now();
	const recentThresholdMs = config.days * 24 * 60 * 60 * 1000;
	const oldThresholdMs = 90 * 24 * 60 * 60 * 1000;
	const DOT_R = 3;

	for (const pn of ctx.visible) {
		const mtime = pn.data.mtime;
		if (!mtime) continue;
		const age = now - mtime;

		if (age < recentThresholdMs) {
			const dx = pn.radius * 0.7;
			const dy = -pn.radius * 0.7;
			g.lineStyle(0);
			g.beginFill(host.getRenderThresholds?.()?.recencyMarkerColor ?? 0x22c55e, 0.9);
			g.drawCircle(pn.data.x + dx, pn.data.y + dy, DOT_R);
			g.endFill();
		} else if (age > oldThresholdMs) {
			g.lineStyle(0);
			g.beginFill(0x000000, 0.3);
			g.drawCircle(pn.data.x, pn.data.y, pn.radius);
			g.endFill();
		} else {
			const t = (age - recentThresholdMs) / (oldThresholdMs - recentThresholdMs);
			const alpha = 0.8 * (1 - t);
			if (alpha > 0.1) {
				const dx = pn.radius * 0.7;
				const dy = -pn.radius * 0.7;
				g.lineStyle(0);
				g.beginFill(0xf59e0b, alpha);
				g.drawCircle(pn.data.x + dx, pn.data.y + dy, DOT_R);
				g.endFill();
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Pass 11: Bridge nodes — gold ring for high betweenness centrality
// ---------------------------------------------------------------------------

export function renderBridgeNodes(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible" | "worldScale" | "minWorldRadius">,
): void {
	const bridgeIds = host.getBridgeNodeIds?.();
	if (!bridgeIds || bridgeIds.size === 0) return;

	const GOLD = 0xffd700;
	const ws = ctx.worldScale || 1;
	const RING_WIDTH = screenToWorld(2, ws, 3);
	const PAD = screenToWorld(3, ws, 5);

	for (const pn of ctx.visible) {
		if (!bridgeIds.has(pn.data.id)) continue;
		g.lineStyle(RING_WIDTH, GOLD, 0.8);
		const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
		g.drawCircle(pn.data.x, pn.data.y, nodeR + PAD);
		g.lineStyle(0);
	}
}

// ---------------------------------------------------------------------------
// Pass 12: Articulation points — red warning ring
// ---------------------------------------------------------------------------

export function renderArticulationPoints(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible" | "worldScale" | "minWorldRadius">,
): void {
	const apIds = host.getArticulationPointIds?.();
	if (!apIds || apIds.size === 0) return;

	const WARNING_COLOR = 0xff4444;
	const ws = ctx.worldScale || 1;
	const RING_WIDTH = screenToWorld(1.5, ws, 2);
	const PAD = screenToWorld(3, ws, 6);

	for (const pn of ctx.visible) {
		if (!apIds.has(pn.data.id)) continue;
		const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
		g.lineStyle(RING_WIDTH, WARNING_COLOR, 0.7);
		g.drawCircle(pn.data.x, pn.data.y, nodeR + PAD);
		g.drawCircle(pn.data.x, pn.data.y, nodeR + PAD + screenToWorld(2, ws, 3));
		g.lineStyle(0);
	}
}

// ---------------------------------------------------------------------------
// Pass 13: Entropy overlay — semi-transparent halo sized by knowledge diversity
// ---------------------------------------------------------------------------

export function renderEntropyOverlay(
	host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible" | "worldScale" | "minWorldRadius">,
): void {
	const scores = host.getEntropyScores?.();
	if (!scores || scores.size === 0) return;

	const ws = ctx.worldScale || 1;
	for (const pn of ctx.visible) {
		const entropy = scores.get(pn.data.id);
		if (entropy === undefined || entropy === 0) continue;
		const t = Math.min(1, entropy);
		const nodeR = Math.max(pn.radius, ctx.minWorldRadius);
		const minHaloWorld = ws > 0 ? 4 / ws : nodeR * 2;
		const haloRadius = Math.max(minHaloWorld, nodeR * (1 + t * 2));
		const hue = (1 - t) * 240;
		const color = hslToHex(hue, 0.7, 0.5);
		g.lineStyle(0);
		g.beginFill(color, 0.15 + t * 0.2);
		g.drawCircle(pn.data.x, pn.data.y, haloRadius);
		g.endFill();
	}
}

// ---------------------------------------------------------------------------
// Pass 14: Multi-select rings — solid cyan ring
// ---------------------------------------------------------------------------

export function renderMultiSelectRings(
	_host: RenderHost,
	g: CanvasGraphics,
	ctx: Pick<DecorationCtx, "visible">,
	selectedIds: string[],
): void {
	const selectedSet = new Set(selectedIds);
	const RING_COLOR = 0x06b6d4;
	const RING_WIDTH = 2.5;
	const PAD = 5;

	for (const pn of ctx.visible) {
		if (!selectedSet.has(pn.data.id)) continue;
		g.lineStyle(RING_WIDTH, RING_COLOR, 0.85);
		g.drawCircle(pn.data.x, pn.data.y, pn.radius + PAD);
		g.lineStyle(0);
	}
}

// ---------------------------------------------------------------------------
// Pass 15: S1 Hierarchy tree overlay — purple lines from focused node
// ---------------------------------------------------------------------------

export function renderHierarchyOverlay(
	host: RenderHost,
	g: CanvasGraphics,
): void {
	const tree = host.getHierarchyTree?.();
	if (!tree || tree.size === 0) return;

	const pixiNodes = host.getPixiNodes();
	const EDGE_COLOR = 0x8b5cf6;
	const EDGE_WIDTH = 2.5;

	g.lineStyle(EDGE_WIDTH, EDGE_COLOR, 0.6);
	for (const [childId, parentId] of tree) {
		const child = pixiNodes.get(childId);
		const parent = pixiNodes.get(parentId);
		if (!child || !parent) continue;
		g.moveTo(parent.data.x, parent.data.y);
		g.lineTo(child.data.x, child.data.y);
	}
	g.lineStyle(0);
}

// ---------------------------------------------------------------------------
// Pass 16: S6 Ontology backbone — translucent indigo skeleton
// ---------------------------------------------------------------------------

export function renderOntologyBackbone(
	host: RenderHost,
	g: CanvasGraphics,
): void {
	const backbone = host.getOntologyBackbone?.();
	if (!backbone || backbone.length === 0) return;

	const pixiNodes = host.getPixiNodes();
	g.lineStyle(4, 0x6366f1, 0.25);
	for (const { from, to } of backbone) {
		const pnFrom = pixiNodes.get(from);
		const pnTo = pixiNodes.get(to);
		if (!pnFrom || !pnTo) continue;
		g.moveTo(pnFrom.data.x, pnFrom.data.y);
		g.lineTo(pnTo.data.x, pnTo.data.y);
	}
	g.lineStyle(0);
}

// ---------------------------------------------------------------------------
// Pass 17: S4 Gap detection dotted edges
// ---------------------------------------------------------------------------

export function renderGapEdges(
	host: RenderHost,
	g: CanvasGraphics,
): void {
	const gaps = host.getStructuralGaps?.();
	if (!gaps || gaps.length === 0) return;

	const pixiNodes = host.getPixiNodes();
	const GAP_COLOR = 0xfbbf24;
	const DASH_LEN = 6;
	const GAP_LEN = 4;

	for (const { from, to } of gaps) {
		const pnA = pixiNodes.get(from);
		const pnB = pixiNodes.get(to);
		if (!pnA || !pnB) continue;

		const dx = pnB.data.x - pnA.data.x;
		const dy = pnB.data.y - pnA.data.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < 1) continue;
		const ux = dx / dist;
		const uy = dy / dist;
		const step = DASH_LEN + GAP_LEN;
		let d = 0;
		g.lineStyle(1.5, GAP_COLOR, 0.45);
		while (d < dist) {
			const end = Math.min(d + DASH_LEN, dist);
			g.moveTo(pnA.data.x + ux * d, pnA.data.y + uy * d);
			g.lineTo(pnA.data.x + ux * end, pnA.data.y + uy * end);
			d += step;
		}
	}
	g.lineStyle(0);
}
