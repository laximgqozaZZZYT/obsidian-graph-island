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

  it("bin: distributes into count bins", () => {
    const wide = new Map([["a", 0], ["b", 50], ["c", 100]]);
    const t = applyTransform(wide, { kind: "bin", count: 2 }, spacing);
    expect(t.get("a")).toBe(0); // bin 0: floor(0/100*2)=0
    expect(t.get("b")).toBe(spacing); // bin 1: floor(50/100*2)=1
    expect(t.get("c")).toBe(spacing); // bin 1: max clamped to count-1
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
});
