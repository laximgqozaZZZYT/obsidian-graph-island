import { describe, it, expect } from "vitest";
import { findCellIndex } from "../src/views/GuideRenderer";

// ---------------------------------------------------------------------------
// findCellIndex — locate a value in sorted boundary positions
// ---------------------------------------------------------------------------
describe("findCellIndex", () => {
  // Standard grid: [0, 100, 200, 300] → cells 0, 1, 2
  const positions = [0, 100, 200, 300];

  it("returns correct cell for value in first cell", () => {
    expect(findCellIndex(50, positions)).toBe(0);
  });

  it("returns correct cell for value in middle cell", () => {
    expect(findCellIndex(150, positions)).toBe(1);
  });

  it("returns correct cell for value in last cell", () => {
    expect(findCellIndex(250, positions)).toBe(2);
  });

  it("returns cell index for value at cell boundary (inclusive start)", () => {
    expect(findCellIndex(100, positions)).toBe(1);
    expect(findCellIndex(200, positions)).toBe(2);
  });

  it("returns first cell for value at first boundary", () => {
    expect(findCellIndex(0, positions)).toBe(0);
  });

  it("returns last cell for value at or beyond last boundary", () => {
    // value >= positions[n-2] falls into last cell
    expect(findCellIndex(300, positions)).toBe(2);
    expect(findCellIndex(999, positions)).toBe(2);
  });

  it("returns -1 for value below all boundaries", () => {
    expect(findCellIndex(-10, positions)).toBe(-1);
  });

  it("handles single-cell grid (two boundaries)", () => {
    expect(findCellIndex(50, [0, 100])).toBe(0);
    expect(findCellIndex(0, [0, 100])).toBe(0);
    expect(findCellIndex(100, [0, 100])).toBe(0);
  });

  it("handles empty positions array", () => {
    expect(findCellIndex(50, [])).toBe(-1);
  });

  it("handles single-element positions array", () => {
    expect(findCellIndex(50, [100])).toBe(-1);
  });

  it("handles negative position boundaries", () => {
    const neg = [-200, -100, 0, 100];
    expect(findCellIndex(-150, neg)).toBe(0);
    expect(findCellIndex(-50, neg)).toBe(1);
    expect(findCellIndex(50, neg)).toBe(2);
  });

  it("handles floating-point boundaries", () => {
    const fp = [0.5, 1.5, 2.5];
    expect(findCellIndex(1.0, fp)).toBe(0);
    expect(findCellIndex(2.0, fp)).toBe(1);
  });
});
