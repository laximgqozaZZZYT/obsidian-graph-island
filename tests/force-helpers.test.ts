import { describe, it, expect } from "vitest";
import { resolveDirection, matchesFilter } from "../src/layouts/force";

describe("resolveDirection", () => {
  it("resolves 'top' to -π/2", () => {
    expect(resolveDirection("top")).toBeCloseTo(-Math.PI / 2);
  });

  it("resolves 'bottom' to π/2", () => {
    expect(resolveDirection("bottom")).toBeCloseTo(Math.PI / 2);
  });

  it("resolves 'left' to π", () => {
    expect(resolveDirection("left")).toBeCloseTo(Math.PI);
  });

  it("resolves 'right' to 0", () => {
    expect(resolveDirection("right")).toBeCloseTo(0);
  });

  it("passes through numeric radian values", () => {
    expect(resolveDirection(1.5)).toBeCloseTo(1.5);
    expect(resolveDirection(0)).toBeCloseTo(0);
    expect(resolveDirection(-Math.PI)).toBeCloseTo(-Math.PI);
  });
});

describe("matchesFilter", () => {
  const node = {
    id: "test.md",
    label: "Test",
    x: 0, y: 0, vx: 0, vy: 0,
    tags: ["character", "entity/person"],
    category: "fiction",
  };

  it("matches tag: filter", () => {
    expect(matchesFilter(node, "tag:character")).toBe(true);
    expect(matchesFilter(node, "tag:entity/person")).toBe(true);
  });

  it("rejects non-matching tag: filter", () => {
    expect(matchesFilter(node, "tag:location")).toBe(false);
  });

  it("matches category: filter", () => {
    expect(matchesFilter(node, "category:fiction")).toBe(true);
  });

  it("rejects non-matching category: filter", () => {
    expect(matchesFilter(node, "category:nonfiction")).toBe(false);
  });

  it("handles node without tags", () => {
    const noTags = { id: "x", label: "X", x: 0, y: 0, vx: 0, vy: 0 };
    expect(matchesFilter(noTags, "tag:anything")).toBe(false);
  });

  it("handles node without category", () => {
    const noCat = { id: "x", label: "X", x: 0, y: 0, vx: 0, vy: 0 };
    expect(matchesFilter(noCat, "category:anything")).toBe(false);
  });
});
