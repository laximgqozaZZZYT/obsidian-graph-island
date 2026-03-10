import { describe, it, expect } from "vitest";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";
import {
  groupNodesByTag,
  groupNodesByCategory,
  groupNodesByFolder,
  groupNodesByField,
  getNodeFieldValues,
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
// getNodeFieldValues
// ---------------------------------------------------------------------------
describe("getNodeFieldValues", () => {
  it("returns tags for field='tag'", () => {
    const n = makeNode("a", { tags: ["x", "y"] });
    expect(getNodeFieldValues(n, "tag")).toEqual(["x", "y"]);
  });

  it("returns empty for tag nodes (isTag=true)", () => {
    const n = makeNode("t", { isTag: true, tags: ["x"] });
    expect(getNodeFieldValues(n, "tag")).toEqual([]);
  });

  it("returns empty when no tags", () => {
    expect(getNodeFieldValues(makeNode("a"), "tag")).toEqual([]);
  });

  it("returns category as single-element array", () => {
    const n = makeNode("a", { category: "char" });
    expect(getNodeFieldValues(n, "category")).toEqual(["char"]);
  });

  it("returns empty when no category", () => {
    expect(getNodeFieldValues(makeNode("a"), "category")).toEqual([]);
  });

  it("extracts folder from filePath", () => {
    const n = makeNode("a", { filePath: "notes/daily/2024.md" });
    expect(getNodeFieldValues(n, "folder")).toEqual(["notes/daily"]);
  });

  it("returns '/' for root-level files", () => {
    const n = makeNode("a", { filePath: "readme.md" });
    expect(getNodeFieldValues(n, "folder")).toEqual(["/"]);
  });

  it("returns empty folder when no filePath", () => {
    expect(getNodeFieldValues(makeNode("a"), "folder")).toEqual([]);
  });

  it("returns full filePath for field='path'", () => {
    const n = makeNode("a", { filePath: "notes/foo.md" });
    expect(getNodeFieldValues(n, "path")).toEqual(["notes/foo.md"]);
  });

  it("returns filename without .md for field='file'", () => {
    const n = makeNode("a", { filePath: "notes/foo.md" });
    expect(getNodeFieldValues(n, "file")).toEqual(["foo"]);
  });

  it("returns node id for field='id'", () => {
    expect(getNodeFieldValues(makeNode("abc"), "id")).toEqual(["abc"]);
  });

  it("returns 'true'/'false' for field='isTag'", () => {
    expect(getNodeFieldValues(makeNode("a", { isTag: true }), "isTag")).toEqual(["true"]);
    expect(getNodeFieldValues(makeNode("b"), "isTag")).toEqual(["false"]);
  });

  it("reads scalar meta property", () => {
    const n = makeNode("a", { meta: { status: "draft" } });
    expect(getNodeFieldValues(n, "status")).toEqual(["draft"]);
  });

  it("reads array meta property", () => {
    const n = makeNode("a", { meta: { aliases: ["x", "y"] } });
    expect(getNodeFieldValues(n, "aliases")).toEqual(["x", "y"]);
  });

  it("reads nested meta property with dot notation", () => {
    const n = makeNode("a", { meta: { author: { name: "Alice" } } });
    expect(getNodeFieldValues(n, "author.name")).toEqual(["Alice"]);
  });

  it("returns empty for missing meta property", () => {
    const n = makeNode("a", { meta: { status: "ok" } });
    expect(getNodeFieldValues(n, "missing")).toEqual([]);
  });

  it("returns empty for missing meta when no meta at all", () => {
    expect(getNodeFieldValues(makeNode("a"), "anything")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// groupNodesByField
// ---------------------------------------------------------------------------
describe("groupNodesByField", () => {
  it("groups nodes by tag", () => {
    const nodes = [
      makeNode("a", { tags: ["programming", "web"] }),
      makeNode("b", { tags: ["programming"] }),
      makeNode("c", { tags: ["design"] }),
      makeNode("d", { tags: ["design"] }),
      makeNode("e"), // no tags
    ];
    const groups = groupNodesByField(nodes, "tag");
    expect(groups).toHaveLength(2);

    const progGroup = groups.find(g => g.key === "tag:programming");
    expect(progGroup).toBeDefined();
    expect(progGroup!.memberIds).toEqual(["a", "b"]);
    expect(progGroup!.label).toBe("programming");

    const designGroup = groups.find(g => g.key === "tag:design");
    expect(designGroup).toBeDefined();
    expect(designGroup!.memberIds).toEqual(["c", "d"]);
  });

  it("skips tag nodes (isTag=true) for tag field", () => {
    const nodes = [
      makeNode("tag:programming", { isTag: true, tags: ["programming"] }),
      makeNode("a", { tags: ["programming"] }),
      makeNode("b", { tags: ["programming"] }),
    ];
    const groups = groupNodesByField(nodes, "tag");
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(["a", "b"]);
  });

  it("does not create singleton groups", () => {
    const nodes = [
      makeNode("a", { tags: ["unique-tag"] }),
      makeNode("b", { tags: ["common"] }),
      makeNode("c", { tags: ["common"] }),
    ];
    const groups = groupNodesByField(nodes, "tag");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("tag:common");
  });

  it("returns empty array when no tags exist", () => {
    const nodes = [makeNode("a"), makeNode("b")];
    expect(groupNodesByField(nodes, "tag")).toEqual([]);
  });

  it("groups nodes by category", () => {
    const nodes = [
      makeNode("a", { category: "character" }),
      makeNode("b", { category: "character" }),
      makeNode("c", { category: "location" }),
      makeNode("d", { category: "location" }),
      makeNode("e"),
    ];
    const groups = groupNodesByField(nodes, "category");
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.key === "category:character")!.memberIds).toEqual(["a", "b"]);
    expect(groups.find(g => g.key === "category:location")!.memberIds).toEqual(["c", "d"]);
  });

  it("groups nodes by folder", () => {
    const nodes = [
      makeNode("a", { filePath: "notes/daily/a.md" }),
      makeNode("b", { filePath: "notes/daily/b.md" }),
      makeNode("c", { filePath: "projects/c.md" }),
      makeNode("d", { filePath: "projects/d.md" }),
    ];
    const groups = groupNodesByField(nodes, "folder");
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.key === "folder:notes/daily")!.memberIds).toEqual(["a", "b"]);
    expect(groups.find(g => g.key === "folder:projects")!.memberIds).toEqual(["c", "d"]);
  });

  it("handles root-level files in folder grouping", () => {
    const nodes = [
      makeNode("a", { filePath: "readme.md" }),
      makeNode("b", { filePath: "index.md" }),
    ];
    const groups = groupNodesByField(nodes, "folder");
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("folder:/");
    expect(groups[0].memberIds).toEqual(["a", "b"]);
  });

  it("returns empty for field='none'", () => {
    const nodes = [makeNode("a", { tags: ["x"] }), makeNode("b", { tags: ["x"] })];
    expect(groupNodesByField(nodes, "none")).toEqual([]);
  });

  it("returns empty for empty field string", () => {
    expect(groupNodesByField([makeNode("a")], "")).toEqual([]);
  });

  it("respects custom minSize option", () => {
    const nodes = [
      makeNode("a", { tags: ["x"] }),
      makeNode("b", { tags: ["x"] }),
      makeNode("c", { tags: ["x"] }),
      makeNode("d", { tags: ["y"] }),
      makeNode("e", { tags: ["y"] }),
    ];
    const groups = groupNodesByField(nodes, "tag", { minSize: 3 });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("tag:x");
  });

  it("respects filter option", () => {
    const nodes = [
      makeNode("a", { tags: ["programming"] }),
      makeNode("b", { tags: ["programming"] }),
      makeNode("c", { tags: ["design"] }),
      makeNode("d", { tags: ["design"] }),
    ];
    const groups = groupNodesByField(nodes, "tag", { filter: "prog" });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("tag:programming");
  });

  it("groups by meta (frontmatter) field", () => {
    const nodes = [
      makeNode("a", { meta: { status: "draft" } }),
      makeNode("b", { meta: { status: "draft" } }),
      makeNode("c", { meta: { status: "published" } }),
      makeNode("d", { meta: { status: "published" } }),
    ];
    const groups = groupNodesByField(nodes, "status");
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.key === "status:draft")!.memberIds).toEqual(["a", "b"]);
    expect(groups.find(g => g.key === "status:published")!.memberIds).toEqual(["c", "d"]);
  });

  it("deduplicates multi-tag nodes into largest group", () => {
    const nodes = [
      makeNode("a", { tags: ["small", "big"] }),
      makeNode("b", { tags: ["big"] }),
      makeNode("c", { tags: ["big"] }),
      makeNode("d", { tags: ["small"] }),
    ];
    // "big" has 3 mentions (a,b,c), "small" has 2 (a,d)
    // node "a" should go to "big" (larger count)
    const groups = groupNodesByField(nodes, "tag");
    const bigGroup = groups.find(g => g.key === "tag:big");
    expect(bigGroup!.memberIds).toContain("a");
    expect(bigGroup!.memberIds).toContain("b");
    expect(bigGroup!.memberIds).toContain("c");
  });
});

// ---------------------------------------------------------------------------
// groupNodesByTag (wrapper)
// ---------------------------------------------------------------------------
describe("groupNodesByTag", () => {
  it("delegates to groupNodesByField and returns correct groups", () => {
    const nodes = [
      makeNode("a", { tags: ["programming"] }),
      makeNode("b", { tags: ["programming"] }),
      makeNode("c", { tags: ["design"] }),
      makeNode("d", { tags: ["design"] }),
    ];
    const groups = groupNodesByTag(nodes);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.key === "tag:programming")!.memberIds).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// groupNodesByCategory (wrapper)
// ---------------------------------------------------------------------------
describe("groupNodesByCategory", () => {
  it("delegates to groupNodesByField and returns correct groups", () => {
    const nodes = [
      makeNode("a", { category: "character" }),
      makeNode("b", { category: "character" }),
      makeNode("c", { category: "location" }),
      makeNode("d", { category: "location" }),
    ];
    const groups = groupNodesByCategory(nodes);
    expect(groups).toHaveLength(2);
    expect(groups.find(g => g.key === "category:character")!.memberIds).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// groupNodesByFolder (wrapper)
// ---------------------------------------------------------------------------
describe("groupNodesByFolder", () => {
  it("delegates to groupNodesByField and returns correct groups", () => {
    const nodes = [
      makeNode("a", { filePath: "notes/a.md" }),
      makeNode("b", { filePath: "notes/b.md" }),
    ];
    const groups = groupNodesByFolder(nodes);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("folder:notes");
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

    const group: GroupSpec = { key: "tag:prog", label: "prog", memberIds: ["a", "b"] };
    const collapsed = collapseGroup(originalData, group);
    const expanded = expandGroup(collapsed, "__super__tag:prog", originalData);

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

    const superNode = collapsed.nodes.find(n => n.id === "__super__tag:t")!;
    superNode.x = 100;
    superNode.y = 200;

    const expanded = expandGroup(collapsed, "__super__tag:t", originalData);

    for (const n of expanded.nodes) {
      const dx = Math.abs(n.x - 100);
      const dy = Math.abs(n.y - 200);
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

    const collapsed = collapseGroup(originalData, group);
    const superNodeId = "__super__tag:group";
    expect(collapsed.edges.some(e => e.source === superNodeId && e.target === "c")).toBe(true);
    expect(collapsed.edges.some(e => e.source === superNodeId && e.target === "d")).toBe(true);
    expect(collapsed.edges.some(e => e.source === "c" && e.target === "d")).toBe(true);

    const expanded = expandGroup(collapsed, superNodeId, originalData);
    expect(expanded.edges.some(e => e.source === "a" && e.target === "c")).toBe(true);
    expect(expanded.edges.some(e => e.source === "b" && e.target === "d")).toBe(true);
    expect(expanded.edges.some(e => e.source === "a" && e.target === "b")).toBe(true);
    expect(expanded.edges.some(e => e.source === "c" && e.target === "d")).toBe(true);
  });
});
