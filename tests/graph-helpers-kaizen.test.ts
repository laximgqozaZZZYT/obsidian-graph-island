import { describe, it, expect } from "vitest";
import {
  buildAdjFiltered,
  autoBundleStrength,
  hitTestTimelineBars,
  computeGaps,
  stringHash,
  parseGroupByFields,
  computeTimelineFilteredIds,
} from "../src/utils/graph-helpers";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string, tags?: string[]): GraphNode {
  return { id, label: id, x: 0, y: 0, tags, isTag: false } as GraphNode;
}
function mkEdge(src: string, tgt: string, type = "link"): GraphEdge {
  return { source: src, target: tgt, type } as GraphEdge;
}
function mkGraphData(nodes: GraphNode[], edges: GraphEdge[]): GraphData {
  return { nodes, edges } as GraphData;
}

// ===========================================================================
// buildAdjFiltered — edge type filtering for hover BFS
// ===========================================================================

describe("buildAdjFiltered", () => {
  const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
  const edges = [
    mkEdge("a", "b", "link"),
    mkEdge("b", "c", "semantic"),
    mkEdge("a", "c", "tag"),
  ];
  const gd = mkGraphData(nodes, edges);

  it("includes only link edges when only link is allowed", () => {
    const adj = buildAdjFiltered(gd, { link: true });
    expect(adj.get("a")?.has("b")).toBe(true);
    expect(adj.get("a")?.has("c")).toBe(false); // tag edge excluded
    expect(adj.get("b")?.has("c")).toBe(false); // semantic excluded
  });

  it("includes semantic edges when enabled", () => {
    const adj = buildAdjFiltered(gd, { semantic: true });
    expect(adj.get("b")?.has("c")).toBe(true);
    expect(adj.get("a")?.has("b")).toBe(false); // link not allowed
  });

  it("includes tag edges when enabled", () => {
    const adj = buildAdjFiltered(gd, { tag: true });
    expect(adj.get("a")?.has("c")).toBe(true);
    expect(adj.get("a")?.has("b")).toBe(false);
  });

  it("maps hasTag key to has-tag edge type", () => {
    const hasTagEdge = mkEdge("a", "b", "has-tag");
    const gd2 = mkGraphData(nodes, [hasTagEdge]);
    const adj = buildAdjFiltered(gd2, { hasTag: true });
    expect(adj.get("a")?.has("b")).toBe(true);
  });

  it("returns empty adjacency when no types are allowed", () => {
    const adj = buildAdjFiltered(gd, {});
    for (const [, neighbors] of adj) {
      expect(neighbors.size).toBe(0);
    }
  });

  it("returns empty adjacency when all types are false", () => {
    const adj = buildAdjFiltered(gd, { link: false, semantic: false, tag: false });
    for (const [, neighbors] of adj) {
      expect(neighbors.size).toBe(0);
    }
  });

  it("includes all edges when all types are allowed", () => {
    const adj = buildAdjFiltered(gd, { link: true, semantic: true, tag: true });
    expect(adj.get("a")?.size).toBe(2); // b (link) + c (tag)
    expect(adj.get("b")?.size).toBe(2); // a (link) + c (semantic)
    expect(adj.get("c")?.size).toBe(2); // b (semantic) + a (tag)
  });

  it("ignores unknown keys in allowedTypes", () => {
    const adj = buildAdjFiltered(gd, { madeUpType: true } as any);
    for (const [, neighbors] of adj) {
      expect(neighbors.size).toBe(0);
    }
  });

  it("handles empty graph", () => {
    const adj = buildAdjFiltered(mkGraphData([], []), { link: true });
    expect(adj.size).toBe(0);
  });

  it("defaults edgeless edges to link type", () => {
    const noTypeEdge = { source: "a", target: "b" } as GraphEdge;
    const gd2 = mkGraphData(nodes, [noTypeEdge]);
    const adj = buildAdjFiltered(gd2, { link: true });
    expect(adj.get("a")?.has("b")).toBe(true);
  });
});

// ===========================================================================
// autoBundleStrength — threshold-based bundle strength
// ===========================================================================

describe("autoBundleStrength", () => {
  it("returns 0.3 for small graphs (≤50 nodes)", () => {
    expect(autoBundleStrength(0)).toBe(0.3);
    expect(autoBundleStrength(1)).toBe(0.3);
    expect(autoBundleStrength(50)).toBe(0.3);
  });

  it("returns 0.5 for medium graphs (51-200 nodes)", () => {
    expect(autoBundleStrength(51)).toBe(0.5);
    expect(autoBundleStrength(100)).toBe(0.5);
    expect(autoBundleStrength(200)).toBe(0.5);
  });

  it("returns 0.7 for large graphs (201-500 nodes)", () => {
    expect(autoBundleStrength(201)).toBe(0.7);
    expect(autoBundleStrength(350)).toBe(0.7);
    expect(autoBundleStrength(500)).toBe(0.7);
  });

  it("returns 0.85 for very large graphs (>500 nodes)", () => {
    expect(autoBundleStrength(501)).toBe(0.85);
    expect(autoBundleStrength(2000)).toBe(0.85);
  });

  it("is monotonically non-decreasing", () => {
    let prev = autoBundleStrength(0);
    for (let n = 1; n <= 1000; n += 10) {
      const cur = autoBundleStrength(n);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

// ===========================================================================
// hitTestTimelineBars — timeline bar geometry hit-test
// ===========================================================================

describe("hitTestTimelineBars", () => {
  const bars = [
    { nodeId: "bar1", xStart: 10, xEnd: 50, yCenter: 100, barHeight: 20 },
    { nodeId: "bar2", xStart: 60, xEnd: 120, yCenter: 100, barHeight: 20 },
  ];

  it("returns nodeId when point is inside a bar", () => {
    expect(hitTestTimelineBars(bars, 30, 100)).toBe("bar1");
    expect(hitTestTimelineBars(bars, 90, 100)).toBe("bar2");
  });

  it("returns null when point is outside all bars", () => {
    expect(hitTestTimelineBars(bars, 55, 100)).toBeNull(); // gap between bars
    expect(hitTestTimelineBars(bars, 30, 200)).toBeNull(); // wrong Y
  });

  it("hits at exact boundary (inclusive)", () => {
    // xStart, xEnd, yCenter ± halfH boundaries
    expect(hitTestTimelineBars(bars, 10, 90)).toBe("bar1");  // left edge, top edge
    expect(hitTestTimelineBars(bars, 50, 110)).toBe("bar1"); // right edge, bottom edge
  });

  it("returns null for empty bars array", () => {
    expect(hitTestTimelineBars([], 30, 100)).toBeNull();
  });

  it("returns first match for overlapping bars", () => {
    const overlap = [
      { nodeId: "first", xStart: 0, xEnd: 100, yCenter: 50, barHeight: 40 },
      { nodeId: "second", xStart: 50, xEnd: 150, yCenter: 50, barHeight: 40 },
    ];
    // Point at x=75 overlaps both — should return first
    expect(hitTestTimelineBars(overlap, 75, 50)).toBe("first");
  });

  it("handles bars with zero height (no hit possible on Y)", () => {
    const thin = [{ nodeId: "thin", xStart: 0, xEnd: 100, yCenter: 50, barHeight: 0 }];
    expect(hitTestTimelineBars(thin, 50, 50)).toBe("thin"); // yCenter ± 0 = exact match
    expect(hitTestTimelineBars(thin, 50, 50.1)).toBeNull();
  });
});

// ===========================================================================
// computeGaps — structural gap detection
// ===========================================================================

describe("computeGaps", () => {
  it("finds gap between two nodes sharing a tag with a common neighbor", () => {
    const nodes = [mkNode("a", ["x"]), mkNode("b", ["x"]), mkNode("mid")];
    const adj = new Map<string, Set<string>>([
      ["a", new Set(["mid"])],
      ["b", new Set(["mid"])],
      ["mid", new Set(["a", "b"])],
    ]);
    const gaps = computeGaps(nodes, adj);
    expect(gaps.length).toBe(1);
    expect(gaps[0]).toEqual({ from: "a", to: "b" });
  });

  it("returns empty when nodes sharing a tag are directly connected", () => {
    const nodes = [mkNode("a", ["x"]), mkNode("b", ["x"])];
    const adj = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])],
    ]);
    expect(computeGaps(nodes, adj)).toEqual([]);
  });

  it("returns empty when no common neighbor exists", () => {
    const nodes = [mkNode("a", ["x"]), mkNode("b", ["x"])];
    const adj = new Map<string, Set<string>>([
      ["a", new Set()],
      ["b", new Set()],
    ]);
    expect(computeGaps(nodes, adj)).toEqual([]);
  });

  it("returns empty for nodes without tags", () => {
    const nodes = [mkNode("a"), mkNode("b")];
    const adj = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])],
    ]);
    expect(computeGaps(nodes, adj)).toEqual([]);
  });

  it("caps results at 20", () => {
    // Create 10 nodes all sharing tag "x", all connected to "hub" but not each other
    // 10 choose 2 = 45 possible gaps, but capped at 20
    const nodeList: { id: string; tags?: string[] }[] = [];
    const adj = new Map<string, Set<string>>();
    for (let i = 0; i < 10; i++) {
      const id = `n${i}`;
      nodeList.push({ id, tags: ["x"] });
      adj.set(id, new Set(["hub"]));
    }
    nodeList.push({ id: "hub" });
    adj.set("hub", new Set(nodeList.filter(n => n.id !== "hub").map(n => n.id)));

    const gaps = computeGaps(nodeList, adj);
    expect(gaps.length).toBe(20);
  });

  it("returns empty for empty input", () => {
    expect(computeGaps([], new Map())).toEqual([]);
  });
});

// ===========================================================================
// stringHash — deterministic string hashing
// ===========================================================================

describe("stringHash", () => {
  it("returns deterministic results", () => {
    const a = stringHash("hello", 100);
    const b = stringHash("hello", 100);
    expect(a).toBe(b);
  });

  it("returns value within [0, range)", () => {
    for (const str of ["", "a", "test", "long string with spaces"]) {
      const h = stringHash(str, 10);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(10);
    }
  });

  it("handles empty string", () => {
    const h = stringHash("", 100);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(100);
  });

  it("different strings produce different hashes (usually)", () => {
    const hashes = new Set<number>();
    for (let i = 0; i < 50; i++) {
      hashes.add(stringHash(`item_${i}`, 1000));
    }
    // With 50 items and range 1000, collision should be rare
    expect(hashes.size).toBeGreaterThan(40);
  });

  it("range=1 always returns 0", () => {
    expect(stringHash("anything", 1)).toBe(0);
    expect(stringHash("else", 1)).toBe(0);
  });
});

// ===========================================================================
// parseGroupByFields — groupBy expression → field names
// ===========================================================================

describe("parseGroupByFields", () => {
  it("null → []", () => expect(parseGroupByFields(null)).toEqual([]));
  it("undefined → []", () => expect(parseGroupByFields(undefined)).toEqual([]));
  it("empty string → []", () => expect(parseGroupByFields("")).toEqual([]));
  it('"none" → []', () => expect(parseGroupByFields("none")).toEqual([]));

  it("plain field", () => expect(parseGroupByFields("folder")).toEqual(["folder"]));
  it("field with :? suffix stripped", () => expect(parseGroupByFields("tag:?")).toEqual(["tag"]));
  it("field with whitespace", () => expect(parseGroupByFields("  category:?  ")).toEqual(["category"]));

  it("AND strips operator", () =>
    expect(parseGroupByFields("folder AND tag")).toEqual(["folder", "tag"]));
  it("OR strips operator", () =>
    expect(parseGroupByFields("folder:? OR category:?")).toEqual(["folder", "category"]));
  it("XOR strips operator", () =>
    expect(parseGroupByFields("tag XOR louvain")).toEqual(["tag", "louvain"]));
  it("case-insensitive operators", () =>
    expect(parseGroupByFields("folder or tag")).toEqual(["folder", "tag"]));
  it("multiple operators", () =>
    expect(parseGroupByFields("folder:? OR tag:? AND category:?")).toEqual(["folder", "tag", "category"]));
  it("louvain preserved", () =>
    expect(parseGroupByFields("louvain")).toEqual(["louvain"]));
  it("whitespace-only → []", () =>
    expect(parseGroupByFields("   ")).toEqual([]));
  it("operator-only → []", () =>
    expect(parseGroupByFields("AND OR")).toEqual([]));
});

// ===========================================================================
// computeTimelineFilteredIds — timeline range filter
// ===========================================================================

describe("computeTimelineFilteredIds", () => {
  const mkXNodes = (xs: number[]) =>
    xs.map((x, i) => ({ id: `n${i}`, x }));

  it("full range filters nothing", () => {
    const all = mkXNodes([0, 50, 100]);
    expect(computeTimelineFilteredIds(all, all, 0, 1).size).toBe(0);
  });

  it("first half filters right nodes", () => {
    const all = mkXNodes([0, 25, 50, 75, 100]);
    const filtered = computeTimelineFilteredIds(all, all, 0, 0.5);
    expect(filtered.has("n3")).toBe(true);  // x=75 out
    expect(filtered.has("n4")).toBe(true);  // x=100 out
    expect(filtered.has("n0")).toBe(false); // x=0 in
  });

  it("second half filters left nodes", () => {
    const all = mkXNodes([0, 25, 50, 75, 100]);
    const filtered = computeTimelineFilteredIds(all, all, 0.5, 1);
    expect(filtered.has("n0")).toBe(true);  // x=0 out
    expect(filtered.has("n3")).toBe(false); // x=75 in
  });

  it("narrow range filters most", () => {
    const all = mkXNodes([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const filtered = computeTimelineFilteredIds(all, all, 0.4, 0.6);
    expect(filtered.has("n4")).toBe(false); // x=40, in
    expect(filtered.has("n0")).toBe(true);  // x=0, out
    expect(filtered.has("n10")).toBe(true); // x=100, out
  });

  it("visible subset only checked", () => {
    const all = mkXNodes([0, 50, 100]);
    const visible = [{ id: "n0", x: 0 }];
    const filtered = computeTimelineFilteredIds(all, visible, 0.6, 1);
    expect(filtered.has("n0")).toBe(true);
    expect(filtered.size).toBe(1);
  });

  it("empty input → empty", () => {
    expect(computeTimelineFilteredIds([], [], 0, 1).size).toBe(0);
  });

  it("single node never filtered with full range", () => {
    const all = mkXNodes([42]);
    expect(computeTimelineFilteredIds(all, all, 0, 1).size).toBe(0);
  });

  it("all same x → zero span → empty", () => {
    const all = mkXNodes([5, 5, 5]);
    expect(computeTimelineFilteredIds(all, all, 0.2, 0.8).size).toBe(0);
  });

  it("negative coordinates", () => {
    const all = [{ id: "a", x: -100 }, { id: "b", x: 0 }, { id: "c", x: 100 }];
    const filtered = computeTimelineFilteredIds(all, all, 0, 0.5);
    expect(filtered.has("c")).toBe(true);  // out of range
    expect(filtered.has("a")).toBe(false); // in range
  });

  it("boundary inclusive", () => {
    const all = mkXNodes([0, 50, 100]);
    const filtered = computeTimelineFilteredIds(all, all, 0, 0.5);
    expect(filtered.has("n0")).toBe(false); // x=0 == tlMinX
    expect(filtered.has("n1")).toBe(false); // x=50 == tlMaxX
    expect(filtered.has("n2")).toBe(true);  // x=100 > tlMaxX
  });
});
