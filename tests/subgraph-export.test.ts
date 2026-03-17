import { describe, it, expect } from "vitest";
import { collectSubgraph, exportSubgraphJSON, buildAdj } from "../src/utils/graph-helpers";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";

function mkNode(id: string, extra?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...extra };
}
function mkEdge(source: string, target: string): GraphEdge {
  return { id: `${source}-${target}`, source, target, type: "link" };
}

describe("collectSubgraph", () => {
  const nodes = [mkNode("a"), mkNode("b"), mkNode("c"), mkNode("d"), mkNode("e")];
  const edges = [
    mkEdge("a", "b"),
    mkEdge("b", "c"),
    mkEdge("c", "d"),
    mkEdge("d", "e"),
  ];
  const gd: GraphData = { nodes, edges };
  const adj = buildAdj(gd);

  it("returns only the start node for 0 hops", () => {
    const sub = collectSubgraph(adj, "a", 0, nodes, edges);
    expect(sub.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(sub.edges).toEqual([]);
  });

  it("returns 1-hop neighbors", () => {
    const sub = collectSubgraph(adj, "b", 1, nodes, edges);
    const ids = sub.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
    expect(sub.edges.length).toBe(2); // a-b and b-c
  });

  it("returns 2-hop neighborhood", () => {
    const sub = collectSubgraph(adj, "a", 2, nodes, edges);
    const ids = sub.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
    expect(sub.edges.length).toBe(2);
  });

  it("returns all nodes for large hop count", () => {
    const sub = collectSubgraph(adj, "a", 10, nodes, edges);
    expect(sub.nodes.length).toBe(5);
    expect(sub.edges.length).toBe(4);
  });
});

describe("exportSubgraphJSON", () => {
  it("produces valid JSON with expected structure", () => {
    const nodes = [
      mkNode("x", { tags: ["tag1"], category: "cat1" }),
      mkNode("y", { tags: ["tag2"] }),
    ];
    const edges = [mkEdge("x", "y")];
    const json = exportSubgraphJSON({ nodes, edges });
    const parsed = JSON.parse(json);

    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.nodes[0]).toEqual({
      id: "x",
      label: "x",
      tags: ["tag1"],
      category: "cat1",
    });
    expect(parsed.edges[0]).toEqual({
      source: "x",
      target: "y",
      type: "link",
    });
  });

  it("handles empty subgraph", () => {
    const json = exportSubgraphJSON({ nodes: [], edges: [] });
    const parsed = JSON.parse(json);
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });
});
