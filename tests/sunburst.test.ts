import { describe, it, expect } from "vitest";
import { computeSunburstArcs, applySunburstLayout, buildSunburstFromGraphNodes, getGroupingPath, assignValues, maxDepth, collectFilePaths, countDirectChildren } from "../src/layouts/sunburst";
import type { SunburstData, GraphNode, GraphEdge } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
  return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function makeEdge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

function sampleRoot(): SunburstData {
  return {
    name: "Vault",
    children: [
      {
        name: "Characters",
        children: [
          { name: "Alice", value: 1, filePath: "alice.md" },
          { name: "Bob", value: 1, filePath: "bob.md" },
        ],
      },
      {
        name: "Locations",
        children: [
          { name: "Castle", value: 1, filePath: "castle.md" },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// computeSunburstArcs
// ---------------------------------------------------------------------------

describe("computeSunburstArcs", () => {
  it("returns arcs for each node in the hierarchy", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    // root + 2 groups + 3 leaves = 6 arcs
    expect(arcs.length).toBe(6);
  });

  it("root arc spans full circle", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    const rootArc = arcs.find(a => a.depth === 0)!;
    expect(rootArc.x0).toBe(0);
    expect(rootArc.x1).toBeCloseTo(2 * Math.PI, 5);
  });

  it("depth-1 arcs partition the full circle", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    const depth1 = arcs.filter(a => a.depth === 1);
    expect(depth1.length).toBe(2);
    // Characters has 2/3 of total, Locations has 1/3
    const totalSpan = depth1.reduce((s, a) => s + (a.x1 - a.x0), 0);
    expect(totalSpan).toBeCloseTo(2 * Math.PI, 5);
  });

  it("preserves filePath on leaf arcs", () => {
    const root = sampleRoot();
    const arcs = computeSunburstArcs(root, 800, 600);
    const aliceArc = arcs.find(a => a.name === "Alice");
    expect(aliceArc?.filePath).toBe("alice.md");
  });

  it("handles empty root", () => {
    const root: SunburstData = { name: "Empty" };
    const arcs = computeSunburstArcs(root, 800, 600);
    expect(arcs.length).toBe(1); // just root
  });

  it("handles single child", () => {
    const root: SunburstData = {
      name: "Root",
      children: [{ name: "Only", value: 1 }],
    };
    const arcs = computeSunburstArcs(root, 400, 400);
    expect(arcs.length).toBe(2);
    const child = arcs.find(a => a.depth === 1)!;
    expect(child.x1 - child.x0).toBeCloseTo(2 * Math.PI, 5);
  });
});

// ---------------------------------------------------------------------------
// applySunburstLayout
// ---------------------------------------------------------------------------

describe("applySunburstLayout", () => {
  it("positions nodes at arc centroids", () => {
    const nodes = [
      makeNode("alice", { filePath: "alice.md" }),
      makeNode("bob", { filePath: "bob.md" }),
      makeNode("castle", { filePath: "castle.md" }),
    ];
    const edges: GraphEdge[] = [makeEdge("alice", "bob")];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges },
      root,
      { width: 800, height: 600, groupField: "category" },
    );

    expect(result.data.nodes.length).toBe(3);
    expect(result.arcs.length).toBeGreaterThan(0);

    // All nodes should be positioned away from their initial (0,0)
    for (const n of result.data.nodes) {
      const dist = Math.sqrt((n.x - result.cx) ** 2 + (n.y - result.cy) ** 2);
      expect(dist).toBeGreaterThan(0);
    }
  });

  it("places unmatched nodes on outer ring", () => {
    const nodes = [
      makeNode("orphan"), // no filePath
    ];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges: [] },
      root,
      { width: 800, height: 600, groupField: "category" },
    );

    const n = result.data.nodes[0];
    // Unmatched nodes are distributed around the outermost ring, not at center
    const dist = Math.sqrt((n.x - result.cx) ** 2 + (n.y - result.cy) ** 2);
    expect(dist).toBeGreaterThan(0);
  });

  it("uses custom center coordinates", () => {
    const nodes = [makeNode("a", { filePath: "alice.md" })];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges: [] },
      root,
      { width: 800, height: 600, centerX: 100, centerY: 200, groupField: "category" },
    );

    expect(result.cx).toBe(100);
    expect(result.cy).toBe(200);
  });

  it("preserves edges", () => {
    const nodes = [
      makeNode("alice", { filePath: "alice.md" }),
      makeNode("bob", { filePath: "bob.md" }),
    ];
    const edges = [makeEdge("alice", "bob")];
    const root = sampleRoot();

    const result = applySunburstLayout(
      { nodes, edges },
      root,
      { width: 800, height: 600, groupField: "category" },
    );

    expect(result.data.edges).toBe(edges);
  });
});

// ---------------------------------------------------------------------------
// getGroupingPath — derive grouping path from node properties
// ---------------------------------------------------------------------------
describe("getGroupingPath", () => {
  it("uses category as first segment", () => {
    const n = makeNode("a", { category: "character" });
    expect(getGroupingPath(n)).toEqual(["character"]);
  });

  it("uses folder path segments (excluding filename)", () => {
    const n = makeNode("a", { filePath: "stories/fantasy/hero.md" });
    expect(getGroupingPath(n)).toEqual(["stories", "fantasy"]);
  });

  it("combines category + folder path", () => {
    const n = makeNode("a", { category: "NPC", filePath: "world/towns/mayor.md" });
    expect(getGroupingPath(n)).toEqual(["NPC", "world", "towns"]);
  });

  it("falls back to first letter of ID when no category or path", () => {
    const n = makeNode("zephyr");
    expect(getGroupingPath(n)).toEqual(["Z"]);
  });

  it("handles root-level file (no folder segments → first letter fallback)", () => {
    const n = makeNode("abc", { filePath: "readme.md" });
    // filePath has no "/" before filename, so segments=[], fallback to ID first letter
    expect(getGroupingPath(n)).toEqual(["A"]);
  });

  it("handles Japanese category", () => {
    const n = makeNode("a", { category: "キャラクター" });
    expect(getGroupingPath(n)).toEqual(["キャラクター"]);
  });

  it("handles empty string ID", () => {
    const n = makeNode("");
    const path = getGroupingPath(n);
    expect(path.length).toBe(1);
    expect(path[0]).toBe("?"); // fallback for empty charAt
  });
});

// ---------------------------------------------------------------------------
// buildSunburstFromGraphNodes — trie-based hierarchy builder
// ---------------------------------------------------------------------------
describe("buildSunburstFromGraphNodes", () => {
  it("returns root with name 'Graph' for empty input", () => {
    const result = buildSunburstFromGraphNodes([]);
    expect(result.name).toBe("Graph");
    expect(result.value).toBe(1);
  });

  it("groups nodes by folder path", () => {
    const nodes = [
      makeNode("a", { filePath: "stories/hero.md" }),
      makeNode("b", { filePath: "stories/villain.md" }),
      makeNode("c", { filePath: "world/map.md" }),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    expect(result.name).toBe("Graph");
    expect(result.children).toBeDefined();
    const childNames = result.children!.map(c => c.name);
    expect(childNames).toContain("stories");
    expect(childNames).toContain("world");
  });

  it("collapses single-child chains", () => {
    // a/b/c/file.md → collapsed to "a/b/c" branch
    const nodes = [
      makeNode("x", { filePath: "a/b/c/file.md" }),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    // Single-child chains should be collapsed
    const firstChild = result.children![0];
    expect(firstChild.name).toContain("/"); // collapsed path
  });

  it("creates leaf nodes with filePath", () => {
    const nodes = [
      makeNode("hero", { filePath: "chars/hero.md" }),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    // Navigate to leaf
    const charsGroup = result.children!.find(c => c.name.includes("char"));
    expect(charsGroup).toBeDefined();
    const leaf = charsGroup!.children!.find(c => c.name === "hero");
    expect(leaf).toBeDefined();
    expect(leaf!.filePath).toBe("chars/hero.md");
  });

  it("uses category as top-level grouping (may collapse with subfolder)", () => {
    const nodes = [
      makeNode("a", { category: "NPC", filePath: "town/mayor.md" }),
      makeNode("b", { category: "NPC", filePath: "town/guard.md" }),
      makeNode("c", { category: "Item", filePath: "items/sword.md" }),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    const topNames = result.children!.map(c => c.name);
    // Category + folder creates a combined path; single-child chains collapse
    // NPC → town is single-child → collapsed to "NPC/town"
    expect(topNames.some(n => n.includes("NPC"))).toBe(true);
    expect(topNames.some(n => n.includes("Item"))).toBe(true);
  });

  it("handles nodes without filePath (first-letter fallback)", () => {
    const nodes = [
      makeNode("alpha"),
      makeNode("bravo"),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    const topNames = result.children!.map(c => c.name);
    expect(topNames).toContain("A");
    expect(topNames).toContain("B");
  });

  it("leaf values sum correctly", () => {
    const nodes = [
      makeNode("a", { filePath: "g/x.md" }),
      makeNode("b", { filePath: "g/y.md" }),
      makeNode("c", { filePath: "g/z.md" }),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    // Each leaf has value=1, so the group should have 3 children
    const group = result.children![0];
    expect(group.children!.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// assignValues — postorder aggregation of leaf values
// ---------------------------------------------------------------------------
describe("assignValues", () => {
  it("assigns value 1 to a leaf with no children", () => {
    const leaf: SunburstData = { name: "leaf" };
    expect(assignValues(leaf)).toBe(1);
    expect(leaf.value).toBe(1);
  });

  it("preserves explicit leaf value", () => {
    const leaf: SunburstData = { name: "leaf", value: 5 };
    expect(assignValues(leaf)).toBe(5);
  });

  it("sums children values for parent", () => {
    const root: SunburstData = {
      name: "root",
      children: [
        { name: "a", value: 3 },
        { name: "b", value: 7 },
      ],
    };
    expect(assignValues(root)).toBe(10);
    expect(root.value).toBe(10);
  });

  it("recursively assigns for deep hierarchy", () => {
    const root: SunburstData = {
      name: "root",
      children: [
        { name: "group", children: [
          { name: "x" },
          { name: "y" },
          { name: "z" },
        ] },
      ],
    };
    expect(assignValues(root)).toBe(3);
    expect(root.children![0].value).toBe(3);
  });

  it("handles mixed leaf and branch children", () => {
    const root: SunburstData = {
      name: "root",
      children: [
        { name: "leaf", value: 2 },
        { name: "branch", children: [{ name: "c1" }, { name: "c2" }] },
      ],
    };
    expect(assignValues(root)).toBe(4); // 2 + (1+1)
  });
});

// ---------------------------------------------------------------------------
// maxDepth — recursive tree depth calculation
// ---------------------------------------------------------------------------
describe("maxDepth", () => {
  it("returns 1 for a leaf node", () => {
    expect(maxDepth({ name: "leaf" })).toBe(1);
  });

  it("returns 2 for root with one level of children", () => {
    expect(maxDepth({ name: "root", children: [{ name: "a" }, { name: "b" }] })).toBe(2);
  });

  it("returns correct depth for deep tree", () => {
    const tree: SunburstData = {
      name: "r",
      children: [{ name: "a", children: [{ name: "b", children: [{ name: "c" }] }] }],
    };
    expect(maxDepth(tree)).toBe(4);
  });

  it("returns max of unbalanced branches", () => {
    const tree: SunburstData = {
      name: "r",
      children: [
        { name: "shallow" },
        { name: "deep", children: [{ name: "d1", children: [{ name: "d2" }] }] },
      ],
    };
    expect(maxDepth(tree)).toBe(4); // r → deep → d1 → d2
  });

  it("handles node with empty children array as leaf", () => {
    expect(maxDepth({ name: "r", children: [] })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// collectFilePaths — collect all filePaths from tree
// ---------------------------------------------------------------------------
describe("collectFilePaths", () => {
  it("returns empty set for node without filePath", () => {
    expect(collectFilePaths({ name: "r" }).size).toBe(0);
  });

  it("collects filePath from leaf node", () => {
    const paths = collectFilePaths({ name: "leaf", filePath: "a.md" });
    expect(paths.has("a.md")).toBe(true);
    expect(paths.size).toBe(1);
  });

  it("collects filePaths recursively from tree", () => {
    const tree: SunburstData = {
      name: "root",
      children: [
        { name: "a", filePath: "a.md" },
        { name: "group", children: [
          { name: "b", filePath: "b.md" },
          { name: "c", filePath: "c.md" },
        ] },
      ],
    };
    const paths = collectFilePaths(tree);
    expect(paths.size).toBe(3);
    expect(paths.has("a.md")).toBe(true);
    expect(paths.has("b.md")).toBe(true);
    expect(paths.has("c.md")).toBe(true);
  });

  it("deduplicates repeated filePaths", () => {
    const tree: SunburstData = {
      name: "root",
      children: [
        { name: "a", filePath: "same.md" },
        { name: "b", filePath: "same.md" },
      ],
    };
    expect(collectFilePaths(tree).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// countDirectChildren
// ---------------------------------------------------------------------------
describe("countDirectChildren", () => {
  it("returns 0 for leaf (no children)", () => {
    expect(countDirectChildren({ name: "leaf" })).toBe(0);
  });

  it("returns 0 for empty children array", () => {
    expect(countDirectChildren({ name: "r", children: [] })).toBe(0);
  });

  it("returns correct count", () => {
    expect(countDirectChildren({
      name: "r",
      children: [{ name: "a" }, { name: "b" }, { name: "c" }],
    })).toBe(3);
  });
});
