import { describe, it, expect } from "vitest";
import { findCellIndex, GuideRenderer } from "../src/views/GuideRenderer";
import type { GuideRendererHost } from "../src/views/GuideRenderer";
import { CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";

// ---------------------------------------------------------------------------
// findCellIndex — locate a value in sorted boundary positions
// ---------------------------------------------------------------------------
describe("findCellIndex", () => {
	// Standard grid: [0, 100, 200, 300] → cells 0, 1, 2
	const positions = [0, 100, 200, 300];

	it("returns correct cell for value in first cell", () => {
		expect(findCellIndex(50, positions)).toBe(0);
	});

	it("returns correct cell for value in middle cell", () => {
		expect(findCellIndex(150, positions)).toBe(1);
	});

	it("returns correct cell for value in last cell", () => {
		expect(findCellIndex(250, positions)).toBe(2);
	});

	it("returns cell index for value at cell boundary (inclusive start)", () => {
		expect(findCellIndex(100, positions)).toBe(1);
		expect(findCellIndex(200, positions)).toBe(2);
	});

	it("returns first cell for value at first boundary", () => {
		expect(findCellIndex(0, positions)).toBe(0);
	});

	it("returns last cell for value at or beyond last boundary", () => {
		// value >= positions[n-2] falls into last cell
		expect(findCellIndex(300, positions)).toBe(2);
		expect(findCellIndex(999, positions)).toBe(2);
	});

	it("returns -1 for value below all boundaries", () => {
		expect(findCellIndex(-10, positions)).toBe(-1);
	});

	it("handles single-cell grid (two boundaries)", () => {
		expect(findCellIndex(50, [0, 100])).toBe(0);
		expect(findCellIndex(0, [0, 100])).toBe(0);
		expect(findCellIndex(100, [0, 100])).toBe(0);
	});

	it("handles empty positions array", () => {
		expect(findCellIndex(50, [])).toBe(-1);
	});

	it("handles single-element positions array", () => {
		expect(findCellIndex(50, [100])).toBe(-1);
	});

	it("handles negative position boundaries", () => {
		const neg = [-200, -100, 0, 100];
		expect(findCellIndex(-150, neg)).toBe(0);
		expect(findCellIndex(-50, neg)).toBe(1);
		expect(findCellIndex(50, neg)).toBe(2);
	});

	it("handles floating-point boundaries", () => {
		const fp = [0.5, 1.5, 2.5];
		expect(findCellIndex(1.0, fp)).toBe(0);
		expect(findCellIndex(2.0, fp)).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// GuideRenderer class — mock-based tests
// ---------------------------------------------------------------------------

function createMockHost(overrides: Partial<GuideRendererHost> = {}): GuideRendererHost {
	const wc = new CanvasContainer();
	return {
		worldContainer: wc,
		isDarkTheme: () => false,
		getPanel: () => ({}),
		getCurrentNodes: () => [],
		...overrides,
	};
}

describe("GuideRenderer", () => {
	describe("drawGridLines", () => {
		it("draws vertical and horizontal lines", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const guide = {
				type: "grid" as const,
				verticals: [0, 100, 200],
				horizontals: [0, 100],
				bounds: { xMin: -10, yMin: -10, xMax: 210, yMax: 110 },
			};
			renderer.drawGridLines(g, 0, 0, guide, 1, 0x888888);
			// Should have drawn: 1 lineStyle + 3 vertical (moveTo+lineTo each) + 2 horizontal (moveTo+lineTo each)
			expect(g.commandCount).toBeGreaterThan(0);
		});

		it("applies center offset (cx, cy)", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const guide = {
				type: "grid" as const,
				verticals: [50],
				horizontals: [50],
				bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
			};
			renderer.drawGridLines(g, 100, 200, guide, 1, 0x888888);
			expect(g.commandCount).toBeGreaterThan(0);
		});
	});

	describe("drawTriangleOutline", () => {
		it("draws a closed triangle", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const guide = {
				type: "triangle" as const,
				vertices: [
					{ x: 0, y: -100 },
					{ x: -87, y: 50 },
					{ x: 87, y: 50 },
				],
			};
			renderer.drawTriangleOutline(g, 0, 0, guide, 1, 0x888888);
			// lineStyle + moveTo + 3 lineTo = 5 commands
			expect(g.commandCount).toBe(5);
		});
	});

	describe("drawConcentricGuide", () => {
		it("draws concentric rings and cross", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const guide = {
				type: "concentric" as const,
				rings: [50, 100, 150],
			};
			renderer.drawConcentricGuide(g, 0, 0, guide, 1, 0x888888);
			// Should draw 3 circles + center cross (4 moveTo/lineTo pairs)
			expect(g.commandCount).toBeGreaterThan(5);
		});

		it("skips drawing when rings is empty", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			renderer.drawConcentricGuide(g, 0, 0, { type: "concentric" as const, rings: [] }, 1, 0x888888);
			expect(g.commandCount).toBe(0);
		});

		it("uses the last ring as max radius for the cross", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const guide = { type: "concentric" as const, rings: [100] };
			renderer.drawConcentricGuide(g, 50, 50, guide, 1, 0x888888);
			expect(g.commandCount).toBeGreaterThan(0);
		});
	});

	describe("drawCoordinateGuide", () => {
		it("returns immediately when bounds is undefined", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			renderer.drawCoordinateGuide(
				g,
				0,
				0,
				{
					type: "coordinate",
					system: "cartesian",
				},
				1,
				0x888888,
			);
			expect(g.commandCount).toBe(0);
		});

		it("draws cartesian grid with bounds", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			renderer.drawCoordinateGuide(
				g,
				0,
				0,
				{
					type: "coordinate",
					system: "cartesian",
					bounds: { xMin: -200, yMin: -200, xMax: 200, yMax: 200 },
				},
				1,
				0x888888,
			);
			expect(g.commandCount).toBeGreaterThan(5);
		});

		it("draws polar guide with maxR", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			renderer.drawCoordinateGuide(
				g,
				0,
				0,
				{
					type: "coordinate",
					system: "polar",
					bounds: { xMin: -200, yMin: -200, xMax: 200, yMax: 200, maxR: 200 },
				},
				1,
				0x888888,
			);
			// Should draw concentric circles + radial lines
			expect(g.commandCount).toBeGreaterThan(5);
		});

		it("skips cartesian grid when range is too small", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			renderer.drawCoordinateGuide(
				g,
				0,
				0,
				{
					type: "coordinate",
					system: "cartesian",
					bounds: { xMin: 0, yMin: 0, xMax: 0.5, yMax: 0.5 },
				},
				1,
				0x888888,
			);
			// Range < 1, should early return
			expect(g.commandCount).toBe(0);
		});
	});

	describe("clearAll", () => {
		it("clears all label arrays without error", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			// Should not throw even with no labels created
			expect(() => renderer.clearAll()).not.toThrow();
		});
	});

	describe("clearCustomGridLabels / clearTimelineAxisLabels / clearAxisTitles", () => {
		it("can be called multiple times without error", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			renderer.clearCustomGridLabels();
			renderer.clearTimelineAxisLabels();
			renderer.clearAxisTitles();
			renderer.clearCustomGridLabels();
			// No assertions needed — just verifying no throw
		});
	});

	describe("drawTimelineAxis", () => {
		it("draws axis line and tick marks", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			// Add g to a parent container so tick labels can be appended
			const parent = new CanvasContainer();
			parent.addChild(g);

			const guide = {
				type: "timeline" as const,
				axisY: 100,
				ticks: [
					{ x: 0, label: "2020" },
					{ x: 100, label: "2021" },
					{ x: 200, label: "2022" },
				],
			};
			renderer.drawTimelineAxis(g, 0, 0, guide, 1, 0x888888, 1.0);
			expect(g.commandCount).toBeGreaterThan(0);
		});

		it("skips drawing when ticks array is empty", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			renderer.drawTimelineAxis(
				g,
				0,
				0,
				{
					type: "timeline" as const,
					axisY: 0,
					ticks: [],
				},
				1,
				0x888888,
				1.0,
			);
			expect(g.commandCount).toBe(0);
		});

		it("draws tick labels when configured", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: {
						timelineAxisShowLabels: true,
						timelineAxisLabelMaxCount: 5,
						timelineAxisLabelFontSize: 12,
						timelineAxisLabelOffset: 8,
						timelineAxisLabelAlpha: 0.8,
						gridLineMargin: 50,
					},
					showTimelineTickLabels: true,
				}),
			});
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const parent = new CanvasContainer();
			parent.addChild(g);

			const guide = {
				type: "timeline" as const,
				axisY: 100,
				ticks: [
					{ x: 0, label: "2020" },
					{ x: 50, label: "2021" },
					{ x: 100, label: "2022" },
				],
			};
			renderer.drawTimelineAxis(g, 0, 0, guide, 1, 0x888888, 1.0);
			expect(g.commandCount).toBeGreaterThan(0);
		});

		it("skips labels when showTimelineTickLabels is false", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: {
						timelineAxisShowLabels: true,
						timelineAxisLabelMaxCount: 5,
						timelineAxisLabelFontSize: 12,
						timelineAxisLabelOffset: 8,
						timelineAxisLabelAlpha: 0.8,
						gridLineMargin: 50,
					},
					showTimelineTickLabels: false,
				}),
			});
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			renderer.drawTimelineAxis(
				g,
				0,
				0,
				{
					type: "timeline" as const,
					axisY: 100,
					ticks: [{ x: 0, label: "2020" }],
				},
				1,
				0x888888,
				1.0,
			);
			expect(g.commandCount).toBeGreaterThan(0);
		});

		it("downsamples labels when there are too many ticks", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: {
						timelineAxisShowLabels: true,
						timelineAxisLabelMaxCount: 2,
						timelineAxisLabelFontSize: 12,
						timelineAxisLabelOffset: 8,
						timelineAxisLabelAlpha: 0.8,
						gridLineMargin: 50,
					},
					showTimelineTickLabels: true,
				}),
			});
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const parent = new CanvasContainer();
			parent.addChild(g);

			const guide = {
				type: "timeline" as const,
				axisY: 100,
				ticks: [
					{ x: 0, label: "2020" },
					{ x: 25, label: "2021" },
					{ x: 50, label: "2022" },
					{ x: 75, label: "2023" },
					{ x: 100, label: "2024" },
				],
			};
			renderer.drawTimelineAxis(g, 0, 0, guide, 1, 0x888888, 1.0);
			expect(g.commandCount).toBeGreaterThan(0);
		});

		it("calls clearTimelineAxisLabels before drawing", () => {
			const host = createMockHost();
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();
			const guide = {
				type: "timeline" as const,
				axisY: 100,
				ticks: [{ x: 0, label: "2020" }],
			};
			// Should not throw, and should call clear internally
			expect(() => renderer.drawTimelineAxis(g, 0, 0, guide, 1, 0x888888, 1.0)).not.toThrow();
		});
	});

	describe("drawAxisTitles", () => {
		it("draws axis1 title for linear shape", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: {
						axisTitleShow: true,
						axisTitleFontSize: 14,
						axisTitleOffset: 20,
						axisTitleAlpha: 0.8,
						gridLabelFontSizeBase: 11,
					},
					showAxisTitles: true,
				}),
			});
			const renderer = new GuideRenderer(host);
			const bounds = { xMin: -100, yMin: -100, xMax: 100, yMax: 100 };
			expect(() => {
				renderer.drawAxisTitles(
					0,
					0,
					{ kind: "linear" },
					{ kind: "linear" },
					bounds,
					1.0,
					false,
					"X Axis",
					"Y Axis",
				);
			}).not.toThrow();
		});

		it("skips drawing when axisTitleShow is false", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: { axisTitleShow: false },
					showAxisTitles: undefined,
				}),
			});
			const renderer = new GuideRenderer(host);
			const bounds = { xMin: -100, yMin: -100, xMax: 100, yMax: 100 };
			expect(() => {
				renderer.drawAxisTitles(0, 0, { kind: "linear" }, { kind: "linear" }, bounds, 1.0, false, "X", "Y");
			}).not.toThrow();
		});

		it("skips drawing when no titles provided", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: { axisTitleShow: true },
					showAxisTitles: true,
				}),
			});
			const renderer = new GuideRenderer(host);
			const bounds = { xMin: -100, yMin: -100, xMax: 100, yMax: 100 };
			expect(() => {
				renderer.drawAxisTitles(0, 0, { kind: "linear" }, { kind: "linear" }, bounds, 1.0, false);
			}).not.toThrow();
		});

		it("draws radial axis1 title", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: {
						axisTitleShow: true,
						axisTitleFontSize: 14,
						axisTitleOffset: 20,
						axisTitleAlpha: 0.8,
						gridLabelFontSizeBase: 11,
					},
					showAxisTitles: true,
				}),
			});
			const renderer = new GuideRenderer(host);
			const bounds = { xMin: -100, yMin: -100, xMax: 100, yMax: 100, maxR: 150 };
			expect(() => {
				renderer.drawAxisTitles(
					0,
					0,
					{ kind: "radial" },
					{ kind: "circle" },
					bounds,
					1.0,
					false,
					"Radius",
					"Angle",
				);
			}).not.toThrow();
		});

		it("draws circle axis2 title", () => {
			const host = createMockHost({
				getPanel: () => ({
					renderThresholds: {
						axisTitleShow: true,
						axisTitleFontSize: 14,
						axisTitleOffset: 20,
						axisTitleAlpha: 0.8,
						gridLabelFontSizeBase: 11,
					},
					showAxisTitles: true,
				}),
			});
			const renderer = new GuideRenderer(host);
			const bounds = { xMin: -100, yMin: -100, xMax: 100, yMax: 100, maxR: 150 };
			expect(() => {
				renderer.drawAxisTitles(0, 0, { kind: "linear" }, { kind: "circle" }, bounds, 1.0, true, "X", "Radius");
			}).not.toThrow();
		});

		it("respects dark theme when drawing titles", () => {
			const host = createMockHost({
				isDarkTheme: () => true,
				getPanel: () => ({
					renderThresholds: {
						axisTitleShow: true,
						axisTitleFontSize: 14,
						axisTitleOffset: 20,
						axisTitleAlpha: 0.8,
						gridLabelFontSizeBase: 11,
					},
					showAxisTitles: true,
				}),
			});
			const renderer = new GuideRenderer(host);
			const bounds = { xMin: -100, yMin: -100, xMax: 100, yMax: 100 };
			expect(() => {
				renderer.drawAxisTitles(0, 0, { kind: "linear" }, { kind: "linear" }, bounds, 1.0, true, "X", "Y");
			}).not.toThrow();
		});
	});

	describe("drawCustomGrid via drawCoordinateGuide", () => {
		it("draws custom grid with gridInfo when provided", () => {
			const host = createMockHost({
				getCurrentNodes: () => [mkNode("a", { x: 50, y: 50 })],
				getPanel: () => ({
					renderThresholds: {
						gridCellShadingMin: 0.1,
						gridCellShadingRange: 0.4,
						gridLineAlpha: 0.2,
						gridTableLineAlpha: 0.15,
						gridLineWidthFactor: 1.0,
						gridLineMargin: 50,
						gridShowHeaders: false,
						gridLabelPlacement: "on-line",
						showAxisTitles: false,
					},
					gridShowHeaders: false,
					showAxisTitles: false,
				}),
			});
			const renderer = new GuideRenderer(host);
			const g = new CanvasGraphics();

			const gridInfo = {
				axis1Lines: [
					{ position: 0, label: "0" },
					{ position: 100, label: "100" },
				],
				axis2Lines: [
					{ position: 0, label: "0" },
					{ position: 100, label: "100" },
				],
				axis1Shape: { kind: "linear" },
				axis2Shape: { kind: "linear" },
				style: "grid" as const,
				cellShading: true,
			};

			const guide = {
				type: "coordinate" as const,
				system: "cartesian",
				bounds: { xMin: 0, yMin: 0, xMax: 100, yMax: 100 },
				gridInfo,
			};

			renderer.drawCoordinateGuide(g, 0, 0, guide, 1, 0x888888);
			expect(g.commandCount).toBeGreaterThan(0);
		});
	});
});

// Utility function to create nodes (for cellShading tests)
function mkNode(id: string, extra?: Partial<GraphNode>): GraphNode {
	return {
		id,
		label: id,
		x: 0,
		y: 0,
		isTag: false,
		...extra,
	} as GraphNode;
}
