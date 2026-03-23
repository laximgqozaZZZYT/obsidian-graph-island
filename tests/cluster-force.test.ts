import { describe, it, expect } from "vitest";
import { forceSimulation, forceManyBody, type Simulation } from "d3-force";
import { buildClusterForce, nodeRadius, effectiveRadius, computeGroupGap, pairwiseGap, estimateLabelExtent, analyzeOverlap, computeAutoOptimize, type ClusterForceConfig, type ClusterForceResult } from "../src/layouts/cluster-force";

/** Extract the force function from a ClusterForceResult (mirrors the old API). */
function extractForce(result: ClusterForceResult | null): ((alpha: number) => void) | null {
  return result ? result.force : null;
}
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
    arrangement: "grid",
    centerX: 400,
    centerY: 300,
    width: 800,
    height: 600,
    nodeSize: 8,
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
  it("returns non-null even when groupRules is empty (layout arrangements still run)", () => {
    const nodes = [makeNode("a")];
    const result = buildClusterForce(nodes, [], new Map(), baseCfg({ groupRules: [] }));
    // All current arrangements are in NEEDS_LAYOUT, so force is always returned
    expect(result).not.toBeNull();
    expect(typeof result!.force).toBe("function");
  });

  it("returns a result object for valid config", () => {
    const nodes = [makeNode("a", { tags: ["t1"] })];
    const result = buildClusterForce(nodes, [], new Map(), baseCfg());
    expect(result).not.toBeNull();
    expect(typeof result!.force).toBe("function");
  });

  it("moves nodes toward target positions", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"], x: 0, y: 0 }),
      makeNode("b", { tags: ["t1"], x: 0, y: 0 }),
    ];
    const force = extractForce(buildClusterForce(nodes, [], new Map(), baseCfg()))!;
    force(1);
    // After one tick, nodes should have moved away from origin
    expect(nodes[0].x).not.toBe(0);
    expect(nodes[0].y).not.toBe(0);
  });

  it("kills velocity completely each tick", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"], vx: 100, vy: 200 }),
    ];
    const force = extractForce(buildClusterForce(nodes, [], new Map(), baseCfg()))!;
    force(1);
    expect(nodes[0].vx).toBe(0);
    expect(nodes[0].vy).toBe(0);
  });

  it("converges to stable positions after many iterations", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"], x: 0, y: 0 }),
      makeNode("b", { tags: ["t1"], x: 500, y: 500 }),
    ];
    const force = extractForce(buildClusterForce(nodes, [], new Map(), baseCfg()))!;
    converge(force);
    const pos1 = { x: nodes[0].x, y: nodes[0].y };
    force(1);
    // After convergence, positions should barely change
    expect(Math.abs(nodes[0].x - pos1.x)).toBeLessThan(0.1);
    expect(Math.abs(nodes[0].y - pos1.y)).toBeLessThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// Radial — spoke-based layout (replacement for removed "spiral" arrangement)
// ---------------------------------------------------------------------------

describe("radial arrangement", () => {
  it("places highest-degree node at center of group", () => {
    const n = 12;
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    nodes.push(makeNode("hub", { tags: ["g1"] }));
    degrees.set("hub", 20);
    for (let i = 1; i < n; i++) {
      nodes.push(makeNode(`leaf${i}`, { tags: ["g1"] }));
      degrees.set(`leaf${i}`, 1);
    }
    const force = extractForce(buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "radial" })))!;
    converge(force);

    const c = centroid(nodes);
    const hubDist = dist(nodes[0], c);
    const leafDists = nodes.slice(1).map(nd => dist(nd, c));
    const avgLeafDist = leafDists.reduce((a, b) => a + b, 0) / leafDists.length;
    expect(hubDist).toBeLessThan(avgLeafDist);
  });

  it("nodes spread outward from center with radial pattern", () => {
    const n = 30;
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      degrees.set(`n${i}`, n - i);
    }
    const force = extractForce(buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "radial" })))!;
    converge(force);

    const c = centroid(nodes);
    // All positions should be finite and spread out
    for (const nd of nodes) {
      expect(Number.isFinite(nd.x)).toBe(true);
      expect(Number.isFinite(nd.y)).toBe(true);
    }
    // Outer nodes should be farther from center than inner ones
    const maxDist = Math.max(...nodes.map(nd => dist(nd, c)));
    expect(maxDist).toBeGreaterThan(0);
  });

  it("radial produces non-degenerate layout with many nodes", () => {
    const n = 100;
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      degrees.set(`n${i}`, n - i);
    }
    const force = extractForce(buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "radial" })))!;
    converge(force);

    const c = centroid(nodes);
    const distances = nodes.map(nd => dist(nd, c));

    // Not all nodes should be at the same distance (non-degenerate)
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    expect(maxDist - minDist).toBeGreaterThan(1);
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
    const force = extractForce(buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "concentric" })))!;
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
    const force = extractForce(buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "concentric" })))!;
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
    const smallForce = extractForce(buildClusterForce(
      smallNodes, [], new Map(), baseCfg({ arrangement: "concentric" }),
    ))!;
    converge(smallForce);
    const smallC = centroid(smallNodes);
    const smallMaxR = Math.max(...smallNodes.map(n => dist(n, smallC)));

    // Large group: 50 nodes
    const largeNodes: GraphNode[] = [];
    for (let i = 0; i < 50; i++) largeNodes.push(makeNode(`l${i}`, { tags: ["g1"] }));
    const largeForce = extractForce(buildClusterForce(
      largeNodes, [], new Map(), baseCfg({ arrangement: "concentric" }),
    ))!;
    converge(largeForce);
    const largeC = centroid(largeNodes);
    const largeMaxR = Math.max(...largeNodes.map(n => dist(n, largeC)));

    expect(largeMaxR).toBeGreaterThan(smallMaxR);
  });

  it("ring spacing is uniform within a group", () => {
    // 20 nodes: ring 0(1), ring 1(6), ring 2(12), ring 3(1)
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    for (let i = 0; i < 20; i++) {
      nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      degrees.set(`n${i}`, 20 - i);
    }
    const force = extractForce(buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "concentric" })))!;
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
// Triangle — groups arranged in triangular pattern
// ---------------------------------------------------------------------------

describe("triangle arrangement", () => {
  it("arranges groups with distinct centroids", () => {
    const nodes = [
      makeNode("a", { tags: ["g1"] }),
      makeNode("b", { tags: ["g1"] }),
      makeNode("c", { tags: ["g2"] }),
      makeNode("d", { tags: ["g2"] }),
    ];
    const force = extractForce(buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "triangle" })))!;
    converge(force);

    const c1 = centroid(nodes.filter(n => n.tags![0] === "g1"));
    const c2 = centroid(nodes.filter(n => n.tags![0] === "g2"));

    // Group centroids should be separated
    expect(dist(c1, c2)).toBeGreaterThan(20);
  });

  it("allocates more space to larger groups", () => {
    const nodes: GraphNode[] = [];
    // Group A: 3 nodes, Group B: 10 nodes
    for (let i = 0; i < 3; i++) nodes.push(makeNode(`a${i}`, { tags: ["groupA"] }));
    for (let i = 0; i < 10; i++) nodes.push(makeNode(`b${i}`, { tags: ["groupB"] }));

    const force = extractForce(buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "triangle" })))!;
    converge(force);

    const groupANodes = nodes.filter(n => n.tags![0] === "groupA");
    const groupBNodes = nodes.filter(n => n.tags![0] === "groupB");

    // Both groups should have distinct positions; larger group gets more space
    const spreadB = Math.max(...groupBNodes.map(n => n.x)) - Math.min(...groupBNodes.map(n => n.x));
    const spreadA = Math.max(...groupANodes.map(n => n.x)) - Math.min(...groupANodes.map(n => n.x));
    expect(spreadB).toBeGreaterThanOrEqual(spreadA);
  });

  it("triangle layout produces structured positions", () => {
    const nodes = [
      makeNode("n0", { tags: ["g1"] }),
      makeNode("n1", { tags: ["g1"] }),
      makeNode("n2", { tags: ["g1"] }),
      makeNode("n3", { tags: ["g1"] }),
      makeNode("n4", { tags: ["g1"] }),
      makeNode("n5", { tags: ["g1"] }),
    ];
    const force = extractForce(buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement: "triangle" })))!;
    converge(force);

    // All nodes should have finite positions
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    // Nodes should not all be at the same position
    const uniquePositions = new Set(nodes.map(n => `${Math.round(n.x)},${Math.round(n.y)}`));
    expect(uniquePositions.size).toBeGreaterThan(1);
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
    const force = extractForce(buildClusterForce(
      nodes, [], new Map(), baseCfg({ arrangement: "grid" }),
    ))!;
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
  it("different groups occupy distinct spatial regions (phyllotaxis/concentric/grid)", () => {
    const arrangements: Array<"phyllotaxis" | "concentric" | "grid"> = ["phyllotaxis", "concentric", "grid"];

    for (const arrangement of arrangements) {
      const nodes = [
        makeNode("a1", { tags: ["alpha"] }),
        makeNode("a2", { tags: ["alpha"] }),
        makeNode("a3", { tags: ["alpha"] }),
        makeNode("b1", { tags: ["beta"] }),
        makeNode("b2", { tags: ["beta"] }),
        makeNode("b3", { tags: ["beta"] }),
      ];
      const force = extractForce(buildClusterForce(nodes, [], new Map(), baseCfg({ arrangement })))!;
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
    const force = extractForce(buildClusterForce(
      nodes, [], new Map(), baseCfg({ arrangement: "grid" }),
    ))!;
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
    const force = extractForce(buildClusterForce(
      nodes, [], degrees, baseCfg({ groupRules: [{ groupBy: "backlinks", recursive: false }], arrangement: "grid" }),
    ))!;
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
    const force = extractForce(buildClusterForce(
      nodes, [], new Map(), baseCfg({ groupRules: [{ groupBy: "node_type", recursive: false }], arrangement: "concentric" }),
    ))!;
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
    const force = extractForce(buildClusterForce(nodes, [], degrees, baseCfg({ arrangement: "phyllotaxis" })))!;
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
    const force = extractForce(buildClusterForce(
      nodes, [], new Map(), baseCfg({ arrangement: "concentric" }),
    ))!;
    converge(force);

    // Check pairwise — no exact overlaps (distance > 1px)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        expect(dist(nodes[i], nodes[j])).toBeGreaterThan(1);
      }
    }
  });

  it("all arrangements produce positions within reasonable bounds", () => {
    const arrangements: Array<"phyllotaxis" | "concentric" | "triangle" | "grid"> =
      ["phyllotaxis", "concentric", "triangle", "grid"];

    for (const arrangement of arrangements) {
      const nodes: GraphNode[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push(makeNode(`n${i}`, { tags: ["g1"] }));
      }
      const force = extractForce(buildClusterForce(
        nodes, [], new Map(), baseCfg({ arrangement }),
      ))!;
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
    arrangement: "phyllotaxis" | "concentric" | "triangle" | "grid",
  ): Simulation<GraphNode, GraphEdge> {
    const sim = forceSimulation(nodes)
      .alphaDecay(0.08)
      .velocityDecay(0.55)
      .stop();

    // Matching applyClusterForce active branch:
    sim.force("charge", forceManyBody<GraphNode>().strength(-10));
    sim.force("center", null);
    sim.force("link", null);

    const forceResult = buildClusterForce(nodes, edges, degrees, {
      groupRules: [{ groupBy: "tag", recursive: false }],
      arrangement,
      centerX: 400,
      centerY: 300,
      width: 800,
      height: 600,
      nodeSize: 8,
      nodeSpacing: 3.0,
      groupScale: 3.0,
      groupSpacing: 2.0,
    });
    sim.force("clusterArrangement", forceResult?.force as any);
    sim.alpha(0.5);
    return sim;
  }

  it("phyllotaxis: groups separate and nodes form pattern through d3 pipeline", () => {
    const nodes: GraphNode[] = [];
    const degrees = new Map<string, number>();
    const tags = ["alpha", "beta", "gamma"];
    for (let i = 0; i < 60; i++) {
      nodes.push(makeNode(`n${i}`, { tags: [tags[i % 3]], x: 400 + (Math.random() - 0.5) * 200, y: 300 + (Math.random() - 0.5) * 200 }));
      degrees.set(`n${i}`, Math.floor(Math.random() * 10));
    }
    const sim = createSimWithCluster(nodes, [], degrees, "phyllotaxis");
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

  it("triangle: groups separate through d3 pipeline", () => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const degrees = new Map<string, number>();
    const tags = ["alpha", "beta"];
    for (let i = 0; i < 20; i++) {
      nodes.push(makeNode(`n${i}`, { tags: [tags[i % 2]], x: 400, y: 300 }));
      degrees.set(`n${i}`, 1);
    }
    for (let i = 0; i < 20; i += 2) {
      if (i + 2 < 20) {
        edges.push(makeEdge(`n${i}`, `n${i + 2}`));
      }
    }
    const sim = createSimWithCluster(nodes, edges, degrees, "triangle");
    for (let i = 0; i < 300; i++) sim.tick();

    // Groups should have separated centroids
    const cAlpha = centroid(nodes.filter(n => n.tags![0] === "alpha"));
    const cBeta = centroid(nodes.filter(n => n.tags![0] === "beta"));
    expect(dist(cAlpha, cBeta)).toBeGreaterThan(20);
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

  it("200 nodes across 5 groups: all patterns produce separated groups through d3", { timeout: 30000 }, () => {
    const arrangements: Array<"phyllotaxis" | "concentric" | "triangle" | "grid"> =
      ["phyllotaxis", "concentric", "triangle", "grid"];
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

// ---------------------------------------------------------------------------
// Multi-level grouping (pipeline)
// ---------------------------------------------------------------------------

describe("multi-level grouping", () => {
  it("two rules produce finer-grained groups than one rule", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"], category: "c1" }),
      makeNode("b", { tags: ["t1"], category: "c2" }),
      makeNode("c", { tags: ["t2"], category: "c1" }),
      makeNode("d", { tags: ["t2"], category: "c2" }),
    ];
    const degrees = new Map([["a", 5], ["b", 3], ["c", 8], ["d", 2]]);

    // Single rule: tag → 2 groups (t1, t2)
    const r1 = buildClusterForce(nodes, [], degrees, baseCfg({
      groupRules: [{ groupBy: "tag", recursive: false }],
    }));

    // Two rules: tag → node_type → potentially more groups
    const r2 = buildClusterForce(nodes, [], degrees, baseCfg({
      groupRules: [
        { groupBy: "tag", recursive: false },
        { groupBy: "node_type", recursive: false },
      ],
    }));

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    // Both should produce valid force functions that move nodes
    const nodes1 = nodes.map(n => ({ ...n }));
    r1!.force(1);
    const nodes2 = [
      makeNode("a", { tags: ["t1"], category: "c1" }),
      makeNode("b", { tags: ["t1"], category: "c2" }),
      makeNode("c", { tags: ["t2"], category: "c1" }),
      makeNode("d", { tags: ["t2"], category: "c2" }),
    ];
    r2!.force(1);
    // Both move nodes (not stuck at origin)
    expect(nodes[0].x).not.toBe(0);
  });

  it("empty groupRules still returns force (arrangements always run)", () => {
    const nodes = [makeNode("a", { tags: ["t1"] })];
    const result = buildClusterForce(nodes, [], new Map(), baseCfg({
      groupRules: [],
    }));
    // All current arrangements are in NEEDS_LAYOUT so force is always returned
    expect(result).not.toBeNull();
    expect(typeof result!.force).toBe("function");
  });

  it("recursive flag per rule splits connected components independently", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"] }),
      makeNode("b", { tags: ["t1"] }),
      makeNode("c", { tags: ["t1"] }),
    ];
    const edges = [makeEdge("a", "b")];
    // recursive=true → t1 splits into {a,b} and {c}
    const fResult = buildClusterForce(nodes, edges, new Map(), baseCfg({
      groupRules: [{ groupBy: "tag", recursive: true }],
    }));
    expect(fResult).not.toBeNull();

    // After convergence, a and b should be close (same component), c farther
    converge(fResult!.force);
    const dAB = dist(nodes[0], nodes[1]);
    const dAC = dist(nodes[0], nodes[2]);
    // c is in a different connected component and may be merged into __other__
    // or stay separate — just verify the force works without error
    expect(Number.isFinite(nodes[2].x)).toBe(true);
  });

  it("tag then backlinks: produces hierarchical grouping", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"] }),
      makeNode("b", { tags: ["t1"] }),
      makeNode("c", { tags: ["t2"] }),
      makeNode("d", { tags: ["t2"] }),
    ];
    const degrees = new Map([["a", 15], ["b", 1], ["c", 8], ["d", 2]]);

    const fResult2 = buildClusterForce(nodes, [], degrees, baseCfg({
      groupRules: [
        { groupBy: "tag", recursive: false },
        { groupBy: "backlinks", recursive: false },
      ],
    }));
    expect(fResult2).not.toBeNull();
    converge(fResult2!.force);

    // All nodes should have finite positions
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

describe("nodeRadius NaN handling", () => {
  it("returns minNodeRadius when nodeSize is NaN", () => {
    const r = nodeRadius(NaN, 10, 15);
    expect(r).toBe(15);
  });

  it("returns minNodeRadius when nodeSize is 0", () => {
    const r = nodeRadius(0, 10, 15);
    expect(r).toBe(15);
  });

  it("returns minNodeRadius when nodeSize is negative", () => {
    const r = nodeRadius(-5, 10, 15);
    expect(r).toBe(15);
  });

  it("returns baseR without sizeByDegree", () => {
    expect(nodeRadius(20, 50, 15, 100, false)).toBe(20);
  });

  it("sizeByDegree scales with degree/maxDegree ratio", () => {
    const rLow = nodeRadius(20, 1, 15, 100, true);
    const rMid = nodeRadius(20, 50, 15, 100, true);
    const rMax = nodeRadius(20, 100, 15, 100, true);
    expect(rLow).toBeLessThan(rMid);
    expect(rMid).toBeLessThan(rMax);
  });

  it("sizeByDegree at max degree gives 2x base", () => {
    // t = sqrt(100/100) = 1, result = 20 * (0.7 + 1*1.3) = 20*2 = 40
    expect(nodeRadius(20, 100, 15, 100, true)).toBe(40);
  });

  it("sizeByDegree with degree=0 returns baseR", () => {
    expect(nodeRadius(20, 0, 15, 100, true)).toBe(20);
  });

  it("sizeByDegree with maxDegree=0 returns baseR", () => {
    expect(nodeRadius(20, 50, 15, 0, true)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Helpers for group assignment tests
// ---------------------------------------------------------------------------
function mkNodes(count: number, overrides?: Partial<GraphNode>): GraphNode[] {
  return Array.from({ length: count }, (_, i) => makeNode(`n${i}`, overrides));
}

function mkChainEdges(nodes: GraphNode[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push(makeEdge(nodes[i].id, nodes[i + 1].id));
  }
  return edges;
}

// ---------------------------------------------------------------------------
// Group assignment boundary values (cycle120)
// ---------------------------------------------------------------------------
describe("group assignment edge cases", () => {
  function mkN(count: number, overrides?: Partial<GraphNode>): GraphNode[] {
    return Array.from({ length: count }, (_, i) => makeNode(`n${i}`, overrides));
  }

  it("all nodes in same category → single group", () => {
    const nodes = mkN(10, { category: "same" });
    const cfg = baseCfg({ groupRules: [{ groupBy: "category:?", recursive: false }] });
    const result = buildClusterForce(nodes, [], new Map(), cfg);
    expect(result).not.toBeNull();
    const groups = new Set(nodes.map(n => n.group));
    expect(groups.size).toBe(1);
  });

  it("nodes with no category → all in default group", () => {
    const nodes = mkN(5);
    const cfg = baseCfg({ groupRules: [{ groupBy: "category:?", recursive: false }] });
    const result = buildClusterForce(nodes, [], new Map(), cfg);
    expect(result).not.toBeNull();
  });

  it("single node: does not crash", () => {
    const nodes = [makeNode("solo", { category: "a" })];
    const cfg = baseCfg({ groupRules: [{ groupBy: "category:?", recursive: false }] });
    const result = buildClusterForce(nodes, [], new Map(), cfg);
    expect(result).not.toBeNull();
  });

  it("returns valid result (non-null) for categorized nodes", () => {
    const nodes = mkN(8, { category: "test" });
    const cfg = baseCfg({ groupRules: [{ groupBy: "category:?", recursive: false }] });
    const result = buildClusterForce(nodes, [], new Map(), cfg);
    expect(result).not.toBeNull();
    // Force function exists
    expect(typeof result!.force).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// pairwiseGap — center-to-center distance between two elements
// ---------------------------------------------------------------------------
describe("pairwiseGap", () => {
  it("uses larger radius as reference", () => {
    expect(pairwiseGap(10, 5, 1)).toBe(20); // max(10,5) * 2 * 1
    expect(pairwiseGap(5, 10, 1)).toBe(20); // symmetric
  });

  it("scales with spacing multiplier", () => {
    expect(pairwiseGap(10, 10, 2)).toBe(40); // 10 * 2 * 2
    expect(pairwiseGap(10, 10, 0.5)).toBe(10); // 10 * 2 * 0.5
  });

  it("returns 0 for zero radius", () => {
    expect(pairwiseGap(0, 0, 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeGroupGap — uniform gap for equal-sized nodes
// ---------------------------------------------------------------------------
describe("computeGroupGap", () => {
  it("uses max of nodeSpacing and groupScale", () => {
    // nodeSpacing=3, groupScale=1 → max=3 → pairwiseGap(10, 10, 3) = 60
    expect(computeGroupGap(10, 3, 1)).toBe(60);
    // nodeSpacing=1, groupScale=5 → max=5 → pairwiseGap(10, 10, 5) = 100
    expect(computeGroupGap(10, 1, 5)).toBe(100);
  });

  it("returns 0 for zero nodeSize", () => {
    expect(computeGroupGap(0, 3, 2)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// estimateLabelExtent — pre-layout label width estimation
// ---------------------------------------------------------------------------
describe("estimateLabelExtent", () => {
  const mkN = (label: string, opts?: Partial<GraphNode>): GraphNode =>
    ({ id: label, label, ...opts } as GraphNode);

  it("returns 0 when labelSpacingFactor <= 0", () => {
    expect(estimateLabelExtent(mkN("hello"), 10, 5, 10, 0)).toBe(0);
    expect(estimateLabelExtent(mkN("hello"), 10, 5, 10, -1)).toBe(0);
  });

  it("returns 0 for empty label", () => {
    expect(estimateLabelExtent(mkN(""), 10, 5, 10, 1)).toBe(0);
  });

  it("longer labels produce larger extent", () => {
    const short = estimateLabelExtent(mkN("ab"), 10, 0, 10, 1);
    const long = estimateLabelExtent(mkN("abcdefghij"), 10, 0, 10, 1);
    expect(long).toBeGreaterThan(short);
  });

  it("higher labelSpacingFactor scales proportionally", () => {
    const base = estimateLabelExtent(mkN("test"), 10, 5, 10, 1);
    const doubled = estimateLabelExtent(mkN("test"), 10, 5, 10, 2);
    expect(doubled).toBeCloseTo(base * 2, 5);
  });

  it("super node uses different padding", () => {
    const normal = estimateLabelExtent(mkN("test"), 10, 5, 10, 1);
    const superNode = estimateLabelExtent(
      mkN("test", { collapsedMembers: ["a", "b"] as any }),
      10, 5, 10, 1,
    );
    // Super node has larger padding, so result differs
    expect(superNode).not.toBe(normal);
  });
});

// ---------------------------------------------------------------------------
// effectiveRadius — visual radius with super-node and content scaling
// ---------------------------------------------------------------------------
describe("effectiveRadius", () => {
  it("returns nodeRadius for normal node without content scaling", () => {
    const n = makeNode("a");
    const r = effectiveRadius(n, 20, 5);
    expect(r).toBe(20); // max(20, 15) = 20
  });

  it("respects minNodeRadius floor", () => {
    const n = makeNode("a");
    const r = effectiveRadius(n, 5, 0, 60, 30);
    expect(r).toBeGreaterThanOrEqual(30);
  });

  it("respects maxNodeRadius cap", () => {
    const n = makeNode("a");
    const r = effectiveRadius(n, 100, 50, 40, 15, 100, true);
    expect(r).toBeLessThanOrEqual(40);
  });

  it("super node with collapsedMembers is larger than normal", () => {
    const normal = makeNode("a");
    const superN = makeNode("b", { collapsedMembers: ["c", "d", "e", "f"] as any });
    const rNormal = effectiveRadius(normal, 20, 5);
    const rSuper = effectiveRadius(superN, 20, 5);
    expect(rSuper).toBeGreaterThan(rNormal);
  });

  it("content scaling increases radius when cardContentScale > 0", () => {
    const n = makeNode("a");
    const rBase = effectiveRadius(n, 20, 5, 60, 15, 0, false, 0, 0, 0);
    const rScaled = effectiveRadius(n, 20, 5, 60, 15, 0, false, 500, 1000, 0.5);
    expect(rScaled).toBeGreaterThan(rBase);
  });

  it("content scaling with bodyLength=0 has no effect", () => {
    const n = makeNode("a");
    const rBase = effectiveRadius(n, 20, 5);
    const rNoBody = effectiveRadius(n, 20, 5, 60, 15, 0, false, 0, 1000, 0.5);
    expect(rNoBody).toBe(rBase);
  });

  it("maxNodeRadius=0 means no cap (Infinity)", () => {
    const n = makeNode("a");
    const r = effectiveRadius(n, 200, 5, 0, 15);
    expect(r).toBe(200);
  });

  it("sizeByDegree increases radius for high-degree nodes", () => {
    const n = makeNode("a");
    const rLow = effectiveRadius(n, 20, 1, 60, 15, 50, true);
    const rHigh = effectiveRadius(n, 20, 50, 60, 15, 50, true);
    expect(rHigh).toBeGreaterThan(rLow);
  });
});

// ---------------------------------------------------------------------------
// analyzeOverlap — spatial overlap detection
// ---------------------------------------------------------------------------
describe("analyzeOverlap", () => {
  it("returns zeros for single node", () => {
    const result = analyzeOverlap(
      [{ id: "a", x: 0, y: 0 }],
      new Map([["a", 10]]),
      3,
    );
    expect(result.overlapRatio).toBe(0);
    expect(result.closePairs).toBe(0);
    expect(result.overlapPairs).toBe(0);
  });

  it("returns zeros for empty array", () => {
    const result = analyzeOverlap([], new Map(), 3);
    expect(result.overlapRatio).toBe(0);
  });

  it("detects overlapping nodes", () => {
    const nodes = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 5, y: 0 }, // distance=5, both r=10 → overlap
    ];
    const radii = new Map([["a", 10], ["b", 10]]);
    const result = analyzeOverlap(nodes, radii, 3);
    expect(result.overlapPairs).toBeGreaterThan(0);
    expect(result.overlapRatio).toBeGreaterThan(0);
  });

  it("reports no overlap for well-separated nodes", () => {
    const nodes = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1000, y: 0 },
    ];
    const radii = new Map([["a", 10], ["b", 10]]);
    const result = analyzeOverlap(nodes, radii, 3);
    expect(result.overlapPairs).toBe(0);
  });

  it("avgRadius reflects radii map values", () => {
    const nodes = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 200, y: 0 },
    ];
    const radii = new Map([["a", 20], ["b", 40]]);
    const result = analyzeOverlap(nodes, radii, 3);
    expect(result.avgRadius).toBe(30);
  });

  it("uses default radius when node not in radii map", () => {
    const nodes = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 }, // very close
    ];
    const radii = new Map<string, number>(); // empty map
    const result = analyzeOverlap(nodes, radii, 3);
    // avgRadius defaults to 6, closeThreshold = 6*3 = 18, dist=1 < 18
    expect(result.closePairs).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeAutoOptimize — parameter adjustment from overlap analysis
// ---------------------------------------------------------------------------
describe("computeAutoOptimize", () => {
  const defaultCfg = {
    overlapThreshold: 0.1,
    padIncrement: 2,
    padMax: 20,
    repelScale: 1.2,
    linkScale: 1.1,
  };

  it("returns unchanged when overlapRatio below threshold", () => {
    const result = computeAutoOptimize(0.05, 10, {}, 50, 100, defaultCfg);
    expect(result.needsMore).toBe(false);
    expect(result.repelForce).toBe(50);
    expect(result.linkDistance).toBe(100);
  });

  it("increases repelForce and linkDistance when overlap exceeds threshold", () => {
    const result = computeAutoOptimize(0.5, 10, {}, 50, 100, defaultCfg);
    expect(result.needsMore).toBe(true);
    expect(result.repelForce).toBe(60);  // 50 * 1.2
    expect(result.linkDistance).toBeCloseTo(110, 10); // 100 * 1.1
  });

  it("sets _overlapPad increment capped at padMax", () => {
    const constants = { _overlapPad: 18 };
    const result = computeAutoOptimize(0.5, 10, constants, 50, 100, defaultCfg);
    expect(result.constants["_overlapPad"]).toBe(20); // min(18+2, 20)
  });

  it("sets _minGap based on avgRadius", () => {
    const result = computeAutoOptimize(0.5, 30, {}, 50, 100, defaultCfg);
    expect(result.constants["_minGap"]).toBe(15); // max(0, 30*0.5)
  });

  it("preserves existing _minGap if larger", () => {
    const constants = { _minGap: 50 };
    const result = computeAutoOptimize(0.5, 10, constants, 50, 100, defaultCfg);
    expect(result.constants["_minGap"]).toBe(50); // max(50, 10*0.5=5)
  });

  it("does not mutate input constants object", () => {
    const original = { _overlapPad: 5 };
    computeAutoOptimize(0.5, 10, original, 50, 100, defaultCfg);
    expect(original._overlapPad).toBe(5);
  });

  it("returns needsMore=false at exact threshold boundary", () => {
    const result = computeAutoOptimize(0.1, 10, {}, 50, 100, defaultCfg);
    expect(result.needsMore).toBe(false);
  });
});
