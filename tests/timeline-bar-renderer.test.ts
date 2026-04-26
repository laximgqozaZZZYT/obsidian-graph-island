import { describe, it, expect, vi } from "vitest";
import { renderTimelineBars, type TimelineBarHost } from "../src/views/timeline-bar-renderer";
import type { TimelineBarInfo } from "../src/layouts/cluster-force";
import type { PixiNode } from "../src/views/InteractionManager";
import type { RenderThresholds } from "../src/types";

// ---------------------------------------------------------------------------
// Mock utilities
// ---------------------------------------------------------------------------

function createMockCanvasGraphics() {
	return {
		clear: vi.fn(),
		lineStyle: vi.fn(),
		beginFill: vi.fn(),
		endFill: vi.fn(),
		drawRoundedRect: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
	};
}

function createMockContainer() {
	return {
		x: 0,
		y: 0,
		scale: { x: 1, y: 1 },
		children: [],
		removeChild: vi.fn(),
		addChild: vi.fn(),
	};
}

function createMockPixiNode(id: string, overrides = {}): PixiNode {
	return {
		data: {
			id,
			label: `Node ${id}`,
			x: 100,
			y: 100,
			filePath: `path/to/${id}.md`,
			...overrides,
		},
		radius: 5,
		color: 0x8080ff,
	} as unknown as PixiNode;
}

function createTimelineBarInfo(overrides = {}): TimelineBarInfo {
	return {
		nodeId: "node-1",
		xStart: 10,
		xEnd: 100,
		yCenter: 50,
		barHeight: 20,
		...overrides,
	} as TimelineBarInfo;
}

function createMockRenderThresholds(): Partial<RenderThresholds> {
	return {
		timelineBarFillAlpha: 0.7,
		timelineBarStrokeAlpha: 0.9,
		timelineBarHoverAlpha: 1.0,
		timelineBarCornerRadius: 3,
		timelineBarShowLabel: true,
		timelineBarLabelMinWidth: 20,
		timelineBarLabelFontSize: 12,
	};
}

function createMockTimelineBarHost(overrides = {}): TimelineBarHost {
	return {
		barGraphics: createMockCanvasGraphics() as any,
		barLabelContainer: createMockContainer() as any,
		worldContainer: createMockContainer() as any,
		canvasWrap: {
			clientWidth: 1200,
			clientHeight: 800,
		} as HTMLElement,
		highlightedNodeId: null,
		pixiNodes: new Map([
			["node-1", createMockPixiNode("node-1")],
			["node-2", createMockPixiNode("node-2")],
		]),
		isDarkTheme: () => false,
		panel: {
			showDurationBars: true,
			viewMode: "force",
			renderThresholds: createMockRenderThresholds(),
		},
		app: {
			vault: {
				getAbstractFileByPath: vi.fn(),
			},
			metadataCache: {
				getFileCache: vi.fn(),
			},
		},
		clusterMeta: {
			timelineBars: [createTimelineBarInfo()],
		},
		...overrides,
	} as any;
}

// ---------------------------------------------------------------------------
// renderTimelineBars tests
// ---------------------------------------------------------------------------

describe("renderTimelineBars", () => {
	it("clears graphics before rendering", () => {
		const host = createMockTimelineBarHost();
		const clearSpy = vi.spyOn(host.barGraphics, "clear");

		renderTimelineBars(host);

		expect(clearSpy).toHaveBeenCalled();
	});

	it("does nothing when no barGraphics", () => {
		const host = createMockTimelineBarHost({
			barGraphics: null,
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("does nothing when showDurationBars is false and viewMode is not timeline", () => {
		const host = createMockTimelineBarHost({
			panel: {
				showDurationBars: false,
				viewMode: "force",
				renderThresholds: createMockRenderThresholds(),
			},
			clusterMeta: {
				timelineBars: undefined,
			},
		});

		const clearSpy = vi.spyOn(host.barGraphics, "clear");

		renderTimelineBars(host);

		// Should still clear
		expect(clearSpy).toHaveBeenCalled();
	});

	it("does nothing when no bars in clusterMeta", () => {
		const host = createMockTimelineBarHost({
			clusterMeta: {
				timelineBars: undefined,
			},
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("does nothing when bars array is empty", () => {
		const host = createMockTimelineBarHost({
			clusterMeta: {
				timelineBars: [],
			},
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("renders bars with graphics calls", () => {
		const host = createMockTimelineBarHost();
		const beginFillSpy = vi.spyOn(host.barGraphics, "beginFill");

		renderTimelineBars(host);

		expect(beginFillSpy).toHaveBeenCalled();
	});

	it("renders multiple bars", () => {
		const bars = [
			createTimelineBarInfo({ nodeId: "node-1", xStart: 10, xEnd: 50 }),
			createTimelineBarInfo({ nodeId: "node-2", xStart: 60, xEnd: 100 }),
		];
		const host = createMockTimelineBarHost({
			clusterMeta: { timelineBars: bars },
		});

		const beginFillSpy = vi.spyOn(host.barGraphics, "beginFill");

		renderTimelineBars(host);

		// Should call for each bar
		expect(beginFillSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("applies highlight to hovered bar", () => {
		const bars = [createTimelineBarInfo({ nodeId: "node-1" })];
		const host = createMockTimelineBarHost({
			highlightedNodeId: "node-1",
			clusterMeta: { timelineBars: bars },
		});

		const lineStyleSpy = vi.spyOn(host.barGraphics, "lineStyle");

		renderTimelineBars(host);

		expect(lineStyleSpy).toHaveBeenCalled();
	});

	it("renders timeline viewMode separators and axis", () => {
		const bars = [createTimelineBarInfo()];
		const host = createMockTimelineBarHost({
			panel: {
				showDurationBars: true,
				viewMode: "timeline",
				renderThresholds: createMockRenderThresholds(),
			},
			clusterMeta: {
				timelineBars: bars,
				timelineWorkGroups: [
					{ name: "group1", minY: 0, maxY: 100 },
					{ name: "group2", minY: 120, maxY: 200 },
				],
				timelineSteps: ["step1", "step2", "step3"],
				timelineStepWidth: 50,
			},
		});

		const lineStyleSpy = vi.spyOn(host.barGraphics, "lineStyle");

		renderTimelineBars(host);

		// Timeline mode should render separators and axis
		expect(lineStyleSpy).toHaveBeenCalled();
	});

	it("clears previous bar labels", () => {
		const host = createMockTimelineBarHost();
		const barLabelContainer = host.barLabelContainer as any;

		// Add mock children
		const mockChild = {
			destroy: vi.fn(),
		};
		barLabelContainer.children = [mockChild];

		renderTimelineBars(host);

		expect(barLabelContainer.removeChild).toHaveBeenCalled();
		expect(mockChild.destroy).toHaveBeenCalled();
	});

	it("respects viewport culling", () => {
		const bars = [
			// This bar is way outside viewport (x=10000)
			createTimelineBarInfo({ nodeId: "node-1", xStart: 10000, xEnd: 10100 }),
		];
		const host = createMockTimelineBarHost({
			clusterMeta: { timelineBars: bars },
		});

		const drawRoundedRectSpy = vi.spyOn(host.barGraphics, "drawRoundedRect");

		renderTimelineBars(host);

		// Should not draw bar outside viewport
		expect(drawRoundedRectSpy).not.toHaveBeenCalled();
	});

	it("uses dark theme colors when appropriate", () => {
		const host = createMockTimelineBarHost({
			isDarkTheme: () => true,
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("handles zero worldScale gracefully", () => {
		const host = createMockTimelineBarHost({
			worldContainer: {
				x: 0,
				y: 0,
				scale: { x: 0, y: 0 },
				children: [],
				removeChild: vi.fn(),
				addChild: vi.fn(),
			} as any,
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("handles missing pixiNode for a bar", () => {
		const bars = [createTimelineBarInfo({ nodeId: "unknown-node" })];
		const host = createMockTimelineBarHost({
			pixiNodes: new Map(),
			clusterMeta: { timelineBars: bars },
		});

		const beginFillSpy = vi.spyOn(host.barGraphics, "beginFill");

		renderTimelineBars(host);

		// Should still render with fallback color
		expect(beginFillSpy).toHaveBeenCalled();
	});

	it("handles null barLabelContainer gracefully", () => {
		const host = createMockTimelineBarHost({
			barLabelContainer: null,
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("handles null worldContainer gracefully", () => {
		const host = createMockTimelineBarHost({
			worldContainer: null,
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("handles null canvasWrap gracefully", () => {
		const host = createMockTimelineBarHost({
			canvasWrap: null,
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});

	it("processes work group separators when timeline viewMode", () => {
		const bars = [createTimelineBarInfo()];
		const host = createMockTimelineBarHost({
			panel: {
				showDurationBars: true,
				viewMode: "timeline",
				renderThresholds: createMockRenderThresholds(),
			},
			clusterMeta: {
				timelineBars: bars,
				timelineWorkGroups: [
					{ name: "classic-mythology-work1", minY: 0, maxY: 100 },
					{ name: "mythology-work2", minY: 120, maxY: 200 },
				],
				timelineSteps: [],
				timelineStepWidth: 0,
			},
		});

		const moveToSpy = vi.spyOn(host.barGraphics, "moveTo");

		renderTimelineBars(host);

		// Should call moveTo for separator lines
		expect(moveToSpy).toHaveBeenCalled();
	});

	it("processes time axis when timeline viewMode with steps", () => {
		const bars = [createTimelineBarInfo()];
		const host = createMockTimelineBarHost({
			panel: {
				showDurationBars: true,
				viewMode: "timeline",
				renderThresholds: createMockRenderThresholds(),
			},
			clusterMeta: {
				timelineBars: bars,
				timelineWorkGroups: [],
				timelineSteps: ["2020", "2021", "2022"],
				timelineStepWidth: 100,
			},
		});

		const moveToSpy = vi.spyOn(host.barGraphics, "moveTo");

		renderTimelineBars(host);

		expect(moveToSpy).toHaveBeenCalled();
	});

	it("handles malformed bar data gracefully", () => {
		const bars = [
			{
				nodeId: "node-1",
				xStart: NaN,
				xEnd: NaN,
				yCenter: NaN,
				barHeight: 0,
			} as unknown as TimelineBarInfo,
		];
		const host = createMockTimelineBarHost({
			clusterMeta: { timelineBars: bars },
		});

		expect(() => {
			renderTimelineBars(host);
		}).not.toThrow();
	});
});
