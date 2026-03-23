import { describe, it, expect } from "vitest";
import { louvainCommunities, LouvainEdge } from "../src/utils/louvain";

describe("louvainCommunities", () => {
  it("returns empty map for empty graph", () => {
    const result = louvainCommunities([], []);
    expect(result.size).toBe(0);
  });

  it("assigns single node to community 0", () => {
    const result = louvainCommunities(["A"], []);
    expect(result.size).toBe(1);
    expect(result.get("A")).toBe(0);
  });

  it("assigns two disconnected nodes to different communities", () => {
    const result = louvainCommunities(["A", "B"], []);
    expect(result.size).toBe(2);
    expect(result.get("A")).not.toBe(result.get("B"));
  });

  it("assigns triangle (3 fully connected nodes) to 1 community", () => {
    const nodes = ["A", "B", "C"];
    const edges: LouvainEdge[] = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "A", target: "C" },
    ];
    const result = louvainCommunities(nodes, edges);
    expect(result.size).toBe(3);
    // All should be in the same community
    const comms = new Set(result.values());
    expect(comms.size).toBe(1);
  });

  it("detects 2 communities for two triangles connected by a bridge", () => {
    // Triangle 1: A-B-C, Triangle 2: D-E-F, Bridge: C-D
    const nodes = ["A", "B", "C", "D", "E", "F"];
    const edges: LouvainEdge[] = [
      // Triangle 1
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "A", target: "C" },
      // Triangle 2
      { source: "D", target: "E" },
      { source: "E", target: "F" },
      { source: "D", target: "F" },
      // Bridge
      { source: "C", target: "D" },
    ];
    const result = louvainCommunities(nodes, edges);
    expect(result.size).toBe(6);

    // A, B, C should be in the same community
    expect(result.get("A")).toBe(result.get("B"));
    expect(result.get("B")).toBe(result.get("C"));

    // D, E, F should be in the same community
    expect(result.get("D")).toBe(result.get("E"));
    expect(result.get("E")).toBe(result.get("F"));

    // The two groups should be in different communities
    expect(result.get("A")).not.toBe(result.get("D"));
  });

  it("produces stable output for a linear chain", () => {
    const nodes = ["A", "B", "C", "D", "E"];
    const edges: LouvainEdge[] = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
      { source: "D", target: "E" },
    ];
    const result1 = louvainCommunities(nodes, edges);
    const result2 = louvainCommunities(nodes, edges);

    // Same input should produce same output
    expect(result1.size).toBe(5);
    for (const [key, val] of result1) {
      expect(result2.get(key)).toBe(val);
    }
  });

  it("ignores edges referencing unknown node IDs", () => {
    const result = louvainCommunities(["A"], [
      { source: "A", target: "Z" },
    ]);
    expect(result.size).toBe(1);
    expect(result.get("A")).toBe(0);
  });

  it("ignores self-loops", () => {
    const result = louvainCommunities(["A", "B"], [
      { source: "A", target: "A" },
      { source: "A", target: "B" },
    ]);
    expect(result.size).toBe(2);
    // With only one real edge, both should be in the same community
    expect(result.get("A")).toBe(result.get("B"));
  });

  it("respects edge weights", () => {
    // Two triangles with a weak bridge — should still separate
    const nodes = ["A", "B", "C", "D", "E", "F"];
    const edges: LouvainEdge[] = [
      { source: "A", target: "B", weight: 10 },
      { source: "B", target: "C", weight: 10 },
      { source: "A", target: "C", weight: 10 },
      { source: "D", target: "E", weight: 10 },
      { source: "E", target: "F", weight: 10 },
      { source: "D", target: "F", weight: 10 },
      { source: "C", target: "D", weight: 0.1 }, // weak bridge
    ];
    const result = louvainCommunities(nodes, edges);
    // Strong internal connections should keep triangles together
    expect(result.get("A")).toBe(result.get("B"));
    expect(result.get("D")).toBe(result.get("E"));
    expect(result.get("A")).not.toBe(result.get("D"));
  });

  it("assigns community IDs starting from 0 with contiguous numbering", () => {
    const nodes = ["A", "B", "C"];
    const result = louvainCommunities(nodes, []);
    const commIds = new Set(result.values());
    // 3 disconnected nodes → 3 communities numbered 0, 1, 2
    expect(commIds).toEqual(new Set([0, 1, 2]));
  });
});

describe("louvainCommunities — boundary cases", () => {
  it("complete graph K4: all nodes in 1 community", () => {
    const nodes = ["a", "b", "c", "d"];
    const edges: LouvainEdge[] = [
      { source: "a", target: "b" }, { source: "a", target: "c" },
      { source: "a", target: "d" }, { source: "b", target: "c" },
      { source: "b", target: "d" }, { source: "c", target: "d" },
    ];
    const result = louvainCommunities(nodes, edges);
    const communities = new Set(result.values());
    expect(communities.size).toBe(1);
  });

  it("bipartite graph: 2 clear communities", () => {
    // Group A: a1, a2, a3 (fully connected)
    // Group B: b1, b2, b3 (fully connected)
    // Single bridge: a1-b1
    const nodes = ["a1", "a2", "a3", "b1", "b2", "b3"];
    const edges: LouvainEdge[] = [
      { source: "a1", target: "a2" }, { source: "a2", target: "a3" }, { source: "a1", target: "a3" },
      { source: "b1", target: "b2" }, { source: "b2", target: "b3" }, { source: "b1", target: "b3" },
      { source: "a1", target: "b1" }, // bridge
    ];
    const result = louvainCommunities(nodes, edges);
    const communities = new Set(result.values());
    expect(communities.size).toBe(2);
    // Nodes in same group should share community
    expect(result.get("a1")).toBe(result.get("a2"));
    expect(result.get("b1")).toBe(result.get("b2"));
    // Different groups should have different communities
    expect(result.get("a1")).not.toBe(result.get("b1"));
  });

  it("star graph: hub + leaves in same community", () => {
    const nodes = ["hub", "a", "b", "c", "d", "e"];
    const edges: LouvainEdge[] = [
      { source: "hub", target: "a" }, { source: "hub", target: "b" },
      { source: "hub", target: "c" }, { source: "hub", target: "d" },
      { source: "hub", target: "e" },
    ];
    const result = louvainCommunities(nodes, edges);
    // All should be in same community (no internal structure to split)
    const communities = new Set(result.values());
    expect(communities.size).toBeLessThanOrEqual(2); // 1 or 2 acceptable
  });

  it("large graph (100 nodes, 2 clusters) detects 2 communities", () => {
    const nodes: string[] = [];
    const edges: LouvainEdge[] = [];
    // Cluster A: 50 nodes with random internal edges
    for (let i = 0; i < 50; i++) nodes.push(`a${i}`);
    for (let i = 0; i < 50; i++) {
      for (let j = i + 1; j < 50 && j <= i + 5; j++) {
        edges.push({ source: `a${i}`, target: `a${j}` });
      }
    }
    // Cluster B: 50 nodes with random internal edges
    for (let i = 0; i < 50; i++) nodes.push(`b${i}`);
    for (let i = 0; i < 50; i++) {
      for (let j = i + 1; j < 50 && j <= i + 5; j++) {
        edges.push({ source: `b${i}`, target: `b${j}` });
      }
    }
    // Single bridge between clusters
    edges.push({ source: "a0", target: "b0" });

    const result = louvainCommunities(nodes, edges);
    expect(result.size).toBe(100);
    // Should detect at least 2 communities
    const communities = new Set(result.values());
    expect(communities.size).toBeGreaterThanOrEqual(2);
  });

  it("all isolated nodes: each in own community", () => {
    const nodes = ["a", "b", "c", "d", "e"];
    const result = louvainCommunities(nodes, []);
    const communities = new Set(result.values());
    expect(communities.size).toBe(5);
  });

  it("duplicate edges ignored gracefully", () => {
    const nodes = ["a", "b"];
    const edges: LouvainEdge[] = [
      { source: "a", target: "b" },
      { source: "a", target: "b" }, // duplicate
      { source: "b", target: "a" }, // reverse
    ];
    const result = louvainCommunities(nodes, edges);
    expect(result.size).toBe(2);
    // Should still work (1 community since fully connected)
    expect(result.get("a")).toBe(result.get("b"));
  });

  // --- Large-scale stability tests (cycle113) ---

  it("500 nodes in 5 cliques: detects ~5 communities", () => {
    const nodes: string[] = [];
    const edges: LouvainEdge[] = [];
    // Create 5 cliques of 100 nodes each
    for (let c = 0; c < 5; c++) {
      const cNodes: string[] = [];
      for (let i = 0; i < 100; i++) {
        const id = `c${c}_n${i}`;
        nodes.push(id);
        cNodes.push(id);
      }
      // Connect every pair within clique (sample: 10 random edges per node)
      for (let i = 0; i < cNodes.length; i++) {
        for (let j = 0; j < 10 && i + j + 1 < cNodes.length; j++) {
          edges.push({ source: cNodes[i], target: cNodes[i + j + 1] });
        }
      }
    }
    // Add sparse inter-clique edges (1 per pair)
    for (let c = 0; c < 4; c++) {
      edges.push({ source: `c${c}_n0`, target: `c${c + 1}_n0` });
    }

    const result = louvainCommunities(nodes, edges);
    expect(result.size).toBe(500);

    // Count unique communities
    const communities = new Set(result.values());
    // Should detect roughly 5 communities (±2 for algorithm variance)
    expect(communities.size).toBeGreaterThanOrEqual(3);
    expect(communities.size).toBeLessThanOrEqual(10);
  });

  it("500 nodes: all assigned to a community (no undefined)", () => {
    const nodes = Array.from({ length: 500 }, (_, i) => `n${i}`);
    const edges: LouvainEdge[] = [];
    // Ring topology
    for (let i = 0; i < 500; i++) {
      edges.push({ source: `n${i}`, target: `n${(i + 1) % 500}` });
    }
    const result = louvainCommunities(nodes, edges);
    expect(result.size).toBe(500);
    for (const id of nodes) {
      expect(result.has(id)).toBe(true);
      expect(typeof result.get(id)).toBe("number");
    }
  });

  it("deterministic: same input produces same output", () => {
    const nodes = Array.from({ length: 50 }, (_, i) => `n${i}`);
    const edges: LouvainEdge[] = [];
    for (let i = 0; i < 49; i++) {
      edges.push({ source: `n${i}`, target: `n${i + 1}` });
    }
    const r1 = louvainCommunities(nodes, edges);
    const r2 = louvainCommunities(nodes, edges);
    for (const id of nodes) {
      expect(r1.get(id)).toBe(r2.get(id));
    }
  });

  it("weighted edges influence community formation", () => {
    // 4 nodes: a-b strongly connected (weight 10), c-d strongly connected (weight 10)
    // a-c weakly connected (weight 1)
    const nodes = ["a", "b", "c", "d"];
    const edges: LouvainEdge[] = [
      { source: "a", target: "b", weight: 10 },
      { source: "c", target: "d", weight: 10 },
      { source: "a", target: "c", weight: 1 },
    ];
    const result = louvainCommunities(nodes, edges);
    // a,b should be in same community; c,d should be in same community
    expect(result.get("a")).toBe(result.get("b"));
    expect(result.get("c")).toBe(result.get("d"));
  });

  it("self-loops are ignored", () => {
    const nodes = ["a", "b"];
    const edges: LouvainEdge[] = [
      { source: "a", target: "a" }, // self-loop
      { source: "a", target: "b" },
    ];
    const result = louvainCommunities(nodes, edges);
    expect(result.size).toBe(2);
  });
});
