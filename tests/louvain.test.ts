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
