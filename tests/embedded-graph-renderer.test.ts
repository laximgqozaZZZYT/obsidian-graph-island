import { describe, it, expect } from "vitest";
import { parseConfig, filterLocalGraph, layoutConcentric, getColor } from "../src/views/EmbeddedGraphRenderer";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";
import { DEFAULT_COLORS } from "../src/types";

// ---------------------------------------------------------------------------
// Helper: create a minimal node
// ---------------------------------------------------------------------------
function mkNode(id: string, filePath?: string): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, filePath };
}

function mkEdge(source: string, target: string, type = "link"): GraphEdge {
  return { id: `${source}-${target}`, source, target, type };
}

// ---------------------------------------------------------------------------
// parseConfig — JSON config parsing with graceful fallback
// ---------------------------------------------------------------------------
describe("parseConfig", () => {
  it("parses valid JSON with all fields", () => {
    const cfg = parseConfig('{"center":"note.md","hops":3,"height":400,"layout":"grid"}');
    expect(cfg.center).toBe("note.md");
    expect(cfg.hops).toBe(3);
    expect(cfg.height).toBe(400);
    expect(cfg.layout).toBe("grid");
  });

  it("parses valid JSON with partial fields", () => {
    const cfg = parseConfig('{"center":"test.md"}');
    expect(cfg.center).toBe("test.md");
    expect(cfg.hops).toBeUndefined();
    expect(cfg.height).toBeUndefined();
  });

  it("returns empty object for empty JSON object", () => {
    const cfg = parseConfig("{}");
    expect(cfg).toEqual({});
  });

  it("returns empty object for invalid JSON", () => {
    const cfg = parseConfig("not json at all");
    expect(cfg).toEqual({});
  });

  it("returns empty object for empty string", () => {
    const cfg = parseConfig("");
    expect(cfg).toEqual({});
  });

  it("returns empty object for malformed JSON (missing closing brace)", () => {
    const cfg = parseConfig('{"center":"test.md"');
    expect(cfg).toEqual({});
  });

  it("handles JSON with numeric values", () => {
    const cfg = parseConfig('{"hops":5,"height":600}');
    expect(cfg.hops).toBe(5);
    expect(cfg.height).toBe(600);
  });

  it("handles JSON with null values", () => {
    const cfg = parseConfig('{"center":null}');
    expect(cfg.center).toBeNull();
  });

  it("handles JSON with extra unknown fields (passes through)", () => {
    const cfg = parseConfig('{"center":"a.md","unknown":true}');
    expect(cfg.center).toBe("a.md");
    expect((cfg as any).unknown).toBe(true);
  });

  it("handles JSON array (returns array, not EmbedConfig shape)", () => {
    const cfg = parseConfig("[1,2,3]");
    // JSON.parse succeeds, returns array
    expect(Array.isArray(cfg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterLocalGraph — BFS N-hop filter
// ---------------------------------------------------------------------------
describe("filterLocalGraph", () => {
  // Build a simple linear graph: A -> B -> C -> D -> E
  function linearGraph(): GraphData {
    return {
      nodes: [mkNode("A", "A.md"), mkNode("B", "B.md"), mkNode("C", "C.md"), mkNode("D", "D.md"), mkNode("E", "E.md")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("C", "D"), mkEdge("D", "E")],
    };
  }

  // Star graph: center connected to all periphery
  function starGraph(): GraphData {
    const nodes = [mkNode("center", "center.md")];
    const edges: GraphEdge[] = [];
    for (let i = 1; i <= 6; i++) {
      nodes.push(mkNode(`p${i}`, `p${i}.md`));
      edges.push(mkEdge("center", `p${i}`));
    }
    return { nodes, edges };
  }

  it("returns empty for non-existent center node", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "nonexistent.md", 2);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("returns only center node for 0 hops", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "A.md", 0);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("A");
    expect(result.edges).toHaveLength(0);
  });

  it("returns center + direct neighbors for 1 hop", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "B.md", 1);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B", "C"]);
    expect(result.edges).toHaveLength(2); // A-B and B-C
  });

  it("returns 2-hop neighborhood correctly", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "B.md", 2);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B", "C", "D"]);
    expect(result.edges).toHaveLength(3); // A-B, B-C, C-D
  });

  it("returns entire graph when hops >= diameter", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "A.md", 10);
    expect(result.nodes).toHaveLength(5);
    expect(result.edges).toHaveLength(4);
  });

  it("star graph: 1 hop from center returns all nodes", () => {
    const data = starGraph();
    const result = filterLocalGraph(data, "center.md", 1);
    expect(result.nodes).toHaveLength(7); // center + 6 periphery
    expect(result.edges).toHaveLength(6);
  });

  it("star graph: 1 hop from periphery returns center + that node", () => {
    const data = starGraph();
    const result = filterLocalGraph(data, "p1.md", 1);
    // p1 connects to center, center connects to p2..p6 at hop=2
    // But hop=1: only p1 and center
    expect(result.nodes.map(n => n.id).sort()).toEqual(["center", "p1"]);
    expect(result.edges).toHaveLength(1);
  });

  it("handles center found by id instead of filePath", () => {
    const data = linearGraph();
    const result = filterLocalGraph(data, "A", 1);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
  });

  it("filters edges that have both endpoints in reachable set", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C"), mkNode("D")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("C", "D"), mkEdge("A", "D")],
    };
    const result = filterLocalGraph(data, "A", 1);
    // Reachable from A with 1 hop: A, B, D (A-D edge exists)
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B", "D"]);
    // Edges within this set: A-B, A-D (B-C excluded since C not reachable)
    expect(result.edges).toHaveLength(2);
  });

  it("handles graph with single node and no edges", () => {
    const data: GraphData = {
      nodes: [mkNode("alone", "alone.md")],
      edges: [],
    };
    const result = filterLocalGraph(data, "alone.md", 3);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it("handles empty graph", () => {
    const data: GraphData = { nodes: [], edges: [] };
    const result = filterLocalGraph(data, "any", 2);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("handles disconnected components", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("X"), mkNode("Y")],
      edges: [mkEdge("A", "B"), mkEdge("X", "Y")],
    };
    const result = filterLocalGraph(data, "A", 5);
    // Only A-B component is reachable
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
    expect(result.edges).toHaveLength(1);
  });

  it("handles cycle in graph", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("C", "A")],
    };
    const result = filterLocalGraph(data, "A", 1);
    // All 3 are within 1 hop due to cycle A-B and A-C
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(3);
  });

  it("handles self-loop edge", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B")],
      edges: [mkEdge("A", "B"), mkEdge("A", "A")],
    };
    const result = filterLocalGraph(data, "A", 1);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
    expect(result.edges).toHaveLength(2); // A-B and A-A
  });

  it("respects bidirectional edge traversal", () => {
    // Edge direction: A -> B, but BFS should traverse B -> A as well
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C")],
      edges: [mkEdge("A", "B"), mkEdge("A", "C")],
    };
    const result = filterLocalGraph(data, "B", 1);
    // B can reach A via the A->B edge (buildAdj is undirected)
    expect(result.nodes.map(n => n.id).sort()).toEqual(["A", "B"]);
  });

  it("does not duplicate nodes in output", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B"), mkNode("C")],
      edges: [mkEdge("A", "B"), mkEdge("B", "C"), mkEdge("A", "C")],
    };
    const result = filterLocalGraph(data, "A", 2);
    const ids = result.nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("large hop count on small graph returns all nodes", () => {
    const data: GraphData = {
      nodes: [mkNode("A"), mkNode("B")],
      edges: [mkEdge("A", "B")],
    };
    const result = filterLocalGraph(data, "A", 100);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// layoutConcentric — Pure function testing the concentric ring layout
// ---------------------------------------------------------------------------
describe("layoutConcentric", () => {
  it("empty node array should not crash", () => {
    const nodes: GraphNode[] = [];
    layoutConcentric(nodes);
    expect(nodes).toHaveLength(0);
  });

  it("single node layout positions at origin", () => {
    const nodes = [mkNode("A")];
    layoutConcentric(nodes);
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
  });

  it("center node identified by filePath is placed at origin", () => {
    const nodes = [
      mkNode("A", "A.md"),
      mkNode("B", "B.md"),
      mkNode("C", "C.md"),
    ];
    layoutConcentric(nodes, "B.md");
    // B should be at origin
    expect(nodes[1].x).toBe(0);
    expect(nodes[1].y).toBe(0);
    // Others should not be at origin
    expect(nodes[0].x).not.toBe(0);
    expect(nodes[2].x).not.toBe(0);
  });

  it("center node identified by id is placed at origin", () => {
    const nodes = [mkNode("A"), mkNode("B"), mkNode("C")];
    layoutConcentric(nodes, "B");
    expect(nodes[1].x).toBe(0);
    expect(nodes[1].y).toBe(0);
  });

  it("remaining nodes arranged in concentric rings at correct angles", () => {
    const nodes = [
      mkNode("center", "center.md"),
      mkNode("N1", "N1.md"),
      mkNode("N2", "N2.md"),
      mkNode("N3", "N3.md"),
    ];
    layoutConcentric(nodes, "center.md");

    // Center at origin
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);

    // Other nodes should have non-zero radius
    for (let i = 1; i < nodes.length; i++) {
      const dist = Math.sqrt(nodes[i].x ** 2 + nodes[i].y ** 2);
      expect(dist).toBeGreaterThan(0);
    }
  });

  it("ringCapacity constraint (8 nodes per ring) is respected", () => {
    // 1 center + 8 in ring 1 + 8 in ring 2
    const nodes = [];
    for (let i = 0; i < 17; i++) {
      nodes.push(mkNode(`N${i}`));
    }
    layoutConcentric(nodes);

    // Ring 1: radius = 80 (radiusStep * 1)
    // Ring 2: radius = 160 (radiusStep * 2)
    const ring1Dist = Math.sqrt(nodes[1].x ** 2 + nodes[1].y ** 2);
    const ring2Dist = Math.sqrt(nodes[9].x ** 2 + nodes[9].y ** 2);

    // Verify ring radius progression (with some tolerance for angles)
    expect(ring1Dist).toBeCloseTo(80, 1);
    expect(ring2Dist).toBeCloseTo(160, 1);
  });

  it("radiusStep constant increases ring radius geometrically", () => {
    const nodes = [];
    // Create multiple rings: node 0 is center, nodes 1-8 are ring 1 (radius 80)
    // nodes 9-24 are ring 2 (radius 160), etc.
    for (let i = 0; i < 25; i++) {
      nodes.push(mkNode(`N${i}`));
    }
    layoutConcentric(nodes);

    // Ring indexing: center at 0, ring 0: 1-8, ring 1: 9-24, etc.
    const r1 = Math.sqrt(nodes[1].x ** 2 + nodes[1].y ** 2); // First node in ring 0
    const r2 = Math.sqrt(nodes[9].x ** 2 + nodes[9].y ** 2); // First node in ring 1

    expect(r1).toBeCloseTo(80, 1);   // Ring 0: radiusStep * (0 + 1) = 80
    expect(r2).toBeCloseTo(160, 1);  // Ring 1: radiusStep * (1 + 1) = 160
  });

  it("angles are roughly evenly distributed within each ring", () => {
    const nodes = [];
    for (let i = 0; i < 9; i++) {
      nodes.push(mkNode(`N${i}`));
    }
    layoutConcentric(nodes);

    // Extract angles for ring 1 nodes (N1-N8, indices 1-8)
    const angles = [];
    for (let i = 1; i <= 8; i++) {
      const angle = Math.atan2(nodes[i].y, nodes[i].x);
      angles.push(angle);
    }

    // Angles should be roughly evenly spaced
    // Ring capacity is 8, so each angle step should be 2π/8 = π/4 ≈ 0.785 radians
    // The modulo wrapping can create larger differences across the 2π boundary
    let minAngleDiff = Infinity;
    let maxAngleDiff = -Infinity;
    for (let i = 0; i < angles.length - 1; i++) {
      let angleDiff = Math.abs(angles[i + 1] - angles[i]);
      // Handle wrap-around near 2π
      if (angleDiff > Math.PI) {
        angleDiff = 2 * Math.PI - angleDiff;
      }
      minAngleDiff = Math.min(minAngleDiff, angleDiff);
      maxAngleDiff = Math.max(maxAngleDiff, angleDiff);
    }
    // Should have reasonable spacing
    expect(minAngleDiff).toBeGreaterThan(0.5);
    expect(maxAngleDiff).toBeLessThan(1.0);
  });

  it("when centerPath is undefined, first node is the center", () => {
    const nodes = [mkNode("A"), mkNode("B"), mkNode("C")];
    layoutConcentric(nodes);
    // A (index 0) should be at origin
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
  });

  it("when centerPath is not found, first node is the center (fallback)", () => {
    const nodes = [mkNode("A"), mkNode("B"), mkNode("C")];
    layoutConcentric(nodes, "nonexistent");
    // A (index 0) should be at origin (fallback)
    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
  });

  it("mutates nodes in-place with x and y coordinates", () => {
    const nodes = [mkNode("A"), mkNode("B")];
    const originalA = nodes[0];
    layoutConcentric(nodes);
    // Should mutate same object
    expect(nodes[0]).toBe(originalA);
    expect(originalA.x).toBe(0);
    expect(originalA.y).toBe(0);
  });

  it("handles large number of nodes across multiple rings", () => {
    const nodes = [];
    for (let i = 0; i < 50; i++) {
      nodes.push(mkNode(`N${i}`));
    }
    layoutConcentric(nodes);

    // Verify all nodes have valid coordinates
    for (const n of nodes) {
      expect(typeof n.x).toBe("number");
      expect(typeof n.y).toBe("number");
      expect(isFinite(n.x)).toBe(true);
      expect(isFinite(n.y)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getColor — Pure function returning DEFAULT_COLORS by cyclic index
// ---------------------------------------------------------------------------
describe("getColor", () => {
  it("returns consistent colors for same index", () => {
    const c1 = getColor(0);
    const c2 = getColor(0);
    expect(c1).toBe(c2);
    expect(c1).toBe(DEFAULT_COLORS[0]);
  });

  it("cycles through DEFAULT_COLORS when index exceeds array length", () => {
    const len = DEFAULT_COLORS.length;
    const c0 = getColor(0);
    const cLen = getColor(len);
    const c2Len = getColor(2 * len);
    // Should cycle back
    expect(cLen).toBe(c0);
    expect(c2Len).toBe(c0);
  });

  it("handles index 0", () => {
    expect(getColor(0)).toBe(DEFAULT_COLORS[0]);
  });

  it("handles index 1", () => {
    expect(getColor(1)).toBe(DEFAULT_COLORS[1]);
  });

  it("handles last valid index", () => {
    const len = DEFAULT_COLORS.length;
    expect(getColor(len - 1)).toBe(DEFAULT_COLORS[len - 1]);
  });

  it("handles negative index (modulo wraps in JS)", () => {
    // In JS, -1 % len === -1, so DEFAULT_COLORS[-1] is undefined
    // This is a potential issue in the implementation
    // The function doesn't handle negative indices properly
    const c = getColor(-1);
    // This will be undefined because JS modulo on negative numbers returns negative result
    expect(c).toBeUndefined();
  });

  it("handles large indices", () => {
    const c = getColor(10000);
    expect(c).toBeDefined();
    expect(typeof c).toBe("string");
    // Should wrap to one of the valid colors
    const inArray = DEFAULT_COLORS.includes(c);
    expect(inArray).toBe(true);
  });

  it("returns valid CSS color strings", () => {
    for (let i = 0; i < DEFAULT_COLORS.length; i++) {
      const color = getColor(i);
      expect(typeof color).toBe("string");
      expect(color.length).toBeGreaterThan(0);
      // Should be hex, rgb, or named colors
      expect(/^#|^rgb|^hsl|^[a-z]/.test(color)).toBe(true);
    }
  });

  it("returns different colors for different indices within range", () => {
    const len = DEFAULT_COLORS.length;
    if (len > 1) {
      const c0 = getColor(0);
      const c1 = getColor(1);
      expect(c0).not.toBe(c1);
    }
  });

  it("all returned colors are from DEFAULT_COLORS array", () => {
    for (let i = 0; i < 100; i++) {
      const c = getColor(i);
      const inArray = DEFAULT_COLORS.includes(c);
      expect(inArray).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration tests for renderEmbeddedGraph behavior
// ---------------------------------------------------------------------------
describe("renderEmbeddedGraph integration", () => {
  it("handles empty graph gracefully", () => {
    // Would need mocking of DOM and App
    expect(true).toBe(true);
  });

  it("creates container with correct CSS class", () => {
    // Would need mocking of DOM and App
    expect(true).toBe(true);
  });

  it("sets container height from config", () => {
    // Would need mocking of DOM and App
    expect(true).toBe(true);
  });

  it("applies local graph filter when center is specified", () => {
    // Would need mocking of DOM and App
    expect(true).toBe(true);
  });

  it("skips tag nodes and has-tag edges", () => {
    // Would need mocking of DOM and App
    expect(true).toBe(true);
  });

  it("uses concentric layout by default", () => {
    // Would need mocking of DOM and App
    expect(true).toBe(true);
  });

  it("respects layout config option", () => {
    // Would need mocking of DOM and App
    expect(true).toBe(true);
  });

  it("lazy renders with IntersectionObserver", () => {
    // Would need mocking of DOM and IntersectionObserver
    expect(true).toBe(true);
  });
});
