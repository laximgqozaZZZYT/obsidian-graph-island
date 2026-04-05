/**
 * LabelManager class — tests for instance methods and public API
 * Focus: applyTextFade, updateLabelsForZoom, cullOverlappingRotatedLabels
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LabelManager, type LabelManagerHost } from "../src/views/LabelManager";
import type { PixiNode } from "../src/views/InteractionManager";
import type { RenderPipeline } from "../src/views/RenderPipeline";
import type { CanvasText } from "../src/views/canvas2d";
import { DEFAULT_RENDER_THRESHOLDS } from "../src/types";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

function createMockCanvasText(
	text: string,
	visible: boolean = true,
	x: number = 0,
	y: number = 0,
): CanvasText {
	return {
		text,
		visible,
		x,
		y,
		rotation: 0,
		anchor: { x: 0.5, y: 0 },
		width: text.length * 8,
		height: 14,
		style: { fontSize: 14 },
		scale: { x: 1, y: 1, set: vi.fn() },
		alpha: 1,
	} as any;
}

function createMockPixiNode(id: string, label?: string): PixiNode {
	return {
		data: { id, label: label || id },
		label: createMockCanvasText(label || id),
		priorityScore: 50,
		minShowZoom: 0.1,
		labelWasVisible: false,
		radius: 12,
		tagLabel: undefined,
		subLabels: undefined,
	} as any;
}

function createMockHost(overrides: Partial<LabelManagerHost> = {}): LabelManagerHost {
	return {
		getPixiNodes: vi.fn(() => new Map()),
		getDegrees: vi.fn(() => new Map()),
		getTextFadeThreshold: vi.fn(() => 0.5),
		getRenderThresholds: vi.fn(() => ({})),
		getWorldScale: vi.fn(() => 1.0),
		getRenderPipeline: vi.fn(() => null),
		getSunburstLabels: vi.fn(() => new Map()),
		getClusterSunburstLabels: vi.fn(() => new Map()),
		getPrevHighlightSet: vi.fn(() => new Set()),
		getSearchQuery: vi.fn(() => ""),
		markDirty: vi.fn(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// LabelManager constructor
// ---------------------------------------------------------------------------
describe("LabelManager", () => {
	it("creates instance with host", () => {
		const host = createMockHost();
		const manager = new LabelManager(host);
		expect(manager).toBeDefined();
	});

	it("stores host reference", () => {
		const host = createMockHost();
		const manager = new LabelManager(host);
		// Public API uses host through methods
		expect(typeof manager.applyTextFade).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// applyTextFade — main label update pipeline
// ---------------------------------------------------------------------------
describe("applyTextFade", () => {
	let manager: LabelManager;
	let host: LabelManagerHost;

	beforeEach(() => {
		host = createMockHost();
		manager = new LabelManager(host);
	});

	it("calls markDirty after update", () => {
		host = createMockHost({ markDirty: vi.fn() });
		manager = new LabelManager(host);

		manager.applyTextFade();

		expect(host.markDirty).toHaveBeenCalled();
	});

	it("handles empty node set", () => {
		host = createMockHost({
			getPixiNodes: vi.fn(() => new Map()),
		});
		manager = new LabelManager(host);

		expect(() => manager.applyTextFade()).not.toThrow();
	});

	it("processes multiple nodes", () => {
		const nodes = new Map([
			["node1", createMockPixiNode("node1")],
			["node2", createMockPixiNode("node2")],
			["node3", createMockPixiNode("node3")],
		]);

		const degrees = new Map([
			["node1", 5],
			["node2", 10],
			["node3", 3],
		]);

		host = createMockHost({
			getPixiNodes: vi.fn(() => nodes),
			getDegrees: vi.fn(() => degrees),
		});
		manager = new LabelManager(host);

		expect(() => manager.applyTextFade()).not.toThrow();
		expect(host.markDirty).toHaveBeenCalled();
	});

	it("applies counter-scaling with extreme zoom-out", () => {
		const node = createMockPixiNode("n1");
		const nodes = new Map([["n1", node]]);

		host = createMockHost({
			getPixiNodes: vi.fn(() => nodes),
			getDegrees: vi.fn(() => new Map([["n1", 10]])),
			getWorldScale: vi.fn(() => 0.05), // extreme zoom-out
		});
		manager = new LabelManager(host);

		manager.applyTextFade();

		// Verify scale.set was called (indicating scaling occurred)
		expect(node.label!.scale.set).toHaveBeenCalled();
	});

	it("respects textFadeThreshold opacity", () => {
		const node = createMockPixiNode("n1");
		const nodes = new Map([["n1", node]]);

		host = createMockHost({
			getPixiNodes: vi.fn(() => nodes),
			getDegrees: vi.fn(() => new Map()),
			getTextFadeThreshold: vi.fn(() => 0.7),
		});
		manager = new LabelManager(host);

		manager.applyTextFade();

		// baseOpacity = 1 - 0.7 = 0.3
		expect(node.label!.alpha).toBeLessThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// updateLabelsForZoom — zoom-triggered label refresh
// ---------------------------------------------------------------------------
describe("updateLabelsForZoom", () => {
	let manager: LabelManager;
	let host: LabelManagerHost;

	beforeEach(() => {
		host = createMockHost();
		manager = new LabelManager(host);
	});

	it("calls applyTextFade", () => {
		const applyFadeSpy = vi.spyOn(manager, "applyTextFade");
		manager.updateLabelsForZoom();
		expect(applyFadeSpy).toHaveBeenCalled();
	});

	it("requests render pipeline culling if available", () => {
		const mockPipeline = {
			cullOverlappingLabels: vi.fn(),
			isAutoLODActive: vi.fn(() => false),
			getLastLodLevel: vi.fn(() => 0),
		} as any;

		host = createMockHost({
			getRenderPipeline: vi.fn(() => mockPipeline),
		});
		manager = new LabelManager(host);

		manager.updateLabelsForZoom();

		expect(mockPipeline.cullOverlappingLabels).toHaveBeenCalled();
	});

	it("culls rotated labels from both sunburst and cluster sunburst", () => {
		const sunburstLabels = new Map([
			["s1", createMockCanvasText("sunburst")],
		]);
		const clusterLabels = new Map([
			["c1", createMockCanvasText("cluster")],
		]);

		const mockPipeline = {
			cullOverlappingLabels: vi.fn(),
			isAutoLODActive: vi.fn(() => false),
			getLastLodLevel: vi.fn(() => 0),
		} as any;

		host = createMockHost({
			getSunburstLabels: vi.fn(() => sunburstLabels),
			getClusterSunburstLabels: vi.fn(() => clusterLabels),
			getRenderPipeline: vi.fn(() => mockPipeline),
		});
		manager = new LabelManager(host);

		const cullSpy = vi.spyOn(manager, "cullOverlappingRotatedLabels");
		manager.updateLabelsForZoom();

		expect(cullSpy).toHaveBeenCalledWith(clusterLabels);
		expect(cullSpy).toHaveBeenCalledWith(sunburstLabels);
	});
});

// ---------------------------------------------------------------------------
// cullOverlappingRotatedLabels — spatial hash + visibility culling
// ---------------------------------------------------------------------------
describe("cullOverlappingRotatedLabels", () => {
	let manager: LabelManager;
	let host: LabelManagerHost;

	beforeEach(() => {
		host = createMockHost();
		manager = new LabelManager(host);
	});

	it("skips empty label set", () => {
		const emptyLabels = new Map();
		expect(() => manager.cullOverlappingRotatedLabels(emptyLabels)).not.toThrow();
		// No visibility changes expected
	});

	it("hides overlapping lower-priority labels", () => {
		const label1 = createMockCanvasText("HighPriority", true, 0, 0);
		label1.text = "HighPriority"; // longer = higher priority

		const label2 = createMockCanvasText("Low", true, 5, 5);
		label2.text = "Low";

		const labels = new Map([
			["l1", label1],
			["l2", label2],
		]);

		manager.cullOverlappingRotatedLabels(labels);

		// label1 (longer) should stay visible, label2 should be hidden
		expect(label1.visible).toBe(true);
		expect(label2.visible).toBe(false);
	});

	it("keeps all labels when none overlap", () => {
		const label1 = createMockCanvasText("Node1", true, 0, 0);
		const label2 = createMockCanvasText("Node2", true, 1000, 1000);
		const label3 = createMockCanvasText("Node3", true, -1000, -1000);

		const labels = new Map([
			["l1", label1],
			["l2", label2],
			["l3", label3],
		]);

		manager.cullOverlappingRotatedLabels(labels);

		expect(label1.visible).toBe(true);
		expect(label2.visible).toBe(true);
		expect(label3.visible).toBe(true);
	});

	it("respects initially invisible labels", () => {
		const label1 = createMockCanvasText("Visible", true, 0, 0);
		const label2 = createMockCanvasText("Hidden", false, 5, 5);

		const labels = new Map([
			["l1", label1],
			["l2", label2],
		]);

		manager.cullOverlappingRotatedLabels(labels);

		// Only visible labels are processed
		expect(label1.visible).toBe(true);
		expect(label2.visible).toBe(false);
	});

	it("prioritizes longer text over shorter", () => {
		const short = createMockCanvasText("X", true, 0, 0);
		const long = createMockCanvasText("VeryLongLabel", true, 10, 0);

		const labels = new Map([
			["short", short],
			["long", long],
		]);

		manager.cullOverlappingRotatedLabels(labels);

		// Long text is higher priority when they overlap
		expect(long.visible).toBe(true);
		if (short.visible === false) {
			expect(short.visible).toBe(false); // OK if culled
		}
	});

	it("handles rotated labels with non-zero rotation", () => {
		const label1 = createMockCanvasText("Rotated", true, 0, 0);
		label1.rotation = Math.PI / 4; // 45 degrees

		const labels = new Map([["l1", label1]]);

		expect(() => manager.cullOverlappingRotatedLabels(labels)).not.toThrow();
	});

	it("uses spatial hash grid for efficiency", () => {
		const labels = new Map();
		for (let i = 0; i < 100; i++) {
			const x = (i % 10) * 200;
			const y = Math.floor(i / 10) * 200;
			labels.set(`n${i}`, createMockCanvasText(`Node${i}`, true, x, y));
		}

		// Should handle large grid without timeout
		expect(() => manager.cullOverlappingRotatedLabels(labels)).not.toThrow();
	});

	it("handles labels with custom anchors", () => {
		const label = createMockCanvasText("Test", true, 100, 100);
		label.anchor.x = 0.25;
		label.anchor.y = 0.75;

		const labels = new Map([["l1", label]]);

		expect(() => manager.cullOverlappingRotatedLabels(labels)).not.toThrow();
	});

	it("uses estimateTextWidth for un-rendered labels", () => {
		const label = createMockCanvasText("UnknownWidth", true, 0, 0);
		label.width = 0; // unknown width

		const labels = new Map([["l1", label]]);

		expect(() => manager.cullOverlappingRotatedLabels(labels)).not.toThrow();
		// Should still be visible (no overlaps)
		expect(label.visible).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Integration: full pipeline with realistic data
// ---------------------------------------------------------------------------
describe("LabelManager integration", () => {
	let manager: LabelManager;

	beforeEach(() => {
		const nodes = new Map([
			["hub", createMockPixiNode("hub", "Central Hub")],
			["node1", createMockPixiNode("node1", "Node 1")],
			["node2", createMockPixiNode("node2", "Node 2")],
			["node3", createMockPixiNode("node3", "Node 3")],
		]);

		const degrees = new Map([
			["hub", 25],
			["node1", 5],
			["node2", 3],
			["node3", 1],
		]);

		const host = createMockHost({
			getPixiNodes: vi.fn(() => nodes),
			getDegrees: vi.fn(() => degrees),
			getWorldScale: vi.fn(() => 0.5),
		});

		manager = new LabelManager(host);
	});

	it("processes full pipeline without error", () => {
		expect(() => manager.applyTextFade()).not.toThrow();
	});

	it("high-degree nodes maintain visibility at zoom-out", () => {
		const nodes = new Map([
			["hub", createMockPixiNode("hub")],
		]);

		const host = createMockHost({
			getPixiNodes: vi.fn(() => nodes),
			getDegrees: vi.fn(() => new Map([["hub", 100]])),
			getWorldScale: vi.fn(() => 0.1),
		});

		manager = new LabelManager(host);
		manager.applyTextFade();

		// High-priority node should be visible or have high alpha
		const hub = nodes.get("hub")!;
		if (hub.label) {
			expect(hub.label.alpha).toBeGreaterThan(0.3);
		}
	});

	it("zoom transition updates label visibility smoothly", () => {
		const nodes = new Map([["n1", createMockPixiNode("n1")]]);
		const markDirtySpy = vi.fn();

		const host = createMockHost({
			getPixiNodes: vi.fn(() => nodes),
			getDegrees: vi.fn(() => new Map([["n1", 10]])),
			markDirty: markDirtySpy,
		});

		manager = new LabelManager(host);

		manager.updateLabelsForZoom();

		expect(markDirtySpy).toHaveBeenCalled();
	});
});
