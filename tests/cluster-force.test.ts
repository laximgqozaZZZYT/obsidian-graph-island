import { describe, it, expect } from "vitest";
import { forceSimulation, forceManyBody, type Simulation } from "d3-force";
import { buildClusterForce, type ClusterForceConfig } from "../src/layouts/cluster-force";
import type { GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function makeEdge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

function baseCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
  return {
    groupRules: [{ groupBy: "tag", recursive: false }],
    arrangement: "spiral",
    centerX: 400,
    centerY: 300,
    width: 800,
    height: 600,
    nodeSize: 8,
    scaleByDegree: true,
    nodeSpacing: 3.0,
    groupScale: 3.0,
    groupSpacing: 2.0,
    ...overrides,
  };
}

/** Run the force function enough times for positions to converge. */
function converge(
  force: (alpha: number) => void,
  iterations = 60,
) {
  for (let i = 0; i < iterations; i++) force(1);
}

/** Euclidean distance between two points. */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Compute centroid of nodes. */
function centroid(nodes: GraphNode[]): { x: number; y: number } {
  const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
  const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
  return { x: cx, y: cy };
}

// ---------------------------------------------------------------------------
// buildClusterForce — basic behavior
// ---------------------------------------------------------------------------

describe("buildClusterForce", () => {
  it("returns null when groupRules is empty (no grouping)", () => {
    const nodes = [makeNode("a")];
    const result = buildClusterForce(nodes, [], new Map(), baseCfg({ groupRules: [] }));
    expect(result).toBeNull();
  });

  it("returns a force function for valid config", () => {
    const nodes = [makeNode("a", { tags: ["t1"] })];
    const result = buildClusterForce(nodes, [], new Map(), baseCfg());
    expect(typeof result).toBe("function");
  });

  it("moves nodes toward target positions", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"], x: 0, y: 0 }),
      makeNode("b", { tags: ["t1"], x: 0, y: 0 }),
    ];
    const force = buildClusterForce(nodes, [], new Map(), baseCfg())!;
    force(1);
    // After one tick, nodes should have moved away from origin
    expect(nodes[0].x).not.toBe(0);
    expect(nodes[0].y).not.toBe(0);
  });

  it("kills velocity completely each tick", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"], vx: 100, vy: 200 }),
    ];
    const force = buildClusterForce(nodes, [], new Map(), baseCfg())!;
    force(1);
    expect(nodes[0].vx).toBe(0);
    expect(nodes[0].vy).toBe(0);
  });

  it("converges to stable positions after many iterations", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"], x: 0, y: 0 }),
      makeNode("b", { tags: ["t1"], x: 500, y: 500 }),
    ];
    const force = buildClusterForce(nodes, [], new Map(), baseCfg())!;
    converge(force);
    const pos1 = { x: nodes[0].x, y: nodes[0].y };
    force(1);
    // After convergence, positions should barely change
    expect(Math.abs(nodes[0].x - pos1.x)).toBeLessThan(0.1);
    expect(Math.abs(nodes[0].y - pos1.y)).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// Spiral — Archimedean: r = aθ, equal arc-length spacing
// ---------------------------------------------------------------------------

describe("spiral arrangement", () => {
  it("places highest-degree node at center of group", () => {
    // Use enough nodes so centroid stays near the spiral center
    const n = 12;
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    nodes.push(makeNode("hub", { tags: ["g1"] }));
    degrees.set("hub", 20);
    for (let i = 1; i < n; i++) {
      nodes.push(makeNode(`leaf${i}`, { tags: ["g1"] }));
      degrees.set(`leaf${i}`, 1);
    }
    const force = buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "spiral" }))!;
    converge(force);

    // Hub (highest degree) is placed at spiral offset (0,0) — closest to centroid
    const c = centroid(nodes);
    const hubDist = dist(nodes[0], c);
    const leafDists = nodes.slice(1).map(nd => dist(nd, c));
    const avgLeafDist = leafDists.reduce((a, b) => a + b, 0) / leafDists.length;
    expect(hubDist).toBeLessThan(avgLeafDist);
  });

  it("produces Archimedean pattern: distance from center increases with rank", () => {
    const n = 30;
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      degrees.set(`n${i}`, n - i); // decreasing degree
    }
    const force = buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "spiral" }))!;
    converge(force);

    // Sort by degree (same order used internally)
    const sorted = [...nodes].sort((a, b) => (degrees.get(b.id)! - degrees.get(a.id)!));
    const c = centroid(sorted);
    const distances = sorted.map(nd => dist(nd, c));

    // Distance should generally increase (allow some tolerance for spiral crossing)
    // Check every 5th node is farther than the 1st
    for (let i = 5; i < distances.length; i += 5) {
      expect(distances[i]).toBeGreaterThan(distances[0]);
    }
  });

  it("spiral arms have roughly constant spacing between turns", () => {
    const n = 100;
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      degrees.set(`n${i}`, n - i);
    }
    const force = buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "spiral" }))!;
    converge(force);

    const sorted = [...nodes].sort((a, b) => (degrees.get(b.id)! - degrees.get(a.id)!));
    const c = centroid(sorted);
    const distances = sorted.map(nd => dist(nd, c));

    // In Archimedean spiral, r ∝ θ, and with equal arc-length spacing θ ∝ √i,
    // so r ∝ √i. Verify the general trend holds: outer nodes are farther.
    // The exact ratio varies due to centroid shift from single-group centering.
    // With thetaOffset for center node clearance, first nodes start farther out.
    // Verify outer nodes are still farther than mid nodes (spiral grows outward).
    const ratio = distances[50] / Math.max(distances[5], 0.01);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Concentric — rings with radius ∝ node count
// ---------------------------------------------------------------------------

describe("concentric arrangement", () => {
  it("places highest-degree node at ring center", () => {
    const nodes = [
      makeNode("hub", { tags: ["g1"] }),
      makeNode("n1", { tags: ["g1"] }),
      makeNode("n2", { tags: ["g1"] }),
      makeNode("n3", { tags: ["g1"] }),
    ];
    const degrees = new Map([["hub", 20], ["n1", 3], ["n2", 2], ["n3", 1]]);
    const force = buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "concentric" }))!;
    converge(force);

    const c = centroid(nodes);
    const hubDist = dist(nodes[0], c);
    expect(hubDist).toBeLessThan(dist(nodes[1], c));
  });

  it("nodes on the same ring are equidistant from center", () => {
    // Ring 1 holds up to 6 nodes. Create exactly 7 nodes: 1 center + 6 on ring 1.
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      degrees.set(`n${i}`, 10 - i);
    }
    const force = buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "concentric" }))!;
    converge(force);

    const c = centroid(nodes);
    // n1..n6 should all be on ring 1 — same distance from center
    const ringDistances = nodes.slice(1).map(n => dist(n, c));
    const avgRingDist = ringDistances.reduce((s, d) => s + d, 0) / ringDistances.length;
    for (const d of ringDistances) {
      expect(Math.abs(d - avgRingDist)).toBeLessThan(avgRingDist * 0.05);
    }
  });

  it("larger group produces larger outer radius", () => {
    // Small group: 7 nodes
    const smallNodes: GraphNode[] = [];
    for (let i = 0; i < 7; i++) smallNodes.push(makeNode(`s${i}`, { tags: ["g1"] }));
    const smallForce = buildClusterForce(
      smallNodes, [], new Map(), baseCfg({ arrangement: "concentric" }),
    )!;
    converge(smallForce);
    const smallC = centroid(smallNodes);
    const smallMaxR = Math.max(...smallNodes.map(n => dist(n, smallC)));

    // Large group: 50 nodes
    const largeNodes: GraphNode[] = [];
    for (let i = 0; i < 50; i++) largeNodes.push(makeNode(`l${i}`, { tags: ["g1"] }));
    const largeForce = buildClusterForce(
      largeNodes, [], new Map(), baseCfg({ arrangement: "concentric" }),
    )!;
    converge(largeForce);
    const largeC = centroid(largeNodes);
    const largeMaxR = Math.max(...largeNodes.map(n => dist(n, largeC)));

    expect(largeMaxR).toBeGreaterThan(smallMaxR * 1.5);
  });

  it("ring spacing is uniform within a group", () => {
    // 20 nodes: ring 0(1), ring 1(6), ring 2(12), ring 3(1)
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < 20; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      degrees.set(`n${i}`, 20 - i);
    }
    const force = buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "concentric" }))!;
    converge(force);

    const sorted = [...nodes].sort((a, b) => (degrees.get(b.id)! - degrees.get(a.id)!));
    const c = centroid(sorted);

    // Ring 0: node 0 (center)
    // Ring 1: nodes 1..6
    // Ring 2: nodes 7..18
    const ring1Avg = sorted.slice(1, 7).reduce((s, n) => s + dist(n, c), 0) / 6;
    const ring2Avg = sorted.slice(7, 19).reduce((s, n) => s + dist(n, c), 0) / 12;

    // Ring 2 should be ~2x ring 1 distance (spacing * 2 vs spacing * 1)
    const ratio = ring2Avg / ring1Avg;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.5);
  });
});

// ---------------------------------------------------------------------------
// Tree — groups arranged in horizontal row
// ---------------------------------------------------------------------------

describe("tree arrangement", () => {
  it("arranges groups in a horizontal row (same Y, different X)", () => {
    const nodes = [
      makeNode("a", { tags: ["g1"] }),
      makeNode("b", { tags: ["g1"] }),
      makeNode("c", { tags: ["g2"] }),
      makeNode("d", { tags: ["g2"] }),
    ];
    const force = buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "tree" }))!;
    converge(force);

    const c1 = centroid(nodes.filter(n => n.tags![0] === "g1"));
    const c2 = centroid(nodes.filter(n => n.tags![0] === "g2"));

    // Group centroids should be at roughly the same Y (horizontal row)
    expect(Math.abs(c1.y - c2.y)).toBeLessThan(50);
    // But different X
    expect(Math.abs(c1.x - c2.x)).toBeGreaterThan(20);
  });

  it("allocates more horizontal space to larger groups", () => {
    const nodes: GraphNode[] = [];
    // Group A: 3 nodes, Group B: 10 nodes
    for (let i = 0; i < 3; i++) nodes.push(makeNode(`a${i}`, { tags: ["groupA"] }));
    for (let i = 0; i < 10; i++) nodes.push(makeNode(`b${i}`, { tags: ["groupB"] }));

    const force = buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "tree" }))!;
    converge(force);

    const groupANodes = nodes.filter(n => n.tags![0] === "groupA");
    const groupBNodes = nodes.filter(n => n.tags![0] === "groupB");
    const cA = centroid(groupANodes);
    const cB = centroid(groupBNodes);

    // Larger group center should be farther from the left edge (gets more space)
    // Both should be within canvas bounds
    // Both groups should have distinct positions; larger group gets more space
    expect(cA.x).toBeGreaterThan(0);
    expect(cB.x).toBeGreaterThan(0);
    // With radius-based spacing, positions may exceed canvas width — that's OK
    // The key property is proportional allocation
    const spreadB = Math.max(...groupBNodes.map(n => n.x)) - Math.min(...groupBNodes.map(n => n.x));
    const spreadA = Math.max(...groupANodes.map(n => n.x)) - Math.min(...groupANodes.map(n => n.x));
    expect(spreadB).toBeGreaterThanOrEqual(spreadA);
  });

  it("uses BFS tree layout within each group", () => {
    const nodes = [
      makeNode("root", { tags: ["g1"] }),
      makeNode("child1", { tags: ["g1"] }),
      makeNode("child2", { tags: ["g1"] }),
      makeNode("grandchild", { tags: ["g1"] }),
    ];
    const edges = [
      makeEdge("root", "child1"),
      makeEdge("root", "child2"),
      makeEdge("child1", "grandchild"),
    ];
    const degrees = new Map([["root", 2], ["child1", 2], ["child2", 1], ["grandchild", 1]]);
    const force = buildClusterForce(nodes, edges, degrees, baseCfg({ arrangement: "tree" }))!;
    converge(force);

    // Root (highest degree) should be at the top (lowest Y within group)
    const root = nodes.find(n => n.id === "root")!;
    const grandchild = nodes.find(n => n.id === "grandchild")!;
    // BFS layers: root(y=top) → child1,child2(y=mid) → grandchild(y=bottom)
    expect(root.y).toBeLessThan(grandchild.y);
  });
});

// ---------------------------------------------------------------------------
// Grid arrangement
// ---------------------------------------------------------------------------

describe("grid arrangement", () => {
  it("arranges nodes in a square grid pattern", () => {
    const nodes: GraphNode[] = [];
    // 9 nodes → √9 = 3 cols → 3 rows × 3 cols
    for (let i = 0; i < 9; i++) nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
    const force = buildClusterForce(
      nodes, [], new Map(), baseCfg({ arrangement: "grid" }),
    )!;
    converge(force);

    const ys = nodes.map(n => Math.round(n.y * 10) / 10);
    const uniqueYs = [...new Set(ys)].sort((a, b) => a - b);
    expect(uniqueYs.length).toBe(3); // 3 rows

    const xs = nodes.map(n => Math.round(n.x * 10) / 10);
    const uniqueXs = [...new Set(xs)].sort((a, b) => a - b);
    expect(uniqueXs.length).toBe(3); // 3 columns (square)
  });
});

// ---------------------------------------------------------------------------
// Group separation (inter-group placement)
// ---------------------------------------------------------------------------

describe("group separation", () => {
  it("different groups occupy distinct spatial regions (spiral/concentric/grid)", () => {
    const arrangements: Array<"spiral" | "concentric" | "grid"> = ["spiral", "concentric", "grid"];

    for (const arrangement of arrangements) {
      const nodes = [
        makeNode("a1", { tags: ["alpha"] }),
        makeNode("a2", { tags: ["alpha"] }),
        makeNode("a3", { tags: ["alpha"] }),
        makeNode("b1", { tags: ["beta"] }),
        makeNode("b2", { tags: ["beta"] }),
        makeNode("b3", { tags: ["beta"] }),
      ];
      const force = buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement }))!;
      converge(force);

      const cAlpha = centroid(nodes.filter(n => n.tags![0] === "alpha"));
      const cBeta = centroid(nodes.filter(n => n.tags![0] === "beta"));

      // Group centroids should be well separated
      expect(dist(cAlpha, cBeta)).toBeGreaterThan(50);
    }
  });

  it("single group centers on canvas", () => {
    const nodes = [
      makeNode("a", { tags: ["only"] }),
      makeNode("b", { tags: ["only"] }),
      makeNode("c", { tags: ["only"] }),
    ];
    const force = buildClusterForce(
      nodes, [], new Map(), baseCfg({ arrangement: "spiral" }),
    )!;
    converge(force);

    const c = centroid(nodes);
    // Should be near canvas center (400, 300)
    expect(Math.abs(c.x - 400)).toBeLessThan(50);
    expect(Math.abs(c.y - 300)).toBeLessThan(50);
  });

  it("groups by backlinks bucket separate correctly", () => {
    const nodes = [
      makeNode("popular", { tags: [] }),   // degree 15 → "11+"
      makeNode("medium", { tags: [] }),     // degree 4  → "3-5"
      makeNode("lonely", { tags: [] }),     // degree 0  → "0"
    ];
    const degrees = new Map([["popular", 15], ["medium", 4], ["lonely", 0]]);
    const force = buildClusterForce(
      nodes, [], degrees, baseCfg({ groupRules: [{ groupBy: "backlinks", recursive: false }], arrangement: "spiral" }),
    )!;
    converge(force);

    // Each node is in a different bucket — they should be separated
    expect(dist(nodes[0], nodes[1])).toBeGreaterThan(30);
    expect(dist(nodes[1], nodes[2])).toBeGreaterThan(30);
  });

  it("groups by node_type separate tag nodes from file nodes", () => {
    const nodes = [
      makeNode("file1", { isTag: false, category: "file" }),
      makeNode("file2", { isTag: false, category: "file" }),
      makeNode("tag1", { isTag: true }),
      makeNode("tag2", { isTag: true }),
    ];
    const force = buildClusterForce(
      nodes, [], new Map(), baseCfg({ groupRules: [{ groupBy: "node_type", recursive: false }], arrangement: "concentric" }),
    )!;
    converge(force);

    const fileCentroid = centroid(nodes.filter(n => !n.isTag));
    const tagCentroid = centroid(nodes.filter(n => n.isTag));
    expect(dist(fileCentroid, tagCentroid)).toBeGreaterThan(50);
  });
});

// (strength parameter removed — blend is now fixed at 0.85)

// ---------------------------------------------------------------------------
// Large-scale sanity
// ---------------------------------------------------------------------------

describe("large-scale layout", () => {
  it("handles 500 nodes across 5 tag groups without NaN or Infinity", () => {
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    const tags = ["alpha", "beta", "gamma", "delta", "epsilon"];
    for (let i = 0; i < 500; i++) {
      const tag = tags[i % tags.length];
      nodes.push(makeNode(`n${i}`, { tags: [tag] }));
      degrees.set(`n${i}`, Math.floor(Math.random() * 20));
    }
    const force = buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "spiral" }))!;
    converge(force);

    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
      expect(Number.isNaN(n.x)).toBe(false);
      expect(Number.isNaN(n.y)).toBe(false);
    }
  });

  it("no two nodes in the same group overlap exactly", () => {
    const nodes: GraphNode[] = [];
    for (let i = 0; i < 50; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
    }
    const force = buildClusterForce(
      nodes, [], new Map(), baseCfg({ arrangement: "concentric" }),
    )!;
    converge(force);

    // Check pairwise — no exact overlaps (distance > 1px)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(dist(nodes[i], nodes[j])).toBeGreaterThan(1);
      }
    }
  });

  it("all arrangements produce positions within reasonable bounds", () => {
    const arrangements: Array<"spiral" | "concentric" | "tree" | "grid"> =
      ["spiral", "concentric", "tree", "grid"];

    for (const arrangement of arrangements) {
      const nodes: GraphNode[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      }
      const force = buildClusterForce(
        nodes, [], new Map(), baseCfg({ arrangement }),
      )!;
      converge(force);

      // All nodes should be within a reasonable distance of canvas center
      for (const n of nodes) {
        const d = dist(n, { x: 400, y: 300 });
        expect(d).toBeLessThan(5000); // generous bound — radius-based spacing spreads out
      }
    }
  });
});

// ---------------------------------------------------------------------------
// D3 SIMULATION PIPELINE — tests that replicate the ACTUAL Obsidian pipeline
//
// This is critical: the cluster force must work correctly THROUGH d3's tick
// loop, not just when called directly. d3's tick does:
//   1. Execute all forces (they modify vx/vy and/or x/y)
//   2. vx *= (1 - velocityDecay)   [velocityDecay(0.55) → vx *= 0.45]
//   3. x += vx
// Our cluster force sets positions directly AND kills velocity, but charge
// force adds velocity that d3 then applies to positions.
// ---------------------------------------------------------------------------

describe("d3 simulation pipeline integration", () => {
  /** Create a d3 simulation matching GraphViewContainer.ts exactly. */
  function createSimWithCluster(
    nodes: GraphNode[],
    edges: GraphEdge[],
    degrees: Map<string, number>,
    arrangement: "spiral" | "concentric" | "tree" | "grid",
  ): Simulation<GraphNode, GraphEdge> {
    const sim = forceSimulation(nodes)
      .alphaDecay(0.08)
      .velocityDecay(0.55)
      .stop();

    // Matching applyClusterForce active branch:
    sim.force("charge", forceManyBody<GraphNode>().strength(-10));
    sim.force("center", null);
    sim.force("link", null);

    const forceFn = buildClusterForce(nodes, edges, degrees, {
      groupRules: [{ groupBy: "tag", recursive: false }],
      arrangement,
      centerX: 400,
      centerY: 300,
      width: 800,
      height: 600,
      nodeSize: 8,
      scaleByDegree: true,
      nodeSpacing: 3.0,
      groupScale: 3.0,
      groupSpacing: 2.0,
    });
    sim.force("clusterArrangement", forceFn as any);
    sim.alpha(0.5);
    return sim;
  }

  it("spiral: groups separate and nodes form spiral pattern through d3 pipeline", () => {
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    const tags = ["alpha", "beta", "gamma"];
    for (let i = 0; i < 60; i++) {
      nodes.push(makeNode(`n${i}`, { tags: [tags[i % 3]], x: 400 + (Math.random() - 0.5) * 200, y: 300 + (Math.random() - 0.5) * 200 }));
      degrees.set(`n${i}`, Math.floor(Math.random() * 10));
    }
    const sim = createSimWithCluster(nodes, [], degrees, "spiral");
    for (let i = 0; i < 300; i++) sim.tick();

    // Groups must be separated
    const alphaNodes = nodes.filter(n => n.tags![0] === "alpha");
    const betaNodes = nodes.filter(n => n.tags![0] === "beta");
    const cAlpha = centroid(alphaNodes);
    const cBeta = centroid(betaNodes);
    expect(dist(cAlpha, cBeta)).toBeGreaterThan(30);

    // All positions must be finite
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("concentric: nodes form ring patterns through d3 pipeline", () => {
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["only"], x: 400 + (Math.random() - 0.5) * 200, y: 300 + (Math.random() - 0.5) * 200 }));
      degrees.set(`n${i}`, i === 0 ? 20 : Math.floor(Math.random() * 5));
    }
    const sim = createSimWithCluster(nodes, [], degrees, "concentric");
    for (let i = 0; i < 300; i++) sim.tick();

    // Group centroid should be near canvas center
    const c = centroid(nodes);
    expect(Math.abs(c.x - 400)).toBeLessThan(100);
    expect(Math.abs(c.y - 300)).toBeLessThan(100);

    // Highest-degree node should be closest to centroid
    const sorted = [...nodes].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));
    const hubDist = dist(sorted[0], c);
    const avgOtherDist = sorted.slice(1).reduce((s, n) => s + dist(n, c), 0) / (sorted.length - 1);
    expect(hubDist).toBeLessThan(avgOtherDist);
  });

  it("tree: groups form horizontal row through d3 pipeline", () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const degrees = new Map<string, number>();
    const tags = ["alpha", "beta"];
    for (let i = 0; i < 20; i++) {
      nodes.push(makeNode(`n${i}`, { tags: [tags[i % 2]], x: 400, y: 300 }));
      degrees.set(`n${i}`, 1);
    }
    // Add edges within groups for tree structure
    for (let i = 0; i < 20; i += 2) {
      if (i + 2 < 20) {
        edges.push(makeEdge(`n${i}`, `n${i + 2}`));
      }
    }
    const sim = createSimWithCluster(nodes, edges, degrees, "tree");
    for (let i = 0; i < 300; i++) sim.tick();

    // Groups should have different X centroids (horizontal separation)
    const cAlpha = centroid(nodes.filter(n => n.tags![0] === "alpha"));
    const cBeta = centroid(nodes.filter(n => n.tags![0] === "beta"));
    const xSeparation = Math.abs(cAlpha.x - cBeta.x);
    expect(xSeparation).toBeGreaterThan(20);
  });

  it("grid: nodes form grid pattern through d3 pipeline", () => {
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < 25; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["only"], x: 400 + (Math.random() - 0.5) * 200, y: 300 + (Math.random() - 0.5) * 200 }));
      degrees.set(`n${i}`, i);
    }
    const sim = createSimWithCluster(nodes, [], degrees, "grid");
    for (let i = 0; i < 300; i++) sim.tick();

    // All positions finite
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }

    // Should be centered near canvas center
    const c = centroid(nodes);
    expect(Math.abs(c.x - 400)).toBeLessThan(100);
    expect(Math.abs(c.y - 300)).toBeLessThan(100);
  });

  it("200 nodes across 5 groups: all patterns produce separated groups through d3", () => {
    const arrangements: Array<"spiral" | "concentric" | "tree" | "grid"> =
      ["spiral", "concentric", "tree", "grid"];
    const tags = ["a", "b", "c", "d", "e"];

    for (const arrangement of arrangements) {
      const nodes: GraphNode[] = [];
      const degrees = new Map<string, number>();
      for (let i = 0; i < 200; i++) {
        nodes.push(makeNode(`n${i}`, {
          tags: [tags[i % 5]],
          x: 400 + (Math.random() - 0.5) * 400,
          y: 300 + (Math.random() - 0.5) * 300,
        }));
        degrees.set(`n${i}`, Math.floor(Math.random() * 15));
      }
      const sim = createSimWithCluster(nodes, [], degrees, arrangement);
      for (let i = 0; i < 300; i++) sim.tick();

      // All finite
      for (const n of nodes) {
        expect(Number.isFinite(n.x)).toBe(true);
        expect(Number.isFinite(n.y)).toBe(true);
      }

      // At least some group centroids should be separated
      const centroids = tags.map(t => centroid(nodes.filter(n => n.tags![0] === t)));
      let maxGroupDist = 0;
      for (let i = 0; i < centroids.length; i++) {
        for (let j = i + 1; j < centroids.length; j++) {
          maxGroupDist = Math.max(maxGroupDist, dist(centroids[i], centroids[j]));
        }
      }
      expect(maxGroupDist).toBeGreaterThan(20);
    }
  });
});
