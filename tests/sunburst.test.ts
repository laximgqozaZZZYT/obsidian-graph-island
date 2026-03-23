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

// ---------------------------------------------------------------------------
// Edge cases — computeSunburstArcs
// ---------------------------------------------------------------------------
describe("computeSunburstArcs edge cases", () => {
  it("handles deeply nested hierarchy (5 levels)", () => {
    const root: SunburstData = {
      name: "r",
      children: [{
        name: "L1",
        children: [{
          name: "L2",
          children: [{
            name: "L3",
            children: [{ name: "L4", value: 1 }],
          }],
        }],
      }],
    };
    const arcs = computeSunburstArcs(root, 400, 400);
    // 5 nodes total: r, L1, L2, L3, L4
    expect(arcs.length).toBe(5);
    // deepest arc should have depth 4
    const depths = arcs.map(a => a.depth);
    expect(Math.max(...depths)).toBe(4);
    // all arcs should have finite coordinates
    for (const arc of arcs) {
      expect(Number.isFinite(arc.x0)).toBe(true);
      expect(Number.isFinite(arc.y0)).toBe(true);
      expect(Number.isFinite(arc.y1)).toBe(true);
    }
  });

  it("handles wide hierarchy (many siblings at depth 1)", () => {
    const children = Array.from({ length: 20 }, (_, i) => ({
      name: `child${i}`,
      value: 1,
    }));
    const root: SunburstData = { name: "root", children };
    const arcs = computeSunburstArcs(root, 600, 600);
    // 1 root + 20 children = 21 arcs
    expect(arcs.length).toBe(21);
    // depth-1 arcs should partition the circle evenly
    const d1 = arcs.filter(a => a.depth === 1);
    expect(d1.length).toBe(20);
    const spans = d1.map(a => a.x1 - a.x0);
    // all equal value -> equal spans
    for (const s of spans) {
      expect(s).toBeCloseTo(spans[0], 10);
    }
  });

  it("zero-size dimensions produce zero-radius arcs", () => {
    const root: SunburstData = { name: "r", children: [{ name: "a", value: 1 }] };
    const arcs = computeSunburstArcs(root, 0, 0);
    // radius = min(0,0)/2 = 0 => all y0/y1 should be 0
    for (const arc of arcs) {
      expect(arc.y0).toBe(0);
      expect(arc.y1).toBe(0);
    }
  });

  it("unequal child values produce proportional arc spans", () => {
    const root: SunburstData = {
      name: "root",
      children: [
        { name: "big", value: 3 },
        { name: "small", value: 1 },
      ],
    };
    const arcs = computeSunburstArcs(root, 400, 400);
    const big = arcs.find(a => a.name === "big")!;
    const small = arcs.find(a => a.name === "small")!;
    const bigSpan = big.x1 - big.x0;
    const smallSpan = small.x1 - small.x0;
    // big should be 3x the span of small
    expect(bigSpan / smallSpan).toBeCloseTo(3, 5);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — applySunburstLayout
// ---------------------------------------------------------------------------
describe("applySunburstLayout edge cases", () => {
  it("handles empty graph (zero nodes)", () => {
    const root = sampleRoot();
    const result = applySunburstLayout(
      { nodes: [], edges: [] },
      root,
      { width: 800, height: 600, groupField: "category" },
    );
    expect(result.data.nodes).toEqual([]);
    expect(result.arcs.length).toBeGreaterThan(0); // arcs still computed from root
    expect(result.data.edges).toEqual([]);
  });

  it("handles single node with matching filePath", () => {
    const nodes = [makeNode("alice", { filePath: "alice.md" })];
    const root = sampleRoot();
    const result = applySunburstLayout(
      { nodes, edges: [] },
      root,
      { width: 400, height: 400, groupField: "category" },
    );
    expect(result.data.nodes.length).toBe(1);
    const n = result.data.nodes[0];
    // should be positioned at arc centroid, not at (0,0)
    const dist = Math.sqrt((n.x - result.cx) ** 2 + (n.y - result.cy) ** 2);
    expect(dist).toBeGreaterThan(0);
  });

  it("falls back to buildSunburstFromGraphNodes when coverage is low", () => {
    // Nodes have filePaths that don't match the root at all
    const nodes = [
      makeNode("x", { filePath: "unknown1.md" }),
      makeNode("y", { filePath: "unknown2.md" }),
      makeNode("z", { filePath: "unknown3.md" }),
    ];
    const root = sampleRoot(); // only has alice.md, bob.md, castle.md
    const result = applySunburstLayout(
      { nodes, edges: [] },
      root,
      { width: 800, height: 600, groupField: "category" },
    );
    // Should still produce valid positioned nodes (via fallback hierarchy)
    expect(result.data.nodes.length).toBe(3);
    for (const n of result.data.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("falls back when root has only 1 direct child (Uncategorized)", () => {
    const nodes = [
      makeNode("a", { filePath: "a.md" }),
      makeNode("b", { filePath: "b.md" }),
    ];
    const singleChildRoot: SunburstData = {
      name: "Root",
      children: [{
        name: "Uncategorized",
        children: [
          { name: "a", value: 1, filePath: "a.md" },
          { name: "b", value: 1, filePath: "b.md" },
        ],
      }],
    };
    const result = applySunburstLayout(
      { nodes, edges: [] },
      singleChildRoot,
      { width: 400, height: 400, groupField: "category" },
    );
    // countDirectChildren(root) === 1 => triggers fallback
    expect(result.data.nodes.length).toBe(2);
    for (const n of result.data.nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });

  it("multiple unmatched nodes are spread evenly around outer ring", () => {
    const nodes = [
      makeNode("orphan1"),
      makeNode("orphan2"),
      makeNode("orphan3"),
      makeNode("orphan4"),
    ];
    const root = sampleRoot();
    const result = applySunburstLayout(
      { nodes, edges: [] },
      root,
      { width: 800, height: 800, groupField: "category" },
    );
    // All 4 unmatched nodes should be at same distance from center
    const dists = result.data.nodes.map(n =>
      Math.sqrt((n.x - result.cx) ** 2 + (n.y - result.cy) ** 2),
    );
    for (let i = 1; i < dists.length; i++) {
      expect(dists[i]).toBeCloseTo(dists[0], 5);
    }
    // They should NOT all be at the same position
    const uniquePositions = new Set(result.data.nodes.map(n => `${n.x.toFixed(2)},${n.y.toFixed(2)}`));
    expect(uniquePositions.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — buildSunburstFromGraphNodes
// ---------------------------------------------------------------------------
describe("buildSunburstFromGraphNodes edge cases", () => {
  it("single node produces a hierarchy with one leaf", () => {
    const nodes = [makeNode("solo", { filePath: "folder/solo.md" })];
    const result = buildSunburstFromGraphNodes(nodes);
    expect(result.name).toBe("Graph");
    expect(result.children).toBeDefined();
    // Should eventually reach a leaf named "solo"
    const leaves: string[] = [];
    function findLeaves(n: SunburstData) {
      if (!n.children || n.children.length === 0) { leaves.push(n.name); return; }
      n.children.forEach(findLeaves);
    }
    findLeaves(result);
    expect(leaves).toContain("solo");
  });

  it("all nodes same category produces single top-level group", () => {
    const nodes = [
      makeNode("a", { category: "hero", filePath: "heroes/a.md" }),
      makeNode("b", { category: "hero", filePath: "heroes/b.md" }),
      makeNode("c", { category: "hero", filePath: "heroes/c.md" }),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    // All nodes share category "hero" + folder "heroes" -> collapsed single-child chain
    expect(result.children).toBeDefined();
    // The top-level should have a single group containing "hero"
    const topNames = result.children!.map(c => c.name);
    expect(topNames.length).toBe(1);
    expect(topNames[0]).toContain("hero");
  });

  it("deeply nested file paths produce collapsed chain names with slashes", () => {
    const nodes = [
      makeNode("x", { filePath: "a/b/c/d/e/file.md" }),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    // Single-child chains get collapsed: a → b → c → d → e → leaf
    // The collapsed name should contain slashes
    const firstChild = result.children![0];
    expect(firstChild.name).toContain("/");
  });

  it("mixed: some nodes with filePath, some without", () => {
    const nodes = [
      makeNode("withPath", { filePath: "docs/readme.md" }),
      makeNode("noPath"),
      makeNode("anotherNoPath"),
    ];
    const result = buildSunburstFromGraphNodes(nodes);
    expect(result.children).toBeDefined();
    // "noPath" falls back to first-letter "N", "anotherNoPath" to "A", "withPath" to "docs"
    const topNames = result.children!.map(c => c.name);
    expect(topNames.some(n => n.includes("docs") || n.includes("D"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — assignValues
// ---------------------------------------------------------------------------
describe("assignValues edge cases", () => {
  it("handles empty children array (treated as leaf with value 1)", () => {
    const node: SunburstData = { name: "empty", children: [] };
    // Empty children array triggers the leaf branch: node.value ?? 1
    const val = assignValues(node);
    expect(val).toBe(1);
    expect(node.value).toBe(1);
  });

  it("handles large tree (100 leaves)", () => {
    const leaves = Array.from({ length: 100 }, (_, i) => ({
      name: `leaf${i}`,
      value: 1,
    }));
    const root: SunburstData = { name: "root", children: leaves };
    expect(assignValues(root)).toBe(100);
  });
});
