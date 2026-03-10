import { describe, it, expect } from "vitest";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";
import {
  groupNodesByTag,
  groupNodesByCategory,
  collapseGroup,
  expandGroup,
  type GroupSpec,
} from "../src/utils/node-grouping";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeNode(id: string, opts?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...opts };
}

function makeEdge(source: string, target: string, opts?: Partial<GraphEdge>): GraphEdge {
  return { id: `${source}->${target}`, source, target, ...opts };
}

// ---------------------------------------------------------------------------
// groupNodesByTag
// ---------------------------------------------------------------------------
describe("groupNodesByTag", () => {
  it("groups nodes by their first tag", () => {
    const nodes: GraphNode[] = [
      makeNode("a", { tags: ["programming", "web"] }),
      makeNode("b", { tags: ["programming"] }),
      makeNode("c", { tags: ["design"] }),
      makeNode("d", { tags: ["design"] }),
      makeNode("e"), // no tags
    ];
    const groups = groupNodesByTag(nodes);
    expect(groups).toHaveLength(2);

    const progGroup = groups.find(g => g.key === "tag:programming");
    expect(progGroup).toBeDefined();
    expect(progGroup!.memberIds).toEqual(["a", "b"]);
    expect(progGroup!.label).toBe("programming");

    const designGroup = groups.find(g => g.key === "tag:design");
    expect(designGroup).toBeDefined();
    expect(designGroup!.memberIds).toEqual(["c", "d"]);
  });

  it("skips tag nodes (isTag=true)", () => {
    const nodes: GraphNode[] = [
      makeNode("tag:programming", { isTag: true, tags: ["programming"] }),
      makeNode("a", { tags: ["programming"] }),
      makeNode("b", { tags: ["programming"] }),
    ];
    const groups = groupNodesByTag(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(["a", "b"]);
  });

  it("does not create singleton groups", () => {
    const nodes: GraphNode[] = [
      makeNode("a", { tags: ["unique-tag"] }),
      makeNode("b", { tags: ["common"] }),
      makeNode("c", { tags: ["common"] }),
    ];
    const groups = groupNodesByTag(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("tag:common");
  });

  it("returns empty array when no tags exist", () => {
    const nodes: GraphNode[] = [makeNode("a"), makeNode("b")];
    expect(groupNodesByTag(nodes)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// groupNodesByCategory
// ---------------------------------------------------------------------------
describe("groupNodesByCategory", () => {
  it("groups nodes by category", () => {
    const nodes: GraphNode[] = [
      makeNode("a", { category: "character" }),
      makeNode("b", { category: "character" }),
      makeNode("c", { category: "location" }),
      makeNode("d", { category: "location" }),
      makeNode("e"), // no category
    ];
    const groups = groupNodesByCategory(nodes);
    expect(groups).toHaveLength(2);

    const charGroup = groups.find(g => g.key === "category:character");
    expect(charGroup).toBeDefined();
    expect(charGroup!.memberIds).toEqual(["a", "b"]);

    const locGroup = groups.find(g => g.key === "category:location");
    expect(locGroup).toBeDefined();
    expect(locGroup!.memberIds).toEqual(["c", "d"]);
  });

  it("skips tag nodes", () => {
    const nodes: GraphNode[] = [
      makeNode("t", { isTag: true, category: "tag" }),
      makeNode("a", { category: "item" }),
      makeNode("b", { category: "item" }),
    ];
    const groups = groupNodesByCategory(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(["a", "b"]);
  });

  it("does not create singleton groups", () => {
    const nodes: GraphNode[] = [
      makeNode("a", { category: "unique" }),
      makeNode("b", { category: "shared" }),
      makeNode("c", { category: "shared" }),
    ];
    const groups = groupNodesByCategory(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("category:shared");
  });
});

// ---------------------------------------------------------------------------
// collapseGroup
// ---------------------------------------------------------------------------
describe("collapseGroup", () => {
  it("hides member nodes and creates a super node", () => {
    const data: GraphData = {
      nodes: [
        makeNode("a", { x: 10, y: 20, tags: ["prog"] }),
        makeNode("b", { x: 30, y: 40, tags: ["prog"] }),
        makeNode("c", { x: 50, y: 60 }),
      ],
      edges: [makeEdge("a", "c"), makeEdge("a", "b")],
    };
    const group: GroupSpec = { key: "tag:prog", label: "prog", memberIds: ["a", "b"] };
    const result = collapseGroup(data, group);

    // Members should be gone, super node should exist
    expect(result.nodes.find(n => n.id === "a")).toBeUndefined();
    expect(result.nodes.find(n => n.id === "b")).toBeUndefined();

    const superNode = result.nodes.find(n => n.id === "__super__tag:prog");
    expect(superNode).toBeDefined();
    expect(superNode!.collapsedMembers).toEqual(["a", "b"]);
    expect(superNode!.label).toBe("prog (2)");

    // Position should be centroid of members
    expect(superNode!.x).toBe(20); // (10+30)/2
    expect(superNode!.y).toBe(30); // (20+40)/2

    // Non-member node should remain
    expect(result.nodes.find(n => n.id === "c")).toBeDefined();
  });

  it("re-routes edges from members to super node", () => {
    const data: GraphData = {
      nodes: [
        makeNode("a", { tags: ["t"] }),
        makeNode("b", { tags: ["t"] }),
        makeNode("c"),
        makeNode("d"),
      ],
      edges: [
        makeEdge("a", "c"),
        makeEdge("d", "b"),
        makeEdge("a", "b"), // internal
      ],
    };
    const group: GroupSpec = { key: "tag:t", label: "t", memberIds: ["a", "b"] };
    const result = collapseGroup(data, group);

    // Internal edge (a->b) should be removed
    // a->c should become super->c
    // d->b should become d->super
    const superNodeId = "__super__tag:t";
    expect(result.edges.find(e => e.source === superNodeId && e.target === "c")).toBeDefined();
    expect(result.edges.find(e => e.source === "d" && e.target === superNodeId)).toBeDefined();
    expect(result.edges.find(e => e.source === "a" || e.target === "b")).toBeUndefined();
  });

  it("deduplicates rerouted edges to super node", () => {
    const data: GraphData = {
      nodes: [
        makeNode("a", { tags: ["t"] }),
        makeNode("b", { tags: ["t"] }),
        makeNode("c"),
      ],
      edges: [
        makeEdge("a", "c"),
        makeEdge("b", "c"), // both route to super->c
      ],
    };
    const group: GroupSpec = { key: "tag:t", label: "t", memberIds: ["a", "b"] };
    const result = collapseGroup(data, group);

    const superEdgesToC = result.edges.filter(
      e => e.source === "__super__tag:t" && e.target === "c"
    );
    expect(superEdgesToC).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// expandGroup
// ---------------------------------------------------------------------------
describe("expandGroup", () => {
  it("restores member nodes from original data", () => {
    const originalData: GraphData = {
      nodes: [
        makeNode("a", { x: 10, y: 20, tags: ["prog"] }),
        makeNode("b", { x: 30, y: 40, tags: ["prog"] }),
        makeNode("c", { x: 50, y: 60 }),
      ],
      edges: [makeEdge("a", "c"), makeEdge("a", "b")],
    };

    // First collapse, then expand
    const group: GroupSpec = { key: "tag:prog", label: "prog", memberIds: ["a", "b"] };
    const collapsed = collapseGroup(originalData, group);
    const expanded = expandGroup(collapsed, "__super__tag:prog", originalData);

    // Super node should be gone, members restored
    expect(expanded.nodes.find(n => n.id === "__super__tag:prog")).toBeUndefined();
    expect(expanded.nodes.find(n => n.id === "a")).toBeDefined();
    expect(expanded.nodes.find(n => n.id === "b")).toBeDefined();
    expect(expanded.nodes.find(n => n.id === "c")).toBeDefined();
  });

  it("restores original edges for member nodes", () => {
    const originalData: GraphData = {
      nodes: [
        makeNode("a", { tags: ["t"] }),
        makeNode("b", { tags: ["t"] }),
        makeNode("c"),
      ],
      edges: [makeEdge("a", "c"), makeEdge("a", "b")],
    };

    const group: GroupSpec = { key: "tag:t", label: "t", memberIds: ["a", "b"] };
    const collapsed = collapseGroup(originalData, group);
    const expanded = expandGroup(collapsed, "__super__tag:t", originalData);

    // Should have both original edges
    expect(expanded.edges.find(e => e.source === "a" && e.target === "c")).toBeDefined();
    expect(expanded.edges.find(e => e.source === "a" && e.target === "b")).toBeDefined();
  });

  it("returns unchanged data when super node not found", () => {
    const data: GraphData = {
      nodes: [makeNode("a")],
      edges: [],
    };
    const result = expandGroup(data, "nonexistent", data);
    expect(result).toBe(data);
  });

  it("positions restored nodes around super node location", () => {
    const originalData: GraphData = {
      nodes: [
        makeNode("a", { tags: ["t"] }),
        makeNode("b", { tags: ["t"] }),
      ],
      edges: [],
    };

    const group: GroupSpec = { key: "tag:t", label: "t", memberIds: ["a", "b"] };
    const collapsed = collapseGroup(originalData, group);

    // Move super node to a specific position
    const superNode = collapsed.nodes.find(n => n.id === "__super__tag:t")!;
    superNode.x = 100;
    superNode.y = 200;

    const expanded = expandGroup(collapsed, "__super__tag:t", originalData);

    // Restored nodes should be near the super node position, not at origin
    for (const n of expanded.nodes) {
      const dx = Math.abs(n.x - 100);
      const dy = Math.abs(n.y - 200);
      // Should be within the spread radius
      expect(dx).toBeLessThan(100);
      expect(dy).toBeLessThan(100);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge re-connection (round-trip)
// ---------------------------------------------------------------------------
describe("edge re-connection round-trip", () => {
  it("preserves external connectivity after collapse and expand", () => {
    const originalData: GraphData = {
      nodes: [
        makeNode("a", { tags: ["group"] }),
        makeNode("b", { tags: ["group"] }),
        makeNode("c"),
        makeNode("d"),
      ],
      edges: [
        makeEdge("a", "c"),
        makeEdge("b", "d"),
        makeEdge("a", "b"),
        makeEdge("c", "d"),
      ],
    };

    const group: GroupSpec = { key: "tag:group", label: "group", memberIds: ["a", "b"] };

    // Collapse
    const collapsed = collapseGroup(originalData, group);
    // Verify super node connects to c and d
    const superNodeId = "__super__tag:group";
    expect(collapsed.edges.some(e => e.source === superNodeId && e.target === "c")).toBe(true);
    expect(collapsed.edges.some(e => e.source === superNodeId && e.target === "d")).toBe(true);
    // c->d edge should be untouched
    expect(collapsed.edges.some(e => e.source === "c" && e.target === "d")).toBe(true);

    // Expand
    const expanded = expandGroup(collapsed, superNodeId, originalData);
    // All original edges should be restored
    expect(expanded.edges.some(e => e.source === "a" && e.target === "c")).toBe(true);
    expect(expanded.edges.some(e => e.source === "b" && e.target === "d")).toBe(true);
    expect(expanded.edges.some(e => e.source === "a" && e.target === "b")).toBe(true);
    expect(expanded.edges.some(e => e.source === "c" && e.target === "d")).toBe(true);
  });
});
