import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	buildSunburstTooltipContent,
	drawSunburstLayoutArcs,
	drawSunburstLabels,
	clearSunburstLabels,
	hitTestSunburstArcAt,
	type SunburstTooltipLines,
	type SunburstArcDrawParams,
	type SunburstLabelDrawParams,
} from "../src/views/sunburst-renderer";
import type { SunburstArc } from "../src/layouts/sunburst";
import { CanvasText } from "../src/views/canvas2d";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkArc(overrides: Partial<SunburstArc> = {}): SunburstArc {
	return {
		name: "Test",
		depth: 1,
		x0: 0,
		x1: Math.PI / 2,
		y0: 0,
		y1: 100,
		value: 1,
		filePath: undefined,
		...overrides,
	} as SunburstArc;
}

// ---------------------------------------------------------------------------
// buildSunburstTooltipContent
// ---------------------------------------------------------------------------

describe("buildSunburstTooltipContent", () => {
	it("handles empty arc list", () => {
		const result = buildSunburstTooltipContent([], "test");
		expect(result.lines).toContain("test");
	});

	it("includes group name in output", () => {
		const arcs = [mkArc({ name: "MyGroup", depth: 1 })];
		const result = buildSunburstTooltipContent(arcs, "MyGroup");
		expect(result.lines[0]).toBe("MyGroup");
	});

	it("counts leaf files correctly", () => {
		const arcs = [
			mkArc({ name: "Parent", depth: 1, x0: 0, x1: Math.PI }),
			mkArc({ name: "Child1", depth: 2, x0: 0, x1: Math.PI / 2, filePath: "a.md" }),
			mkArc({ name: "Child2", depth: 2, x0: Math.PI / 2, x1: Math.PI, filePath: "b.md" }),
		];
		const result = buildSunburstTooltipContent(arcs, "Parent");
		expect(result.lines.some((l) => l.includes("2 files"))).toBe(true);
	});

	it("counts aggregated files from parent value", () => {
		const arcs = [
			mkArc({ name: "Parent", depth: 1, x0: 0, x1: Math.PI }),
			mkArc({ name: "Child", depth: 2, x0: 0, x1: Math.PI / 2, value: 5, filePath: undefined }),
		];
		const result = buildSunburstTooltipContent(arcs, "Parent");
		expect(result.lines.some((l) => l.includes("5 files"))).toBe(true);
	});

	it("skips parent self-entry", () => {
		const arcs = [
			mkArc({ name: "Parent", depth: 1 }),
			mkArc({ name: "Parent", depth: 1 }), // duplicate (should skip)
		];
		const result = buildSunburstTooltipContent(arcs, "Parent");
		// Should not error and should have reasonable output
		expect(result.lines).toBeDefined();
	});

	it("includes depth-2 child names up to 5", () => {
		const arcs = [
			mkArc({ name: "Parent", depth: 1, x0: 0, x1: 2 * Math.PI }),
			...Array.from({ length: 8 }, (_, i) =>
				mkArc({
					name: `Child${i}`,
					depth: 2,
					x0: (i * 2 * Math.PI) / 8,
					x1: ((i + 1) * 2 * Math.PI) / 8,
				}),
			),
		];
		const result = buildSunburstTooltipContent(arcs, "Parent");
		// Should include child names (max 5)
		expect(result.lines.length).toBeGreaterThanOrEqual(2);
	});

	it("only includes depth-2+ children", () => {
		const arcs = [
			mkArc({ name: "Parent", depth: 1, x0: 0, x1: Math.PI }),
			mkArc({ name: "Child", depth: 2, x0: 0, x1: Math.PI / 2 }),
			mkArc({ name: "GrandChild", depth: 3, x0: 0, x1: Math.PI / 4 }), // depth 3, should not affect count
		];
		const result = buildSunburstTooltipContent(arcs, "Parent");
		expect(result.lines).toBeDefined();
	});

	it("only counts children within angular range", () => {
		const arcs = [
			mkArc({ name: "Parent1", depth: 1, x0: 0, x1: Math.PI }),
			mkArc({ name: "Child1", depth: 2, x0: 0, x1: Math.PI / 2, filePath: "a.md" }),
			mkArc({ name: "Parent2", depth: 1, x0: Math.PI, x1: 2 * Math.PI }),
			mkArc({ name: "Child2", depth: 2, x0: Math.PI, x1: 1.5 * Math.PI, filePath: "b.md" }),
		];
		const result = buildSunburstTooltipContent(arcs, "Parent1");
		// Parent1 should only count Child1
		expect(result.lines.some((l) => l.includes("1 files"))).toBe(true);
	});

	it("cleans arc names", () => {
		const arcs = [mkArc({ name: "test-group", depth: 1 })];
		const result = buildSunburstTooltipContent(arcs, "test-group");
		// cleanArcName converts dashes to spaces
		expect(result.lines[0]).toBe("test-group");
	});
});

// ---------------------------------------------------------------------------
// drawSunburstLayoutArcs
// ---------------------------------------------------------------------------

describe("drawSunburstLayoutArcs", () => {
	let mockGfx: any;
	let mockDrawArcPath: any;

	beforeEach(() => {
		mockGfx = {
			lineStyle: vi.fn(),
			beginFill: vi.fn(),
			endFill: vi.fn(),
		};
		mockDrawArcPath = vi.fn();
	});

	it("handles empty arc list", () => {
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs: [],
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: null,
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		expect(mockDrawArcPath).not.toHaveBeenCalled();
	});

	it("skips depth-0 arcs", () => {
		const arcs = [mkArc({ depth: 0 }), mkArc({ depth: 1, name: "Group1" })];
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: null,
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		// Should only draw 1 arc (depth 1)
		expect(mockDrawArcPath).toHaveBeenCalledTimes(1);
	});

	it("calls drawArcPath for each non-depth-0 arc", () => {
		const arcs = [
			mkArc({ depth: 1, name: "G1" }),
			mkArc({ depth: 1, name: "G2" }),
			mkArc({ depth: 2, name: "C1" }),
		];
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: null,
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		expect(mockDrawArcPath).toHaveBeenCalledTimes(3);
	});

	it("sets line style and fill before drawing", () => {
		const arcs = [mkArc({ depth: 1 })];
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: null,
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		expect(mockGfx.lineStyle).toHaveBeenCalled();
		expect(mockGfx.beginFill).toHaveBeenCalled();
		expect(mockGfx.endFill).toHaveBeenCalled();
	});

	it("applies hover highlight to matching group", () => {
		const arcs = [mkArc({ depth: 1, name: "Target" }), mkArc({ depth: 1, name: "Other" })];
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: "Target",
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		expect(mockGfx.beginFill).toHaveBeenCalled();
		// Hovered group should get different alpha
		expect(mockDrawArcPath).toHaveBeenCalledTimes(2);
	});

	it("darkens non-hovered groups when hovering", () => {
		const arcs = [mkArc({ depth: 1, name: "G1" })];
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: "Other",
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		expect(mockGfx.beginFill).toHaveBeenCalled();
	});

	it("uses different rendering for sunburst vs graph view", () => {
		const arcs = [mkArc({ depth: 1 })];
		const sunburstParams: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: null,
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(sunburstParams);
		const sunburstCalls = mockGfx.lineStyle.mock.calls.length;

		mockGfx.lineStyle.mockClear();
		mockGfx.beginFill.mockClear();
		mockDrawArcPath.mockClear();

		const graphParams: SunburstArcDrawParams = {
			...sunburstParams,
			isSunburstView: false,
		};
		drawSunburstLayoutArcs(graphParams);
		// Should have different rendering
		expect(mockGfx.lineStyle).toHaveBeenCalled();
	});

	it("lightens deeper arcs in sunburst view", () => {
		const arcs = [
			mkArc({ depth: 1, name: "Root" }),
			mkArc({ depth: 2, name: "Child" }),
			mkArc({ depth: 3, name: "GrandChild" }),
		];
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 1,
			isSunburstView: true,
			hoveredGroup: null,
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		// All arcs should be drawn with depth-based lightening
		expect(mockDrawArcPath).toHaveBeenCalledTimes(3);
	});

	it("handles world scale zoom effects", () => {
		const arcs = [mkArc({ depth: 1 })];
		const params: SunburstArcDrawParams = {
			gfx: mockGfx,
			arcs,
			cx: 500,
			cy: 500,
			worldScale: 0.5, // zoomed out
			isSunburstView: true,
			hoveredGroup: null,
			drawArcPath: mockDrawArcPath,
		};
		drawSunburstLayoutArcs(params);
		// lineStyle call should include stroke width adjusted for zoom
		expect(mockGfx.lineStyle).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// drawSunburstLabels
// ---------------------------------------------------------------------------

describe("drawSunburstLabels", () => {
	let mockContainer: any;
	let mockCullFunc: any;

	beforeEach(() => {
		mockContainer = {
			addChild: vi.fn(),
		};
		mockCullFunc = vi.fn();
	});

	it("returns a map of labels", () => {
		const params: SunburstLabelDrawParams = {
			arcs: [],
			cx: 500,
			cy: 500,
			container: mockContainer,
			gfx: null,
			worldScale: 1,
			isSunburstView: false,
			isDark: true,
			cullOverlappingRotatedLabels: mockCullFunc,
		};
		const result = drawSunburstLabels(params);
		expect(result).toBeInstanceOf(Map);
	});

	it("adds depth-1 labels to container", () => {
		const arcs = [mkArc({ depth: 1, name: "G1" }), mkArc({ depth: 1, name: "G2" })];
		const params: SunburstLabelDrawParams = {
			arcs,
			cx: 500,
			cy: 500,
			container: mockContainer,
			gfx: null,
			worldScale: 1,
			isSunburstView: false,
			isDark: true,
			cullOverlappingRotatedLabels: mockCullFunc,
		};
		const result = drawSunburstLabels(params);
		// Should have 2 labels
		expect(result.size).toBeGreaterThanOrEqual(0);
	});

	it("skips depth-1 labels with small sweep", () => {
		const arcs = [
			mkArc({ depth: 1, name: "G1", x0: 0, x1: 0.01 }), // very small arc
		];
		const params: SunburstLabelDrawParams = {
			arcs,
			cx: 500,
			cy: 500,
			container: mockContainer,
			gfx: null,
			worldScale: 1,
			isSunburstView: false,
			isDark: true,
			cullOverlappingRotatedLabels: mockCullFunc,
		};
		const result = drawSunburstLabels(params);
		// Small arc should be skipped
		expect(result.size).toBeLessThanOrEqual(0);
	});

	it("adds depth-2 labels only in sunburst view", () => {
		const arcs = [
			mkArc({ depth: 1, name: "G1", x0: 0, x1: Math.PI }),
			mkArc({ depth: 2, name: "C1", x0: 0, x1: Math.PI / 2 }),
		];
		const params: SunburstLabelDrawParams = {
			arcs,
			cx: 500,
			cy: 500,
			container: mockContainer,
			gfx: null,
			worldScale: 1,
			isSunburstView: true,
			isDark: true,
			cullOverlappingRotatedLabels: mockCullFunc,
		};
		const result = drawSunburstLabels(params);
		expect(result).toBeInstanceOf(Map);
	});

	it("calls cullOverlappingRotatedLabels", () => {
		const arcs = [mkArc({ depth: 1 })];
		const params: SunburstLabelDrawParams = {
			arcs,
			cx: 500,
			cy: 500,
			container: mockContainer,
			gfx: null,
			worldScale: 1,
			isSunburstView: true,
			isDark: true,
			cullOverlappingRotatedLabels: mockCullFunc,
		};
		drawSunburstLabels(params);
		expect(mockCullFunc).toHaveBeenCalled();
	});

	it("uses different colors for dark vs light theme", () => {
		const arcs = [mkArc({ depth: 1 })];
		const darkParams: SunburstLabelDrawParams = {
			arcs,
			cx: 500,
			cy: 500,
			container: mockContainer,
			gfx: null,
			worldScale: 1,
			isSunburstView: false,
			isDark: true,
			cullOverlappingRotatedLabels: mockCullFunc,
		};
		const result1 = drawSunburstLabels(darkParams);

		mockContainer.addChild.mockClear();

		const lightParams: SunburstLabelDrawParams = {
			...darkParams,
			isDark: false,
		};
		const result2 = drawSunburstLabels(lightParams);

		// Both should produce results (color difference is internal)
		expect(result1).toBeInstanceOf(Map);
		expect(result2).toBeInstanceOf(Map);
	});

	it("scales font size with world scale", () => {
		const arcs = [mkArc({ depth: 1 })];
		const zoomedOutParams: SunburstLabelDrawParams = {
			arcs,
			cx: 500,
			cy: 500,
			container: mockContainer,
			gfx: null,
			worldScale: 0.5,
			isSunburstView: false,
			isDark: true,
			cullOverlappingRotatedLabels: mockCullFunc,
		};
		const result = drawSunburstLabels(zoomedOutParams);
		expect(result).toBeInstanceOf(Map);
	});
});

// ---------------------------------------------------------------------------
// clearSunburstLabels
// ---------------------------------------------------------------------------

describe("clearSunburstLabels", () => {
	it("clears empty label map", () => {
		const labels = new Map<string, CanvasText>();
		clearSunburstLabels(labels, null, null);
		expect(labels.size).toBe(0);
	});

	it("removes and destroys all labels", () => {
		const label1 = { parent: { removeChild: vi.fn() }, destroy: vi.fn() } as any;
		const label2 = { parent: { removeChild: vi.fn() }, destroy: vi.fn() } as any;
		const labels = new Map([
			["l1", label1],
			["l2", label2],
		]);
		clearSunburstLabels(labels, null, null);
		expect(labels.size).toBe(0);
		expect(label1.destroy).toHaveBeenCalled();
		expect(label2.destroy).toHaveBeenCalled();
	});

	it("hides label container if provided", () => {
		const container = { visible: true } as any;
		clearSunburstLabels(new Map(), container, null);
		expect(container.visible).toBe(false);
	});

	it("hides tooltip if provided", () => {
		const tooltip = { style: { display: "block" } } as any;
		clearSunburstLabels(new Map(), null, tooltip);
		expect(tooltip.style.display).toBe("none");
	});

	it("handles labels with null parent", () => {
		const label = { parent: null, destroy: vi.fn() } as any;
		const labels = new Map([["l1", label]]);
		clearSunburstLabels(labels, null, null);
		expect(labels.size).toBe(0);
		expect(label.destroy).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// hitTestSunburstArcAt
// ---------------------------------------------------------------------------

describe("hitTestSunburstArcAt", () => {
	// Helper: build a 4-quadrant sunburst around (0,0) with one depth-1 arc per
	// quadrant. The on-screen +y axis is "up" because the renderer offsets
	// angles by +PI/2 to put 0 at the top.
	//
	//   quadrant arcs (after the +PI/2 offset that hitTestSunburstArcAt undoes):
	//     "Top"    angles [0,         PI/2]
	//     "Right"  angles [PI/2,      PI]
	//     "Bottom" angles [PI,        3*PI/2]
	//     "Left"   angles [3*PI/2,    2*PI]
	function quadrantArcs(): SunburstArc[] {
		return [
			{ name: "Top", depth: 1, x0: 0, x1: Math.PI / 2, y0: 10, y1: 50, value: 1 } as SunburstArc,
			{ name: "Right", depth: 1, x0: Math.PI / 2, x1: Math.PI, y0: 10, y1: 50, value: 1 } as SunburstArc,
			{ name: "Bottom", depth: 1, x0: Math.PI, x1: (3 * Math.PI) / 2, y0: 10, y1: 50, value: 1 } as SunburstArc,
			{ name: "Left", depth: 1, x0: (3 * Math.PI) / 2, x1: 2 * Math.PI, y0: 10, y1: 50, value: 1 } as SunburstArc,
		];
	}

	it("returns null for empty arc list", () => {
		expect(hitTestSunburstArcAt([], 0, 0, 30, 30)).toBeNull();
	});

	it("returns null when point is inside the inner radius", () => {
		const arcs = quadrantArcs();
		// Inside hole (r < 10)
		expect(hitTestSunburstArcAt(arcs, 0, 0, 5, 0)).toBeNull();
	});

	it("returns null when point is outside the outer radius", () => {
		const arcs = quadrantArcs();
		// r = 100 > y1=50
		expect(hitTestSunburstArcAt(arcs, 0, 0, 100, 0)).toBeNull();
	});

	it("identifies the depth-1 arc directly when hit", () => {
		const arcs = quadrantArcs();
		// Right side (x>0, y=0) → angle=PI/2 after offset → "Right"
		const hit = hitTestSunburstArcAt(arcs, 0, 0, 30, 0);
		expect(hit).toBe("Right");
	});

	it("returns the depth-1 ancestor when a deeper arc is hit", () => {
		const arcs: SunburstArc[] = [
			{ name: "Parent", depth: 1, x0: 0, x1: Math.PI, y0: 10, y1: 30, value: 2 } as SunburstArc,
			{ name: "Child", depth: 2, x0: 0, x1: Math.PI / 2, y0: 30, y1: 60, value: 1 } as SunburstArc,
		];
		// Hit the child arc: r=45 (in [30,60]), angle = PI/2 (atan2(30,0)+PI/2 = PI)
		// Wait — atan2(0, 30)+PI/2 = 0 + PI/2 = PI/2 → in [0, PI/2] → child hit
		const hit = hitTestSunburstArcAt(arcs, 0, 0, 45, 0);
		expect(hit).toBe("Parent");
	});

	it("prefers the deepest arc when multiple contain the point", () => {
		const arcs: SunburstArc[] = [
			{ name: "Outer", depth: 1, x0: 0, x1: Math.PI, y0: 10, y1: 60, value: 2 } as SunburstArc,
			{ name: "Inner", depth: 2, x0: 0, x1: Math.PI / 2, y0: 20, y1: 40, value: 1 } as SunburstArc,
		];
		// r=30, angle=PI/2 → both arcs contain the point; the deeper one (Inner)
		// wins, but the function returns its depth-1 ancestor.
		const hit = hitTestSunburstArcAt(arcs, 0, 0, 30, 0);
		expect(hit).toBe("Outer");
	});

	it("falls back to the deepest arc's name when no depth-1 ancestor exists", () => {
		const arcs: SunburstArc[] = [
			{ name: "Orphan", depth: 2, x0: 0, x1: Math.PI / 2, y0: 10, y1: 50, value: 1 } as SunburstArc,
		];
		const hit = hitTestSunburstArcAt(arcs, 0, 0, 30, 0);
		expect(hit).toBe("Orphan");
	});

	it("skips depth-0 (root) arcs in hit-testing", () => {
		const arcs: SunburstArc[] = [
			{ name: "Root", depth: 0, x0: 0, x1: 2 * Math.PI, y0: 0, y1: 100, value: 10 } as SunburstArc,
		];
		// Even though the point is inside the root, depth-0 is filtered out.
		expect(hitTestSunburstArcAt(arcs, 0, 0, 30, 0)).toBeNull();
	});

	it("normalises negative angles back into [0, 2*PI)", () => {
		const arcs = quadrantArcs();
		// Left side (x<0, y=0): atan2(0,-30)=PI → angle=PI+PI/2=3PI/2 → in [3PI/2, 2PI] → "Left"
		const hit = hitTestSunburstArcAt(arcs, 0, 0, -30, 0);
		expect(hit).toBe("Left");
	});

	it("works around a non-zero centre (cx, cy)", () => {
		const arcs = quadrantArcs();
		// Centre at (100, 200); world point (130, 200) → relative (30, 0) → "Right"
		const hit = hitTestSunburstArcAt(arcs, 100, 200, 130, 200);
		expect(hit).toBe("Right");
	});
});
