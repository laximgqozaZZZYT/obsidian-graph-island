import { describe, it, expect } from "vitest";
import { DiffOverlay, layoutGhostNodes, ghostLabel } from "../src/views/DiffOverlay";
import type { SnapshotDiff } from "../src/types";

// ---------------------------------------------------------------------------
// Helper: create a minimal SnapshotDiff
// ---------------------------------------------------------------------------
function makeDiff(opts: Partial<{
  addedNodeIds: string[];
  removedNodes: Array<{ id: string; metaHash: string }>;
  changedNodeIds: string[];
  addedEdgeKeys: string[];
  removedEdges: Array<{ source: string; target: string; type: string }>;
}> = {}): SnapshotDiff {
  return {
    addedNodeIds: new Set(opts.addedNodeIds ?? []),
    removedNodes: opts.removedNodes ?? [],
    changedNodeIds: new Set(opts.changedNodeIds ?? []),
    addedEdgeKeys: new Set(opts.addedEdgeKeys ?? []),
    removedEdges: opts.removedEdges ?? [],
  };
}

// ---------------------------------------------------------------------------
// DiffOverlay class — state management
// ---------------------------------------------------------------------------
describe("DiffOverlay", () => {
  it("starts inactive", () => {
    const overlay = new DiffOverlay();
    expect(overlay.isActive()).toBe(false);
    expect(overlay.getSummary()).toBeNull();
  });

  it("activate / deactivate lifecycle", () => {
    const overlay = new DiffOverlay();
    const diff = makeDiff({ addedNodeIds: ["a", "b"], removedNodes: [{ id: "c", metaHash: "" }] });
    overlay.activate(diff, "test-snap");

    expect(overlay.isActive()).toBe(true);

    const summary = overlay.getSummary();
    expect(summary).not.toBeNull();
    expect(summary!.name).toBe("test-snap");
    expect(summary!.added).toBe(2);
    expect(summary!.removed).toBe(1);
    expect(summary!.changed).toBe(0);

    overlay.deactivate();
    expect(overlay.isActive()).toBe(false);
    expect(overlay.getSummary()).toBeNull();
  });

  it("getSummary counts all diff categories", () => {
    const overlay = new DiffOverlay();
    const diff = makeDiff({
      addedNodeIds: ["a"],
      removedNodes: [{ id: "b", metaHash: "x" }, { id: "c", metaHash: "y" }],
      changedNodeIds: ["d", "e", "f"],
    });
    overlay.activate(diff, "snap-2");

    const s = overlay.getSummary()!;
    expect(s.added).toBe(1);
    expect(s.removed).toBe(2);
    expect(s.changed).toBe(3);
  });

  it("re-activate replaces previous diff", () => {
    const overlay = new DiffOverlay();
    overlay.activate(makeDiff({ addedNodeIds: ["a"] }), "first");
    overlay.activate(makeDiff({ addedNodeIds: ["x", "y"] }), "second");

    expect(overlay.getSummary()!.name).toBe("second");
    expect(overlay.getSummary()!.added).toBe(2);
  });

  it("activate with empty diff", () => {
    const overlay = new DiffOverlay();
    overlay.activate(makeDiff(), "empty");
    expect(overlay.isActive()).toBe(true);
    const s = overlay.getSummary()!;
    expect(s.added).toBe(0);
    expect(s.removed).toBe(0);
    expect(s.changed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// layoutGhostNodes — grid layout pure function
// ---------------------------------------------------------------------------
describe("layoutGhostNodes", () => {
  const viewport = { width: 1000, height: 800 };

  it("returns empty array for 0 nodes", () => {
    expect(layoutGhostNodes(0, viewport)).toEqual([]);
  });

  it("returns empty array for negative count", () => {
    expect(layoutGhostNodes(-5, viewport)).toEqual([]);
  });

  it("positions single node at bottom-right corner", () => {
    const pos = layoutGhostNodes(1, viewport);
    expect(pos).toHaveLength(1);
    // startX = 1000 - 40 = 960, startY = 800 - 40 = 760
    expect(pos[0].x).toBe(960);
    expect(pos[0].y).toBe(760);
  });

  it("arranges multiple nodes in grid columns", () => {
    const pos = layoutGhostNodes(3, viewport);
    expect(pos).toHaveLength(3);
    // All in row 0, columns 0,1,2
    expect(pos[0].y).toBe(pos[1].y); // same row
    expect(pos[1].y).toBe(pos[2].y);
    // x decreases (right to left)
    expect(pos[0].x).toBeGreaterThan(pos[1].x);
    expect(pos[1].x).toBeGreaterThan(pos[2].x);
  });

  it("wraps to next row after filling columns", () => {
    // cols = floor(1000 * 0.3 / 24) = floor(12.5) = 12
    const cols = Math.floor((1000 * 0.3) / 24);
    const pos = layoutGhostNodes(cols + 1, viewport);
    expect(pos).toHaveLength(cols + 1);
    // First node of row 1 should have different y
    expect(pos[cols].y).toBeLessThan(pos[0].y); // higher up (smaller y = upward)
    // Same x as first column
    expect(pos[cols].x).toBe(pos[0].x);
  });

  it("limits visible nodes to fit within 70% viewport height", () => {
    // maxRows = floor(800 * 0.7 / 24) = floor(23.33) = 23
    // cols = 12
    // maxVisible = 23 * 12 = 276
    const maxRows = Math.floor((800 * 0.7) / 24);
    const cols = Math.floor((1000 * 0.3) / 24);
    const maxVisible = maxRows * cols;

    const pos = layoutGhostNodes(500, viewport);
    expect(pos).toHaveLength(maxVisible);
    expect(pos.length).toBeLessThan(500);
  });

  it("all positions are within viewport bounds", () => {
    const pos = layoutGhostNodes(100, viewport);
    for (const { x, y } of pos) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThanOrEqual(viewport.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(viewport.height);
    }
  });

  it("no two ghost positions overlap", () => {
    const pos = layoutGhostNodes(50, viewport);
    const set = new Set(pos.map(p => `${p.x},${p.y}`));
    expect(set.size).toBe(pos.length);
  });

  it("handles tiny viewport gracefully", () => {
    const small = { width: 100, height: 100 };
    // cols = max(1, floor(30/24)) = 1
    // maxRows = max(1, floor(70/24)) = 2
    const pos = layoutGhostNodes(10, small);
    expect(pos.length).toBeLessThanOrEqual(2); // 1 col * 2 rows
    expect(pos.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// ghostLabel — label extraction pure function
// ---------------------------------------------------------------------------
describe("ghostLabel", () => {
  it("extracts filename from path", () => {
    expect(ghostLabel("folder/subfolder/note.md")).toBe("note");
  });

  it("removes .md extension", () => {
    expect(ghostLabel("test.md")).toBe("test");
  });

  it("truncates long names with ellipsis", () => {
    const result = ghostLabel("very-long-filename-here.md");
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result).toMatch(/…$/);
  });

  it("preserves short names without truncation", () => {
    expect(ghostLabel("short.md")).toBe("short");
  });

  it("handles names exactly at max length", () => {
    // "123456789012" = 12 chars → no truncation
    expect(ghostLabel("123456789012.md")).toBe("123456789012");
  });

  it("handles names one char over max length", () => {
    // "1234567890123" = 13 chars → truncate to 11 + "…" = 12
    expect(ghostLabel("1234567890123.md")).toBe("12345678901…");
  });

  it("handles deeply nested path", () => {
    expect(ghostLabel("a/b/c/d/e/note.md")).toBe("note");
  });

  it("handles path without extension", () => {
    expect(ghostLabel("folder/tag-node")).toBe("tag-node");
  });

  it("handles bare ID (no slashes, no extension)", () => {
    expect(ghostLabel("mynode")).toBe("mynode");
  });

  it("respects custom maxLen", () => {
    expect(ghostLabel("abcdefghij.md", 5)).toBe("abcd…");
    expect(ghostLabel("abc.md", 5)).toBe("abc");
  });

  it("handles empty string", () => {
    expect(ghostLabel("")).toBe("");
  });
});
