import { describe, it, expect } from "vitest";
import { pointToSegmentDist, pointToNearestRoad } from "../src/layouts/road-network-metrics";
import type { RoadNetwork } from "../src/layouts/cable-tray";

// ---------------------------------------------------------------------------
// pointToSegmentDist — point-to-segment minimum distance
// ---------------------------------------------------------------------------
describe("pointToSegmentDist", () => {
  it("point on segment returns 0", () => {
    // midpoint of (0,0)-(10,0)
    expect(pointToSegmentDist(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it("point at segment endpoint returns 0", () => {
    expect(pointToSegmentDist(0, 0, 0, 0, 10, 0)).toBeCloseTo(0);
    expect(pointToSegmentDist(10, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it("perpendicular distance from horizontal segment", () => {
    // point (5, 3) is 3 units above midpoint of (0,0)-(10,0)
    expect(pointToSegmentDist(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it("perpendicular distance from vertical segment", () => {
    expect(pointToSegmentDist(4, 5, 0, 0, 0, 10)).toBeCloseTo(4);
  });

  it("distance from point beyond segment start (projection < 0)", () => {
    // point (-3, 0) is beyond start of (0,0)-(10,0)
    expect(pointToSegmentDist(-3, 0, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it("distance from point beyond segment end (projection > 1)", () => {
    // point (13, 4) is beyond end of (0,0)-(10,0)
    expect(pointToSegmentDist(13, 4, 0, 0, 10, 0)).toBeCloseTo(5); // sqrt(9+16)
  });

  it("degenerate zero-length segment (a == b)", () => {
    // collapses to point distance
    expect(pointToSegmentDist(3, 4, 0, 0, 0, 0)).toBeCloseTo(5); // sqrt(9+16)
  });

  it("diagonal segment — 45 degree line", () => {
    // segment (0,0)-(10,10), point (0,10) — distance = 10/sqrt(2) ≈ 7.071
    expect(pointToSegmentDist(0, 10, 0, 0, 10, 10)).toBeCloseTo(Math.sqrt(50));
  });

  it("very long segment with small offset", () => {
    expect(pointToSegmentDist(500, 0.1, 0, 0, 1000, 0)).toBeCloseTo(0.1);
  });

  it("negative coordinates", () => {
    expect(pointToSegmentDist(-5, -3, -10, 0, 0, 0)).toBeCloseTo(3);
  });
});

// ---------------------------------------------------------------------------
// pointToNearestRoad — minimum distance to any road segment
// ---------------------------------------------------------------------------
describe("pointToNearestRoad", () => {
  /** Build a minimal RoadNetwork for testing */
  function makeNetwork(opts: {
    intersections: Array<{ id: number; x: number; y: number }>;
    segments: Array<{
      from: number;
      to: number;
      waypoints?: Array<{ x: number; y: number }>;
      length?: number;
    }>;
  }): RoadNetwork {
    return {
      intersections: opts.intersections,
      segments: opts.segments.map(s => ({
        from: s.from,
        to: s.to,
        waypoints: s.waypoints ?? [],
        length: s.length ?? 0,
      })),
      nodeAccess: new Map(),
      adjacency: new Map(),
      system: "cartesian",
      cx: 0,
      cy: 0,
    };
  }

  it("point on a road segment returns 0", () => {
    const net = makeNetwork({
      intersections: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 10, y: 0 }],
      segments: [{ from: 0, to: 1 }],
    });
    expect(pointToNearestRoad(5, 0, net)).toBeCloseTo(0);
  });

  it("perpendicular distance to nearest road", () => {
    const net = makeNetwork({
      intersections: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 10, y: 0 }],
      segments: [{ from: 0, to: 1 }],
    });
    expect(pointToNearestRoad(5, 7, net)).toBeCloseTo(7);
  });

  it("selects closest segment from multiple roads", () => {
    const net = makeNetwork({
      intersections: [
        { id: 0, x: 0, y: 0 },
        { id: 1, x: 10, y: 0 },
        { id: 2, x: 0, y: 20 },
        { id: 3, x: 10, y: 20 },
      ],
      segments: [
        { from: 0, to: 1 }, // y=0 road
        { from: 2, to: 3 }, // y=20 road
      ],
    });
    // point (5, 3) → distance 3 to y=0 road, 17 to y=20 road
    expect(pointToNearestRoad(5, 3, net)).toBeCloseTo(3);
  });

  it("considers waypoints for curved road segments", () => {
    const net = makeNetwork({
      intersections: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 20, y: 0 }],
      segments: [{
        from: 0,
        to: 1,
        waypoints: [{ x: 10, y: 10 }], // arc through (10,10)
      }],
    });
    // point (10, 10) is on waypoint → distance = 0
    expect(pointToNearestRoad(10, 10, net)).toBeCloseTo(0);
  });

  it("empty network returns Infinity", () => {
    const net = makeNetwork({ intersections: [], segments: [] });
    expect(pointToNearestRoad(5, 5, net)).toBe(Infinity);
  });

  it("segment with missing intersection is skipped", () => {
    const net = makeNetwork({
      intersections: [{ id: 0, x: 0, y: 0 }], // only id=0, not id=1
      segments: [{ from: 0, to: 1 }], // to=1 doesn't exist
    });
    expect(pointToNearestRoad(5, 5, net)).toBe(Infinity);
  });

  it("waypoints create a closer path than direct segment", () => {
    const net = makeNetwork({
      intersections: [{ id: 0, x: 0, y: 0 }, { id: 1, x: 100, y: 0 }],
      segments: [{
        from: 0,
        to: 1,
        waypoints: [{ x: 50, y: 30 }], // detour upward
      }],
    });
    // point (50, 25): direct segment dist = 25, waypoint path goes via (50,30)
    // Segments: (0,0)→(50,30) and (50,30)→(100,0). Closest is perpendicular to (0,0)→(50,30).
    const dist = pointToNearestRoad(50, 25, net);
    expect(dist).toBeLessThan(25); // closer via waypoint path
    expect(dist).toBeLessThan(6); // significantly closer than direct segment
  });
});
