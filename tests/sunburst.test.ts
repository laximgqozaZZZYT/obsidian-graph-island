import { describe, it, expect } from "vitest";
import { computeSunburstArcs, applySunburstLayout } from "../src/layouts/sunburst";
import type { SunburstData, GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function makeEdge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

function sampleRoot(): SunburstData {
  return {
    name: "Vault",
    children: [
      {
        name: "Characters",
        children: [
          { name: "Alice", value: 1, filePath: "alice.md" },
          { name: "Bob", value: 1, filePath: "bob.md" },
        ],
      },
      {
        name: "Locations",
        children: [
          { name: "Castle", value: 1, filePath: "castle.md" },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// computeSunburstArcs
// ---------------------------------------------------------------------------

describe("computeSunburstArcs", () => {
  it("returns arcs for each node in the hierarchy", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    // root + 2 groups + 3 leaves = 6 arcs
    expect(arcs.length).toBe(6);
  });

  it("root arc spans full circle", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    const rootArc = arcs.find(a => a.depth === 0)!;
    expect(rootArc.x0).toBe(0);
    expect(rootArc.x1).toBeCloseTo(2 * Math.PI, 5);
  });

  it("depth-1 arcs partition the full circle", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    const depth1 = arcs.filter(a => a.depth === 1);
    expect(depth1.length).toBe(2);
    // Characters has 2/3 of total, Locations has 1/3
    const totalSpan = depth1.reduce((s, a) => s + (a.x1 - a.x0), 0);
    expect(totalSpan).toBeCloseTo(2 * Math.PI, 5);
  });

  it("preserves filePath on leaf arcs", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    const aliceArc = arcs.find(a => a.name === "Alice");
    expect(aliceArc?.filePath).toBe("alice.md");
  });

  it("handles empty root", () => {
    const root: SunburstData = { name: "Empty" };
    const arcs = computeSunburstArcs(root, 800, 600);
    expect(arcs.length).toBe(1); // just root
  });

  it("handles single child", () => {
    const root: SunburstData = {
      name: "Root",
      children: [{ name: "Only", value: 1 }],
    };
    const arcs = computeSunburstArcs(root, 400, 400);
    expect(arcs.length).toBe(2);
    const child = arcs.find(a => a.depth === 1)!;
    expect(child.x1 - child.x0).toBeCloseTo(2 * Math.PI, 5);
  });
});

// ---------------------------------------------------------------------------
// applySunburstLayout
// ---------------------------------------------------------------------------

describe("applySunburstLayout", () => {
  it("positions nodes at arc centroids", () => {
    const nodes = [
      makeNode("alice", { filePath: "alice.md" }),
      makeNode("bob", { filePath: "bob.md" }),
      makeNode("castle", { filePath: "castle.md" }),
    ];
    const edges: GraphEdge[] = [makeEdge("alice", "bob")];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges },
      root,
      { width: 800, height: 600, groupField: "category" },
    );

    expect(result.data.nodes.length).toBe(3);
    expect(result.arcs.length).toBeGreaterThan(0);

    // All nodes should be positioned away from their initial (0,0)
    for (const n of result.data.nodes) {
      const dist = Math.sqrt((n.x - result.cx) ** 2 + (n.y - result.cy) ** 2);
      expect(dist).toBeGreaterThan(0);
    }
  });

  it("places unmatched nodes at center", () => {
    const nodes = [
      makeNode("orphan"), // no filePath
    ];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges: [] },
      root,
      { width: 800, height: 600, groupField: "category" },
    );

    const n = result.data.nodes[0];
    expect(n.x).toBe(result.cx);
    expect(n.y).toBe(result.cy);
  });

  it("uses custom center coordinates", () => {
    const nodes = [makeNode("a", { filePath: "alice.md" })];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges: [] },
      root,
      { width: 800, height: 600, centerX: 100, centerY: 200, groupField: "category" },
    );

    expect(result.cx).toBe(100);
    expect(result.cy).toBe(200);
  });

  it("preserves edges", () => {
    const nodes = [
      makeNode("alice", { filePath: "alice.md" }),
      makeNode("bob", { filePath: "bob.md" }),
    ];
    const edges = [makeEdge("alice", "bob")];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges },
      root,
      { width: 800, height: 600, groupField: "category" },
    );

    expect(result.data.edges).toBe(edges);
  });
});
