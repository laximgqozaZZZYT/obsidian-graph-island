/**
 * EdgeRenderer — port/perimeter pure function tests (cycle156)
 *
 * Covers exported functions that were previously untested:
 *   - computePortFace: selects the bbox face closest to graph center
 *   - faceCenter: returns center point of a given bbox face
 *   - facePerpendicular: returns tangent direction for a face
 *   - buildPerimeterPath: CCW perimeter traversal from a port face
 *   - findPerimeterBranchPoint: closest point on perimeter path to a target
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("pixi.js", () => ({}));

import {
  computePortFace,
  faceCenter,
  facePerpendicular,
  buildPerimeterPath,
  findPerimeterBranchPoint,
  type GroupBBox,
  type BBoxFace,
} from "../src/views/EdgeRenderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function bbox(minX: number, minY: number, maxX: number, maxY: number): GroupBBox {
  return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// computePortFace — picks face whose center is closest to graphCenter
// ---------------------------------------------------------------------------
describe("computePortFace", () => {
  const b = bbox(0, 0, 100, 100); // center at (50,50)

  it("returns N when graph center is above the bbox", () => {
    expect(computePortFace(b, { x: 50, y: -200 })).toBe("N");
  });

  it("returns S when graph center is below the bbox", () => {
    expect(computePortFace(b, { x: 50, y: 300 })).toBe("S");
  });

  it("returns W when graph center is to the left", () => {
    expect(computePortFace(b, { x: -200, y: 50 })).toBe("W");
  });

  it("returns E when graph center is to the right", () => {
    expect(computePortFace(b, { x: 300, y: 50 })).toBe("E");
  });

  it("prefers W face for center strongly biased left", () => {
    // Graph center at (-500, 50): N face center = (50, 0), W face center = (0, 50)
    // dist to N = sqrt(550^2 + 50^2) = huge, dist to W = sqrt(500^2 + 0) = 500
    // W is clearly closest
    expect(computePortFace(b, { x: -500, y: 50 })).toBe("W");
  });

  it("handles square bbox centered at origin", () => {
    const sym = bbox(-50, -50, 50, 50);
    // Center directly above: N face center = (0, -50) is closest to (0, -1000)
    expect(computePortFace(sym, { x: 0, y: -1000 })).toBe("N");
  });
});

// ---------------------------------------------------------------------------
// faceCenter — center point of each face
// ---------------------------------------------------------------------------
describe("faceCenter", () => {
  const b = bbox(10, 20, 110, 80);
  // center: (60, 50)

  it("N face returns horizontal center at minY", () => {
    const c = faceCenter(b, "N");
    expect(c.x).toBe(60);
    expect(c.y).toBe(20);
  });

  it("S face returns horizontal center at maxY", () => {
    const c = faceCenter(b, "S");
    expect(c.x).toBe(60);
    expect(c.y).toBe(80);
  });

  it("W face returns vertical center at minX", () => {
    const c = faceCenter(b, "W");
    expect(c.x).toBe(10);
    expect(c.y).toBe(50);
  });

  it("E face returns vertical center at maxX", () => {
    const c = faceCenter(b, "E");
    expect(c.x).toBe(110);
    expect(c.y).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// facePerpendicular — tangent direction along each face
// ---------------------------------------------------------------------------
describe("facePerpendicular", () => {
  it("N and S faces have horizontal perpendicular (1,0)", () => {
    expect(facePerpendicular("N")).toEqual({ perpX: 1, perpY: 0 });
    expect(facePerpendicular("S")).toEqual({ perpX: 1, perpY: 0 });
  });

  it("E and W faces have vertical perpendicular (0,1)", () => {
    expect(facePerpendicular("E")).toEqual({ perpX: 0, perpY: 1 });
    expect(facePerpendicular("W")).toEqual({ perpX: 0, perpY: 1 });
  });
});

// ---------------------------------------------------------------------------
// buildPerimeterPath — CCW perimeter starting from port face
// ---------------------------------------------------------------------------
describe("buildPerimeterPath", () => {
  const b = bbox(0, 0, 100, 100);
  // Corners: NW=(0,0), NE=(100,0), SE=(100,100), SW=(0,100)

  it("S face → port, SE, NE (CCW)", () => {
    const port = faceCenter(b, "S"); // (50, 100)
    const path = buildPerimeterPath(b, "S", port);
    expect(path).toHaveLength(3);
    expect(path[0]).toEqual(port);
    expect(path[1]).toEqual({ x: 100, y: 100 }); // SE
    expect(path[2]).toEqual({ x: 100, y: 0 });   // NE
  });

  it("N face → port, NW, SW (CCW)", () => {
    const port = faceCenter(b, "N"); // (50, 0)
    const path = buildPerimeterPath(b, "N", port);
    expect(path).toHaveLength(3);
    expect(path[0]).toEqual(port);
    expect(path[1]).toEqual({ x: 0, y: 0 });     // NW
    expect(path[2]).toEqual({ x: 0, y: 100 });   // SW
  });

  it("E face → port, NE, NW (CCW)", () => {
    const port = faceCenter(b, "E"); // (100, 50)
    const path = buildPerimeterPath(b, "E", port);
    expect(path).toHaveLength(3);
    expect(path[0]).toEqual(port);
    expect(path[1]).toEqual({ x: 100, y: 0 });   // NE
    expect(path[2]).toEqual({ x: 0, y: 0 });     // NW
  });

  it("W face → port, SW, SE (CCW)", () => {
    const port = faceCenter(b, "W"); // (0, 50)
    const path = buildPerimeterPath(b, "W", port);
    expect(path).toHaveLength(3);
    expect(path[0]).toEqual(port);
    expect(path[1]).toEqual({ x: 0, y: 100 });   // SW
    expect(path[2]).toEqual({ x: 100, y: 100 }); // SE
  });

  it("custom port position on S face (not center) is preserved", () => {
    const port = { x: 25, y: 100 }; // left-biased on S face
    const path = buildPerimeterPath(b, "S", port);
    expect(path[0]).toEqual({ x: 25, y: 100 });
    expect(path[1]).toEqual({ x: 100, y: 100 }); // SE corner unchanged
  });
});

// ---------------------------------------------------------------------------
// findPerimeterBranchPoint — closest projection on perimeter path
// ---------------------------------------------------------------------------
describe("findPerimeterBranchPoint", () => {
  // Path: (0,0) → (100,0) → (100,100)
  const path = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("target on first segment projects directly", () => {
    const result = findPerimeterBranchPoint(path, 50, 0);
    expect(result.index).toBe(0);
    expect(result.point.x).toBeCloseTo(50);
    expect(result.point.y).toBeCloseTo(0);
  });

  it("target on second segment projects directly", () => {
    const result = findPerimeterBranchPoint(path, 100, 50);
    expect(result.index).toBe(1);
    expect(result.point.x).toBeCloseTo(100);
    expect(result.point.y).toBeCloseTo(50);
  });

  it("target off-path projects to nearest segment point", () => {
    // Target at (50, -100) — above the first segment, projects to (50, 0)
    const result = findPerimeterBranchPoint(path, 50, -100);
    expect(result.index).toBe(0);
    expect(result.point.x).toBeCloseTo(50);
    expect(result.point.y).toBeCloseTo(0);
  });

  it("target at corner clamps to endpoint", () => {
    const result = findPerimeterBranchPoint(path, 100, 0);
    // Could be end of segment 0 or start of segment 1 — either index is fine
    expect(result.point.x).toBeCloseTo(100);
    expect(result.point.y).toBeCloseTo(0);
  });

  it("target far from both segments picks closest one", () => {
    // Target at (200, 50) — closer to second segment (vertical at x=100)
    const result = findPerimeterBranchPoint(path, 200, 50);
    expect(result.index).toBe(1);
    expect(result.point.x).toBeCloseTo(100);
    expect(result.point.y).toBeCloseTo(50);
  });

  it("single-point path returns that point", () => {
    const singlePath = [{ x: 42, y: 17 }];
    const result = findPerimeterBranchPoint(singlePath, 100, 100);
    // No segments to iterate — returns the first point as default
    expect(result.point).toEqual({ x: 42, y: 17 });
    expect(result.index).toBe(0);
  });

  it("degenerate zero-length segment is skipped", () => {
    // Path with a zero-length segment at the start
    const p = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },  // zero-length
      { x: 100, y: 0 },
    ];
    const result = findPerimeterBranchPoint(p, 50, 0);
    // Should find the projection on the second segment (index=1)
    expect(result.index).toBe(1);
    expect(result.point.x).toBeCloseTo(50);
    expect(result.point.y).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: computePortFace → faceCenter → buildPerimeterPath → findPerimeterBranchPoint
// ---------------------------------------------------------------------------
describe("port-to-branch integration", () => {
  it("full pipeline from bbox + graphCenter to branch point", () => {
    const b = bbox(0, 0, 200, 100);
    const graphCenter = { x: 100, y: -500 }; // far above → N face

    const face = computePortFace(b, graphCenter);
    expect(face).toBe("N");

    const port = faceCenter(b, face);
    expect(port).toEqual({ x: 100, y: 0 });

    const perp = facePerpendicular(face);
    expect(perp).toEqual({ perpX: 1, perpY: 0 });

    const path = buildPerimeterPath(b, face, port);
    expect(path.length).toBe(3);

    // Target node at (250, 50) — to the right of the bbox
    const branch = findPerimeterBranchPoint(path, 250, 50);
    expect(branch.point.x).toBeDefined();
    expect(branch.point.y).toBeDefined();
    // Should be on the perimeter path, so x/y are finite
    expect(isFinite(branch.point.x)).toBe(true);
    expect(isFinite(branch.point.y)).toBe(true);
  });
});
