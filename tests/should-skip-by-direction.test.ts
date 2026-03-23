import { describe, it, expect } from "vitest";
import {
  shouldSkipByDirection,
  buildBidirectionalSet,
} from "../src/views/EdgeRenderer";
import type { GraphEdge } from "../src/types";

function makeEdge(src = "a", tgt = "b", type = "link"): GraphEdge {
  return { source: src, target: tgt, type } as GraphEdge;
}

describe("shouldSkipByDirection", () => {
  const edges = [
    makeEdge("a", "b"),
    makeEdge("b", "a"), // bidirectional with a→b
    makeEdge("c", "d"), // unidirectional
  ];
  const bidirSet = buildBidirectionalSet(edges);

  // --- filter = "all" (no filtering) ---
  it("filter=all → never skips", () => {
    const cfg = { edgeDirectionFilter: "all" as const, _bidirectionalSet: bidirSet };
    expect(shouldSkipByDirection(makeEdge("a", "b"), cfg)).toBe(false);
    expect(shouldSkipByDirection(makeEdge("c", "d"), cfg)).toBe(false);
  });

  it("filter=undefined → never skips", () => {
    const cfg = { edgeDirectionFilter: undefined, _bidirectionalSet: bidirSet };
    expect(shouldSkipByDirection(makeEdge("a", "b"), cfg)).toBe(false);
  });

  // --- filter = "bidirectional" (show only bidirectional) ---
  it("filter=bidirectional → keeps bidirectional edge", () => {
    const cfg = { edgeDirectionFilter: "bidirectional" as const, _bidirectionalSet: bidirSet };
    expect(shouldSkipByDirection(makeEdge("a", "b"), cfg)).toBe(false);
  });

  it("filter=bidirectional → skips unidirectional edge", () => {
    const cfg = { edgeDirectionFilter: "bidirectional" as const, _bidirectionalSet: bidirSet };
    expect(shouldSkipByDirection(makeEdge("c", "d"), cfg)).toBe(true);
  });

  // --- filter = "unidirectional" (show only unidirectional) ---
  it("filter=unidirectional → skips bidirectional edge", () => {
    const cfg = { edgeDirectionFilter: "unidirectional" as const, _bidirectionalSet: bidirSet };
    expect(shouldSkipByDirection(makeEdge("a", "b"), cfg)).toBe(true);
  });

  it("filter=unidirectional → keeps unidirectional edge", () => {
    const cfg = { edgeDirectionFilter: "unidirectional" as const, _bidirectionalSet: bidirSet };
    expect(shouldSkipByDirection(makeEdge("c", "d"), cfg)).toBe(false);
  });

  // --- no bidirectional set ---
  it("no bidirectionalSet → never skips (even with filter)", () => {
    const cfg = { edgeDirectionFilter: "bidirectional" as const, _bidirectionalSet: undefined };
    expect(shouldSkipByDirection(makeEdge("a", "b"), cfg)).toBe(false);
  });

  // --- buildBidirectionalSet correctness ---
  it("buildBidirectionalSet identifies mutual edges", () => {
    expect(bidirSet.has("a→b")).toBe(true);
    expect(bidirSet.has("b→a")).toBe(true);
    expect(bidirSet.has("c→d")).toBe(false);
  });

  it("buildBidirectionalSet empty input → empty set", () => {
    expect(buildBidirectionalSet([]).size).toBe(0);
  });
});
