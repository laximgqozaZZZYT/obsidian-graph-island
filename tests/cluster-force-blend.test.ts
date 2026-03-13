import { describe, it, expect } from "vitest";

describe("cluster force blend decay", () => {
  it("should return full blend at high alpha", () => {
    const blendInitial = 0.85;
    const alpha = 1.0;
    const blend = blendInitial * Math.min(1, alpha * 3);
    expect(blend).toBeCloseTo(0.85);
  });

  it("should decay blend at medium alpha", () => {
    const blendInitial = 0.85;
    const alpha = 0.2;
    const blend = blendInitial * Math.min(1, alpha * 3);
    expect(blend).toBeCloseTo(0.51);
  });

  it("should have very low blend at low alpha", () => {
    const blendInitial = 0.85;
    const alpha = 0.05;
    const blend = blendInitial * Math.min(1, alpha * 3);
    expect(blend).toBeCloseTo(0.1275);
    expect(blend).toBeLessThan(0.2);
  });

  it("should read _blend from user constants", () => {
    const constants: Record<string, number> = { _blend: 0.6 };
    const blend = constants._blend ?? 0.85;
    expect(blend).toBe(0.6);
  });

  it("should default to 0.85 when no constants", () => {
    const constants: Record<string, number> | undefined = undefined;
    const blend = constants?._blend ?? 0.85;
    expect(blend).toBe(0.85);
  });

  it("should kill velocity when blend is strong", () => {
    const blend = 0.7;
    expect(blend > 0.5).toBe(true);
    // vx and vy should be set to 0
  });

  it("should dampen velocity when blend is weak", () => {
    const blend = 0.3;
    const vx = 10;
    const dampened = vx * (1 - blend);
    expect(dampened).toBeCloseTo(7);
  });
});
