import { describe, it, expect } from "vitest";
import { buildTimelineEntries, formatDelta, type TimelineEntry } from "../src/views/DiffOverlay";

// ---------------------------------------------------------------------------
// buildTimelineEntries
// ---------------------------------------------------------------------------
describe("buildTimelineEntries", () => {
  function makeSnap(name: string, createdAt: string, nodeCount: number, edgeCount: number) {
    return { name, createdAt, context: { nodeCount, edgeCount, layout: "force", searchQuery: "", groupBy: "" } };
  }

  it("returns empty array for empty input", () => {
    expect(buildTimelineEntries([])).toEqual([]);
  });

  it("single snapshot has no deltas", () => {
    const entries = buildTimelineEntries([makeSnap("s1", "2026-01-01T00:00", 100, 200)]);
    expect(entries).toHaveLength(1);
    expect(entries[0].nodeCount).toBe(100);
    expect(entries[0].edgeCount).toBe(200);
    expect(entries[0].nodeDelta).toBeUndefined();
    expect(entries[0].edgeDelta).toBeUndefined();
  });

  it("computes deltas between consecutive snapshots", () => {
    const entries = buildTimelineEntries([
      makeSnap("s1", "2026-01-01T00:00", 100, 200),
      makeSnap("s2", "2026-01-02T00:00", 120, 180),
      makeSnap("s3", "2026-01-03T00:00", 115, 250),
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[0].nodeDelta).toBeUndefined();
    expect(entries[1].nodeDelta).toBe(20);   // 120 - 100
    expect(entries[1].edgeDelta).toBe(-20);  // 180 - 200
    expect(entries[2].nodeDelta).toBe(-5);   // 115 - 120
    expect(entries[2].edgeDelta).toBe(70);   // 250 - 180
  });

  it("sorts by createdAt (handles unsorted input)", () => {
    const entries = buildTimelineEntries([
      makeSnap("late", "2026-03-01T00:00", 300, 400),
      makeSnap("early", "2026-01-01T00:00", 100, 200),
      makeSnap("mid", "2026-02-01T00:00", 200, 300),
    ]);

    expect(entries[0].name).toBe("early");
    expect(entries[1].name).toBe("mid");
    expect(entries[2].name).toBe("late");
    expect(entries[1].nodeDelta).toBe(100); // 200 - 100
    expect(entries[2].nodeDelta).toBe(100); // 300 - 200
  });

  it("handles zero-count snapshots", () => {
    const entries = buildTimelineEntries([
      makeSnap("empty", "2026-01-01T00:00", 0, 0),
      makeSnap("some", "2026-01-02T00:00", 50, 100),
    ]);

    expect(entries[0].nodeCount).toBe(0);
    expect(entries[1].nodeDelta).toBe(50);
    expect(entries[1].edgeDelta).toBe(100);
  });

  it("preserves snapshot names including [auto] prefix", () => {
    const entries = buildTimelineEntries([
      makeSnap("[auto] 2026-01-01 12:00", "2026-01-01T12:00", 100, 200),
    ]);
    expect(entries[0].name).toBe("[auto] 2026-01-01 12:00");
  });

  it("handles equal consecutive snapshots (delta = 0)", () => {
    const entries = buildTimelineEntries([
      makeSnap("s1", "2026-01-01T00:00", 100, 200),
      makeSnap("s2", "2026-01-02T00:00", 100, 200),
    ]);
    expect(entries[1].nodeDelta).toBe(0);
    expect(entries[1].edgeDelta).toBe(0);
  });

  it("does not mutate input array", () => {
    const input = [
      makeSnap("b", "2026-02-01T00:00", 200, 300),
      makeSnap("a", "2026-01-01T00:00", 100, 200),
    ];
    const original = [...input.map(s => s.name)];
    buildTimelineEntries(input);
    expect(input.map(s => s.name)).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// formatDelta
// ---------------------------------------------------------------------------
describe("formatDelta", () => {
  it("undefined returns muted dash", () => {
    expect(formatDelta(undefined)).toEqual({ text: "—", color: "muted" });
  });

  it("zero returns muted dash", () => {
    expect(formatDelta(0)).toEqual({ text: "—", color: "muted" });
  });

  it("positive returns green +N", () => {
    expect(formatDelta(42)).toEqual({ text: "+42", color: "green" });
  });

  it("negative returns red -N", () => {
    expect(formatDelta(-15)).toEqual({ text: "-15", color: "red" });
  });

  it("+1 edge case", () => {
    expect(formatDelta(1)).toEqual({ text: "+1", color: "green" });
  });

  it("-1 edge case", () => {
    expect(formatDelta(-1)).toEqual({ text: "-1", color: "red" });
  });
});
