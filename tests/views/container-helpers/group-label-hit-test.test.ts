import { describe, it, expect } from "vitest";
import {
	findHoveredGroupLabel,
	computeGroupZoomTransform,
	type GroupLabelLike,
	type GroupMemberLike,
} from "../../../src/views/container-helpers/group-label-hit-test";

// ---------------------------------------------------------------------------
// findHoveredGroupLabel
// ---------------------------------------------------------------------------
describe("findHoveredGroupLabel", () => {
	const mkLabel = (overrides: Partial<GroupLabelLike> = {}): GroupLabelLike => ({
		x: 0,
		y: 0,
		visible: true,
		text: "abcde", // 5 chars → hw = 5*7*0.5 + 10 = 27.5
		...overrides,
	});

	it("returns the key when pointer is inside the hit area at unit scale", () => {
		const labels = new Map<string, GroupLabelLike>([["g1", mkLabel({ x: 100, y: 50 })]]);
		// Screen pos = (100, 50) at scale=1, worldX=worldY=0
		expect(findHoveredGroupLabel(100, 50, labels, 0, 0, 1)).toBe("g1");
	});

	it("returns null when pointer is far from any label", () => {
		const labels = new Map<string, GroupLabelLike>([["g1", mkLabel({ x: 100, y: 50 })]]);
		expect(findHoveredGroupLabel(500, 500, labels, 0, 0, 1)).toBeNull();
	});

	it("skips labels whose visible flag is false", () => {
		const labels = new Map<string, GroupLabelLike>([
			["hidden", mkLabel({ x: 0, y: 0, visible: false })],
		]);
		expect(findHoveredGroupLabel(0, 0, labels, 0, 0, 1)).toBeNull();
	});

	it("uses default text length 10 when text is undefined", () => {
		// hw = 10 * 7 * 0.5 + 10 = 45
		const labels = new Map<string, GroupLabelLike>([
			["g", { x: 0, y: 0, visible: true }],
		]);
		// 44 is inside, 46 is outside (right edge ~45)
		expect(findHoveredGroupLabel(44, 0, labels, 0, 0, 1)).toBe("g");
		expect(findHoveredGroupLabel(46, 0, labels, 0, 0, 1)).toBeNull();
	});

	it("respects worldX/Y offset and scale when computing screen position", () => {
		// label at world (10,20), scale=2, worldX=5, worldY=7
		// → screen (10*2+5, 20*2+7) = (25, 47)
		const labels = new Map<string, GroupLabelLike>([
			["g", mkLabel({ x: 10, y: 20 })],
		]);
		expect(findHoveredGroupLabel(25, 47, labels, 5, 7, 2)).toBe("g");
		expect(findHoveredGroupLabel(0, 0, labels, 5, 7, 2)).toBeNull();
	});

	it("returns the first match when multiple labels overlap (iteration order)", () => {
		const labels = new Map<string, GroupLabelLike>([
			["a", mkLabel({ x: 0, y: 0 })],
			["b", mkLabel({ x: 0, y: 0 })],
		]);
		expect(findHoveredGroupLabel(0, 0, labels, 0, 0, 1)).toBe("a");
	});

	it("checks vertical hit area: half-height + padding = 14 + 5 = 19", () => {
		const labels = new Map<string, GroupLabelLike>([
			["g", mkLabel({ x: 0, y: 0 })],
		]);
		expect(findHoveredGroupLabel(0, 19, labels, 0, 0, 1)).toBe("g");
		expect(findHoveredGroupLabel(0, 20, labels, 0, 0, 1)).toBeNull();
	});

	it("returns null on empty label map", () => {
		expect(findHoveredGroupLabel(0, 0, new Map(), 0, 0, 1)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// computeGroupZoomTransform
// ---------------------------------------------------------------------------
describe("computeGroupZoomTransform", () => {
	const mkNode = (x: number, y: number): GroupMemberLike => ({ gfx: { x, y } });

	it("returns null for an empty member set", () => {
		expect(computeGroupZoomTransform(new Set(), new Map(), 800, 600)).toBeNull();
	});

	it("returns null when no members resolve to nodes", () => {
		expect(
			computeGroupZoomTransform(new Set(["missing"]), new Map(), 800, 600),
		).toBeNull();
	});

	it("computes a centered scale clamped to GROUP_ZOOM_MAX_SCALE (2.0) for a tight cluster", () => {
		const nodes = new Map<string, GroupMemberLike>([
			["a", mkNode(0, 0)],
			["b", mkNode(10, 10)],
		]);
		const t = computeGroupZoomTransform(new Set(["a", "b"]), nodes, 800, 600);
		expect(t).not.toBeNull();
		// scaleX = 800 / (10 + 200) ≈ 3.81, scaleY = 600 / (10 + 200) ≈ 2.86 → min(3.81, 2.86, 2.0) = 2.0
		expect(t!.scale).toBe(2.0);
		// center = (5, 5), canvas center (400, 300) → x = 400 - 5*2 = 390, y = 300 - 5*2 = 290
		expect(t!.x).toBe(390);
		expect(t!.y).toBe(290);
	});

	it("scales down for a wide cluster larger than the canvas", () => {
		const nodes = new Map<string, GroupMemberLike>([
			["a", mkNode(0, 0)],
			["b", mkNode(1000, 500)],
		]);
		const t = computeGroupZoomTransform(new Set(["a", "b"]), nodes, 800, 600);
		expect(t).not.toBeNull();
		// scaleX = 800 / (1000 + 200) = 0.6667, scaleY = 600 / (500 + 200) = 0.857 → min = 0.6667
		expect(t!.scale).toBeCloseTo(800 / 1200, 5);
	});

	it("ignores missing member ids while keeping resolved ones", () => {
		const nodes = new Map<string, GroupMemberLike>([["a", mkNode(50, 50)]]);
		const t = computeGroupZoomTransform(new Set(["a", "missing"]), nodes, 800, 600);
		expect(t).not.toBeNull();
		// Single node bounding box collapses to a point, scale clamps to 2.0
		expect(t!.scale).toBe(2.0);
		expect(t!.x).toBe(400 - 50 * 2);
		expect(t!.y).toBe(300 - 50 * 2);
	});

	it("centers the transform such that the bbox center maps to canvas center", () => {
		const nodes = new Map<string, GroupMemberLike>([
			["a", mkNode(-50, -50)],
			["b", mkNode(50, 50)],
		]);
		const t = computeGroupZoomTransform(new Set(["a", "b"]), nodes, 800, 600);
		expect(t).not.toBeNull();
		// bbox center = (0, 0) → x = 400 - 0*scale = 400, y = 300 - 0*scale = 300
		expect(t!.x).toBe(400);
		expect(t!.y).toBe(300);
	});
});
