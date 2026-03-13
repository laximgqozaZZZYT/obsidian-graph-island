import { describe, it, expect } from "vitest";
import {
  resolveAxisValues,
  applyTransform,
  toCartesian,
  coordinateOffsets,
  type CoordinateContext,
} from "../src/layouts/coordinate-engine";
import { isExactPreset, ARRANGEMENT_PRESETS } from "../src/layouts/coordinate-presets";
import type { GraphNode, GraphEdge, CoordinateLayout } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, meta?: Record<string, unknown>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, meta };
}

function makeEdge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

function baseCtx(overrides?: Partial<CoordinateContext>): CoordinateContext {
  return {
    degrees: new Map(),
    edges: [],
    nodeSize: 8,
    nodeSpacing: 3.0,
    groupScale: 1.0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 1: resolveAxisValues
// ---------------------------------------------------------------------------

describe("resolveAxisValues", () => {
  const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
  const ctx = baseCtx();

  it("index: assigns 0..n-1", () => {
    const vals = resolveAxisValues(nodes, { kind: "index" }, ctx);
    expect(vals.get("a")).toBe(0);
    expect(vals.get("b")).toBe(1);
    expect(vals.get("c")).toBe(2);
  });

  it("const: all nodes get same value", () => {
    const vals = resolveAxisValues(nodes, { kind: "const", value: 5 }, ctx);
    for (const n of nodes) {
      expect(vals.get(n.id)).toBe(5);
    }
  });

  it("random: values are in [0, 1) and deterministic", () => {
    const vals = resolveAxisValues(nodes, { kind: "random", seed: 42 }, ctx);
    for (const [, v] of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // Deterministic: same seed → same values
    const vals2 = resolveAxisValues(nodes, { kind: "random", seed: 42 }, ctx);
    for (const [id, v] of vals) {
      expect(vals2.get(id)).toBe(v);
    }
  });

  it("metric:degree: reads from degrees map", () => {
    const ctx2 = baseCtx({ degrees: new Map([["a", 5], ["b", 2], ["c", 0]]) });
    const vals = resolveAxisValues(nodes, { kind: "metric", metric: "degree" }, ctx2);
    expect(vals.get("a")).toBe(5);
    expect(vals.get("b")).toBe(2);
    expect(vals.get("c")).toBe(0);
  });

  it("metric:in-degree: counts incoming edges", () => {
    const edges = [makeEdge("a", "b"), makeEdge("c", "b"), makeEdge("a", "c")];
    const ctx2 = baseCtx({ edges });
    const vals = resolveAxisValues(nodes, { kind: "metric", metric: "in-degree" }, ctx2);
    expect(vals.get("a")).toBe(0);
    expect(vals.get("b")).toBe(2);
    expect(vals.get("c")).toBe(1);
  });

  it("metric:out-degree: counts outgoing edges", () => {
    const edges = [makeEdge("a", "b"), makeEdge("a", "c"), makeEdge("b", "c")];
    const ctx2 = baseCtx({ edges });
    const vals = resolveAxisValues(nodes, { kind: "metric", metric: "out-degree" }, ctx2);
    expect(vals.get("a")).toBe(2);
    expect(vals.get("b")).toBe(1);
    expect(vals.get("c")).toBe(0);
  });

  it("metric:bfs-depth: computes BFS from highest-degree node", () => {
    // a-b-c chain, a has highest degree
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
    const ctx2 = baseCtx({
      degrees: new Map([["a", 3], ["b", 2], ["c", 1]]),
      edges,
    });
    const vals = resolveAxisValues(nodes, { kind: "metric", metric: "bfs-depth" }, ctx2);
    expect(vals.get("a")).toBe(0);
    expect(vals.get("b")).toBe(1);
    expect(vals.get("c")).toBe(2);
  });

  it("metric:sibling-rank: ranks within each BFS depth level", () => {
    // Star: a → b, a → c, a → d (b,c,d all at depth 1)
    const d = makeNode("d");
    const nodesWithD = [...nodes, d];
    const edges = [makeEdge("a", "b"), makeEdge("a", "c"), makeEdge("a", "d")];
    const ctx2 = baseCtx({
      degrees: new Map([["a", 3], ["b", 1], ["c", 1], ["d", 1]]),
      edges,
    });
    const vals = resolveAxisValues(nodesWithD, { kind: "metric", metric: "sibling-rank" }, ctx2);
    expect(vals.get("a")).toBe(0); // depth 0, only node → rank 0
    // b, c, d are all at depth 1, ranks 0,1,2 in some order
    const ranks = [vals.get("b")!, vals.get("c")!, vals.get("d")!].sort();
    expect(ranks).toEqual([0, 1, 2]);
  });

  it("property: numeric values parsed correctly", () => {
    const nodes2 = [
      makeNode("a", { score: 10 }),
      makeNode("b", { score: 20 }),
      makeNode("c", { score: 5 }),
    ];
    const vals = resolveAxisValues(nodes2, { kind: "property", key: "score" }, ctx);
    expect(vals.get("a")).toBe(10);
    expect(vals.get("b")).toBe(20);
    expect(vals.get("c")).toBe(5);
  });

  it("property: non-numeric values → lexicographic index", () => {
    const nodes2 = [
      makeNode("a", { color: "red" }),
      makeNode("b", { color: "blue" }),
      makeNode("c", { color: "green" }),
    ];
    const vals = resolveAxisValues(nodes2, { kind: "property", key: "color" }, ctx);
    // Sorted: blue=0, green=1, red=2
    expect(vals.get("b")).toBe(0); // blue
    expect(vals.get("c")).toBe(1); // green
    expect(vals.get("a")).toBe(2); // red
  });

  // --- field source (unified node attribute access) ---

  it("field:category: resolves category values", () => {
    const nodes2 = [
      makeNode("a", {}),
      makeNode("b", {}),
      makeNode("c", {}),
    ];
    nodes2[0].category = "protagonist";
    nodes2[1].category = "antagonist";
    nodes2[2].category = "protagonist";
    const vals = resolveAxisValues(nodes2, { kind: "field", field: "category" }, ctx);
    // Lex sort: antagonist=0, protagonist=1
    expect(vals.get("b")).toBe(0);
    expect(vals.get("a")).toBe(1);
    expect(vals.get("c")).toBe(1);
  });

  it("field:folder: groups by folder path", () => {
    const nodes2 = [
      makeNode("a", {}),
      makeNode("b", {}),
      makeNode("c", {}),
    ];
    nodes2[0].filePath = "characters/alice.md";
    nodes2[1].filePath = "locations/town.md";
    nodes2[2].filePath = "characters/bob.md";
    const vals = resolveAxisValues(nodes2, { kind: "field", field: "folder" }, ctx);
    // Lex sort: characters=0, locations=1
    expect(vals.get("a")).toBe(0);
    expect(vals.get("c")).toBe(0);
    expect(vals.get("b")).toBe(1);
  });

  it("field:isTag: boolean field → 0/1 index", () => {
    const nodes2 = [makeNode("a"), makeNode("b"), makeNode("c")];
    nodes2[1].isTag = true;
    const vals = resolveAxisValues(nodes2, { kind: "field", field: "isTag" }, ctx);
    // "false"=0, "true"=1
    expect(vals.get("a")).toBe(0);
    expect(vals.get("b")).toBe(1);
    expect(vals.get("c")).toBe(0);
  });

  it("field with frontmatter: reads arbitrary meta property", () => {
    const nodes2 = [
      makeNode("a", { node_type: "character" }),
      makeNode("b", { node_type: "location" }),
      makeNode("c", { node_type: "character" }),
    ];
    const vals = resolveAxisValues(nodes2, { kind: "field", field: "node_type" }, ctx);
    // Lex sort: character=0, location=1
    expect(vals.get("a")).toBe(0);
    expect(vals.get("b")).toBe(1);
    expect(vals.get("c")).toBe(0);
  });

  // --- hop source ---

  it("hop: BFS distance from specified node", () => {
    // a—b—c chain
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
    const ctx2 = baseCtx({ edges, degrees: new Map([["a", 1], ["b", 2], ["c", 1]]) });
    const vals = resolveAxisValues(nodes, { kind: "hop", from: "a" }, ctx2);
    expect(vals.get("a")).toBe(0);
    expect(vals.get("b")).toBe(1);
    expect(vals.get("c")).toBe(2);
  });

  it("hop: respects maxDepth", () => {
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
    const ctx2 = baseCtx({ edges, degrees: new Map([["a", 1], ["b", 2], ["c", 1]]) });
    const vals = resolveAxisValues(nodes, { kind: "hop", from: "a", maxDepth: 1 }, ctx2);
    expect(vals.get("a")).toBe(0);
    expect(vals.get("b")).toBe(1);
    // c is unreachable within maxDepth=1 → gets fallback value
    expect(vals.get("c")).toBeGreaterThan(1);
  });

  it("hop: no matching root produces finite fallback values (no Infinity)", () => {
    // 'zzz' matches no node — previously produced Infinity when maxDepth=Infinity
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
    const ctx2 = baseCtx({ edges, degrees: new Map([["a", 1], ["b", 2], ["c", 1]]) });
    const vals = resolveAxisValues(nodes, { kind: "hop", from: "zzz" }, ctx2);
    for (const [, v] of vals) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("hop: substring match on node id", () => {
    const edges = [makeEdge("a", "b"), makeEdge("b", "c")];
    const ctx2 = baseCtx({ edges, degrees: new Map([["a", 1], ["b", 2], ["c", 1]]) });
    // "a" is a substring of node id "a" — should match
    const vals = resolveAxisValues(nodes, { kind: "hop", from: "a" }, ctx2);
    expect(vals.get("a")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 2: applyTransform
// ---------------------------------------------------------------------------

describe("applyTransform", () => {
  const raw = new Map([["a", 0], ["b", 1], ["c", 2]]);
  const spacing = 48; // 8 * 2 * 3

  it("linear: value × scale × spacing", () => {
    const t = applyTransform(raw, { kind: "linear", scale: 2 }, spacing);
    expect(t.get("a")).toBe(0);
    expect(t.get("b")).toBe(2 * spacing);
    expect(t.get("c")).toBe(4 * spacing);
  });

  it("linear: negative scale inverts", () => {
    const t = applyTransform(raw, { kind: "linear", scale: -1 }, spacing);
    expect(t.get("b")).toBe(-spacing);
    expect(t.get("c")).toBe(-2 * spacing);
  });

  it("bin: distributes into count bins (1-indexed for polar safety)", () => {
    const wide = new Map([["a", 0], ["b", 50], ["c", 100]]);
    const t = applyTransform(wide, { kind: "bin", count: 2 }, spacing);
    // (bin+1)*spacing ensures non-zero radius for polar coordinate layouts
    expect(t.get("a")).toBe(1 * spacing); // bin 0 → (0+1)*spacing
    expect(t.get("b")).toBe(2 * spacing); // bin 1 → (1+1)*spacing
    expect(t.get("c")).toBe(2 * spacing); // bin 1 (clamped) → (1+1)*spacing
  });

  it("date-to-index: sorts and assigns sequential indices", () => {
    const dates = new Map([["a", 3], ["b", 1], ["c", 2]]);
    const t = applyTransform(dates, { kind: "date-to-index" }, spacing);
    // Sorted order: b(1), c(2), a(3)
    expect(t.get("b")).toBe(0);
    expect(t.get("c")).toBe(spacing);
    expect(t.get("a")).toBe(2 * spacing);
  });

  it("golden-angle: multiplies by golden angle constant", () => {
    const t = applyTransform(raw, { kind: "golden-angle" }, spacing);
    const GA = 2.39996322972865332;
    expect(t.get("a")).toBeCloseTo(0);
    expect(t.get("b")).toBeCloseTo(GA);
    expect(t.get("c")).toBeCloseTo(2 * GA);
  });

  it("even-divide: distributes over totalRange", () => {
    const t = applyTransform(raw, { kind: "even-divide", totalRange: 360 }, spacing);
    const fullRad = 2 * Math.PI;
    // 3 nodes → divisor=3, values: 0/3, 1/3, 2/3 of full circle
    expect(t.get("a")).toBeCloseTo(0);
    expect(t.get("b")).toBeCloseTo(fullRad / 3);
    expect(t.get("c")).toBeCloseTo((2 * fullRad) / 3);
  });

  it("stack-avoid: spreads nodes sharing same other-axis bin", () => {
    const vals = new Map([["a", 0], ["b", 0], ["c", 0]]);
    const otherAxis = new Map([["a", 0], ["b", 0], ["c", 0]]);
    const t = applyTransform(vals, { kind: "stack-avoid" }, spacing, otherAxis);
    // 3 nodes in same bin → spread: -1*sp, 0, 1*sp
    const sorted = [...t.values()].sort((a, b) => a - b);
    expect(sorted[0]).toBeLessThan(0);
    expect(sorted[1]).toBeCloseTo(0);
    expect(sorted[2]).toBeGreaterThan(0);
  });

  it("curve:archimedean: values increase with t", () => {
    const t = applyTransform(raw, { kind: "curve", curve: "archimedean", scale: 1 }, spacing);
    // a=0 (t=0), b=1 (t=0.5), c=2 (t=1.0)
    // Archimedean: a + b*t → monotonically increasing
    expect(t.get("a")!).toBeLessThan(t.get("b")!);
    expect(t.get("b")!).toBeLessThan(t.get("c")!);
  });

  it("curve:rose: produces non-linear values", () => {
    const vals = new Map([["a", 0], ["b", 1], ["c", 2], ["d", 3], ["e", 4]]);
    const t = applyTransform(vals, { kind: "curve", curve: "rose", params: { k: 3, a: 1 }, scale: 1 }, spacing);
    expect(t.size).toBe(5);
    // Rose curve produces oscillating values — not all should be equal
    const values = [...t.values()];
    const allSame = values.every(v => Math.abs(v - values[0]) < 0.001);
    expect(allSame).toBe(false);
  });

  it("curve: unknown curve falls back to linear", () => {
    const t = applyTransform(raw, { kind: "curve", curve: "nonexistent" as any, scale: 1 }, spacing);
    // Should still produce values for all nodes
    expect(t.size).toBe(3);
  });

  it("expression: simple 't' identity", () => {
    const t = applyTransform(raw, { kind: "expression", expr: "t", scale: 1 }, spacing);
    // t is normalized 0..1, so a=0, b=0.5, c=1.0 (times spacing)
    expect(t.get("a")!).toBeCloseTo(0);
    expect(t.get("b")!).toBeCloseTo(0.5 * spacing);
    expect(t.get("c")!).toBeCloseTo(1.0 * spacing);
  });

  it("expression: sin(t * pi)", () => {
    const vals = new Map([["a", 0], ["b", 1], ["c", 2]]);
    const t = applyTransform(vals, { kind: "expression", expr: "sin(t * pi)", scale: 1 }, spacing);
    // t=0 → sin(0)=0, t=0.5 → sin(π/2)=1, t=1 → sin(π)≈0
    expect(t.get("a")!).toBeCloseTo(0);
    expect(t.get("b")!).toBeCloseTo(1.0 * spacing);
    expect(t.get("c")!).toBeCloseTo(0, 5);
  });

  it("expression: invalid expression falls back to linear", () => {
    const t = applyTransform(raw, { kind: "expression", expr: "invalid!!!", scale: 1 }, spacing);
    // Should still produce values for all nodes (linear fallback)
    expect(t.size).toBe(3);
    expect(t.get("a")).toBe(0);
  });

  it("expression: scale parameter multiplies result", () => {
    const t = applyTransform(raw, { kind: "expression", expr: "t", scale: 2 }, spacing);
    expect(t.get("c")!).toBeCloseTo(2.0 * spacing);
  });

  // --- shape-fill transforms ---

  describe("shape-fill", () => {
    const ids25 = Array.from({ length: 25 }, (_, i) => [`n${i}`, i] as [string, number]);
    const raw25 = new Map(ids25);

    it("square: all nodes get coordinates", () => {
      const t = applyTransform(raw25, { kind: "shape-fill", shape: "square", axis: 1 }, spacing);
      expect(t.size).toBe(25);
    });

    it("square: x values cluster into ceil(sqrt(n)) discrete columns", () => {
      const t = applyTransform(raw25, { kind: "shape-fill", shape: "square", axis: 1 }, spacing);
      const cols = new Set([...t.values()].map(v => Math.round(v * 1000) / 1000));
      // ceil(sqrt(25)) = 5 columns
      expect(cols.size).toBe(5);
    });

    it("square: axis 2 returns y coordinates", () => {
      const tx = applyTransform(raw25, { kind: "shape-fill", shape: "square", axis: 1 }, spacing);
      const ty = applyTransform(raw25, { kind: "shape-fill", shape: "square", axis: 2 }, spacing);
      // x and y should not be identical for all nodes (grid has distinct rows and columns)
      let anyDiff = false;
      for (const [id] of raw25) {
        if (Math.abs(tx.get(id)! - ty.get(id)!) > 0.001) { anyDiff = true; break; }
      }
      expect(anyDiff).toBe(true);
    });

    it("triangle: all nodes get coordinates", () => {
      const raw10 = new Map(Array.from({ length: 10 }, (_, i) => [`n${i}`, i] as [string, number]));
      const t = applyTransform(raw10, { kind: "shape-fill", shape: "triangle", axis: 1 }, spacing);
      expect(t.size).toBe(10);
    });

    it("triangle: x values centered per row, rows have increasing node count", () => {
      // 10 nodes → rows: 1, 2, 3, 4 (=10 total)
      const raw10 = new Map(Array.from({ length: 10 }, (_, i) => [`n${i}`, i] as [string, number]));
      const ty = applyTransform(raw10, { kind: "shape-fill", shape: "triangle", axis: 2 }, spacing);
      // Should have 4 distinct y values (4 rows)
      const yVals = new Set([...ty.values()].map(v => Math.round(v * 1000) / 1000));
      expect(yVals.size).toBe(4);
    });

    it("hexagon: all nodes get coordinates", () => {
      const raw7 = new Map(Array.from({ length: 7 }, (_, i) => [`n${i}`, i] as [string, number]));
      const t = applyTransform(raw7, { kind: "shape-fill", shape: "hexagon", axis: 1 }, spacing);
      expect(t.size).toBe(7);
    });

    it("hexagon: center node at (0,0), ring 1 has 6 nodes", () => {
      const raw7 = new Map(Array.from({ length: 7 }, (_, i) => [`n${i}`, i] as [string, number]));
      const tx = applyTransform(raw7, { kind: "shape-fill", shape: "hexagon", axis: 1 }, spacing);
      const ty = applyTransform(raw7, { kind: "shape-fill", shape: "hexagon", axis: 2 }, spacing);
      // First node (center) should be at (0,0)
      expect(tx.get("n0")).toBeCloseTo(0);
      expect(ty.get("n0")).toBeCloseTo(0);
      // Ring 1 nodes should have non-zero distance from center
      for (let i = 1; i < 7; i++) {
        const x = tx.get(`n${i}`)!;
        const y = ty.get(`n${i}`)!;
        const dist = Math.sqrt(x * x + y * y);
        expect(dist).toBeGreaterThan(0);
      }
    });

    it("diamond: all nodes get coordinates", () => {
      const t = applyTransform(raw25, { kind: "shape-fill", shape: "diamond", axis: 1 }, spacing);
      expect(t.size).toBe(25);
    });

    it("diamond: coordinates are rotated (not axis-aligned grid)", () => {
      const tx = applyTransform(raw25, { kind: "shape-fill", shape: "diamond", axis: 1 }, spacing);
      const ty = applyTransform(raw25, { kind: "shape-fill", shape: "diamond", axis: 2 }, spacing);
      // In a diamond (rotated grid), most nodes should not be on the same x or y line
      const xVals = new Set([...tx.values()].map(v => Math.round(v * 100) / 100));
      const yVals = new Set([...ty.values()].map(v => Math.round(v * 100) / 100));
      // A rotated 5x5 grid produces more distinct x/y values than an axis-aligned one
      expect(xVals.size).toBeGreaterThan(5);
      expect(yVals.size).toBeGreaterThan(5);
    });

    it("circle: all nodes get coordinates", () => {
      const t = applyTransform(raw25, { kind: "shape-fill", shape: "circle", axis: 1 }, spacing);
      expect(t.size).toBe(25);
    });

    it("circle: radii increase with index (sqrt pattern)", () => {
      const tx = applyTransform(raw25, { kind: "shape-fill", shape: "circle", axis: 1 }, spacing);
      const ty = applyTransform(raw25, { kind: "shape-fill", shape: "circle", axis: 2 }, spacing);
      // Compute radii for first and last few nodes
      const radii: number[] = [];
      for (let i = 0; i < 25; i++) {
        const x = tx.get(`n${i}`)!;
        const y = ty.get(`n${i}`)!;
        radii.push(Math.sqrt(x * x + y * y));
      }
      // Average radius of last 5 nodes should be greater than average of first 5
      const avgFirst5 = radii.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const avgLast5 = radii.slice(20).reduce((a, b) => a + b, 0) / 5;
      expect(avgLast5).toBeGreaterThan(avgFirst5);
    });

    it("shape-fill: single node produces (0,0)", () => {
      const raw1 = new Map([["only", 0]]);
      const tx = applyTransform(raw1, { kind: "shape-fill", shape: "square", axis: 1 }, spacing);
      const ty = applyTransform(raw1, { kind: "shape-fill", shape: "square", axis: 2 }, spacing);
      expect(tx.get("only")).toBeCloseTo(0);
      expect(ty.get("only")).toBeCloseTo(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 3: toCartesian
// ---------------------------------------------------------------------------

describe("toCartesian", () => {
  it("cartesian: dx=axis1, dy=axis2, centroid at origin", () => {
    const a1 = new Map([["a", 0], ["b", 100]]);
    const a2 = new Map([["a", 0], ["b", 200]]);
    const result = toCartesian(a1, a2, "cartesian");
    // Centroid: (50, 100)
    expect(result.get("a")).toEqual({ dx: -50, dy: -100 });
    expect(result.get("b")).toEqual({ dx: 50, dy: 100 });
  });

  it("polar: axis1=r, axis2=θ", () => {
    const a1 = new Map([["a", 100]]);
    const a2 = new Map([["a", 0]]); // angle=0 → (100, 0)
    const result = toCartesian(a1, a2, "polar");
    // Single node → centroid = itself → (0, 0)
    expect(result.get("a")!.dx).toBeCloseTo(0);
    expect(result.get("a")!.dy).toBeCloseTo(0);
  });

  it("polar: two nodes at opposite angles", () => {
    const a1 = new Map([["a", 100], ["b", 100]]);
    const a2 = new Map([["a", 0], ["b", Math.PI]]);
    const result = toCartesian(a1, a2, "polar");
    // a: (100,0), b: (-100,0), centroid: (0,0)
    expect(result.get("a")!.dx).toBeCloseTo(100);
    expect(result.get("b")!.dx).toBeCloseTo(-100);
  });
});

// ---------------------------------------------------------------------------
// isExactPreset
// ---------------------------------------------------------------------------

describe("isExactPreset", () => {
  it("matches spiral preset", () => {
    expect(isExactPreset(ARRANGEMENT_PRESETS.spiral)).toBe(true);
  });

  it("matches all presets", () => {
    for (const preset of Object.values(ARRANGEMENT_PRESETS)) {
      expect(isExactPreset(preset)).toBe(true);
    }
  });

  it("returns false for modified preset", () => {
    const modified: CoordinateLayout = {
      ...ARRANGEMENT_PRESETS.spiral,
      system: "cartesian", // changed from polar
    };
    expect(isExactPreset(modified)).toBe(false);
  });

  it("returns false for custom axis source", () => {
    const custom: CoordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "golden-angle" } },
      axis2: { source: { kind: "index" }, transform: { kind: "golden-angle" } },
      perGroup: true,
    };
    expect(isExactPreset(custom)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// coordinateOffsets — integration
// ---------------------------------------------------------------------------

describe("coordinateOffsets", () => {
  const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
  const edges = [makeEdge("a", "b"), makeEdge("b", "c"), makeEdge("c", "d")];
  const degrees = new Map([["a", 1], ["b", 2], ["c", 2], ["d", 1]]);

  it("returns offsets for all members", () => {
    const layout: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: -1 } },
      perGroup: true,
    };
    const ctx = baseCtx({ degrees, edges });
    const result = coordinateOffsets(nodes, degrees, edges, layout, ctx);
    expect(result.offsets.size).toBe(4);
    for (const n of nodes) {
      expect(result.offsets.has(n.id)).toBe(true);
    }
  });

  it("centroid is approximately at origin", () => {
    const layout: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    const ctx = baseCtx({ degrees, edges });
    const result = coordinateOffsets(nodes, degrees, edges, layout, ctx);
    let cx = 0, cy = 0;
    for (const { dx, dy } of result.offsets.values()) {
      cx += dx;
      cy += dy;
    }
    cx /= result.offsets.size;
    cy /= result.offsets.size;
    expect(Math.abs(cx)).toBeLessThan(0.01);
    expect(Math.abs(cy)).toBeLessThan(0.01);
  });

  it("polar system produces different layout than cartesian for same sources", () => {
    const cartesian: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    const polar: CoordinateLayout = {
      ...cartesian,
      system: "polar",
    };
    const ctx = baseCtx({ degrees, edges });
    const r1 = coordinateOffsets(nodes, degrees, edges, cartesian, ctx);
    const r2 = coordinateOffsets(nodes, degrees, edges, polar, ctx);
    // At least one node should have different offsets
    let anyDiff = false;
    for (const n of nodes) {
      const o1 = r1.offsets.get(n.id)!;
      const o2 = r2.offsets.get(n.id)!;
      if (Math.abs(o1.dx - o2.dx) > 0.1 || Math.abs(o1.dy - o2.dy) > 0.1) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });

  it("changing axis source changes node positions", () => {
    const byIndex: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    const byDegree: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    const ctx = baseCtx({ degrees, edges });
    const r1 = coordinateOffsets(nodes, degrees, edges, byIndex, ctx);
    const r2 = coordinateOffsets(nodes, degrees, edges, byDegree, ctx);
    // "a" and "d" have same degree(1) but different index, so x should differ
    const a1 = r1.offsets.get("a")!;
    const a2 = r2.offsets.get("a")!;
    expect(a1.dx).not.toBeCloseTo(a2.dx, 0);
  });

  it("returns CoordinateGuide with correct type", () => {
    const layout: CoordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "golden-angle" } },
      perGroup: true,
    };
    const ctx = baseCtx({ degrees, edges });
    const result = coordinateOffsets(nodes, degrees, edges, layout, ctx);
    expect(result.guide).toBeDefined();
    expect(result.guide!.type).toBe("coordinate");
  });

  it("empty members returns empty offsets", () => {
    const layout: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    const ctx = baseCtx();
    const result = coordinateOffsets([], new Map(), [], layout, ctx);
    expect(result.offsets.size).toBe(0);
  });

  it("cartesian layout produces guide with bounds (xMin <= xMax, yMin <= yMax)", () => {
    const layout: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: -1 } },
      perGroup: true,
    };
    const ctx = baseCtx({ degrees, edges });
    const result = coordinateOffsets(nodes, degrees, edges, layout, ctx);
    expect(result.guide).toBeDefined();
    expect(result.guide!.bounds).toBeDefined();
    const b = result.guide!.bounds!;
    expect(b.xMin).toBeLessThanOrEqual(b.xMax);
    expect(b.yMin).toBeLessThanOrEqual(b.yMax);
    expect(b.maxR).toBeUndefined();
  });

  it("polar layout produces guide with bounds including maxR > 0", () => {
    const layout: CoordinateLayout = {
      system: "polar",
      axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "golden-angle" } },
      perGroup: true,
    };
    const ctx = baseCtx({ degrees, edges });
    const result = coordinateOffsets(nodes, degrees, edges, layout, ctx);
    expect(result.guide).toBeDefined();
    expect(result.guide!.bounds).toBeDefined();
    const b = result.guide!.bounds!;
    expect(b.xMin).toBeLessThanOrEqual(b.xMax);
    expect(b.yMin).toBeLessThanOrEqual(b.yMax);
    expect(b.maxR).toBeDefined();
    expect(b.maxR!).toBeGreaterThan(0);
  });

  it("empty node list produces no guide (early return)", () => {
    const layout: CoordinateLayout = {
      system: "cartesian",
      axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
      perGroup: true,
    };
    const ctx = baseCtx();
    const result = coordinateOffsets([], new Map(), [], layout, ctx);
    expect(result.offsets.size).toBe(0);
    expect(result.guide).toBeUndefined();
  });
});
