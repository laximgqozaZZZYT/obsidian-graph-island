import { describe, it, expect } from "vitest";
import {
	drawEdgeMarker,
	drawSequenceArrow,
	drawGenericArrow,
	drawCardinalityMarker,
	resolveCardinality,
	getDefaultCardinality,
} from "../src/views/edge-markers";
import { CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";
import {
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_SEQUENCE,
	EDGE_TYPE_HAS_TAG,
	EDGE_TYPE_LINK,
} from "../src/constants";
import { DEFAULT_CARDINALITY_RENDER_CONFIG } from "../src/types";
import type { GraphEdge, CardinalityRule } from "../src/types";

// Access private command buffer for assertions.
function cmds(g: CanvasGraphics): any[] {
	return (g as any).commands;
}

function makeEdge(partial: Partial<GraphEdge> = {}): GraphEdge {
	return {
		id: "e1",
		source: "a",
		target: "b",
		...partial,
	};
}

// ---------------------------------------------------------------------------
// getDefaultCardinality — pure switch/case mapping
// ---------------------------------------------------------------------------

describe("getDefaultCardinality", () => {
	it("returns 1 → 0..N for inheritance edges", () => {
		const r = getDefaultCardinality(makeEdge({ type: EDGE_TYPE_INHERITANCE }));
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "0..N" });
	});

	it("returns 1 → 0..N for aggregation edges", () => {
		const r = getDefaultCardinality(makeEdge({ type: EDGE_TYPE_AGGREGATION }));
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "0..N" });
	});

	it("returns N → 1 for has-tag edges (many notes per tag)", () => {
		const r = getDefaultCardinality(makeEdge({ type: EDGE_TYPE_HAS_TAG }));
		expect(r).toEqual({ sourceCardinality: "N", targetCardinality: "1" });
	});

	it("returns 1 → 0..1 for link edges", () => {
		const r = getDefaultCardinality(makeEdge({ type: EDGE_TYPE_LINK }));
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "0..1" });
	});

	it("returns 1 → 1 for sequence edges", () => {
		const r = getDefaultCardinality(makeEdge({ type: EDGE_TYPE_SEQUENCE }));
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "1" });
	});

	it("returns null for unknown edge type", () => {
		// "semantic" is a valid EdgeType but has no default cardinality entry
		const r = getDefaultCardinality(makeEdge({ type: "semantic" as any }));
		expect(r).toBeNull();
	});

	it("returns null when type is undefined", () => {
		const r = getDefaultCardinality(makeEdge({ type: undefined }));
		expect(r).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// resolveCardinality — rule resolution with fallback
// ---------------------------------------------------------------------------

describe("resolveCardinality", () => {
	it("returns first matching rule (edgeType match)", () => {
		const rules: CardinalityRule[] = [
			{ edgeType: EDGE_TYPE_LINK, sourceCardinality: "N", targetCardinality: "N" },
			{ edgeType: EDGE_TYPE_LINK, sourceCardinality: "1", targetCardinality: "1" },
		];
		const r = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK }), rules);
		// First-match wins
		expect(r).toBe(rules[0]);
	});

	it("matches by relation substring (includes semantics)", () => {
		const rules: CardinalityRule[] = [{ relation: "Author", sourceCardinality: "1", targetCardinality: "N" }];
		const r = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK, relation: "AuthorOf" }), rules);
		expect(r).toBe(rules[0]);
	});

	it("skips rule when edgeType does not match", () => {
		const rules: CardinalityRule[] = [
			{ edgeType: EDGE_TYPE_INHERITANCE, sourceCardinality: "0..1", targetCardinality: "0..1" },
		];
		const r = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK }), rules);
		// Falls through to default for link
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "0..1" });
	});

	it("skips rule when relation does not include match string", () => {
		const rules: CardinalityRule[] = [{ relation: "Owns", sourceCardinality: "1", targetCardinality: "N" }];
		const r = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK, relation: "Author" }), rules);
		// Falls through to default for link
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "0..1" });
	});

	it("treats missing relation on edge as no-match for relation rule", () => {
		const rules: CardinalityRule[] = [{ relation: "Owns", sourceCardinality: "1", targetCardinality: "N" }];
		// No relation on edge → optional chain returns undefined → !includes is true → skip
		const r = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK }), rules);
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "0..1" });
	});

	it("matches rule that has neither edgeType nor relation (catch-all)", () => {
		const rules: CardinalityRule[] = [{ sourceCardinality: "0..N", targetCardinality: "0..N" }];
		const r = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK }), rules);
		expect(r).toBe(rules[0]);
	});

	it("returns null when no rule matches and edge has no default", () => {
		const r = resolveCardinality(makeEdge({ type: undefined }), []);
		expect(r).toBeNull();
	});

	it("falls back to default when rules array is empty", () => {
		const r = resolveCardinality(makeEdge({ type: EDGE_TYPE_SEQUENCE }), []);
		expect(r).toEqual({ sourceCardinality: "1", targetCardinality: "1" });
	});

	it("requires both edgeType AND relation to match when both specified", () => {
		const rules: CardinalityRule[] = [
			{
				edgeType: EDGE_TYPE_LINK,
				relation: "Knows",
				sourceCardinality: "N",
				targetCardinality: "N",
			},
		];
		// edgeType matches but relation does not → skip → fallback to default
		const r1 = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK, relation: "Owns" }), rules);
		expect(r1).toEqual({ sourceCardinality: "1", targetCardinality: "0..1" });

		// Both match → rule wins
		const r2 = resolveCardinality(makeEdge({ type: EDGE_TYPE_LINK, relation: "Knows" }), rules);
		expect(r2).toBe(rules[0]);
	});
});

// ---------------------------------------------------------------------------
// drawEdgeMarker — inheritance (triangle at target) / aggregation (diamond at source)
// ---------------------------------------------------------------------------

describe("drawEdgeMarker", () => {
	it("early-returns when source and target overlap (len < 1)", () => {
		const g = new CanvasGraphics();
		drawEdgeMarker(g, { x: 100, y: 100 }, { x: 100.5, y: 100.5 }, EDGE_TYPE_INHERITANCE, 0xff0000, 1, 0xffffff);
		// Below len < 1 threshold → no commands emitted
		expect(cmds(g).length).toBe(0);
	});

	it("emits triangle path for inheritance: lineStyle/beginFill/moveTo + 2 lineTo + closePath/endFill", () => {
		const g = new CanvasGraphics();
		drawEdgeMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, EDGE_TYPE_INHERITANCE, 0x336699, 1, 0x000000);
		const seq = cmds(g).map((c) => c.t);
		expect(seq).toEqual(["lineStyle", "beginFill", "moveTo", "lineTo", "lineTo", "closePath", "endFill"]);
		// Triangle apex sits exactly at target
		const moveTo = cmds(g).find((c) => c.t === "moveTo");
		expect(moveTo.x).toBe(100);
		expect(moveTo.y).toBe(0);
	});

	it("emits diamond path for aggregation: 3 lineTo entries forming the 4-point shape", () => {
		const g = new CanvasGraphics();
		drawEdgeMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, EDGE_TYPE_AGGREGATION, 0x336699, 1, 0x000000);
		const lineTos = cmds(g).filter((c) => c.t === "lineTo");
		// Diamond uses 3 lineTo (start at src, then 3 vertices) before closePath
		expect(lineTos.length).toBe(3);
		// Diamond starts at source
		const moveTo = cmds(g).find((c) => c.t === "moveTo");
		expect(moveTo.x).toBe(0);
		expect(moveTo.y).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// drawSequenceArrow — filled triangle at target
// ---------------------------------------------------------------------------

describe("drawSequenceArrow", () => {
	it("early-returns when len < 1", () => {
		const g = new CanvasGraphics();
		drawSequenceArrow(g, { x: 0, y: 0 }, { x: 0.3, y: 0 }, 0xff0000, 1);
		expect(cmds(g).length).toBe(0);
	});

	it("emits triangle path with apex at target", () => {
		const g = new CanvasGraphics();
		drawSequenceArrow(g, { x: 0, y: 0 }, { x: 50, y: 0 }, 0x336699, 0.8);
		const seq = cmds(g).map((c) => c.t);
		expect(seq).toEqual(["lineStyle", "beginFill", "moveTo", "lineTo", "lineTo", "closePath", "endFill"]);
		const moveTo = cmds(g).find((c) => c.t === "moveTo");
		expect(moveTo.x).toBe(50);
		expect(moveTo.y).toBe(0);
	});

	it("uses provided color and alpha for fill", () => {
		const g = new CanvasGraphics();
		drawSequenceArrow(g, { x: 0, y: 0 }, { x: 50, y: 0 }, 0xabcdef, 0.42);
		const fill = cmds(g).find((c) => c.t === "beginFill");
		expect(fill.color).toBe(0xabcdef);
		expect(fill.alpha).toBe(0.42);
	});
});

// ---------------------------------------------------------------------------
// drawGenericArrow — small filled triangle, scaled by zoom and node radius
// ---------------------------------------------------------------------------

describe("drawGenericArrow", () => {
	it("early-returns when len < 1", () => {
		const g = new CanvasGraphics();
		drawGenericArrow(g, { x: 0, y: 0 }, { x: 0.5, y: 0 }, 0xff0000, 1, 10);
		expect(cmds(g).length).toBe(0);
	});

	it("places tip offset before target by (radius + tipOffset)", () => {
		const g = new CanvasGraphics();
		const targetRadius = 10;
		// Edge goes left→right, target at (100, 0), so tip is at x = 100 - (10 + 2) = 88
		drawGenericArrow(g, { x: 0, y: 0 }, { x: 100, y: 0 }, 0x336699, 1, targetRadius);
		const moveTo = cmds(g).find((c) => c.t === "moveTo");
		expect(moveTo.x).toBeCloseTo(88, 5);
		expect(moveTo.y).toBeCloseTo(0, 5);
	});

	it("respects min screen-pixel size when worldScale is small (zoomed-out)", () => {
		// At worldScale=0.1, minWorldSize = 6 / 0.1 = 60 → arrow much bigger than radius*0.35
		const g1 = new CanvasGraphics();
		drawGenericArrow(g1, { x: 0, y: 0 }, { x: 100, y: 0 }, 0x000000, 1, 5, 0.1);
		// At worldScale=10 (zoomed-in), minWorldSize = 0.6 → radius factor wins (5*0.35=1.75)
		const g2 = new CanvasGraphics();
		drawGenericArrow(g2, { x: 0, y: 0 }, { x: 100, y: 0 }, 0x000000, 1, 5, 10);
		// Arrow in g1 should produce wider triangle (bigger sz) than g2.
		// Compare the perpendicular spread of the two base lineTo points (3rd and 4th commands).
		const lt1 = cmds(g1).filter((c) => c.t === "lineTo");
		const lt2 = cmds(g2).filter((c) => c.t === "lineTo");
		const spread1 = Math.abs(lt1[0].y - lt1[1].y);
		const spread2 = Math.abs(lt2[0].y - lt2[1].y);
		expect(spread1).toBeGreaterThan(spread2);
	});

	it("falls back to GENERIC_ARROW_MIN_SIZE when worldScale = 0", () => {
		const g = new CanvasGraphics();
		drawGenericArrow(g, { x: 0, y: 0 }, { x: 100, y: 0 }, 0x000000, 1, 5, 0);
		// Should still emit a complete path — no NaN, no early return
		const seq = cmds(g).map((c) => c.t);
		expect(seq).toContain("moveTo");
		expect(seq).toContain("closePath");
		// And no NaN coordinates
		for (const c of cmds(g)) {
			if ("x" in c) expect(Number.isFinite(c.x)).toBe(true);
			if ("y" in c) expect(Number.isFinite(c.y)).toBe(true);
		}
	});

	it("uses zero stroke width (filled arrow only)", () => {
		const g = new CanvasGraphics();
		drawGenericArrow(g, { x: 0, y: 0 }, { x: 100, y: 0 }, 0x000000, 1, 5);
		const ls = cmds(g).find((c) => c.t === "lineStyle");
		expect(ls.width).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// drawCardinalityMarker — five crow's-foot variants
// ---------------------------------------------------------------------------

describe("drawCardinalityMarker", () => {
	const cfg = DEFAULT_CARDINALITY_RENDER_CONFIG;

	it("early-returns when nearNode and farNode overlap", () => {
		const g = new CanvasGraphics();
		drawCardinalityMarker(g, { x: 5, y: 5 }, { x: 5, y: 5 }, "1", 0x000000, 1, 10, cfg);
		expect(cmds(g).length).toBe(0);
	});

	it("'1' draws a single perpendicular bar (1 moveTo + 1 lineTo)", () => {
		const g = new CanvasGraphics();
		drawCardinalityMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, "1", 0x000000, 1, 10, cfg);
		const moveTos = cmds(g).filter((c) => c.t === "moveTo");
		const lineTos = cmds(g).filter((c) => c.t === "lineTo");
		expect(moveTos.length).toBe(1);
		expect(lineTos.length).toBe(1);
		expect(cmds(g).filter((c) => c.t === "drawCircle").length).toBe(0);
	});

	it("'0..1' draws a bar plus a small circle", () => {
		const g = new CanvasGraphics();
		drawCardinalityMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, "0..1", 0x000000, 1, 10, cfg);
		expect(cmds(g).filter((c) => c.t === "drawCircle").length).toBe(1);
		expect(cmds(g).filter((c) => c.t === "moveTo").length).toBe(1);
		expect(cmds(g).filter((c) => c.t === "lineTo").length).toBe(1);
	});

	it("'N' draws crow's-foot fork (4 moveTo + 4 lineTo, no circle)", () => {
		const g = new CanvasGraphics();
		drawCardinalityMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, "N", 0x000000, 1, 10, cfg);
		expect(cmds(g).filter((c) => c.t === "moveTo").length).toBe(4);
		expect(cmds(g).filter((c) => c.t === "lineTo").length).toBe(4);
		expect(cmds(g).filter((c) => c.t === "drawCircle").length).toBe(0);
	});

	it("'0..N' draws crow's-foot plus a circle", () => {
		const g = new CanvasGraphics();
		drawCardinalityMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, "0..N", 0x000000, 1, 10, cfg);
		expect(cmds(g).filter((c) => c.t === "drawCircle").length).toBe(1);
		expect(cmds(g).filter((c) => c.t === "moveTo").length).toBe(3);
		expect(cmds(g).filter((c) => c.t === "lineTo").length).toBe(3);
	});

	it("'1..N' draws bar plus crow's-foot (3 moveTo + 3 lineTo, no circle)", () => {
		const g = new CanvasGraphics();
		drawCardinalityMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, "1..N", 0x000000, 1, 10, cfg);
		expect(cmds(g).filter((c) => c.t === "moveTo").length).toBe(3);
		expect(cmds(g).filter((c) => c.t === "lineTo").length).toBe(3);
		expect(cmds(g).filter((c) => c.t === "drawCircle").length).toBe(0);
	});

	it("respects markerSizeMin floor when nodeRadius is tiny", () => {
		const g1 = new CanvasGraphics();
		// Tiny radius (1) with default markerSizeRatio=0.3 → 0.3, but min=6 wins
		drawCardinalityMarker(g1, { x: 0, y: 0 }, { x: 100, y: 0 }, "1", 0x000000, 1, 1, cfg);
		// Bar perpendicular spread = sz * 1.0 (sz*0.5 each side) = ~6
		const moveTo = cmds(g1).find((c) => c.t === "moveTo")!;
		const lineTo = cmds(g1).find((c) => c.t === "lineTo")!;
		const spread = Math.hypot(moveTo.x - lineTo.x, moveTo.y - lineTo.y);
		expect(spread).toBeCloseTo(6, 5);
	});

	it("scales marker with nodeRadius when ratio*radius exceeds the minimum", () => {
		const g = new CanvasGraphics();
		// radius=100 → 100 * 0.3 = 30 (well above min=6)
		drawCardinalityMarker(g, { x: 0, y: 0 }, { x: 1000, y: 0 }, "1", 0x000000, 1, 100, cfg);
		const moveTo = cmds(g).find((c) => c.t === "moveTo")!;
		const lineTo = cmds(g).find((c) => c.t === "lineTo")!;
		const spread = Math.hypot(moveTo.x - lineTo.x, moveTo.y - lineTo.y);
		expect(spread).toBeCloseTo(30, 5);
	});

	it("offsets marker outside node boundary by (nodeRadius + markerOffset)", () => {
		const g = new CanvasGraphics();
		// Horizontal edge: nearNode at (0,0), farNode at (100,0), radius=10, offset=3
		// Bar's center along the edge sits at x = 0 + 1*(10+3) = 13
		drawCardinalityMarker(g, { x: 0, y: 0 }, { x: 100, y: 0 }, "1", 0x000000, 1, 10, cfg);
		const moveTo = cmds(g).find((c) => c.t === "moveTo")!;
		const lineTo = cmds(g).find((c) => c.t === "lineTo")!;
		// Bar is perpendicular to the edge, so x of both endpoints equals the base x
		expect(moveTo.x).toBeCloseTo(13, 5);
		expect(lineTo.x).toBeCloseTo(13, 5);
	});
});
