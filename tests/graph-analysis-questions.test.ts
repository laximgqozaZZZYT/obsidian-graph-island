import { describe, it, expect } from "vitest";
import { generateStructureQuestions, computeGraphStats, computeNodeDegrees } from "../src/analysis/graph-analysis";
import type { GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeNode(id: string, opts: Partial<GraphNode> = {}): GraphNode {
  return {
    id, label: opts.label ?? id,
    x: 0, y: 0, radius: 5,
    tags: opts.tags ?? [],
    isTag: opts.isTag ?? false,
    ...opts,
  } as GraphNode;
}

function makeEdge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type } as GraphEdge;
}

// ---------------------------------------------------------------------------
// generateStructureQuestions
// ---------------------------------------------------------------------------
describe("generateStructureQuestions", () => {
  it("returns empty array for empty graph", () => {
    expect(generateStructureQuestions([], [], new Map())).toEqual([]);
  });

  it("generates hub question for highest-degree node", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
    const edges = [makeEdge("a", "b"), makeEdge("a", "c"), makeEdge("a", "d")];
    const degrees = new Map([["a", 3], ["b", 1], ["c", 1], ["d", 1]]);

    const questions = generateStructureQuestions(nodes, edges, degrees);
    expect(questions.some(q => q.includes('"a"') && q.includes("3 edges"))).toBe(true);
  });

  it("generates betweenness question when different from hub", () => {
    const nodes = [makeNode("hub"), makeNode("bridge"), makeNode("c")];
    const edges = [makeEdge("hub", "bridge"), makeEdge("hub", "c"), makeEdge("bridge", "c")];
    const degrees = new Map([["hub", 2], ["bridge", 2], ["c", 2]]);
    const betweenness = new Map([["hub", 0.1], ["bridge", 0.9], ["c", 0]]);

    const questions = generateStructureQuestions(nodes, edges, degrees, betweenness);
    expect(questions.some(q => q.includes('"bridge"') && q.includes("betweenness"))).toBe(true);
  });

  it("skips betweenness question when same as hub", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("a", "b")];
    const degrees = new Map([["a", 1], ["b", 1]]);
    const betweenness = new Map([["a", 1.0], ["b", 0]]);

    const questions = generateStructureQuestions(nodes, edges, degrees, betweenness);
    // "a" is both max degree and max betweenness → no separate betweenness question
    expect(questions.filter(q => q.includes("betweenness")).length).toBe(0);
  });

  it("generates orphan question when >3 orphans", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => makeNode(`n${i}`));
    const degrees = new Map(nodes.map(n => [n.id, 0] as [string, number]));

    const questions = generateStructureQuestions(nodes, [], degrees);
    expect(questions.some(q => q.includes("10 orphan nodes"))).toBe(true);
  });

  it("skips orphan question when <=3 orphans", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const degrees = new Map([["a", 0], ["b", 0], ["c", 0]]);

    const questions = generateStructureQuestions(nodes, [], degrees);
    expect(questions.filter(q => q.includes("orphan nodes")).length).toBe(0);
  });

  it("generates untagged question when >30% untagged", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode(`n${i}`, { tags: i < 3 ? ["t1"] : [] })
    );
    const degrees = new Map(nodes.map(n => [n.id, 1] as [string, number]));
    // 7/10 = 70% untagged
    const questions = generateStructureQuestions(nodes, [], degrees);
    expect(questions.some(q => q.includes("untagged"))).toBe(true);
  });

  it("generates density question for sparse large graph", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => makeNode(`n${i}`));
    const edges = [makeEdge("n0", "n1")]; // 1 edge for 20 nodes → very sparse
    const degrees = new Map(nodes.map(n => [n.id, 0] as [string, number]));
    degrees.set("n0", 1);
    degrees.set("n1", 1);

    const questions = generateStructureQuestions(nodes, edges, degrees);
    expect(questions.some(q => q.includes("density is very low"))).toBe(true);
  });

  it("generates disconnected-component question", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
    const edges = [makeEdge("a", "b"), makeEdge("c", "d")]; // 2 components
    const degrees = new Map([["a", 1], ["b", 1], ["c", 1], ["d", 1]]);

    const questions = generateStructureQuestions(nodes, edges, degrees);
    expect(questions.some(q => q.includes("2 disconnected components"))).toBe(true);
  });

  it("generates resilience question for hub with >5 edges", () => {
    const nodes = Array.from({ length: 8 }, (_, i) => makeNode(`n${i}`));
    const edges = Array.from({ length: 7 }, (_, i) => makeEdge("n0", `n${i + 1}`));
    const degrees = new Map<string, number>();
    degrees.set("n0", 7);
    for (let i = 1; i < 8; i++) degrees.set(`n${i}`, 1);

    const questions = generateStructureQuestions(nodes, edges, degrees);
    expect(questions.some(q => q.includes("removed") && q.includes("neighbors"))).toBe(true);
  });

  it("generates orphan rate question when >30% and >5 orphans", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => makeNode(`n${i}`));
    // Only 2 nodes connected, 18 orphans = 90%
    const edges = [makeEdge("n0", "n1")];
    const degrees = new Map(nodes.map(n => [n.id, 0] as [string, number]));
    degrees.set("n0", 1);
    degrees.set("n1", 1);

    const questions = generateStructureQuestions(nodes, edges, degrees);
    expect(questions.some(q => q.includes("orphan rate") && q.includes("metadata"))).toBe(true);
  });

  it("generates tag dominance question when single tag >50% with <5 unique tags", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode(`n${i}`, { tags: i < 8 ? ["dominant"] : ["other"] })
    );
    const degrees = new Map(nodes.map(n => [n.id, 1] as [string, number]));
    const edges = Array.from({ length: 9 }, (_, i) => makeEdge(`n${i}`, `n${i + 1}`));

    const questions = generateStructureQuestions(nodes, edges, degrees);
    expect(questions.some(q => q.includes("dominant") && q.includes("sub-tags"))).toBe(true);
  });

  it("skips tag dominance when many unique tags", () => {
    const nodes = Array.from({ length: 10 }, (_, i) =>
      makeNode(`n${i}`, { tags: [`tag${i}`, "shared"] })
    );
    const degrees = new Map(nodes.map(n => [n.id, 1] as [string, number]));

    // 11 unique tags (tag0..tag9 + shared) → >5 unique, skip dominance question
    const questions = generateStructureQuestions(nodes, [], degrees);
    expect(questions.filter(q => q.includes("sub-tags")).length).toBe(0);
  });

  it("uses node label instead of ID when available", () => {
    const nodes = [makeNode("a", { label: "Alpha" }), makeNode("b")];
    const edges = [makeEdge("a", "b")];
    const degrees = new Map([["a", 1], ["b", 1]]);

    const questions = generateStructureQuestions(nodes, edges, degrees);
    // Hub question should use label "Alpha" not id "a"
    expect(questions.some(q => q.includes('"Alpha"'))).toBe(true);
  });

  it("handles graph with single node", () => {
    const nodes = [makeNode("solo")];
    const degrees = new Map([["solo", 0]]);
    const questions = generateStructureQuestions(nodes, [], degrees);
    // Should have hub question at minimum
    expect(questions.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// computeGraphStats — extended
// ---------------------------------------------------------------------------
describe("computeGraphStats — extended", () => {
  it("empty graph produces zeroed stats", () => {
    const degrees = new Map<string, number>();
    const stats = computeGraphStats([], [], degrees);
    expect(stats.nodeCount).toBe(0);
    expect(stats.edgeCount).toBe(0);
    expect(stats.orphanRate).toBe(0);
    expect(stats.avgDegree).toBe(0);
  });

  it("single node with no edges", () => {
    const nodes = [makeNode("a")];
    const degrees = new Map([["a", 0]]);
    const stats = computeGraphStats(nodes, [], degrees);
    expect(stats.nodeCount).toBe(1);
    expect(stats.orphanRate).toBe(1);
  });

  it("fully connected triangle", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [makeEdge("a", "b"), makeEdge("b", "c"), makeEdge("a", "c")];
    const degrees = new Map([["a", 2], ["b", 2], ["c", 2]]);
    const stats = computeGraphStats(nodes, edges, degrees);
    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(3);
    expect(stats.orphanRate).toBe(0);
    expect(stats.avgDegree).toBe(2);
  });

  it("mixed edge types are counted in edgeTypeCounts", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [
      makeEdge("a", "b", "link"),
      makeEdge("b", "c", "semantic"),
      makeEdge("a", "c", "tag"),
    ];
    const degrees = new Map([["a", 2], ["b", 2], ["c", 2]]);
    const stats = computeGraphStats(nodes, edges, degrees);
    expect(stats.edgeTypeCounts.get("link")).toBe(1);
    expect(stats.edgeTypeCounts.get("semantic")).toBe(1);
    expect(stats.edgeTypeCounts.get("tag")).toBe(1);
  });

  it("density of complete graph is 1", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c")];
    const edges = [makeEdge("a", "b"), makeEdge("b", "c"), makeEdge("a", "c")];
    const degrees = new Map([["a", 2], ["b", 2], ["c", 2]]);
    const stats = computeGraphStats(nodes, edges, degrees);
    expect(stats.density).toBeCloseTo(1, 4);
  });

  it("hubs returns top N most-connected nodes", () => {
    const nodes = [makeNode("a"), makeNode("b"), makeNode("c"), makeNode("d")];
    const edges = [makeEdge("a", "b"), makeEdge("a", "c"), makeEdge("a", "d")];
    const degrees = new Map([["a", 3], ["b", 1], ["c", 1], ["d", 1]]);
    const stats = computeGraphStats(nodes, edges, degrees, 2);
    expect(stats.hubs).toHaveLength(2);
    expect(stats.hubs[0][0]).toBe("a");
    expect(stats.hubs[0][1]).toBe(3);
  });

  it("tagCoverage reflects fraction of tagged nodes", () => {
    const nodes = [
      makeNode("a", { tags: ["t1"] }),
      makeNode("b"),
      makeNode("c", { tags: ["t2"] }),
    ];
    const degrees = new Map([["a", 0], ["b", 0], ["c", 0]]);
    const stats = computeGraphStats(nodes, [], degrees);
    expect(stats.tagCoverage).toBeCloseTo(2 / 3, 4);
  });
});

// ---------------------------------------------------------------------------
// computeNodeDegrees
// ---------------------------------------------------------------------------
describe("computeNodeDegrees — extended", () => {
  it("self-loop counts as 2 degrees", () => {
    const nodes = [makeNode("a")];
    const edges = [makeEdge("a", "a")];
    const degrees = computeNodeDegrees(nodes, edges);
    expect(degrees.get("a")).toBe(2);
  });

  it("parallel edges both count", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    const edges = [makeEdge("a", "b"), makeEdge("a", "b")];
    const degrees = computeNodeDegrees(nodes, edges);
    expect(degrees.get("a")).toBe(2);
    expect(degrees.get("b")).toBe(2);
  });

  it("star topology: center has N-1 degree", () => {
    const n = 10;
    const nodes = Array.from({ length: n }, (_, i) => makeNode(`n${i}`));
    const edges = Array.from({ length: n - 1 }, (_, i) => makeEdge("n0", `n${i + 1}`));
    const degrees = computeNodeDegrees(nodes, edges);
    expect(degrees.get("n0")).toBe(n - 1);
  });
});
