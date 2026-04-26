import { describe, it, expect } from "vitest";
import {
	a11yEdgeLabelFill,
	getEdgeLabel,
	collectLabelableEdges,
	trimLabelsByDegree,
	seedNodeRects,
	computeLabelPosition,
	EDGE_LABEL_FONT_SIZE_DEFAULT,
	EDGE_LABEL_BG_ALPHA,
	MAX_EDGE_LABELS,
} from "../../src/views/EdgeLabelRenderer";
import type { GraphEdge } from "../../src/types";
import type { EdgeDrawConfig } from "../../src/views/EdgeRenderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
	return { id: "e1", source: "a", target: "b", ...overrides };
}

function baseCfg(overrides?: Partial<EdgeDrawConfig>): EdgeDrawConfig {
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
		colorEdgesByRelation: false,
		isArcLayout: false,
		highlightedNodeId: null,
		highlightSet: new Set<string>(),
		bgColor: 0x1e1e2e,
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("EdgeLabelRenderer constants", () => {
	it("EDGE_LABEL_FONT_SIZE_DEFAULT is positive", () => {
		expect(EDGE_LABEL_FONT_SIZE_DEFAULT).toBeGreaterThan(0);
	});

	it("EDGE_LABEL_BG_ALPHA is in 0..1 range", () => {
		expect(EDGE_LABEL_BG_ALPHA).toBeGreaterThan(0);
		expect(EDGE_LABEL_BG_ALPHA).toBeLessThanOrEqual(1);
	});

	it("MAX_EDGE_LABELS is a reasonable cap", () => {
		expect(MAX_EDGE_LABELS).toBeGreaterThanOrEqual(50);
	});
});

// ---------------------------------------------------------------------------
// a11yEdgeLabelFill
// ---------------------------------------------------------------------------

describe("a11yEdgeLabelFill", () => {
	it("returns a number for dark mode", () => {
		const fill = a11yEdgeLabelFill(true);
		expect(typeof fill).toBe("number");
		expect(fill).toBeGreaterThanOrEqual(0);
	});

	it("returns a number for light mode", () => {
		const fill = a11yEdgeLabelFill(false);
		expect(typeof fill).toBe("number");
		expect(fill).toBeGreaterThanOrEqual(0);
	});

	it("dark and light fills differ", () => {
		expect(a11yEdgeLabelFill(true)).not.toBe(a11yEdgeLabelFill(false));
	});
});

// ---------------------------------------------------------------------------
// getEdgeLabel
// ---------------------------------------------------------------------------

describe("getEdgeLabel", () => {
	it("returns relation string when present", () => {
		expect(getEdgeLabel(makeEdge({ relation: "owns" }))).toBe("owns");
	});

	it("returns 'is-a' for inheritance type", () => {
		expect(getEdgeLabel(makeEdge({ type: "inheritance" }))).toBe("is-a");
	});

	it("returns 'has-a' for aggregation type", () => {
		expect(getEdgeLabel(makeEdge({ type: "aggregation" }))).toBe("has-a");
	});

	it("returns approx symbol for similar type", () => {
		expect(getEdgeLabel(makeEdge({ type: "similar" }))).toBe("\u2248");
	});

	it("returns 'sibling' for sibling type", () => {
		expect(getEdgeLabel(makeEdge({ type: "sibling" }))).toBe("sibling");
	});

	it("returns 'seq' for sequence type", () => {
		expect(getEdgeLabel(makeEdge({ type: "sequence" }))).toBe("seq");
	});

	it("returns null for has-tag type", () => {
		expect(getEdgeLabel(makeEdge({ type: "has-tag" }))).toBeNull();
	});

	it("returns null for plain link (no type)", () => {
		expect(getEdgeLabel(makeEdge({}))).toBeNull();
	});

	it("returns null for link type", () => {
		expect(getEdgeLabel(makeEdge({ type: "link" }))).toBeNull();
	});

	it("relation takes precedence over type", () => {
		expect(getEdgeLabel(makeEdge({ type: "inheritance", relation: "custom" }))).toBe("custom");
	});
});

// ---------------------------------------------------------------------------
// collectLabelableEdges
// ---------------------------------------------------------------------------

describe("collectLabelableEdges", () => {
	it("returns empty for empty input", () => {
		expect(collectLabelableEdges([], baseCfg())).toEqual([]);
	});

	it("filters out edges with no label", () => {
		const edges = [makeEdge({ type: "link" })];
		expect(collectLabelableEdges(edges, baseCfg())).toEqual([]);
	});

	it("includes edges with a relation label", () => {
		const edges = [makeEdge({ relation: "owns" })];
		const result = collectLabelableEdges(edges, baseCfg());
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("owns");
	});

	it("includes typed edges with labels", () => {
		const edges = [makeEdge({ id: "e1", type: "inheritance" }), makeEdge({ id: "e2", type: "sibling" })];
		const result = collectLabelableEdges(edges, baseCfg());
		expect(result).toHaveLength(2);
		expect(result[0].label).toBe("is-a");
		expect(result[1].label).toBe("sibling");
	});

	it("respects edge type visibility config", () => {
		const edges = [makeEdge({ type: "inheritance" })];
		const result = collectLabelableEdges(edges, baseCfg({ showInheritance: false }));
		expect(result).toEqual([]);
	});

	it("mixes labelable and non-labelable edges", () => {
		const edges = [
			makeEdge({ id: "e1", type: "link" }),
			makeEdge({ id: "e2", type: "aggregation" }),
			makeEdge({ id: "e3", type: "has-tag" }),
		];
		const result = collectLabelableEdges(edges, baseCfg());
		expect(result).toHaveLength(1);
		expect(result[0].label).toBe("has-a");
	});
});

// ---------------------------------------------------------------------------
// trimLabelsByDegree
// ---------------------------------------------------------------------------

describe("trimLabelsByDegree", () => {
	const mkEntry = (id: string, src: string, tgt: string) => ({
		edge: makeEdge({ id, source: src, target: tgt, type: "inheritance" }),
		label: "is-a",
	});

	it("no-op when labelable count <= effectiveMax", () => {
		const items = [mkEntry("e1", "a", "b")];
		trimLabelsByDegree(items, 10, new Map());
		expect(items).toHaveLength(1);
	});

	it("truncates to effectiveMax", () => {
		const items = [mkEntry("e1", "a", "b"), mkEntry("e2", "c", "d"), mkEntry("e3", "e", "f")];
		trimLabelsByDegree(items, 2, new Map());
		expect(items).toHaveLength(2);
	});

	it("sorts by degree sum (highest first) before truncating", () => {
		const degrees = new Map([
			["a", 1],
			["b", 1],
			["c", 10],
			["d", 10],
			["e", 5],
			["f", 5],
		]);
		const items = [
			mkEntry("e1", "a", "b"), // degree 2
			mkEntry("e2", "c", "d"), // degree 20
			mkEntry("e3", "e", "f"), // degree 10
		];
		trimLabelsByDegree(items, 2, degrees);
		expect(items).toHaveLength(2);
		// Highest degree sum first
		expect(items[0].edge.id).toBe("e2");
		expect(items[1].edge.id).toBe("e3");
	});

	it("handles missing degrees gracefully", () => {
		const degrees = new Map([["a", 5]]);
		const items = [
			mkEntry("e1", "a", "b"), // degree 5+0=5
			mkEntry("e2", "c", "d"), // degree 0+0=0
		];
		trimLabelsByDegree(items, 1, degrees);
		expect(items).toHaveLength(1);
		expect(items[0].edge.id).toBe("e1");
	});

	it("effectiveMax=0 empties the array", () => {
		const items = [mkEntry("e1", "a", "b")];
		trimLabelsByDegree(items, 0, new Map());
		expect(items).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// seedNodeRects
// ---------------------------------------------------------------------------

describe("seedNodeRects", () => {
	const resolvePos = (ref: string | object) => {
		const map: Record<string, { x: number; y: number; id: string }> = {
			a: { x: 0, y: 0, id: "a" },
			b: { x: 100, y: 0, id: "b" },
			c: { x: 50, y: 50, id: "c" },
		};
		if (typeof ref === "string") return map[ref];
		return ref as { x: number; y: number; id: string };
	};

	it("returns empty for empty labelable", () => {
		expect(seedNodeRects([], resolvePos, null)).toEqual([]);
	});

	it("collects unique source/target node rects", () => {
		const labelable = [{ edge: makeEdge({ source: "a", target: "b" }) }];
		const rects = seedNodeRects(labelable, resolvePos, null);
		expect(rects).toHaveLength(2);
		expect(rects[0]).toEqual({ x: 0, y: 0, hw: 15, hh: 15 });
		expect(rects[1]).toEqual({ x: 100, y: 0, hw: 15, hh: 15 });
	});

	it("deduplicates nodes appearing in multiple edges", () => {
		const labelable = [
			{ edge: makeEdge({ id: "e1", source: "a", target: "b" }) },
			{ edge: makeEdge({ id: "e2", source: "a", target: "c" }) },
		];
		const rects = seedNodeRects(labelable, resolvePos, null);
		// a, b, c — a only once
		expect(rects).toHaveLength(3);
	});

	it("uses nodeRadii when provided", () => {
		const radii = new Map([
			["a", 30],
			["b", 20],
		]);
		const labelable = [{ edge: makeEdge({ source: "a", target: "b" }) }];
		const rects = seedNodeRects(labelable, resolvePos, radii);
		expect(rects[0].hw).toBe(30);
		expect(rects[1].hw).toBe(20);
	});

	it("skips nodes that resolvePos cannot find", () => {
		const labelable = [{ edge: makeEdge({ source: "a", target: "unknown" }) }];
		const rects = seedNodeRects(labelable, resolvePos, null);
		expect(rects).toHaveLength(1); // only "a"
	});
});

// ---------------------------------------------------------------------------
// computeLabelPosition
// ---------------------------------------------------------------------------

describe("computeLabelPosition", () => {
	const sp = { x: 0, y: 0 };
	const tp = { x: 100, y: 0 };

	it("center placement returns midpoint", () => {
		const pos = computeLabelPosition(sp, tp, "center", []);
		expect(pos.x).toBe(50);
		expect(pos.y).toBe(0);
	});

	it("offset placement shifts perpendicular to edge", () => {
		const pos = computeLabelPosition(sp, tp, "offset", []);
		expect(pos.x).toBe(50);
		// Perpendicular offset means y != 0
		expect(pos.y).not.toBe(0);
	});

	it("smart placement without collisions equals offset position", () => {
		const pos = computeLabelPosition(sp, tp, "smart", []);
		const offsetPos = computeLabelPosition(sp, tp, "offset", []);
		expect(pos.x).toBeCloseTo(offsetPos.x, 1);
		expect(pos.y).toBeCloseTo(offsetPos.y, 1);
	});

	it("smart placement shifts when collision exists at midpoint", () => {
		const blocking = [{ x: 50, y: -8, hw: 30, hh: 10 }];
		const pos = computeLabelPosition(sp, tp, "smart", blocking);
		// Should have shifted away from the blocking rect
		const offsetPos = computeLabelPosition(sp, tp, "offset", []);
		const dist = Math.sqrt((pos.x - offsetPos.x) ** 2 + (pos.y - offsetPos.y) ** 2);
		expect(dist).toBeGreaterThan(0);
	});

	it("smart placement adds rect to placedRects array", () => {
		const rects: { x: number; y: number; hw: number; hh: number }[] = [];
		computeLabelPosition(sp, tp, "smart", rects);
		expect(rects).toHaveLength(1);
	});

	it("center placement does not modify placedRects", () => {
		const rects: { x: number; y: number; hw: number; hh: number }[] = [];
		computeLabelPosition(sp, tp, "center", rects);
		expect(rects).toHaveLength(0);
	});

	it("handles zero-length edge (same source/target pos)", () => {
		const same = { x: 50, y: 50 };
		const pos = computeLabelPosition(same, same, "center", []);
		expect(pos.x).toBe(50);
		expect(pos.y).toBe(50);
	});

	it("handles diagonal edge", () => {
		const s = { x: 0, y: 0 };
		const t = { x: 100, y: 100 };
		const pos = computeLabelPosition(s, t, "center", []);
		expect(pos.x).toBe(50);
		expect(pos.y).toBe(50);
	});

	it("smart placement caps shift attempts (does not infinite loop)", () => {
		// Fill with many blocking rects so all shifts collide
		const rects = Array.from({ length: 10 }, (_, i) => ({
			x: 50,
			y: -8 - i * 12,
			hw: 200,
			hh: 200,
		}));
		// Should complete without hanging
		const pos = computeLabelPosition(sp, tp, "smart", rects);
		expect(typeof pos.x).toBe("number");
		expect(typeof pos.y).toBe("number");
	});
});
