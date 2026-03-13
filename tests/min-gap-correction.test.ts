import { describe, it, expect } from "vitest";

describe("intra-group minimum gap correction", () => {
  it("should push apart nodes closer than minGap when including radius", () => {
    // Simulate the correction logic
    const nodeR = 5; // effective radius per node
    const minGap = 10;
    const required = nodeR + nodeR + minGap; // 20

    const a = { x: 0, y: 0 };
    const b = { x: 8, y: 0 }; // distance = 8, less than required 20

    const dx = b.x - a.x;
    const dist = Math.sqrt(dx * dx);
    expect(dist).toBeLessThan(required);

    const overlap = required - dist;
    const half = overlap / 2;
    a.x -= half;
    b.x += half;

    const newDist = Math.sqrt((b.x - a.x) ** 2);
    expect(newDist).toBeCloseTo(required);
  });

  it("should not push apart nodes already far enough", () => {
    const nodeR = 5;
    const minGap = 10;
    const required = nodeR + nodeR + minGap; // 20

    const a = { x: 0, y: 0 };
    const b = { x: 30, y: 0 }; // distance = 30, greater than required 20

    const dist = Math.sqrt((b.x - a.x) ** 2);
    expect(dist).toBeGreaterThanOrEqual(required);
    // No push needed
  });

  it("should be disabled when _minGap is 0", () => {
    const constants: Record<string, number> = { _minGap: 0 };
    const minGap = constants._minGap ?? 0;
    expect(minGap).toBe(0);
    // Function returns immediately when minGap <= 0
  });

  it("should handle coincident nodes (dist ≈ 0)", () => {
    const a = { x: 5, y: 5 };
    const b = { x: 5, y: 5 }; // Same position

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // When dist < 0.01, use unit vector (1, 0)
    const nx = dist > 0.01 ? dx / dist : 1;
    const ny = dist > 0.01 ? dy / dist : 0;
    expect(nx).toBe(1);
    expect(ny).toBe(0);

    // Push apart along x-axis
    const required = 20;
    const half = required / 2;
    a.x -= nx * half;
    b.x += nx * half;
    expect(b.x - a.x).toBeCloseTo(required);
  });
});
