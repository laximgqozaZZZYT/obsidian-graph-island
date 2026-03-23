import { describe, it, expect } from "vitest";
import { parseConfig, filterLocalGraph } from "../src/views/EmbeddedGraphRenderer";
import { makeGraphData } from "./helpers/factories";

// ---------------------------------------------------------------------------
// parseConfig — JSON parse with fallback
// ---------------------------------------------------------------------------
describe("parseConfig", () => {
  it("parses valid JSON", () => {
    const cfg = parseConfig('{"center":"test.md","hops":2}');
    expect(cfg.center).toBe("test.md");
    expect(cfg.hops).toBe(2);
  });

  it("returns empty object for invalid JSON", () => {
    expect(parseConfig("not json")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseConfig("")).toEqual({});
  });

  it("handles JSON with extra fields", () => {
    const cfg = parseConfig('{"center":"a.md","unknown":true}');
    expect(cfg.center).toBe("a.md");
  });
});

// ---------------------------------------------------------------------------
// filterLocalGraph — BFS N-hop filter
// ---------------------------------------------------------------------------
describe("filterLocalGraph", () => {
  it("returns empty when center not found", () => {
    const data = makeGraphData({ nodes: ["a", "b"], edges: [["a", "b"]] });
    const result = filterLocalGraph(data, "nonexistent", 1);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("0 hops returns only center node", () => {
    const data = makeGraphData({
      nodes: ["a", "b", "c"],
      edges: [["a", "b"], ["b", "c"]],
    });
    const result = filterLocalGraph(data, "a", 0);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("a");
    expect(result.edges).toHaveLength(0);
  });

  it("1 hop returns center + direct neighbors", () => {
    const data = makeGraphData({
      nodes: ["a", "b", "c", "d"],
      edges: [["a", "b"], ["b", "c"], ["c", "d"]],
    });
    const result = filterLocalGraph(data, "a", 1);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["a", "b"]);
    expect(result.edges).toHaveLength(1); // a→b only
  });

  it("2 hops expands to 2nd degree neighbors", () => {
    const data = makeGraphData({
      nodes: ["a", "b", "c", "d"],
      edges: [["a", "b"], ["b", "c"], ["c", "d"]],
    });
    const result = filterLocalGraph(data, "a", 2);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("large hops returns all reachable nodes", () => {
    const data = makeGraphData({
      nodes: ["a", "b", "c"],
      edges: [["a", "b"], ["b", "c"]],
    });
    const result = filterLocalGraph(data, "a", 100);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });

  it("disconnected nodes are excluded", () => {
    const data = makeGraphData({
      nodes: ["a", "b", "isolated"],
      edges: [["a", "b"]],
    });
    const result = filterLocalGraph(data, "a", 10);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["a", "b"]);
  });

  it("edges between unreachable nodes are excluded", () => {
    const data = makeGraphData({
      nodes: ["a", "b", "c", "d"],
      edges: [["a", "b"], ["c", "d"]],
    });
    const result = filterLocalGraph(data, "a", 1);
    // Only a-b edge, not c-d
    expect(result.edges).toHaveLength(1);
  });

  it("bidirectional edges: both directions reachable", () => {
    const data = makeGraphData({
      nodes: ["a", "b"],
      edges: [["a", "b"]],
    });
    // Starting from b, should reach a via reverse edge
    const result = filterLocalGraph(data, "b", 1);
    expect(result.nodes).toHaveLength(2);
  });

  it("handles graph with no edges", () => {
    const data = makeGraphData({ nodes: ["a", "b"] });
    const result = filterLocalGraph(data, "a", 5);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("a");
  });
});
