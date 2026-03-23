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

  // --- Boundary values (cycle123) ---

  it("star graph: 1 hop from hub reaches all leaves", () => {
    const data = makeGraphData({
      nodes: ["hub", "leaf1", "leaf2", "leaf3", "leaf4", "leaf5"],
      edges: [["hub", "leaf1"], ["hub", "leaf2"], ["hub", "leaf3"], ["hub", "leaf4"], ["hub", "leaf5"]],
    });
    const result = filterLocalGraph(data, "hub", 1);
    expect(result.nodes).toHaveLength(6);
    expect(result.edges).toHaveLength(5);
  });

  it("long chain: hop limit respected", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const edges: [string, string][] = [];
    for (let i = 0; i < 9; i++) edges.push([`n${i}`, `n${i + 1}`]);
    const data = makeGraphData({ nodes, edges });
    const result = filterLocalGraph(data, "n0", 3);
    // Should reach n0, n1, n2, n3 (4 nodes)
    expect(result.nodes).toHaveLength(4);
    expect(result.nodes.map(n => n.id).sort()).toEqual(["n0", "n1", "n2", "n3"]);
  });

  it("cycle graph: doesn't revisit nodes", () => {
    const data = makeGraphData({
      nodes: ["a", "b", "c"],
      edges: [["a", "b"], ["b", "c"], ["c", "a"]],
    });
    const result = filterLocalGraph(data, "a", 10);
    expect(result.nodes).toHaveLength(3); // all reachable, no duplicates
  });

  it("negative hops treated as 0 (center only)", () => {
    const data = makeGraphData({ nodes: ["a", "b"], edges: [["a", "b"]] });
    const result = filterLocalGraph(data, "a", -1);
    // Negative hops → BFS runs 0 iterations → only center
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].id).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// parseConfig — additional boundary values (cycle123)
// ---------------------------------------------------------------------------
describe("parseConfig boundary values", () => {
  it("handles JSON with nested objects", () => {
    const cfg = parseConfig('{"center":"a.md","layout":{"type":"force"}}');
    expect(cfg.center).toBe("a.md");
    expect(cfg.layout).toEqual({ type: "force" });
  });

  it("handles JSON with arrays", () => {
    const cfg = parseConfig('{"tags":["a","b","c"]}');
    expect(cfg.tags).toEqual(["a", "b", "c"]);
  });

  it("handles whitespace-only input", () => {
    expect(parseConfig("   ")).toEqual({});
  });

  it("handles null JSON value", () => {
    const cfg = parseConfig("null");
    // JSON.parse("null") returns null, not {}
    expect(cfg === null || (typeof cfg === "object" && Object.keys(cfg).length === 0)).toBe(true);
  });
});
