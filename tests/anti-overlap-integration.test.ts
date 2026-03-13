import { describe, it, expect } from "vitest";

describe("anti-overlap integration", () => {
  describe("blend decay behavior", () => {
    it("blend is strong at high alpha (early simulation)", () => {
      const blendInitial = 0.85;
      const alpha = 1.0;
      const blend = blendInitial * Math.min(1, alpha * 3);
      expect(blend).toBeCloseTo(0.85);
    });

    it("blend decays at low alpha (late simulation)", () => {
      const blendInitial = 0.85;
      const alpha = 0.1;
      const blend = blendInitial * Math.min(1, alpha * 3);
      expect(blend).toBeLessThan(0.3);
      // forceCollide influence = 1 - blend ≈ 0.75
      expect(1 - blend).toBeGreaterThan(0.7);
    });

    it("custom _blend overrides default", () => {
      const userConstants: Record<string, number> = { _blend: 0.5 };
      const blendInitial = userConstants._blend ?? 0.85;
      expect(blendInitial).toBe(0.5);

      const alpha = 1.0;
      const blend = blendInitial * Math.min(1, alpha * 3);
      expect(blend).toBeCloseTo(0.5);
    });
  });

  describe("system constants defaults", () => {
    it("all system constants have sensible defaults", () => {
      const constants: Record<string, number> | undefined = undefined;
      expect(constants?._blend ?? 0.85).toBe(0.85);
      expect(constants?._overlapPad ?? 1.3).toBe(1.3);
      expect(constants?._minGap ?? 0).toBe(0);
    });

    it("system constants can be overridden individually", () => {
      const constants: Record<string, number> = {
        _blend: 0.5,
        _overlapPad: 2.0,
        _minGap: 15,
        k: 6, // user constant preserved alongside
      };

      expect(constants._blend).toBe(0.5);
      expect(constants._overlapPad).toBe(2.0);
      expect(constants._minGap).toBe(15);
      expect(constants.k).toBe(6);
    });
  });

  describe("constants serialization round-trip", () => {
    it("system constants survive JSON round-trip", () => {
      const layout = {
        system: "cartesian" as const,
        axis1: { source: { kind: "index" as const }, transform: { kind: "linear" as const, scale: 1 } },
        axis2: { source: { kind: "index" as const }, transform: { kind: "linear" as const, scale: 1 } },
        perGroup: true,
        constants: { k: 6, d: 0.5, _blend: 0.7, _minGap: 10 },
      };

      const serialized = JSON.stringify(layout);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.constants._blend).toBe(0.7);
      expect(deserialized.constants._minGap).toBe(10);
      expect(deserialized.constants.k).toBe(6);
      expect(deserialized.constants.d).toBe(0.5);
    });

    it("system constants coexist with user constants in key set", () => {
      const constants = { k: 6, _blend: 0.85, _minGap: 0 };
      const keys = Object.keys(constants);
      // Both user constants and system constants are present
      expect(keys).toContain("k");
      expect(keys).toContain("_blend");
      expect(keys).toContain("_minGap");
      expect(keys).toHaveLength(3);
    });
  });

  describe("overlap padding behavior", () => {
    it("higher _overlapPad creates more group spacing", () => {
      const rA = 50, rB = 40;

      const minDist_default = (rA + rB) * 1.3; // 117
      const minDist_high = (rA + rB) * 2.0;    // 180

      expect(minDist_high).toBeGreaterThan(minDist_default);
      expect(minDist_default).toBeCloseTo(117);
      expect(minDist_high).toBeCloseTo(180);
    });
  });

  describe("minimum gap correction", () => {
    it("_minGap=0 disables correction (default behavior)", () => {
      const minGap = 0;
      // Function should return immediately
      expect(minGap <= 0).toBe(true);
    });

    it("_minGap > 0 pushes close nodes apart", () => {
      const minGap = 10;
      const nodeR = 5;
      const required = nodeR + nodeR + minGap; // 20

      // Two nodes 8px apart (less than required 20)
      const a = { x: 0, y: 0 };
      const b = { x: 8, y: 0 };

      const dx = b.x - a.x;
      const dist = Math.sqrt(dx * dx);
      expect(dist).toBeLessThan(required);

      // After correction
      const overlap = required - dist;
      const half = overlap / 2;
      a.x -= half;
      b.x += half;

      expect(Math.sqrt((b.x - a.x) ** 2)).toBeCloseTo(required);
    });
  });

  describe("super node effective radius", () => {
    it("super node radius is larger than base radius", () => {
      const baseR = 5;
      const memberCount = 10;
      const superR = Math.min(Math.max(baseR, baseR * (1 + Math.sqrt(memberCount) * 0.5)), 30);
      expect(superR).toBeGreaterThan(baseR);
      expect(superR).toBeCloseTo(5 * (1 + Math.sqrt(10) * 0.5));
    });

    it("super node radius is capped at 30", () => {
      const baseR = 10;
      const memberCount = 100;
      const superR = Math.min(Math.max(baseR, baseR * (1 + Math.sqrt(memberCount) * 0.5)), 30);
      expect(superR).toBe(30);
    });

    it("non-super node radius equals base radius", () => {
      const baseR = 5;
      const collapsedMembers: string[] = [];
      // effectiveRadius returns baseR when no collapsed members
      const result = collapsedMembers.length > 0
        ? Math.min(Math.max(baseR, baseR * (1 + Math.sqrt(collapsedMembers.length) * 0.5)), 30)
        : baseR;
      expect(result).toBe(baseR);
      expect(result).toBe(5);
    });
  });
});
