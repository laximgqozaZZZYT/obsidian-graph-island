import { describe, it, expect } from "vitest";
import { fnv1a, hashMeta, captureSnapshot, computeSnapshotDiff, computeSnapshotToSnapshotDiff } from "../src/utils/snapshot";
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

  it("detects removed edges", () => {
    const snap = makeSnapshot(baseData);
    const noEdges: GraphData = { nodes: baseData.nodes, edges: [] };
    const diff = computeSnapshotDiff(noEdges, snap);
    expect(diff.removedEdges).toHaveLength(1);
    expect(diff.removedEdges[0].source).toBe("a.md");
    expect(diff.removedEdges[0].target).toBe("b.md");
  });

  it("handles simultaneous add + remove + change", () => {
    const snap = makeSnapshot(baseData);
    const mixed: GraphData = {
      nodes: [
        { id: "a.md", label: "A", meta: { v: 99 } }, // changed
        // b.md removed
        { id: "new.md", label: "New", meta: {} },     // added
      ],
      edges: [],
    };
    const diff = computeSnapshotDiff(mixed, snap);
    expect(diff.addedNodeIds.has("new.md")).toBe(true);
    expect(diff.removedNodes.some(n => n.id === "b.md")).toBe(true);
    expect(diff.changedNodeIds.has("a.md")).toBe(true);
  });

  it("handles empty snapshot vs populated current", () => {
    const emptySnap = makeSnapshot({ nodes: [], edges: [] });
    const diff = computeSnapshotDiff(baseData, emptySnap);
    expect(diff.addedNodeIds.size).toBe(2); // all current nodes are "added"
    expect(diff.removedNodes).toHaveLength(0);
  });

  it("handles populated snapshot vs empty current", () => {
    const snap = makeSnapshot(baseData);
    const diff = computeSnapshotDiff({ nodes: [], edges: [] }, snap);
    expect(diff.addedNodeIds.size).toBe(0);
    expect(diff.removedNodes).toHaveLength(2); // all snapshot nodes "removed"
  });

  it("node with no meta → empty hash matches snapshot empty hash", () => {
    const data: GraphData = {
      nodes: [{ id: "x.md", label: "X" }], // no meta field
      edges: [],
    };
    const snap = makeSnapshot(data);
    const diff = computeSnapshotDiff(data, snap);
    expect(diff.changedNodeIds.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hashMeta edge cases
// ---------------------------------------------------------------------------
describe("hashMeta edge cases", () => {
  it("handles nested objects with consistent key order", () => {
    const a = { outer: { z: 3, a: 1 } };
    const b = { outer: { a: 1, z: 3 } };
    expect(hashMeta(a)).toBe(hashMeta(b));
  });

  it("handles null values in metadata", () => {
    const meta = { key: null as unknown };
    // Should not throw
    const hash = hashMeta(meta as Record<string, unknown>);
    expect(hash.length).toBeGreaterThan(0);
  });

  it("distinguishes arrays from objects", () => {
    expect(hashMeta({ a: [1, 2] })).not.toBe(hashMeta({ a: { "0": 1, "1": 2 } }));
  });

  it("handles Japanese characters in values", () => {
    const hash = hashMeta({ name: "テスト" });
    expect(hash.length).toBeGreaterThan(0);
    expect(hashMeta({ name: "テスト" })).toBe(hash); // stable
  });
});

// ---------------------------------------------------------------------------
// computeSnapshotToSnapshotDiff
// ---------------------------------------------------------------------------
describe("computeSnapshotToSnapshotDiff", () => {
  function makeSnap(
    nodes: Array<{ id: string; metaHash: string }>,
    edges: Array<{ source: string; target: string; type: string }> = [],
  ): GraphSnapshot {
    return {
      name: "test",
      createdAt: "2026-01-01T00:00:00",
      nodes,
      edges,
      context: { layout: "force", searchQuery: "", groupBy: "", nodeCount: nodes.length, edgeCount: edges.length },
    };
  }

  it("identical snapshots produce empty diff", () => {
    const snap = makeSnap([{ id: "a", metaHash: "h1" }], [{ source: "a", target: "b", type: "link" }]);
    const diff = computeSnapshotToSnapshotDiff(snap, snap);
    expect(diff.addedNodeIds.size).toBe(0);
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.changedNodeIds.size).toBe(0);
    expect(diff.addedEdgeKeys.size).toBe(0);
    expect(diff.removedEdges).toHaveLength(0);
  });

  it("detects added nodes in newer", () => {
    const older = makeSnap([{ id: "a", metaHash: "h1" }]);
    const newer = makeSnap([{ id: "a", metaHash: "h1" }, { id: "b", metaHash: "h2" }]);
    const diff = computeSnapshotToSnapshotDiff(newer, older);
    expect(diff.addedNodeIds.has("b")).toBe(true);
    expect(diff.removedNodes).toHaveLength(0);
  });

  it("detects removed nodes in newer", () => {
    const older = makeSnap([{ id: "a", metaHash: "h1" }, { id: "b", metaHash: "h2" }]);
    const newer = makeSnap([{ id: "a", metaHash: "h1" }]);
    const diff = computeSnapshotToSnapshotDiff(newer, older);
    expect(diff.removedNodes).toHaveLength(1);
    expect(diff.removedNodes[0].id).toBe("b");
  });

  it("detects changed metadata by hash comparison", () => {
    const older = makeSnap([{ id: "a", metaHash: "old-hash" }]);
    const newer = makeSnap([{ id: "a", metaHash: "new-hash" }]);
    const diff = computeSnapshotToSnapshotDiff(newer, older);
    expect(diff.changedNodeIds.has("a")).toBe(true);
  });

  it("detects added and removed edges", () => {
    const older = makeSnap([], [{ source: "a", target: "b", type: "link" }]);
    const newer = makeSnap([], [{ source: "a", target: "c", type: "semantic" }]);
    const diff = computeSnapshotToSnapshotDiff(newer, older);
    expect(diff.addedEdgeKeys.size).toBe(1);
    expect(diff.removedEdges).toHaveLength(1);
    expect(diff.removedEdges[0].source).toBe("a");
    expect(diff.removedEdges[0].target).toBe("b");
  });

  it("handles completely disjoint snapshots", () => {
    const older = makeSnap([{ id: "a", metaHash: "h" }]);
    const newer = makeSnap([{ id: "x", metaHash: "h" }]);
    const diff = computeSnapshotToSnapshotDiff(newer, older);
    expect(diff.addedNodeIds.has("x")).toBe(true);
    expect(diff.removedNodes.some(n => n.id === "a")).toBe(true);
  });

  it("handles empty snapshots", () => {
    const empty = makeSnap([]);
    const diff = computeSnapshotToSnapshotDiff(empty, empty);
    expect(diff.addedNodeIds.size).toBe(0);
    expect(diff.removedNodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// captureSnapshot → computeSnapshotDiff roundtrip (cycle120)
// ---------------------------------------------------------------------------
describe("snapshot roundtrip", () => {
  const ctx = { layout: "force", searchQuery: "", groupBy: "" };

  it("capture then diff with same data reports no changes", () => {
    const data: GraphData = {
      nodes: [
        { id: "a.md", label: "A", meta: { tags: ["t1"] } },
        { id: "b.md", label: "B", meta: { v: 42 } },
      ],
      edges: [{ source: "a.md", target: "b.md", type: "link" }],
    };
    const snap = captureSnapshot(data, "round1", ctx);
    const diff = computeSnapshotDiff(data, snap);
    expect(diff.addedNodeIds.size).toBe(0);
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.changedNodeIds.size).toBe(0);
    expect(diff.addedEdgeKeys.size).toBe(0);
    expect(diff.removedEdges).toHaveLength(0);
  });

  it("capture, add a node, diff detects addition", () => {
    const data1: GraphData = {
      nodes: [{ id: "a.md", label: "A" }],
      edges: [],
    };
    const snap = captureSnapshot(data1, "snap", ctx);
    const data2: GraphData = {
      nodes: [{ id: "a.md", label: "A" }, { id: "b.md", label: "B" }],
      edges: [],
    };
    const diff = computeSnapshotDiff(data2, snap);
    expect(diff.addedNodeIds.has("b.md")).toBe(true);
    expect(diff.removedNodes).toHaveLength(0);
  });

  it("capture, remove a node, diff detects removal", () => {
    const data1: GraphData = {
      nodes: [{ id: "a.md", label: "A" }, { id: "b.md", label: "B" }],
      edges: [{ source: "a.md", target: "b.md", type: "link" }],
    };
    const snap = captureSnapshot(data1, "snap", ctx);
    const data2: GraphData = {
      nodes: [{ id: "a.md", label: "A" }],
      edges: [],
    };
    const diff = computeSnapshotDiff(data2, snap);
    expect(diff.removedNodes.some(n => n.id === "b.md")).toBe(true);
    expect(diff.removedEdges).toHaveLength(1);
  });

  it("capture, modify meta, diff detects change", () => {
    const data1: GraphData = {
      nodes: [{ id: "a.md", label: "A", meta: { v: 1 } }],
      edges: [],
    };
    const snap = captureSnapshot(data1, "snap", ctx);
    const data2: GraphData = {
      nodes: [{ id: "a.md", label: "A", meta: { v: 2 } }],
      edges: [],
    };
    const diff = computeSnapshotDiff(data2, snap);
    expect(diff.changedNodeIds.has("a.md")).toBe(true);
  });

  it("large graph roundtrip (100 nodes, 200 edges)", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: `n${i}.md`, label: `N${i}`, meta: { idx: i },
    }));
    const edges = Array.from({ length: 200 }, (_, i) => ({
      source: `n${i % 100}.md`,
      target: `n${(i * 7 + 3) % 100}.md`,
      type: "link" as const,
    }));
    const data: GraphData = { nodes, edges };
    const snap = captureSnapshot(data, "large", ctx);
    const diff = computeSnapshotDiff(data, snap);
    // Perfect roundtrip — no changes
    expect(diff.addedNodeIds.size).toBe(0);
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.changedNodeIds.size).toBe(0);
  });
});
