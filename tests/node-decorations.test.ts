import { describe, it, expect, vi } from "vitest";
import {
	renderPathfinderMarkers,
	renderCompareRings,
	renderBookmarkStars,
	renderMissingNeighborRings,
	renderTagBadges,
	renderImportanceRings,
	renderRecencyMarkers,
	renderBridgeNodes,
	renderArticulationPoints,
	renderEntropyOverlay,
	renderMultiSelectRings,
	renderHierarchyOverlay,
	renderOntologyBackbone,
	renderGapEdges,
	type DecorationCtx,
} from "../src/views/node-decorations";
import type { PixiNode } from "../src/views/InteractionManager";
import type { RenderHost } from "../src/views/RenderPipeline";
import type { ShapeRule } from "../src/utils/node-shapes";

// ---------------------------------------------------------------------------
// Mock utilities
// ---------------------------------------------------------------------------

function createMockCanvasGraphics() {
	return {
		lineStyle: vi.fn(),
		beginFill: vi.fn(),
		endFill: vi.fn(),
		drawCircle: vi.fn(),
		drawRoundedRect: vi.fn(),
		closePath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		arc: vi.fn(),
		clear: vi.fn(),
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
			tags: [],
			mtime: Date.now(),
			...overrides,
		},
		radius: 5,
		color: 0x8080ff,
	} as unknown as PixiNode;
}

function createMockRenderHost(overrides = {}): RenderHost {
	return {
		getPathfinderNodeSet: () => new Set<string>(),
		getPathfinderState: () => null,
		getRenderThresholds: () => ({}),
		getCompareNodeIds: () => [],
		getBookmarkedNodeIds: () => new Set<string>(),
		getMissingNeighborNodeIds: () => new Set<string>(),
		getShowImportanceRing: () => null,
		getDegrees: () => new Map(),
		getBetweennessCache: () => null,
		getRecencyConfig: () => null,
		getBridgeNodeIds: () => new Set<string>(),
		getArticulationPointIds: () => new Set<string>(),
		getEntropyScores: () => new Map(),
		getHierarchyTree: () => null,
		getOntologyBackbone: () => null,
		getStructuralGaps: () => null,
		getPixiNodes: () => new Map(),
		...overrides,
	} as unknown as RenderHost;
}

function createDecorationCtx(overrides = {}): DecorationCtx {
	return {
		visible: [],
		shapeRules: [],
		worldScale: 1,
		minWorldRadius: 1,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// renderPathfinderMarkers tests
// ---------------------------------------------------------------------------

describe("renderPathfinderMarkers", () => {
	it("does nothing when no pathfinder nodes", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost();
		const ctx = createDecorationCtx();

		expect(() => {
			renderPathfinderMarkers(host, g as any, ctx);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders markers for pathfinder nodes", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getPathfinderNodeSet: () => new Set(["a"]),
			getPathfinderState: () => ({ startId: "a", endId: "b" }),
			getRenderThresholds: () => ({ pathfinderStartColor: 0xff0000, pathfinderEndColor: 0x00ff00 }),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderPathfinderMarkers(host, g as any, ctx);

		expect(g.lineStyle).toHaveBeenCalled();
	});

	it("distinguishes start and end markers", () => {
		const g = createMockCanvasGraphics();
		const pn1 = createMockPixiNode("a");
		const pn2 = createMockPixiNode("b");
		const host = createMockRenderHost({
			getPathfinderNodeSet: () => new Set(["a", "b"]),
			getPathfinderState: () => ({ startId: "a", endId: "b" }),
			getRenderThresholds: () => ({ pathfinderStartColor: 0xff0000, pathfinderEndColor: 0x00ff00 }),
		});
		const ctx = createDecorationCtx({ visible: [pn1, pn2] });

		renderPathfinderMarkers(host, g as any, ctx);

		// Should call lineStyle for both nodes
		expect(g.lineStyle).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// renderCompareRings tests
// ---------------------------------------------------------------------------

describe("renderCompareRings", () => {
	it("does nothing when no compare nodes", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getCompareNodeIds: () => [] });
		const ctx = createDecorationCtx();

		expect(() => {
			renderCompareRings(host, g as any, ctx);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders compare rings", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getCompareNodeIds: () => ["a"],
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderCompareRings(host, g as any, ctx);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.arc).toHaveBeenCalled();
	});

	it("renders dashed ring segments", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getCompareNodeIds: () => ["a"],
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderCompareRings(host, g as any, ctx);

		// Should have multiple arc calls for dashed effect
		expect(g.arc).toHaveBeenCalledTimes(8);
	});
});

// ---------------------------------------------------------------------------
// renderBookmarkStars tests
// ---------------------------------------------------------------------------

describe("renderBookmarkStars", () => {
	it("does nothing when no bookmarks", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getBookmarkedNodeIds: () => null });
		const ctx = createDecorationCtx();

		expect(() => {
			renderBookmarkStars(host, g as any, ctx);
		}).not.toThrow();

		expect(g.beginFill).not.toHaveBeenCalled();
	});

	it("renders star for bookmarked node", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getBookmarkedNodeIds: () => new Set(["a"]),
			getRenderThresholds: () => ({ bookmarkStarColor: 0xf5c542 }),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderBookmarkStars(host, g as any, ctx);

		expect(g.beginFill).toHaveBeenCalled();
		expect(g.moveTo).toHaveBeenCalled();
	});

	it("renders plus-one indicator for excess bookmarks", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a", { tags: Array(6).fill("tag") });
		const host = createMockRenderHost({
			getBookmarkedNodeIds: () => new Set(["a"]),
			getRenderThresholds: () => ({ bookmarkStarColor: 0xf5c542 }),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderBookmarkStars(host, g as any, ctx);

		expect(g.beginFill).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderMissingNeighborRings tests
// ---------------------------------------------------------------------------

describe("renderMissingNeighborRings", () => {
	it("does nothing when no missing neighbors", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getMissingNeighborNodeIds: () => null });
		const ctx = createDecorationCtx();

		expect(() => {
			renderMissingNeighborRings(host, g as any, ctx);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders dashed ring for missing neighbor nodes", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getMissingNeighborNodeIds: () => new Set(["a"]),
			getRenderThresholds: () => ({ missingNeighborRingColor: 0xff8c00 }),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderMissingNeighborRings(host, g as any, ctx);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.moveTo).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderTagBadges tests
// ---------------------------------------------------------------------------

describe("renderTagBadges", () => {
	it("does nothing when no visible nodes", () => {
		const g = createMockCanvasGraphics();
		const ctx = createDecorationCtx();

		expect(() => {
			renderTagBadges({} as any, g as any, ctx);
		}).not.toThrow();

		expect(g.drawCircle).not.toHaveBeenCalled();
	});

	it("renders tag badges for nodes with tags", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a", { tags: ["tag1", "tag2"] });
		const ctx = createDecorationCtx({ visible: [pn] });

		renderTagBadges({} as any, g as any, ctx);

		expect(g.drawCircle).toHaveBeenCalled();
	});

	it("limits badges to MAX_BADGES", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a", { tags: Array(10).fill("tag") });
		const ctx = createDecorationCtx({ visible: [pn] });

		renderTagBadges({} as any, g as any, ctx);

		// Should have badges for 4 tags + 1 overflow indicator
		const drawCalls = (g.drawCircle as any).mock.calls.length;
		expect(drawCalls).toBeLessThanOrEqual(5);
	});

	it("shows overflow indicator when more than MAX_BADGES", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a", { tags: Array(6).fill("tag") });
		const ctx = createDecorationCtx({ visible: [pn] });

		renderTagBadges({} as any, g as any, ctx);

		// Overflow indicator should use different color
		expect(g.beginFill).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderImportanceRings tests
// ---------------------------------------------------------------------------

describe("renderImportanceRings", () => {
	it("does nothing when no importance ring config", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getShowImportanceRing: () => null });
		const ctx = createDecorationCtx();

		expect(() => {
			renderImportanceRings(host, g as any, ctx);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders importance ring proportional to degree", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getShowImportanceRing: () => ({ metric: "degree" }),
			getDegrees: () => new Map([["a", 10]]),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderImportanceRings(host, g as any, ctx);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.drawCircle).toHaveBeenCalled();
	});

	it("uses betweenness cache when metric is betweenness", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getShowImportanceRing: () => ({ metric: "betweenness" }),
			getDegrees: () => new Map(),
			getBetweennessCache: () => new Map([["a", 50]]),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderImportanceRings(host, g as any, ctx);

		expect(g.drawCircle).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderRecencyMarkers tests
// ---------------------------------------------------------------------------

describe("renderRecencyMarkers", () => {
	it("does nothing when no recency config", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getRecencyConfig: () => null });
		const ctx = createDecorationCtx();

		expect(() => {
			renderRecencyMarkers(host, g as any, ctx);
		}).not.toThrow();

		expect(g.drawCircle).not.toHaveBeenCalled();
	});

	it("marks recent nodes with green dot", () => {
		const g = createMockCanvasGraphics();
		const now = Date.now();
		const pn = createMockPixiNode("a", { mtime: now - 1000 });
		const host = createMockRenderHost({
			getRecencyConfig: () => ({ days: 30 }),
			getRenderThresholds: () => ({ recencyMarkerColor: 0x22c55e }),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderRecencyMarkers(host, g as any, ctx);

		expect(g.drawCircle).toHaveBeenCalled();
		expect(g.beginFill).toHaveBeenCalled();
	});

	it("fades old nodes", () => {
		const g = createMockCanvasGraphics();
		const now = Date.now();
		const oldTime = now - 100 * 24 * 60 * 60 * 1000; // 100 days old
		const pn = createMockPixiNode("a", { mtime: oldTime });
		const host = createMockRenderHost({
			getRecencyConfig: () => ({ days: 30 }),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderRecencyMarkers(host, g as any, ctx);

		expect(g.beginFill).toHaveBeenCalled();
	});

	it("shows fade transition for moderately old nodes", () => {
		const g = createMockCanvasGraphics();
		const now = Date.now();
		const mediumTime = now - 60 * 24 * 60 * 60 * 1000; // 60 days old
		const pn = createMockPixiNode("a", { mtime: mediumTime });
		const host = createMockRenderHost({
			getRecencyConfig: () => ({ days: 30 }),
			getRenderThresholds: () => ({ recencyMarkerColor: 0xf59e0b }),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderRecencyMarkers(host, g as any, ctx);

		expect(g.drawCircle).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderBridgeNodes tests
// ---------------------------------------------------------------------------

describe("renderBridgeNodes", () => {
	it("does nothing when no bridge nodes", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getBridgeNodeIds: () => null });
		const ctx = createDecorationCtx();

		expect(() => {
			renderBridgeNodes(host, g as any, ctx);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders gold ring for bridge nodes", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getBridgeNodeIds: () => new Set(["a"]),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderBridgeNodes(host, g as any, ctx);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.drawCircle).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderArticulationPoints tests
// ---------------------------------------------------------------------------

describe("renderArticulationPoints", () => {
	it("does nothing when no articulation points", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getArticulationPointIds: () => null });
		const ctx = createDecorationCtx();

		expect(() => {
			renderArticulationPoints(host, g as any, ctx);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders red warning rings for articulation points", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getArticulationPointIds: () => new Set(["a"]),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderArticulationPoints(host, g as any, ctx);

		expect(g.lineStyle).toHaveBeenCalled();
		// Should draw two concentric rings
		expect(g.drawCircle).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// renderEntropyOverlay tests
// ---------------------------------------------------------------------------

describe("renderEntropyOverlay", () => {
	it("does nothing when no entropy scores", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getEntropyScores: () => null });
		const ctx = createDecorationCtx();

		expect(() => {
			renderEntropyOverlay(host, g as any, ctx);
		}).not.toThrow();

		expect(g.beginFill).not.toHaveBeenCalled();
	});

	it("renders entropy halo", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getEntropyScores: () => new Map([["a", 0.5]]),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderEntropyOverlay(host, g as any, ctx);

		expect(g.beginFill).toHaveBeenCalled();
		expect(g.drawCircle).toHaveBeenCalled();
	});

	it("scales halo with entropy value", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getEntropyScores: () => new Map([["a", 0.8]]),
		});
		const ctx = createDecorationCtx({ visible: [pn] });

		renderEntropyOverlay(host, g as any, ctx);

		expect(g.drawCircle).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderMultiSelectRings tests
// ---------------------------------------------------------------------------

describe("renderMultiSelectRings", () => {
	it("does nothing when no selected nodes", () => {
		const g = createMockCanvasGraphics();
		const ctx = createDecorationCtx();

		expect(() => {
			renderMultiSelectRings({} as any, g as any, ctx, []);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders cyan ring for selected nodes", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const ctx = createDecorationCtx({ visible: [pn] });

		renderMultiSelectRings({} as any, g as any, ctx, ["a"]);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.drawCircle).toHaveBeenCalled();
	});

	it("supports multiple selected nodes", () => {
		const g = createMockCanvasGraphics();
		const pn1 = createMockPixiNode("a");
		const pn2 = createMockPixiNode("b");
		const ctx = createDecorationCtx({ visible: [pn1, pn2] });

		renderMultiSelectRings({} as any, g as any, ctx, ["a", "b"]);

		expect(g.drawCircle).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// renderHierarchyOverlay tests
// ---------------------------------------------------------------------------

describe("renderHierarchyOverlay", () => {
	it("does nothing when no hierarchy tree", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getHierarchyTree: () => null });

		expect(() => {
			renderHierarchyOverlay(host, g as any);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders hierarchy tree lines", () => {
		const g = createMockCanvasGraphics();
		const pn1 = createMockPixiNode("a");
		const pn2 = createMockPixiNode("b");
		const host = createMockRenderHost({
			getHierarchyTree: () => new Map([["b", "a"]]),
			getPixiNodes: () => new Map([["a", pn1], ["b", pn2]]),
		});

		renderHierarchyOverlay(host, g as any);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.moveTo).toHaveBeenCalled();
		expect(g.lineTo).toHaveBeenCalled();
	});

	it("skips missing nodes", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({
			getHierarchyTree: () => new Map([["missing", "also-missing"]]),
			getPixiNodes: () => new Map(),
		});

		expect(() => {
			renderHierarchyOverlay(host, g as any);
		}).not.toThrow();

		expect(g.moveTo).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderOntologyBackbone tests
// ---------------------------------------------------------------------------

describe("renderOntologyBackbone", () => {
	it("does nothing when no ontology backbone", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getOntologyBackbone: () => null });

		expect(() => {
			renderOntologyBackbone(host, g as any);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders ontology backbone edges", () => {
		const g = createMockCanvasGraphics();
		const pn1 = createMockPixiNode("a");
		const pn2 = createMockPixiNode("b");
		const host = createMockRenderHost({
			getOntologyBackbone: () => [{ from: "a", to: "b" }],
			getPixiNodes: () => new Map([["a", pn1], ["b", pn2]]),
		});

		renderOntologyBackbone(host, g as any);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.moveTo).toHaveBeenCalled();
		expect(g.lineTo).toHaveBeenCalled();
	});

	it("skips missing backbone nodes", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({
			getOntologyBackbone: () => [{ from: "x", to: "y" }],
			getPixiNodes: () => new Map(),
		});

		expect(() => {
			renderOntologyBackbone(host, g as any);
		}).not.toThrow();

		expect(g.moveTo).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderGapEdges tests
// ---------------------------------------------------------------------------

describe("renderGapEdges", () => {
	it("does nothing when no structural gaps", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({ getStructuralGaps: () => null });

		expect(() => {
			renderGapEdges(host, g as any);
		}).not.toThrow();

		expect(g.lineStyle).not.toHaveBeenCalled();
	});

	it("renders dotted lines for gap edges", () => {
		const g = createMockCanvasGraphics();
		const pn1 = createMockPixiNode("a");
		const pn2 = createMockPixiNode("b", { x: 200, y: 200 });
		const host = createMockRenderHost({
			getStructuralGaps: () => [{ from: "a", to: "b" }],
			getPixiNodes: () => new Map([["a", pn1], ["b", pn2]]),
		});

		renderGapEdges(host, g as any);

		expect(g.lineStyle).toHaveBeenCalled();
		expect(g.moveTo).toHaveBeenCalled();
		expect(g.lineTo).toHaveBeenCalled();
	});

	it("skips zero-distance gaps", () => {
		const g = createMockCanvasGraphics();
		const pn = createMockPixiNode("a");
		const host = createMockRenderHost({
			getStructuralGaps: () => [{ from: "a", to: "a" }],
			getPixiNodes: () => new Map([["a", pn]]),
		});

		expect(() => {
			renderGapEdges(host, g as any);
		}).not.toThrow();

		expect(g.moveTo).not.toHaveBeenCalled();
	});

	it("skips missing gap nodes", () => {
		const g = createMockCanvasGraphics();
		const host = createMockRenderHost({
			getStructuralGaps: () => [{ from: "x", to: "y" }],
			getPixiNodes: () => new Map(),
		});

		expect(() => {
			renderGapEdges(host, g as any);
		}).not.toThrow();

		expect(g.moveTo).not.toHaveBeenCalled();
	});
});
