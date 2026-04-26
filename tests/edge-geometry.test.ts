import { describe, it, expect } from "vitest";
import {
	computePortFace,
	faceCenter,
	facePerpendicular,
	buildPerimeterPath,
	findPerimeterBranchPoint,
	type GroupBBox,
	type BBoxFace,
} from "../src/views/EdgeRenderer";

// ---------- computePortFace ----------

describe("computePortFace", () => {
	const box: GroupBBox = { minX: 0, minY: 0, maxX: 100, maxY: 80 };

	it("returns N when graph center is above the box", () => {
		expect(computePortFace(box, { x: 50, y: -100 })).toBe("N");
	});

	it("returns S when graph center is below the box", () => {
		expect(computePortFace(box, { x: 50, y: 200 })).toBe("S");
	});

	it("returns W when graph center is left of the box", () => {
		expect(computePortFace(box, { x: -100, y: 40 })).toBe("W");
	});

	it("returns E when graph center is right of the box", () => {
		expect(computePortFace(box, { x: 300, y: 40 })).toBe("E");
	});

	it("returns closest face for diagonal center (NW)", () => {
		// Center above-left: closer to N or W depending on aspect ratio
		const face = computePortFace(box, { x: -50, y: -50 });
		expect(["N", "W"]).toContain(face);
	});

	it("handles square bbox with centered graph", () => {
		const sq: GroupBBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
		// Graph center exactly on top → N face center is closest
		const face = computePortFace(sq, { x: 50, y: -1 });
		expect(face).toBe("N");
	});
});

// ---------- faceCenter ----------

describe("faceCenter", () => {
	const box: GroupBBox = { minX: 10, minY: 20, maxX: 110, maxY: 80 };

	it("returns center of N face", () => {
		expect(faceCenter(box, "N")).toEqual({ x: 60, y: 20 });
	});

	it("returns center of S face", () => {
		expect(faceCenter(box, "S")).toEqual({ x: 60, y: 80 });
	});

	it("returns center of W face", () => {
		expect(faceCenter(box, "W")).toEqual({ x: 10, y: 50 });
	});

	it("returns center of E face", () => {
		expect(faceCenter(box, "E")).toEqual({ x: 110, y: 50 });
	});
});

// ---------- facePerpendicular ----------

describe("facePerpendicular", () => {
	it("N and S faces have horizontal perpendicular", () => {
		expect(facePerpendicular("N")).toEqual({ perpX: 1, perpY: 0 });
		expect(facePerpendicular("S")).toEqual({ perpX: 1, perpY: 0 });
	});

	it("E and W faces have vertical perpendicular", () => {
		expect(facePerpendicular("E")).toEqual({ perpX: 0, perpY: 1 });
		expect(facePerpendicular("W")).toEqual({ perpX: 0, perpY: 1 });
	});
});

// ---------- buildPerimeterPath ----------

describe("buildPerimeterPath", () => {
	const box: GroupBBox = { minX: 0, minY: 0, maxX: 100, maxY: 80 };

	it("S face: port → SE → NE", () => {
		const port = { x: 50, y: 80 };
		const path = buildPerimeterPath(box, "S", port);
		expect(path).toEqual([port, { x: 100, y: 80 }, { x: 100, y: 0 }]);
	});

	it("N face: port → NW → SW", () => {
		const port = { x: 50, y: 0 };
		const path = buildPerimeterPath(box, "N", port);
		expect(path).toEqual([port, { x: 0, y: 0 }, { x: 0, y: 80 }]);
	});

	it("E face: port → NE → NW", () => {
		const port = { x: 100, y: 40 };
		const path = buildPerimeterPath(box, "E", port);
		expect(path).toEqual([port, { x: 100, y: 0 }, { x: 0, y: 0 }]);
	});

	it("W face: port → SW → SE", () => {
		const port = { x: 0, y: 40 };
		const path = buildPerimeterPath(box, "W", port);
		expect(path).toEqual([port, { x: 0, y: 80 }, { x: 100, y: 80 }]);
	});

	it("always returns exactly 3 points", () => {
		const faces: BBoxFace[] = ["N", "S", "E", "W"];
		for (const f of faces) {
			const port = faceCenter(box, f);
			expect(buildPerimeterPath(box, f, port)).toHaveLength(3);
		}
	});
});

// ---------- findPerimeterBranchPoint ----------

describe("findPerimeterBranchPoint", () => {
	it("projects target onto nearest segment", () => {
		const path = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
		];
		// Target at (50, 30) → closest to first segment at (50, 0)
		const { index, point } = findPerimeterBranchPoint(path, 50, 30);
		expect(index).toBe(0);
		expect(point.x).toBeCloseTo(50);
		expect(point.y).toBeCloseTo(0);
	});

	it("clamps projection to segment endpoints", () => {
		const path = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
		];
		// Target far past end of segment
		const { point } = findPerimeterBranchPoint(path, 200, 0);
		expect(point.x).toBeCloseTo(100);
		expect(point.y).toBeCloseTo(0);
	});

	it("selects second segment when closer", () => {
		const path = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
		];
		// Target at (120, 60) → closest to second segment at (100, 60)
		const { index, point } = findPerimeterBranchPoint(path, 120, 60);
		expect(index).toBe(1);
		expect(point.x).toBeCloseTo(100);
		expect(point.y).toBeCloseTo(60);
	});

	it("handles degenerate single-point path", () => {
		const path = [{ x: 50, y: 50 }];
		const result = findPerimeterBranchPoint(path, 100, 100);
		expect(result.point).toEqual({ x: 50, y: 50 });
	});

	it("handles zero-length segment gracefully", () => {
		const path = [
			{ x: 0, y: 0 },
			{ x: 0, y: 0 }, // degenerate
			{ x: 100, y: 0 },
		];
		// Should skip degenerate segment and find closest on segment 1
		const { index, point } = findPerimeterBranchPoint(path, 50, 5);
		expect(index).toBe(1);
		expect(point.x).toBeCloseTo(50);
		expect(point.y).toBeCloseTo(0);
	});
});

// ---------------------------------------------------------------------------
// Integration: computePortFace → faceCenter → buildPerimeterPath → findPerimeterBranchPoint
// ---------------------------------------------------------------------------
describe("port-to-branch integration", () => {
	it("full pipeline from bbox + graphCenter to branch point", () => {
		const b: GroupBBox = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
		const graphCenter = { x: 100, y: -500 }; // far above → N face

		const face = computePortFace(b, graphCenter);
		expect(face).toBe("N");

		const port = faceCenter(b, face);
		expect(port).toEqual({ x: 100, y: 0 });

		const perp = facePerpendicular(face);
		expect(perp).toEqual({ perpX: 1, perpY: 0 });

		const path = buildPerimeterPath(b, face, port);
		expect(path.length).toBe(3);

		const branch = findPerimeterBranchPoint(path, 250, 50);
		expect(isFinite(branch.point.x)).toBe(true);
		expect(isFinite(branch.point.y)).toBe(true);
	});
});
