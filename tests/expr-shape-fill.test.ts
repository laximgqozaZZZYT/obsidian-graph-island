/**
 * Test: Can grid and triangle fills be expressed purely with math expressions?
 */
import { describe, it, expect } from "vitest";
import { parseExpr, evalExpr, type ExprVars } from "../src/utils/expr-eval";

function evalFor(expr: string, i: number, n: number): number {
  const ast = parseExpr(expr);
  return evalExpr(ast, { t: i / (n - 1 || 1), i, n, v: i });
}

// =========================================================================
// Grid fill: nodes placed in a rectangular grid
// =========================================================================
describe("grid fill via expressions", () => {
  const xExpr = "i % ceil(sqrt(n))";
  const yExpr = "floor(i / ceil(sqrt(n)))";

  it("produces a proper grid for n=9 (3×3)", () => {
    const n = 9;
    const positions: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      positions.push([evalFor(xExpr, i, n), evalFor(yExpr, i, n)]);
    }

    // Should produce 3 unique X values and 3 unique Y values
    const xs = new Set(positions.map(p => p[0]));
    const ys = new Set(positions.map(p => p[1]));
    expect(xs.size).toBe(3);
    expect(ys.size).toBe(3);

    // Verify exact positions: (0,0), (1,0), (2,0), (0,1), (1,1), ...
    expect(positions[0]).toEqual([0, 0]);
    expect(positions[1]).toEqual([1, 0]);
    expect(positions[2]).toEqual([2, 0]);
    expect(positions[3]).toEqual([0, 1]);
    expect(positions[4]).toEqual([1, 1]);
    expect(positions[8]).toEqual([2, 2]);
  });

  it("produces a proper grid for n=20 (5×4)", () => {
    const n = 20;
    const positions: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      positions.push([evalFor(xExpr, i, n), evalFor(yExpr, i, n)]);
    }

    const cols = Math.ceil(Math.sqrt(n)); // 5
    const xs = new Set(positions.map(p => p[0]));
    const ys = new Set(positions.map(p => p[1]));
    expect(xs.size).toBe(cols); // 5 columns
    expect(ys.size).toBe(Math.ceil(n / cols)); // 4 rows

    // All positions should be unique
    const unique = new Set(positions.map(p => `${p[0]},${p[1]}`));
    expect(unique.size).toBe(n);
  });

  it("produces a proper grid for n=100 (10×10)", () => {
    const n = 100;
    const positions: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      positions.push([evalFor(xExpr, i, n), evalFor(yExpr, i, n)]);
    }

    const xs = new Set(positions.map(p => p[0]));
    const ys = new Set(positions.map(p => p[1]));
    expect(xs.size).toBe(10);
    expect(ys.size).toBe(10);
  });
});

// =========================================================================
// Triangle fill: row k has k+1 nodes, centered
// =========================================================================
describe("triangle fill via expressions", () => {
  // row = floor((-1 + sqrt(1 + 8*i)) / 2)
  const rowExpr = "floor((-1 + sqrt(1 + 8*i)) / 2)";

  // posInRow = i - row*(row+1)/2
  // centered x = posInRow - row/2
  // We can't reference "row" as a variable, so inline it:
  const xExpr =
    "i - floor((-1+sqrt(1+8*i))/2)*(floor((-1+sqrt(1+8*i))/2)+1)/2 - floor((-1+sqrt(1+8*i))/2)/2";
  const yExpr = "floor((-1 + sqrt(1 + 8*i)) / 2)";

  it("computes correct row numbers", () => {
    const n = 15; // rows 0..4: 1+2+3+4+5 = 15
    // Row 0: i=0
    expect(evalFor(rowExpr, 0, n)).toBe(0);
    // Row 1: i=1,2
    expect(evalFor(rowExpr, 1, n)).toBe(1);
    expect(evalFor(rowExpr, 2, n)).toBe(1);
    // Row 2: i=3,4,5
    expect(evalFor(rowExpr, 3, n)).toBe(2);
    expect(evalFor(rowExpr, 5, n)).toBe(2);
    // Row 3: i=6,7,8,9
    expect(evalFor(rowExpr, 6, n)).toBe(3);
    expect(evalFor(rowExpr, 9, n)).toBe(3);
    // Row 4: i=10..14
    expect(evalFor(rowExpr, 10, n)).toBe(4);
    expect(evalFor(rowExpr, 14, n)).toBe(4);
  });

  it("produces centered x positions for each row", () => {
    const n = 10; // rows 0..3: 1+2+3+4 = 10
    const positions: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      positions.push([evalFor(xExpr, i, n), evalFor(yExpr, i, n)]);
    }

    // Row 0 (1 node): x should be 0 (centered)
    expect(positions[0][0]).toBe(0);
    expect(positions[0][1]).toBe(0);

    // Row 1 (2 nodes): x should be -0.5, 0.5
    expect(positions[1][0]).toBe(-0.5);
    expect(positions[2][0]).toBe(0.5);

    // Row 2 (3 nodes): x should be -1, 0, 1
    expect(positions[3][0]).toBe(-1);
    expect(positions[4][0]).toBe(0);
    expect(positions[5][0]).toBe(1);

    // Row 3 (4 nodes): x should be -1.5, -0.5, 0.5, 1.5
    expect(positions[6][0]).toBe(-1.5);
    expect(positions[7][0]).toBe(-0.5);
    expect(positions[8][0]).toBe(0.5);
    expect(positions[9][0]).toBe(1.5);
  });

  it("all positions are unique for n=15", () => {
    const n = 15;
    const positions: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      positions.push([evalFor(xExpr, i, n), evalFor(yExpr, i, n)]);
    }

    const unique = new Set(positions.map(p => `${p[0]},${p[1]}`));
    expect(unique.size).toBe(n);

    // Should have 5 rows
    const ys = new Set(positions.map(p => p[1]));
    expect(ys.size).toBe(5);
  });
});
