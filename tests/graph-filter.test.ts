import { describe, it, expect } from "vitest";
import {
  filterOrphans, filterAttachments, filterTagNodes, filterSimilarEdges,
  filterByDegree, filterEdgesByNodeSet, filterExcludedNodes,
  applyVisibilityFilters, type VisibilityOptions,
} from "../src/utils/graph-filter";
import type { GraphNode, GraphEdge } from "../src/types";

function node(id: string, extra?: Partial<GraphNode>): GraphNode {
  return { id, label: id, ...extra };
}
function edge(source: string, target: string, type = "link"): GraphEdge {
  return { source, target, type };
}

describe("filterOrphans", () => {
  it("removes nodes with no edges", () => {
    const nodes = [node("a"), node("b"), node("orphan")];
    const edges = [edge("a", "b")];
    expect(filterOrphans(nodes, edges).map(n => n.id)).toEqual(["a", "b"]);
  });

  it("returns empty when no edges exist", () => {
    expect(filterOrphans([node("a")], [])).toHaveLength(0);
  });

  it("keeps all when all connected", () => {
    const n = [node("a"), node("b")];
    expect(filterOrphans(n, [edge("a", "b")])).toHaveLength(2);
  });
});

describe("filterAttachments", () => {
  it("removes image files", () => {
    const nodes = [node("a.md"), node("img.png", { filePath: "img.png" })];
    expect(filterAttachments(nodes).map(n => n.id)).toEqual(["a.md"]);
  });

  it("removes PDF files", () => {
    const nodes = [node("doc.pdf", { filePath: "doc.pdf" }), node("note.md")];
    expect(filterAttachments(nodes).map(n => n.id)).toEqual(["note.md"]);
  });

  it("keeps markdown and extensionless files", () => {
    const nodes = [node("note.md"), node("noext")];
    expect(filterAttachments(nodes)).toHaveLength(2);
  });

  it("is case-insensitive for extensions", () => {
    const nodes = [node("photo.JPG", { filePath: "photo.JPG" })];
    expect(filterAttachments(nodes)).toHaveLength(0);
  });

  // --- Boundary values (cycle116) ---

  it("handles mixed md/png/pdf/excalidraw/csv files", () => {
    const nodes = [
      node("note.md"),
      node("pic.png", { filePath: "pic.png" }),
      node("doc.pdf", { filePath: "doc.pdf" }),
      node("draw.excalidraw"),  // no extension match → kept
      node("data.csv", { filePath: "data.csv" }),
      node("audio.mp3", { filePath: "audio.mp3" }),
    ];
    const kept = filterAttachments(nodes).map(n => n.id);
    expect(kept).toContain("note.md");
    expect(kept).toContain("draw.excalidraw"); // .excalidraw not in ATTACHMENT_EXTS
    expect(kept).not.toContain("pic.png");
    expect(kept).not.toContain("doc.pdf");
    expect(kept).not.toContain("data.csv");
    expect(kept).not.toContain("audio.mp3");
  });

  it("keeps nodes with no filePath and no extension in id", () => {
    const nodes = [node("tag-node")]; // no extension
    expect(filterAttachments(nodes)).toHaveLength(1);
  });

  it("handles empty node array", () => {
    expect(filterAttachments([])).toEqual([]);
  });

  it("handles all video/audio extensions", () => {
    const exts = [".mp4", ".webm", ".wav", ".ogg"];
    for (const ext of exts) {
      const nodes = [node(`file${ext}`, { filePath: `file${ext}` })];
      expect(filterAttachments(nodes), `${ext} should be filtered`).toHaveLength(0);
    }
  });

  it("keeps .md files with dots in name", () => {
    const nodes = [node("my.project.notes.md")];
    expect(filterAttachments(nodes)).toHaveLength(1);
  });
});

describe("filterTagNodes", () => {
  it("removes tag nodes and has-tag edges", () => {
    const nodes = [node("a.md"), node("#tag1", { isTag: true })];
    const edges = [edge("a.md", "#tag1", "has-tag"), edge("a.md", "b.md")];
    const result = filterTagNodes(nodes, edges);
    expect(result.nodes.map(n => n.id)).toEqual(["a.md"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].type).toBe("link");
  });
});

describe("filterSimilarEdges", () => {
  it("removes similar-type edges only", () => {
    const edges = [edge("a", "b", "link"), edge("a", "c", "similar"), edge("b", "c", "tag")];
    const result = filterSimilarEdges(edges);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.type !== "similar")).toBe(true);
  });
});

describe("filterByDegree", () => {
  const nodes = [node("hub"), node("a"), node("b"), node("leaf")];
  const edges = [edge("hub", "a"), edge("hub", "b"), edge("hub", "leaf"), edge("a", "b")];

  it("filters below min degree", () => {
    expect(filterByDegree(nodes, edges, 2, 0).map(n => n.id)).toEqual(["hub", "a", "b"]);
  });

  it("filters above max degree", () => {
    expect(filterByDegree(nodes, edges, 0, 2).map(n => n.id)).toEqual(["a", "b", "leaf"]);
  });

  it("no-op when both 0", () => {
    expect(filterByDegree(nodes, edges, 0, 0)).toHaveLength(4);
  });
});

describe("filterEdgesByNodeSet", () => {
  it("removes edges to missing nodes", () => {
    const edges = [edge("a", "b"), edge("a", "gone"), edge("b", "gone")];
    expect(filterEdgesByNodeSet(edges, new Set(["a", "b"]))).toHaveLength(1);
  });
});

describe("filterExcludedNodes", () => {
  it("removes excluded nodes and their edges", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges = [edge("a", "b"), edge("b", "c")];
    const result = filterExcludedNodes(nodes, edges, ["b"]);
    expect(result.nodes.map(n => n.id)).toEqual(["a", "c"]);
    expect(result.edges).toHaveLength(0); // both edges touched b
  });

  it("no-op for empty exclude list", () => {
    const nodes = [node("a")];
    const result = filterExcludedNodes(nodes, [], []);
    expect(result.nodes).toHaveLength(1);
  });
});

describe("applyVisibilityFilters", () => {
  const defaultOpts: VisibilityOptions = {
    showOrphans: true,
    showAttachments: true,
    includeTagsInData: true,
    showTagNodes: true,
    tagDisplay: "node",
    showSimilar: true,
  };

  it("passes through when all options enabled", () => {
    const nodes = [node("a"), node("b"), node("#t", { isTag: true })];
    const edges = [edge("a", "b"), edge("a", "#t", "has-tag"), edge("a", "b", "similar")];
    const result = applyVisibilityFilters(nodes, edges, defaultOpts);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(3);
  });

  it("removes orphans when showOrphans=false", () => {
    const nodes = [node("a"), node("b"), node("orphan")];
    const edges = [edge("a", "b")];
    const result = applyVisibilityFilters(nodes, edges, { ...defaultOpts, showOrphans: false });
    expect(result.nodes.map(n => n.id)).toEqual(["a", "b"]);
  });

  it("removes tags when includeTagsInData=false", () => {
    const nodes = [node("a"), node("#t", { isTag: true })];
    const edges = [edge("a", "#t", "has-tag")];
    const result = applyVisibilityFilters(nodes, edges, { ...defaultOpts, includeTagsInData: false });
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it("removes similar edges when showSimilar=false", () => {
    const edges = [edge("a", "b", "link"), edge("a", "b", "similar")];
    const result = applyVisibilityFilters([node("a"), node("b")], edges, { ...defaultOpts, showSimilar: false });
    expect(result.edges).toHaveLength(1);
  });

  it("combines multiple filters", () => {
    const nodes = [node("a"), node("orphan"), node("#t", { isTag: true })];
    const edges = [edge("a", "#t", "has-tag")];
    const result = applyVisibilityFilters(nodes, edges, {
      ...defaultOpts, showOrphans: false, includeTagsInData: false,
    });
    // orphan removed (no edges after tag removal), #t removed, only a remains but it's also orphaned
    expect(result.nodes.length).toBeLessThanOrEqual(1);
  });
});
