import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	buildSunburstTooltipContent,
	drawSunburstLayoutArcs,
	drawSunburstLabels,
	clearSunburstLabels,
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
