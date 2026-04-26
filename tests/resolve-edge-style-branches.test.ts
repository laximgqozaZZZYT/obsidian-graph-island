import { describe, it, expect } from "vitest";
import {
	resolveEdgeStyle,
	STRUCTURAL_EDGE_ALPHA,
	NON_STRUCTURAL_EDGE_ALPHA,
	DEFAULT_LINE_THICKNESS,
	HIGHLIGHT_THICKNESS_MULTIPLIER,
	RELATION_COLOR_ALPHA,
	type EdgeDrawConfig,
} from "../src/views/EdgeRenderer";
import type { GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Branch-coverage tests for resolveEdgeStyle
//
// Covers paths that existing tests/resolve-edge-style.test.ts does not:
//   - aggregation / sequence / sibling edges (isOnto, isBreadcrumbs)
//   - relation color skipped for isOnto
//   - fadeByDegree / edgeStrengthGlow no-op when maxDegree=0
//   - globalEdgeAlpha skipped for highlighted edges
//   - hoverDistMap distance-falloff path
//   - applyZoomFade alpha branch for similar / has-tag / breadcrumbs
//   - LOD tier boundaries (ws = 0.1, 0.3, 0.5, 1, 5)
//   - highContrast combined with fadeByDegree and highlight
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

const pos = (id: string) => ({ x: 0, y: 0, id });
const src = pos("a");
const tgt = pos("b");

describe("resolveEdgeStyle — edge type branches", () => {
	it("aggregation edge is structural (isOnto path)", () => {
		const s = resolveEdgeStyle(makeEdge({ type: "aggregation" }), src, tgt, makeCfg(), 1, null);
		expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
	});

	it("sequence edge is structural (isBreadcrumbs path)", () => {
		const s = resolveEdgeStyle(makeEdge({ type: "sequence" }), src, tgt, makeCfg(), 1, null);
		expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
	});

	it("sibling edge is structural (isBreadcrumbs path)", () => {
		const s = resolveEdgeStyle(makeEdge({ type: "sibling" }), src, tgt, makeCfg(), 1, null);
		expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
	});

	it("tag edge is non-structural (not onto, not has-tag, not breadcrumb)", () => {
		const s = resolveEdgeStyle(makeEdge({ type: "tag" }), src, tgt, makeCfg(), 1, null);
		expect(s.alpha).toBeCloseTo(NON_STRUCTURAL_EDGE_ALPHA);
	});
});

describe("resolveEdgeStyle — relation color gating", () => {
	it("relation on isOnto edge does NOT trigger RELATION_COLOR alpha", () => {
		const e = makeEdge({ type: "inheritance", relation: "Author" });
		const cfg = makeCfg({ colorEdgesByRelation: true });
		const s = resolveEdgeStyle(e, src, tgt, cfg, 1, null);
		// isOnto branch keeps STRUCTURAL alpha, skipping relation override
		expect(s.alpha).toBeCloseTo(STRUCTURAL_EDGE_ALPHA);
	});

	it("relation without colorEdgesByRelation uses default alpha", () => {
		const e = makeEdge({ relation: "Author" });
		const cfg = makeCfg({ colorEdgesByRelation: false });
		const s = resolveEdgeStyle(e, src, tgt, cfg, 1, null);
		expect(s.alpha).toBeCloseTo(NON_STRUCTURAL_EDGE_ALPHA);
		expect(s.alpha).not.toBeCloseTo(RELATION_COLOR_ALPHA);
	});
});

describe("resolveEdgeStyle — degree-based guards", () => {
	it("fadeByDegree is a no-op when maxDegree=0", () => {
		const cfg = makeCfg({ fadeByDegree: true, degrees: new Map(), maxDegree: 0 });
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// Guard clause: alpha untouched
		expect(s.alpha).toBeCloseTo(NON_STRUCTURAL_EDGE_ALPHA);
	});

	it("edgeStrengthGlow is a no-op when maxDegree=0", () => {
		const cfg = makeCfg({ edgeStrengthGlow: true, degrees: new Map(), maxDegree: 0 });
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS);
	});
});

describe("resolveEdgeStyle — highlight priority", () => {
	it("highlighted edge ignores globalEdgeAlpha", () => {
		const cfg = makeCfg({
			highlightedNodeId: "a",
			highlightSet: new Set(["a", "b"]),
			globalEdgeAlpha: 0.3,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// Highlight alpha is 1.0 and globalEdgeAlpha does NOT multiply
		expect(s.alpha).toBe(1.0);
	});

	it("hoverDistMap produces distance-based alpha falloff", () => {
		const cfg = makeCfg({
			highlightedNodeId: "root",
			highlightSet: new Set(["root"]),
			hoverDistMap: new Map([["a", 1]]),
			hoverEdgeFalloff: 0.6,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// pow(0.6, 1) = 0.6 — distinct from the non-match constant (0.04)
		expect(s.alpha).toBeCloseTo(0.6);
	});

	it("empty hoverDistMap without endpoint match falls back to non-match alpha", () => {
		const cfg = makeCfg({
			highlightedNodeId: "root",
			highlightSet: new Set(["root"]),
			hoverDistMap: new Map([["unrelated", 1]]),
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		expect(s.alpha).toBeCloseTo(0.04);
	});
});

describe("resolveEdgeStyle — applyZoomFade alpha branches", () => {
	it("similar edge fades alpha at ws < fadeZ", () => {
		const cfg = makeCfg({ worldScale: 0.2, edgeZoomFadeThreshold: 0.5 });
		const similar = resolveEdgeStyle(makeEdge({ type: "similar" }), src, tgt, cfg, 1, null);
		const normal = resolveEdgeStyle(makeEdge({ type: "similar" }), src, tgt, makeCfg({ worldScale: 1 }), 1, null);
		expect(similar.alpha).toBeLessThan(normal.alpha);
	});

	it("has-tag edge fades alpha at ws < fadeZ", () => {
		const cfg = makeCfg({ worldScale: 0.2, edgeZoomFadeThreshold: 0.5 });
		const faded = resolveEdgeStyle(makeEdge({ type: "has-tag" }), src, tgt, cfg, 1, null);
		const normal = resolveEdgeStyle(makeEdge({ type: "has-tag" }), src, tgt, makeCfg({ worldScale: 1 }), 1, null);
		expect(faded.alpha).toBeLessThan(normal.alpha);
	});

	it("breadcrumbs (sibling) fades alpha only at ws < fadeZ * 0.6", () => {
		// ws=0.4, fadeZ=0.5 → fadeZ*0.6=0.3 → 0.4 >= 0.3 → NO breadcrumb alpha fade
		// but thickness IS faded by ws < fadeZ
		const cfgMid = makeCfg({ worldScale: 0.4, edgeZoomFadeThreshold: 0.5 });
		const mid = resolveEdgeStyle(makeEdge({ type: "sibling" }), src, tgt, cfgMid, 1, null);
		// ws=0.2 < 0.3 → breadcrumb alpha fade engages
		const cfgDeep = makeCfg({ worldScale: 0.2, edgeZoomFadeThreshold: 0.5 });
		const deep = resolveEdgeStyle(makeEdge({ type: "sibling" }), src, tgt, cfgDeep, 1, null);
		expect(deep.alpha).toBeLessThan(mid.alpha);
	});

	it("breadcrumbs (sequence) deep zoom triggers alpha fade", () => {
		const cfg = makeCfg({ worldScale: 0.1, edgeZoomFadeThreshold: 0.5 });
		const deep = resolveEdgeStyle(makeEdge({ type: "sequence" }), src, tgt, cfg, 1, null);
		const normal = resolveEdgeStyle(makeEdge({ type: "sequence" }), src, tgt, makeCfg(), 1, null);
		expect(deep.alpha).toBeLessThan(normal.alpha);
	});

	it("zoom-in (ws=5) leaves alpha and thickness unchanged", () => {
		const cfg = makeCfg({ worldScale: 5 });
		const zoomed = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		const baseline = resolveEdgeStyle(makeEdge(), src, tgt, makeCfg(), 1, null);
		expect(zoomed.alpha).toBeCloseTo(baseline.alpha);
		expect(zoomed.lineThick).toBeCloseTo(baseline.lineThick);
	});

	it("at ws = fadeZ exactly (0.5), no zoom fade applied (strict <)", () => {
		const cfg = makeCfg({ worldScale: 0.5, edgeZoomFadeThreshold: 0.5 });
		const boundary = resolveEdgeStyle(makeEdge({ type: "similar" }), src, tgt, cfg, 1, null);
		const normal = resolveEdgeStyle(makeEdge({ type: "similar" }), src, tgt, makeCfg(), 1, null);
		expect(boundary.alpha).toBeCloseTo(normal.alpha);
		expect(boundary.lineThick).toBeCloseTo(normal.lineThick);
	});

	it("highlighted edge is exempt from zoom fade even at ws=0.1", () => {
		const cfg = makeCfg({
			worldScale: 0.1,
			edgeZoomFadeThreshold: 0.5,
			highlightedNodeId: "a",
			highlightSet: new Set(["a", "b"]),
		});
		const s = resolveEdgeStyle(makeEdge({ type: "similar" }), src, tgt, cfg, 1, null);
		expect(s.alpha).toBe(1.0);
		expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * HIGHLIGHT_THICKNESS_MULTIPLIER);
	});
});

describe("resolveEdgeStyle — combined modifiers", () => {
	it("fadeByDegree + highContrast: HC boost applies after degree fade", () => {
		const cfg = makeCfg({
			fadeByDegree: true,
			degrees: new Map([
				["a", 10],
				["b", 10],
			]),
			maxDegree: 100,
			highContrast: true,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		// Both branches taken: lineThick doubled, alpha faded then boosted 1.3x
		expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * 2);
		expect(s.alpha).toBeLessThan(NON_STRUCTURAL_EDGE_ALPHA); // still faded by degree
	});

	it("highlight + highContrast: both multipliers stack on lineThick", () => {
		const cfg = makeCfg({
			highlightedNodeId: "a",
			highlightSet: new Set(["a", "b"]),
			highContrast: true,
		});
		const s = resolveEdgeStyle(makeEdge(), src, tgt, cfg, 1, null);
		expect(s.lineThick).toBeCloseTo(DEFAULT_LINE_THICKNESS * HIGHLIGHT_THICKNESS_MULTIPLIER * 2);
		expect(s.alpha).toBe(1.0); // clamped
	});
});
