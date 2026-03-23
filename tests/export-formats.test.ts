import { describe, it, expect } from "vitest";
import { exportGraphCSV, exportGraphMermaid, exportFullGraphJSON, exportSubgraphJSON } from "../src/utils/graph-helpers";
import type { GraphNode, GraphEdge } from "../src/types";

function makeNode(id: string, label: string, opts: Partial<GraphNode> = {}): GraphNode {
  return { id, label, x: 0, y: 0, vx: 0, vy: 0, tags: [], ...opts };
}

function makeEdge(source: string, target: string, type = "link"): GraphEdge {
  return { id: `${source}->${target}`, source, target, type: type as any };
}

describe("exportGraphCSV", () => {
  it("produces valid CSV with headers", () => {
    const nodes = [makeNode("a.md", "Alpha", { category: "cat1", tags: ["tag1", "tag2"], x: 100, y: 200 })];
    const edges = [makeEdge("a.md", "b.md", "link")];
    const csv = exportGraphCSV(nodes, edges);

    expect(csv).toContain("# Nodes");
    expect(csv).toContain("id,label,category,tags,x,y");
    expect(csv).toContain("a.md,Alpha,cat1,tag1;tag2,100,200");
    expect(csv).toContain("# Edges");
    expect(csv).toContain("source,target,type,label");
    expect(csv).toContain("a.md,b.md,link,");
  });

  it("escapes commas in labels", () => {
    const nodes = [makeNode("x.md", "Hello, World")];
    const csv = exportGraphCSV(nodes, []);
    // Commas replaced with space
    expect(csv).toContain("Hello  World");
    expect(csv).not.toContain("Hello, World");
  });

  it("handles empty graph", () => {
    const csv = exportGraphCSV([], []);
    expect(csv).toContain("# Nodes");
    expect(csv).toContain("# Edges");
  });

  it("handles nodes without tags or category", () => {
    const nodes = [makeNode("n.md", "NoMeta")];
    const csv = exportGraphCSV(nodes, []);
    expect(csv).toContain("n.md,NoMeta,,");
  });
});

describe("exportGraphMermaid", () => {
  it("produces valid Mermaid syntax", () => {
    const nodes = [makeNode("a.md", "Alpha"), makeNode("b.md", "Beta")];
    const edges = [makeEdge("a.md", "b.md")];
    const mmd = exportGraphMermaid(nodes, edges);

    expect(mmd).toMatch(/^graph LR/);
    expect(mmd).toContain('a_md["Alpha"]');
    expect(mmd).toContain('b_md["Beta"]');
    expect(mmd).toContain("a_md --> b_md");
  });

  it("uses is-a label for inheritance edges", () => {
    const nodes = [makeNode("a.md", "A"), makeNode("b.md", "B")];
    const edges = [makeEdge("a.md", "b.md", "inheritance")];
    const mmd = exportGraphMermaid(nodes, edges);
    expect(mmd).toContain("-->|is-a|");
  });

  it("limits output to 200 nodes", () => {
    const nodes = Array.from({ length: 300 }, (_, i) => makeNode(`n${i}.md`, `Node${i}`));
    const mmd = exportGraphMermaid(nodes, []);
    const nodeLines = mmd.split("\n").filter(l => l.includes('["'));
    expect(nodeLines.length).toBeLessThanOrEqual(200);
  });

  it("skips edges to nodes outside the 200 limit", () => {
    const nodes = Array.from({ length: 250 }, (_, i) => makeNode(`n${i}.md`, `N${i}`));
    const edges = [makeEdge("n0.md", "n249.md")];
    const mmd = exportGraphMermaid(nodes, edges);
    expect(mmd).not.toContain("n249");
  });

  it("sanitizes special characters in IDs", () => {
    const nodes = [makeNode("path/to/file.md", "File")];
    const mmd = exportGraphMermaid(nodes, []);
    expect(mmd).not.toContain("/");
    expect(mmd).toContain("path_to_file_md");
  });
});

describe("exportFullGraphJSON", () => {
  it("includes all nodes and edges", () => {
    const nodes = [makeNode("a.md", "A"), makeNode("b.md", "B")];
    const edges = [makeEdge("a.md", "b.md")];
    const json = JSON.parse(exportFullGraphJSON(nodes, edges));

    expect(json.nodes).toHaveLength(2);
    expect(json.edges).toHaveLength(1);
    expect(json.nodeCount).toBe(2);
    expect(json.edgeCount).toBe(1);
    expect(json.exportedAt).toBeTruthy();
  });

  it("handles d3 object-form source/target", () => {
    const nodes = [makeNode("a.md", "A")];
    const edges = [{ source: { id: "a.md" } as any, target: { id: "b.md" } as any }] as any;
    const json = JSON.parse(exportFullGraphJSON(nodes, edges));
    expect(json.edges[0].source).toBe("a.md");
    expect(json.edges[0].target).toBe("b.md");
  });
});

describe("exportSubgraphJSON", () => {
  it("includes id, label, tags, category", () => {
    const nodes = [makeNode("a.md", "A", { tags: ["t1"], category: "c1" })];
    const edges = [makeEdge("a.md", "b.md", "tag")];
    const json = JSON.parse(exportSubgraphJSON({ nodes, edges }));

    expect(json.nodes[0].id).toBe("a.md");
    expect(json.nodes[0].tags).toEqual(["t1"]);
    expect(json.edges[0].type).toBe("tag");
  });
});
