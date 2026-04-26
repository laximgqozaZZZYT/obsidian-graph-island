/**
 * Branch-coverage tests for already-extracted pure functions in src/views/.
 *
 * Scope (subtask of 142-coverage-drop):
 *  - resolveEdgeStyle: breadcrumbs / has-tag / similar zoom-fade branches,
 *    hoverDistMap branches, highlighted + globalEdgeAlpha interaction,
 *    edgeStrengthGlow with custom min/max, colorEdgesByRelation + isOnto,
 *    custom edgeFadeMinAlpha/edgeHoverFalloff values.
 *  - computeLodLevel / computeZoomFadeAlpha / screenToWorld at LOD tier
 *    boundaries (zoom = 0.1, 0.5, 1, 2, 5).
 *
 * No modifications to god-object sources — public API tests only.
 */
import { describe, it, expect } from "vitest";
import {
	resolveEdgeStyle,
	resolveEdgeColor,
	NON_STRUCTURAL_EDGE_ALPHA,
	STRUCTURAL_EDGE_ALPHA,
	DEFAULT_LINE_THICKNESS,
	HIGHLIGHT_THICKNESS_MULTIPLIER,
	EDGE_TYPE_FALLBACK_COLORS,
	type EdgeDrawConfig,
} from "../../src/views/EdgeRenderer";
import { computeLodLevel, computeZoomFadeAlpha, screenToWorld } from "../../src/views/RenderPipeline";
import { NODE_SCREEN_PX_BASE } from "../../src/constants";
import type { GraphEdge } from "../../src/types";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
	return {
		source: "a",
		target: "b",
		type: "link",
		...overrides,
	} as GraphEdge;
}

function makeCfg(overrides: Partial<EdgeDrawConfig> = {}): EdgeDrawConfig {
	return {
		showLinks: true,
		showTagEdges: true,
		showCategoryEdges: true,
		showSemanticEdges: true,
		showInheritance: true,
		showAggregation: true,
		showTagNodes: true,
		showSimilar: true,
		showSibling: true,
		showSequence: true,
		showInlineRelation: true,
		showNamedRelation: true,
		colorEdgesByRelation: false,
		isArcLayout: false,
		highlightedNodeId: null,
		highlightSet: new Set(),
		bgColor: 0x1e1e1e,
		relationColors: new Map(),
		fadeByDegree: false,
		degrees: new Map(),
		maxDegree: 0,
		nodeClusterMap: null,
		clusterCentroids: null,
		clusterRadii: null,
		bundleStrength: 0,
		isDark: true,
		showEdgeLabels: false,
		showArrows: false,
		nodeRadii: null,
		...overrides,
	};
}

const src = { x: 0, y: 0, id: "a" };
const tgt = { x: 0, y: 0, id: "b" };

// ===========================================================================
// resolveEdgeStyle — applyZoomFade breadcrumbs branches
// ===========================================================================
describe("resolveEdgeStyle zoom-fade branches (sibling/sequence/has-tag/similar)", () => {
	it("sibling edge at ws < fadeZ * 0.6 applies deep breadcrumb fade", () => {
		// fadeZ default 0.5, 0.6*fadeZ = 0.3. ws=0.2 hits the breadcrumb deep-fade branch.
		const cfg = makeCfg({ worldScale: 0.2 });
		const normal = resolveEdgeStyle(makeEdge({ type: "sibling" }), src, tgt, makeCfg(), 1, null);
		const faded = resolveEdgeStyle(makeEdge({ type: "sibling" }), src, tgt, cfg, 1, null);
		// Deep-fade multiplier = max(fadeFloor*2, ws/(fadeZ*0.6)) = max(0.5, 0.667) = 0.667
		expect(faded.alpha).toBeLessThan(normal.alpha);
		expect(faded.alpha).toBeGreaterThan(0);
	});

	it("sequence edge at ws between fadeZ*0.6 and fadeZ — no breadcrumb fade, only thickness thin", () => {
		// ws=0.35 is between 0.3 (fadeZ*0.6) and 0.5 (fadeZ). Hits neither fade branch.
		const cfg = makeCfg({ worldScale: 0.35 });
		const full = resolveEdgeStyle(makeEdge({ type: "sequence" }), src, tgt, makeCfg(), 1, null);
		const s = resolveEdgeStyle(makeEdge({ type: "sequence" }), src, tgt, cfg, 1, null);
		// Alpha preserved (sequence is breadcrumb, only fades at ws<fadeZ*0.6)
		expect(s.alpha).toBeCloseTo(full.alpha);
		// Thickness reduced by zoom thin: max(0.6, 0.35/0.5) = 0.7
		expect(s.lineThick).toBeLessThan(full.lineThick);
	});

	it("has-tag edge at ws < fadeZ triggers has-tag fade branch (not the similar branch)", () => {
		const cfg = makeCfg({ worldScale: 0.25 });
		const full = resolveEdgeStyle(makeEdge({ type: "has-tag" }), src, tgt, makeCfg(), 1, null);
		const s = resolveEdgeStyle(makeEdge({ type: "has-tag" }), src, tgt, cfg, 1, null);
		// ws=0.25 < fadeZ=0.5, has-tag is in the same branch as similar
		// alpha *= max(fadeFloor=0.25, 0.25/0.5=0.5) = 0.5
		expect(s.alpha).toBeCloseTo(full.alpha * 0.5);
	});

	it("custom edgeFadeMinAlpha floors the similar fade", () => {
		const cfg = makeCfg({ worldScale: 0.05, edgeFadeMinAlpha: 0.8 });
		const s = resolveEdgeStyle(makeEdge({ type: "similar" }), src, tgt, cfg, 1, null);
		// Custom floor 0.8 is higher than ws/fadeZ=0.1, so multiplier = 0.8
		// STRUCTURAL_EDGE_ALPHA * 0.8 floor applied
		expect(s.alpha).toBeGreaterThanOrEqual(STRUCTURAL_EDGE_ALPHA * 0.8 - 0.01);
	});

	it("highlighted edge skips zoom-fade entirely", () => {
		const cfg = makeCfg({
			worldScale: 0.1,
			highlightedNodeId: "a",
			highlightSet: new Set(["a", "b"]),
		});
		const s = resolveEdgeStyle(makeEdge({ type: "sibling" }), src, tgt, cfg, 1, null);
		// isHighlighted → returns early in applyZoomFade, full alpha preserved
		expect(s.alpha).toBe(1.0);
		expect(s.isHighlighted).toBe(true);
		// Thickness uses HIGHLIGHT multiplier, not thin factor
		expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * HIGHLIGHT_THICKNESS_MULTIPLIER);
	});
});

// ===========================================================================
// resolveEdgeStyle — hoverDistMap branches
// ===========================================================================
describe("resolveEdgeStyle hoverDistMap branches", () => {
	it("hoverDistMap with source distance only — uses pow(falloff, dist)", () => {
		const cfg = makeCfg({
			highlightedNodeId: "x",
			highlightSet: new Set(["x"]),
			hoverDistMap: new Map([["a", 2]]),
			hoverEdgeFalloff: 0.5,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// min(2, undefined→99) = 2, pow(0.5, 2) = 0.25, floor min 0.08
		expect(s.alpha).toBeCloseTo(0.25);
	});

	it("hoverDistMap with both endpoints — uses min distance", () => {
		const cfg = makeCfg({
			highlightedNodeId: "x",
			highlightSet: new Set(["x"]),
			hoverDistMap: new Map([
				["a", 3],
				["b", 1],
			]),
			hoverEdgeFalloff: 0.5,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// min(3, 1) = 1, pow(0.5, 1) = 0.5
		expect(s.alpha).toBeCloseTo(0.5);
	});

	it("hoverDistMap present but neither endpoint in map — uses highlightEdgeNonMatchAlpha default 0.04", () => {
		const cfg = makeCfg({
			highlightedNodeId: "x",
			highlightSet: new Set(["x"]),
			hoverDistMap: new Map([["c", 1]]), // neither "a" nor "b"
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		expect(s.alpha).toBeCloseTo(0.04);
	});

	it("edgeHoverFalloffMinAlpha clamps deep falloff", () => {
		const cfg = makeCfg({
			highlightedNodeId: "x",
			highlightSet: new Set(["x"]),
			hoverDistMap: new Map([["a", 10]]),
			hoverEdgeFalloff: 0.5,
			edgeHoverFalloffMinAlpha: 0.3,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// pow(0.5, 10) ≈ 0.00098, but custom floor 0.3 applies
		expect(s.alpha).toBeCloseTo(0.3);
	});
});

// ===========================================================================
// resolveEdgeStyle — highlighted + globalEdgeAlpha interaction
// ===========================================================================
describe("resolveEdgeStyle highlighted + globalEdgeAlpha", () => {
	it("globalEdgeAlpha does NOT apply to highlighted edges (hover priority)", () => {
		const cfg = makeCfg({
			highlightedNodeId: "a",
			highlightSet: new Set(["a", "b"]),
			globalEdgeAlpha: 0.2,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// Highlighted edge: alpha=1.0 regardless of globalEdgeAlpha
		expect(s.alpha).toBe(1.0);
	});

	it("custom highlightEdgeAlpha overrides 1.0 default on highlighted edge", () => {
		const cfg = makeCfg({
			highlightedNodeId: "a",
			highlightSet: new Set(["a", "b"]),
			highlightEdgeAlpha: 0.75,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		expect(s.alpha).toBeCloseTo(0.75);
	});
});

// ===========================================================================
// resolveEdgeStyle — edgeStrengthGlow with custom min/max
// ===========================================================================
describe("resolveEdgeStyle edgeStrengthGlow custom min/max", () => {
	it("custom glow min/max scales thickness linearly with target degree ratio", () => {
		const cfg = makeCfg({
			edgeStrengthGlow: true,
			edgeStrengthGlowMin: 1.0,
			edgeStrengthGlowMax: 5.0,
			degrees: new Map([
				["a", 0],
				["b", 10],
			]),
			maxDegree: 40,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// t = 10/40 = 0.25, multiplier = 1.0 + 0.25 * (5.0 - 1.0) = 2.0
		expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * 2.0);
	});

	it("glow with target degree = 0 applies min multiplier", () => {
		const cfg = makeCfg({
			edgeStrengthGlow: true,
			edgeStrengthGlowMin: 0.5,
			edgeStrengthGlowMax: 3.0,
			degrees: new Map([
				["a", 5],
				["b", 0],
			]),
			maxDegree: 10,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// t = 0/10 = 0, multiplier = 0.5 + 0 * 2.5 = 0.5
		expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * 0.5);
	});
});

// ===========================================================================
// resolveEdgeStyle — colorEdgesByRelation + isOnto branch
// ===========================================================================
describe("resolveEdgeStyle colorEdgesByRelation + isOnto interaction", () => {
	it("inheritance edge with relation does NOT switch to RELATION_COLOR_ALPHA (isOnto skips)", () => {
		const cfg = makeCfg({ colorEdgesByRelation: true });
		const e = makeEdge({ type: "inheritance", relation: "extends" });
		const s = resolveEdgeStyle(e, src, tgt, cfg, 1, null);
		// isOnto=true → RELATION_COLOR_ALPHA branch is skipped, keeps STRUCTURAL alpha
		expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
	});

	it("link edge with relation but colorEdgesByRelation=false keeps NON_STRUCTURAL", () => {
		const cfg = makeCfg({ colorEdgesByRelation: false });
		const e = makeEdge({ relation: "related" });
		const s = resolveEdgeStyle(e, src, tgt, cfg, 1, null);
		expect(s.alpha).toBeCloseTo(NON_STRUCTURAL_EDGE_ALPHA);
	});
});

// ===========================================================================
// resolveEdgeColor — fallback branches
// ===========================================================================
describe("resolveEdgeColor fallback branches", () => {
	it("colorEdgesByRelation=true + no relation + known fallback type → EDGE_TYPE_FALLBACK_COLORS", () => {
		const semanticFallback = EDGE_TYPE_FALLBACK_COLORS.get("semantic");
		expect(semanticFallback).toBeDefined();
		const color = resolveEdgeColor(makeEdge({ type: "semantic" }), true, new Map(), true);
		expect(color).toBe(semanticFallback);
	});

	it("named-relation (spec.color=null) with useRelColor=false falls through to defaultColor", () => {
		const color = resolveEdgeColor(makeEdge({ type: "named-relation" }), false, new Map(), true);
		// spec exists but color=null, useRelColor=false → defaultColor(isDark=true) = 0x666666
		expect(color).toBe(0x666666);
	});

	it("named-relation with useRelColor=true + relation in map → uses relation color", () => {
		const relationColors = new Map([["hasAuthor", "#abcdef"]]);
		const color = resolveEdgeColor(
			makeEdge({ type: "named-relation", relation: "hasAuthor" }),
			true,
			relationColors,
			true,
		);
		expect(color).toBe(0xabcdef);
	});
});

// ===========================================================================
// LOD tier boundaries at canonical zoom levels (0.1, 0.5, 1, 2, 5)
// ===========================================================================
describe("computeLodLevel at NODE_SCREEN_PX_BASE × canonical zoom levels", () => {
	// NODE_SCREEN_PX_BASE = 30
	const DEFAULT_LOD = {
		cardLODExtremePx: 1.5,
		cardLODMidLabelPx: 3.0,
		cardLODNormalPx: 4.0,
		cardLODCompactPx: 8.0,
		cardLODFullCardPx: 15.0,
	};

	it("zoom=0.1 (px=3.0) hits midLabel threshold exactly → tier 2 (not <3)", () => {
		expect(computeLodLevel(NODE_SCREEN_PX_BASE * 0.1, DEFAULT_LOD)).toBe(2);
	});

	it("zoom=0.5 (px=15.0) hits fullCard threshold exactly → tier 5 (not <15)", () => {
		expect(computeLodLevel(NODE_SCREEN_PX_BASE * 0.5, DEFAULT_LOD)).toBe(5);
	});

	it("zoom=1 (px=30) well above fullCard → tier 5", () => {
		expect(computeLodLevel(NODE_SCREEN_PX_BASE * 1, DEFAULT_LOD)).toBe(5);
	});

	it("zoom=2 (px=60) and zoom=5 (px=150) both saturate at tier 5", () => {
		expect(computeLodLevel(NODE_SCREEN_PX_BASE * 2, DEFAULT_LOD)).toBe(5);
		expect(computeLodLevel(NODE_SCREEN_PX_BASE * 5, DEFAULT_LOD)).toBe(5);
	});
});

// ===========================================================================
// computeZoomFadeAlpha + screenToWorld at canonical zoom levels
// ===========================================================================
describe("zoom-dependent utility functions at canonical zoom levels", () => {
	it("computeZoomFadeAlpha at zoom=0.1 returns fadeFloor (<=fadeEnd=0.15)", () => {
		expect(computeZoomFadeAlpha(0.1)).toBe(0.03);
	});

	it("computeZoomFadeAlpha at zoom=0.5 returns interpolated value strictly between floor and 1", () => {
		const v = computeZoomFadeAlpha(0.5);
		expect(v).toBeGreaterThan(0.03);
		expect(v).toBeLessThan(1);
	});

	it("computeZoomFadeAlpha at zoom=1, 2, 5 all saturate at 1 (>=fadeStart=0.7)", () => {
		expect(computeZoomFadeAlpha(1)).toBe(1);
		expect(computeZoomFadeAlpha(2)).toBe(1);
		expect(computeZoomFadeAlpha(5)).toBe(1);
	});

	it("screenToWorld at zoom=0.1 produces 10× screenPx (max of floor, px/ws)", () => {
		// 3px / 0.1 = 30, floor=1 → 30
		expect(screenToWorld(3, 0.1, 1)).toBe(30);
	});

	it("screenToWorld at zoom=5 produces 0.2× screenPx but floor kicks in", () => {
		// 3px / 5 = 0.6, floor=1 → 1 (floored)
		expect(screenToWorld(3, 5, 1)).toBe(1);
		// 10px / 5 = 2, floor=1 → 2 (pass-through)
		expect(screenToWorld(10, 5, 1)).toBe(2);
	});
});
