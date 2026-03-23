import { describe, it, expect } from "vitest";
import { extractInitials, computePriorityScores, type PriorityInput } from "../src/views/LabelManager";

// ---------------------------------------------------------------------------
// extractInitials — 2-character initials from label text
// ---------------------------------------------------------------------------
describe("extractInitials", () => {
  it("extracts initials from path-separated segments", () => {
    expect(extractInitials("classic-othello/characters")).toBe("OC");
  });

  it("extracts from hyphenated segments", () => {
    expect(extractInitials("dark-fantasy")).toBe("DF");
  });

  it("extracts from underscore-separated segments", () => {
    expect(extractInitials("node_type")).toBe("NT");
  });

  it("extracts from space-separated segments", () => {
    expect(extractInitials("hello world")).toBe("HW");
  });

  it("uses first two chars for single word", () => {
    expect(extractInitials("mythology")).toBe("MY");
  });

  it("strips group suffix like (15)", () => {
    expect(extractInitials("fantasy (15)")).toBe("FA");
  });

  it("strips group suffix with multi-digit count", () => {
    expect(extractInitials("action/heroes (123)")).toBe("AH");
  });

  it("handles multi-segment path — uses last two", () => {
    expect(extractInitials("a/b/c/deep/leaf")).toBe("DL");
  });

  it("uppercases results", () => {
    expect(extractInitials("hello-world")).toBe("HW");
    expect(extractInitials("Hello-World")).toBe("HW");
  });

  it("handles single character input", () => {
    expect(extractInitials("x")).toBe("X");
  });

  it("handles empty string", () => {
    expect(extractInitials("")).toBe("");
  });

  it("handles Japanese text (single segment)", () => {
    expect(extractInitials("神話")).toBe("神話");
  });

  it("handles Japanese path-separated segments", () => {
    expect(extractInitials("歴史/人物")).toBe("歴人");
  });

  it("handles mixed separators", () => {
    expect(extractInitials("a-b/c_d")).toBe("CD");
  });

  it("ignores leading/trailing whitespace in segments", () => {
    expect(extractInitials("  alpha  beta  ")).toBe("AB");
  });
});

// ---------------------------------------------------------------------------
// computePriorityScores — LOD tier assignment for label visibility
// ---------------------------------------------------------------------------
const defaultRT = {
  labelZoomTier1: 0.15,
  labelZoomTier2: 0.35,
  labelZoomTier3: 0.70,
  labelDegreePctTier1: 0.10,
  labelDegreePctTier2: 0.30,
  labelDegreePctTier3: 0.50,
  nodeLabelZoomMin: 0.9,
};

function mkInput(id: string, opts?: { isSuper?: boolean; hasLabel?: boolean }): PriorityInput {
  return { id, isSuper: opts?.isSuper ?? false, hasLabel: opts?.hasLabel ?? true };
}

describe("computePriorityScores", () => {
  it("returns empty array for empty input", () => {
    expect(computePriorityScores([], new Map(), defaultRT)).toEqual([]);
  });

  it("assigns higher score to super nodes", () => {
    const nodes = [mkInput("a"), mkInput("b", { isSuper: true })];
    const degrees = new Map([["a", 5], ["b", 5]]);
    const result = computePriorityScores(nodes, degrees, defaultRT);
    const scoreA = result.find(r => r.id === "a")!.priorityScore;
    const scoreB = result.find(r => r.id === "b")!.priorityScore;
    expect(scoreB).toBeGreaterThan(scoreA);
  });

  it("assigns higher score to higher-degree nodes", () => {
    const nodes = [mkInput("low"), mkInput("high")];
    const degrees = new Map([["low", 1], ["high", 100]]);
    const result = computePriorityScores(nodes, degrees, defaultRT);
    const scoreLow = result.find(r => r.id === "low")!.priorityScore;
    const scoreHigh = result.find(r => r.id === "high")!.priorityScore;
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it("assigns minShowZoom based on rank tier", () => {
    // Create 20 nodes with varying degrees
    const nodes = Array.from({ length: 20 }, (_, i) => mkInput(`n${i}`));
    const degrees = new Map(nodes.map((n, i) => [n.id, 20 - i])); // n0=20, n19=1
    const result = computePriorityScores(nodes, degrees, defaultRT);
    // Top priority node (n0, degree=20) should have lowest minShowZoom
    const topNode = result.find(r => r.id === "n0")!;
    const bottomNode = result.find(r => r.id === "n19")!;
    expect(topNode.minShowZoom).toBeLessThan(bottomNode.minShowZoom);
  });

  it("nodes without labels get minShowZoom=0", () => {
    const nodes = [mkInput("a", { hasLabel: false }), mkInput("b")];
    const degrees = new Map([["a", 10], ["b", 5]]);
    const result = computePriorityScores(nodes, degrees, defaultRT);
    const noLabel = result.find(r => r.id === "a")!;
    expect(noLabel.minShowZoom).toBe(0);
  });

  it("all zero degrees gives equal scores", () => {
    const nodes = [mkInput("a"), mkInput("b"), mkInput("c")];
    const degrees = new Map<string, number>();
    const result = computePriorityScores(nodes, degrees, defaultRT);
    const scores = result.map(r => r.priorityScore);
    expect(new Set(scores).size).toBe(1); // all same
  });

  it("respects nodeLabelZoomMin for lowest-tier nodes", () => {
    const nodes = Array.from({ length: 10 }, (_, i) => mkInput(`n${i}`));
    const degrees = new Map(nodes.map((n, i) => [n.id, 10 - i]));
    const customRT = { ...defaultRT, nodeLabelZoomMin: 1.5 };
    const result = computePriorityScores(nodes, degrees, customRT);
    // Bottom-tier node should get the custom floor
    const bottom = result.find(r => r.id === "n9")!;
    expect(bottom.minShowZoom).toBe(1.5);
  });

  it("top 1% nodes get tier1 * 0.2 minShowZoom", () => {
    // Need 100+ nodes so top 1% = 1 node
    const nodes = Array.from({ length: 100 }, (_, i) => mkInput(`n${i}`));
    const degrees = new Map(nodes.map((n, i) => [n.id, 100 - i]));
    const result = computePriorityScores(nodes, degrees, defaultRT);
    const topNode = result.find(r => r.id === "n0")!;
    expect(topNode.minShowZoom).toBeCloseTo(0.15 * 0.2, 5); // 0.03
  });

  it("single node gets lowest tier zoom", () => {
    const nodes = [mkInput("solo")];
    const degrees = new Map([["solo", 5]]);
    const result = computePriorityScores(nodes, degrees, defaultRT);
    expect(result[0].minShowZoom).toBe(0.15 * 0.2); // pct=0 < lodPct1*0.1=0.01 → tier1*0.2
  });
});
