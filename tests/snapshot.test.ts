import { describe, it, expect } from "vitest";
import { fnv1a, hashMeta, captureSnapshot, computeSnapshotDiff } from "../src/utils/snapshot";
import type { GraphData, GraphSnapshot } from "../src/types";

describe("fnv1a", () => {
  it("returns consistent hash for same input", () => {
    expect(fnv1a("hello")).toBe(fnv1a("hello"));
  });

  it("returns different hashes for different inputs", () => {
    expect(fnv1a("hello")).not.toBe(fnv1a("world"));
  });

  it("returns non-empty string", () => {
    expect(fnv1a("").length).toBeGreaterThan(0);
    expect(fnv1a("test").length).toBeGreaterThan(0);
  });

  it("returns hex string", () => {
    expect(/^[0-9a-f]+$/.test(fnv1a("test"))).toBe(true);
  });
});

describe("hashMeta", () => {
  it("returns empty string for undefined", () => {
    expect(hashMeta(undefined)).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(hashMeta({})).toBe("");
  });

  it("returns consistent hash for same metadata", () => {
    const meta = { tags: ["a", "b"], category: "note" };
    expect(hashMeta(meta)).toBe(hashMeta(meta));
  });

  it("returns same hash regardless of key order", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 2, x: 1 };
    expect(hashMeta(a)).toBe(hashMeta(b));
  });

  it("returns different hash for different values", () => {
    expect(hashMeta({ a: 1 })).not.toBe(hashMeta({ a: 2 }));
  });
});

describe("captureSnapshot", () => {
  const mockData: GraphData = {
    nodes: [
      { id: "a.md", label: "A", meta: { tags: ["t1"] } },
      { id: "b.md", label: "B", meta: {} },
    ],
    edges: [
      { source: "a.md", target: "b.md", type: "link" },
    ],
  };

  it("captures nodes and edges", () => {
    const snap = captureSnapshot(mockData, "test-snap", {
      layout: "force", searchQuery: "", groupBy: "",
    });
    expect(snap.name).toBe("test-snap");
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges).toHaveLength(1);
  });

  it("records context metadata", () => {
    const snap = captureSnapshot(mockData, "s1", {
      layout: "arc", searchQuery: "tag:x", groupBy: "category",
    });
    expect(snap.context.layout).toBe("arc");
    expect(snap.context.searchQuery).toBe("tag:x");
    expect(snap.context.nodeCount).toBe(2);
    expect(snap.context.edgeCount).toBe(1);
  });

  it("generates ISO timestamp", () => {
    const snap = captureSnapshot(mockData, "s", {
      layout: "", searchQuery: "", groupBy: "",
    });
    expect(snap.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles empty graph", () => {
    const empty: GraphData = { nodes: [], edges: [] };
    const snap = captureSnapshot(empty, "empty", {
      layout: "force", searchQuery: "", groupBy: "",
    });
    expect(snap.nodes).toHaveLength(0);
    expect(snap.edges).toHaveLength(0);
  });
});

describe("computeSnapshotDiff", () => {
  const baseData: GraphData = {
    nodes: [
      { id: "a.md", label: "A", meta: { v: 1 } },
      { id: "b.md", label: "B", meta: {} },
    ],
    edges: [
      { source: "a.md", target: "b.md", type: "link" },
    ],
  };

  function makeSnapshot(data: GraphData): GraphSnapshot {
    return captureSnapshot(data, "test", {
      layout: "force", searchQuery: "", groupBy: "",
    });
  }

  it("reports no diff for identical data", () => {
    const snap = makeSnapshot(baseData);
    const diff = computeSnapshotDiff(baseData, snap);
    expect(diff.addedNodeIds.size).toBe(0);
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.addedEdgeKeys.size).toBe(0);
    expect(diff.removedEdges).toHaveLength(0);
  });

  it("detects added nodes", () => {
    const snap = makeSnapshot(baseData);
    const updated: GraphData = {
      nodes: [...baseData.nodes, { id: "c.md", label: "C", meta: {} }],
      edges: baseData.edges,
    };
    const diff = computeSnapshotDiff(updated, snap);
    expect(diff.addedNodeIds.has("c.md")).toBe(true);
  });

  it("detects removed nodes", () => {
    const snap = makeSnapshot(baseData);
    const reduced: GraphData = {
      nodes: [baseData.nodes[0]],
      edges: [],
    };
    const diff = computeSnapshotDiff(reduced, snap);
    expect(diff.removedNodes.some(n => n.id === "b.md")).toBe(true);
  });

  it("detects changed node metadata", () => {
    const snap = makeSnapshot(baseData);
    const changed: GraphData = {
      nodes: [
        { id: "a.md", label: "A", meta: { v: 2 } }, // meta changed
        { id: "b.md", label: "B", meta: {} },
      ],
      edges: baseData.edges,
    };
    const diff = computeSnapshotDiff(changed, snap);
    expect(diff.changedNodeIds.has("a.md")).toBe(true);
  });

  it("detects added edges", () => {
    const snap = makeSnapshot(baseData);
    const withEdge: GraphData = {
      nodes: baseData.nodes,
      edges: [
        ...baseData.edges,
        { source: "b.md", target: "a.md", type: "semantic" },
      ],
    };
    const diff = computeSnapshotDiff(withEdge, snap);
    expect(diff.addedEdgeKeys.size).toBeGreaterThan(0);
  });
});
