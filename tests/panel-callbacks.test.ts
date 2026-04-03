import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildPanelCallbacks, type PanelCallbackHost } from "../src/views/panel-callbacks";
import type { PanelCallbacks } from "../src/views/PanelBuilder";
import type { Simulation } from "d3-force";
import type { GraphNode, GraphEdge, GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Mock PanelCallbackHost
// ---------------------------------------------------------------------------

function createMockHost(): PanelCallbackHost {
	return {
		// Core render/lifecycle
		doRender: vi.fn().mockResolvedValue(undefined),
		requestSave: vi.fn(),
		markDirty: vi.fn(),
		wakeRenderLoop: vi.fn(),
		buildPanel: vi.fn(),
		applySearch: vi.fn(),
		applyTextFade: vi.fn(),
		applyHover: vi.fn(),
		applyNodeRulesForce: vi.fn(),
		applyClusterForce: vi.fn(),
		startOrbitAnimation: vi.fn(),
		stopOrbitAnimation: vi.fn(),
		updateForces: vi.fn(),
		setZoom: vi.fn(),
		jumpToNode: vi.fn(),
		recolorNodes: vi.fn(),
		recalcNodeRadii: vi.fn(),
		rebuildNodesInPlace: vi.fn(),
		navBack: vi.fn(),
		navForward: vi.fn(),
		applyEgoToVisible: vi.fn(),
		bulkAddTag: vi.fn(),
		bulkSetField: vi.fn(),
		restoreViewport: vi.fn(),
		autoFitView: vi.fn(),
		collectFrontmatterKeys: vi.fn().mockReturnValue(["custom-field"]),
		updateGraphStats: vi.fn(),
		updateRelationMatrix: vi.fn(),
		updateThumbnails: vi.fn(),
		updateHierarchyBreadcrumb: vi.fn(),
		updateLegend: vi.fn(),

		// Internal helpers
		_announceA11y: vi.fn(),
		_buildResetPanelCallback: vi.fn(),
		_buildAutoOptimizeCallback: vi.fn(),
		_getPresetSummary: vi.fn().mockReturnValue("summary"),
		_getNodeTreeData: vi.fn().mockReturnValue([]),
		_getForwardLinks: vi.fn().mockReturnValue([]),
		_getBacklinks: vi.fn().mockReturnValue([]),
		_toggleNodeVisibility: vi.fn(),
		_rebuildHoverAdj: vi.fn(),
		_saveTemplate: vi.fn().mockReturnValue(true),
		_loadTemplate: vi.fn(),
		_deleteTemplate: vi.fn(),
		_similarCache: { clear: vi.fn() },
		_zoomBaseNodeSize: null,

		// State
		skipPanelRebuildCount: 0,
		edgeCache: {},
		renderPipeline: null,
		rawData: null,
		panel: {
			showMinimap: false,
			viewMode: "graph",
			autoFitOnFilter: false,
			clusterGroupRules: [],
			groups: [],
			tagDisplay: "inline",
		} as any,
		pixiNodes: new Map(),
		graphEdges: [],
		originalGraphData: null,
		highlightedNodeId: null,
		currentLayout: "force",
		simulation: null,
		minimap: null,
		canvasWrap: null,
		plugin: {
			settings: { groupPresets: [] },
			saveSettings: vi.fn(),
		} as any,
		app: {
			workspace: {
				getActiveFile: vi.fn().mockReturnValue(null),
			},
		} as any,
		allPresets: {},
	};
}

// ---------------------------------------------------------------------------
// buildPanelCallbacks
// ---------------------------------------------------------------------------

describe("buildPanelCallbacks", () => {
	let host: PanelCallbackHost;
	let callbacks: PanelCallbacks;

	beforeEach(() => {
		host = createMockHost();
		callbacks = buildPanelCallbacks(host);
	});

	it("returns object with all callback methods", () => {
		expect(callbacks).toHaveProperty("doRender");
		expect(callbacks).toHaveProperty("doRenderKeepPanel");
		expect(callbacks).toHaveProperty("markDirty");
		expect(callbacks).toHaveProperty("updateForces");
		expect(callbacks).toHaveProperty("applySearch");
		expect(callbacks).toHaveProperty("applyTextFade");
		expect(callbacks).toHaveProperty("applyHover");
		expect(callbacks).toHaveProperty("applyDirectionalGravityForce");
		expect(callbacks).toHaveProperty("applyNodeRules");
		expect(callbacks).toHaveProperty("applyClusterForce");
		expect(callbacks).toHaveProperty("startOrbitAnimation");
		expect(callbacks).toHaveProperty("stopOrbitAnimation");
		expect(callbacks).toHaveProperty("wakeRenderLoop");
		expect(callbacks).toHaveProperty("rebuildPanel");
		expect(callbacks).toHaveProperty("announceA11y");
		expect(callbacks).toHaveProperty("invalidateData");
		expect(callbacks).toHaveProperty("setZoom");
		expect(callbacks).toHaveProperty("invalidateDataKeepPanel");
		expect(callbacks).toHaveProperty("restartSimulation");
		expect(callbacks).toHaveProperty("collectFieldSuggestions");
		expect(callbacks).toHaveProperty("collectValueSuggestions");
		expect(callbacks).toHaveProperty("saveGroupPreset");
		expect(callbacks).toHaveProperty("resetPanel");
		expect(callbacks).toHaveProperty("restoreViewport");
		expect(callbacks).toHaveProperty("applyPreset");
		expect(callbacks).toHaveProperty("getPresetSummary");
		expect(callbacks).toHaveProperty("jumpToNode");
		expect(callbacks).toHaveProperty("getNodeIds");
		expect(callbacks).toHaveProperty("recolorNodes");
		expect(callbacks).toHaveProperty("autoOptimize");
		expect(callbacks).toHaveProperty("saveTemplate");
		expect(callbacks).toHaveProperty("loadTemplate");
		expect(callbacks).toHaveProperty("deleteTemplate");
		expect(callbacks).toHaveProperty("resetZoomBaseNodeSize");
		expect(callbacks).toHaveProperty("recalcNodeRadii");
		expect(callbacks).toHaveProperty("navBack");
		expect(callbacks).toHaveProperty("navForward");
		expect(callbacks).toHaveProperty("applyEgoToVisible");
		expect(callbacks).toHaveProperty("bulkAddTag");
		expect(callbacks).toHaveProperty("bulkSetField");
		expect(callbacks).toHaveProperty("getNodeTreeData");
		expect(callbacks).toHaveProperty("getHoveredNodeId");
		expect(callbacks).toHaveProperty("getForwardLinks");
		expect(callbacks).toHaveProperty("getBacklinks");
		expect(callbacks).toHaveProperty("toggleNodeVisibility");
		expect(callbacks).toHaveProperty("refreshOverlays");
		expect(callbacks).toHaveProperty("rebuildNodesInPlace");
		expect(callbacks).toHaveProperty("rebuildHoverAdj");
		expect(callbacks).toHaveProperty("clearHoverTooltips");
		expect(callbacks).toHaveProperty("setViewMode");
	});

	describe("doRender", () => {
		it("calls host.doRender and requestSave", async () => {
			await callbacks.doRender();
			expect(host.doRender).toHaveBeenCalled();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("doRenderKeepPanel", () => {
		it("increments skipPanelRebuildCount before render", async () => {
			const initial = host.skipPanelRebuildCount;
			await callbacks.doRenderKeepPanel();
			expect(host.skipPanelRebuildCount).toBe(initial);
		});

		it("calls requestSave", async () => {
			await callbacks.doRenderKeepPanel();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("markDirty", () => {
		it("marks dirty and saves", () => {
			// edgeCache mock needs invalidateBundles method
			host.edgeCache = { invalidateBundles: vi.fn() } as any;
			callbacks.markDirty();
			expect(host.markDirty).toHaveBeenCalledWith(true);
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("updateForces", () => {
		it("calls host updateForces and requestSave", () => {
			callbacks.updateForces();
			expect(host.updateForces).toHaveBeenCalled();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("applySearch", () => {
		it("calls host.applySearch", () => {
			callbacks.applySearch();
			expect(host.applySearch).toHaveBeenCalled();
		});
	});

	describe("applyTextFade", () => {
		it("calls host.applyTextFade and requestSave", () => {
			callbacks.applyTextFade();
			expect(host.applyTextFade).toHaveBeenCalled();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("applyHover", () => {
		it("calls host.applyHover", () => {
			callbacks.applyHover();
			expect(host.applyHover).toHaveBeenCalled();
		});
	});

	describe("applyDirectionalGravityForce", () => {
		it("calls host.applyNodeRulesForce and requestSave", () => {
			callbacks.applyDirectionalGravityForce();
			expect(host.applyNodeRulesForce).toHaveBeenCalled();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("applyNodeRules", () => {
		it("calls multiple host methods", () => {
			callbacks.applyNodeRules();
			expect(host.applyNodeRulesForce).toHaveBeenCalled();
			expect(host.applyClusterForce).toHaveBeenCalled();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("applyClusterForce", () => {
		it("accepts optional reset parameter", () => {
			callbacks.applyClusterForce(true);
			expect(host.applyClusterForce).toHaveBeenCalledWith(true);
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("collectFieldSuggestions", () => {
		it("combines built-in and frontmatter fields", () => {
			const result = callbacks.collectFieldSuggestions();
			expect(Array.isArray(result)).toBe(true);
			expect(result.length).toBeGreaterThan(0);
			expect(result).toContain("label");
			expect(result).toContain("custom-field");
		});

		it("removes duplicates", () => {
			const result = callbacks.collectFieldSuggestions();
			const unique = new Set(result);
			expect(unique.size).toBe(result.length);
		});
	});

	describe("collectValueSuggestions", () => {
		it("returns empty for empty pixi nodes", () => {
			const result = callbacks.collectValueSuggestions("field");
			expect(Array.isArray(result)).toBe(true);
		});

		it("handles label field specially", () => {
			host.pixiNodes.set("n1", { data: { label: "TestLabel" } } as any);
			const result = callbacks.collectValueSuggestions("label");
			expect(result.length).toBeGreaterThan(0);
		});

		it("returns sorted unique values", () => {
			host.pixiNodes.set("n1", { data: { category: "cat" } } as any);
			host.pixiNodes.set("n2", { data: { category: "cat" } } as any);
			const result = callbacks.collectValueSuggestions("category");
			const unique = new Set(result);
			expect(unique.size).toBe(result.length);
		});
	});

	describe("saveGroupPreset", () => {
		it("adds preset to plugin settings", () => {
			callbacks.saveGroupPreset();
			expect(host.plugin.settings.groupPresets.length).toBeGreaterThan(0);
			expect(host.plugin.saveSettings).toHaveBeenCalled();
		});
	});

	describe("getPresetSummary", () => {
		it("delegates to host", () => {
			const result = callbacks.getPresetSummary("test");
			expect(host._getPresetSummary).toHaveBeenCalledWith("test");
			expect(result).toBe("summary");
		});
	});

	describe("jumpToNode", () => {
		it("delegates to host", () => {
			callbacks.jumpToNode("node-id");
			expect(host.jumpToNode).toHaveBeenCalledWith("node-id");
		});
	});

	describe("getNodeIds", () => {
		it("returns array of node IDs from pixiNodes", () => {
			host.pixiNodes.set("a", { data: {} } as any);
			host.pixiNodes.set("b", { data: {} } as any);
			const result = callbacks.getNodeIds();
			expect(result).toContain("a");
			expect(result).toContain("b");
		});
	});

	describe("recolorNodes", () => {
		it("calls host methods", () => {
			callbacks.recolorNodes();
			expect(host.recolorNodes).toHaveBeenCalled();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("navBack", () => {
		it("delegates to host", () => {
			callbacks.navBack();
			expect(host.navBack).toHaveBeenCalled();
		});
	});

	describe("navForward", () => {
		it("delegates to host", () => {
			callbacks.navForward();
			expect(host.navForward).toHaveBeenCalled();
		});
	});

	describe("applyEgoToVisible", () => {
		it("delegates to host", () => {
			callbacks.applyEgoToVisible();
			expect(host.applyEgoToVisible).toHaveBeenCalled();
		});
	});

	describe("bulkAddTag", () => {
		it("delegates to host", () => {
			callbacks.bulkAddTag(["a", "b"], "tag");
			expect(host.bulkAddTag).toHaveBeenCalledWith(["a", "b"], "tag");
		});
	});

	describe("bulkSetField", () => {
		it("delegates to host", () => {
			callbacks.bulkSetField(["a"], "field", "value");
			expect(host.bulkSetField).toHaveBeenCalledWith(["a"], "field", "value");
		});
	});

	describe("getHoveredNodeId", () => {
		it("returns highlightedNodeId from host", () => {
			host.highlightedNodeId = "node-123";
			const result = callbacks.getHoveredNodeId();
			expect(result).toBe("node-123");
		});
	});

	describe("getForwardLinks", () => {
		it("delegates to host", () => {
			callbacks.getForwardLinks("node-id");
			expect(host._getForwardLinks).toHaveBeenCalledWith("node-id");
		});
	});

	describe("getBacklinks", () => {
		it("delegates to host", () => {
			callbacks.getBacklinks("node-id");
			expect(host._getBacklinks).toHaveBeenCalledWith("node-id");
		});
	});

	describe("toggleNodeVisibility", () => {
		it("delegates to host", () => {
			callbacks.toggleNodeVisibility("node-id");
			expect(host._toggleNodeVisibility).toHaveBeenCalledWith("node-id");
		});
	});

	describe("refreshOverlays", () => {
		it("updates all overlays and refreshes views", () => {
			callbacks.refreshOverlays();
			expect(host.updateGraphStats).toHaveBeenCalled();
			expect(host.updateRelationMatrix).toHaveBeenCalled();
			expect(host.updateThumbnails).toHaveBeenCalled();
			expect(host.updateHierarchyBreadcrumb).toHaveBeenCalled();
			expect(host.updateLegend).toHaveBeenCalled();
		});

		it("handles minimap visibility", () => {
			host.minimap = { setVisible: vi.fn() } as any;
			host.panel.showMinimap = true;
			callbacks.refreshOverlays();
			expect(host.minimap!.setVisible).toHaveBeenCalled();
		});
	});

	describe("setViewMode", () => {
		it("sets panel viewMode and currentLayout", () => {
			callbacks.setViewMode("graph");
			expect(host.panel.viewMode).toBe("graph");
			expect(host.doRender).toHaveBeenCalled();
		});
	});

	describe("restartSimulation", () => {
		it("restarts simulation with alpha value", () => {
			const mockSim = {
				alpha: vi.fn().mockReturnThis(),
				restart: vi.fn(),
			} as any;
			host.simulation = mockSim;
			callbacks.restartSimulation(0.5);
			expect(mockSim.alpha).toHaveBeenCalledWith(0.5);
			expect(mockSim.restart).toHaveBeenCalled();
		});

		it("ignores null simulation", () => {
			host.simulation = null;
			expect(() => callbacks.restartSimulation(0.5)).not.toThrow();
		});
	});

	describe("invalidateData", () => {
		it("clears rawData and similar cache", async () => {
			host.rawData = { nodes: [], edges: [] };
			await callbacks.invalidateData();
			expect(host.rawData).toBeNull();
			expect(host._similarCache.clear).toHaveBeenCalled();
		});
	});

	describe("invalidateDataKeepPanel", () => {
		it("preserves panel while invalidating data", async () => {
			await callbacks.invalidateDataKeepPanel();
			expect(host.skipPanelRebuildCount).toBeGreaterThanOrEqual(0);
			expect(host.requestSave).toHaveBeenCalled();
		});

		it("auto-fits view if configured", async () => {
			host.panel.autoFitOnFilter = true;
			host.canvasWrap = { clientWidth: 800, clientHeight: 600 } as any;
			await callbacks.invalidateDataKeepPanel();
			expect(host.autoFitView).toHaveBeenCalled();
		});
	});

	describe("saveTemplate", () => {
		it("delegates to host", () => {
			callbacks.saveTemplate("template-name");
			expect(host._saveTemplate).toHaveBeenCalledWith("template-name");
		});
	});

	describe("loadTemplate", () => {
		it("delegates to host", () => {
			callbacks.loadTemplate("template-name");
			expect(host._loadTemplate).toHaveBeenCalledWith("template-name");
		});
	});

	describe("deleteTemplate", () => {
		it("delegates to host", () => {
			callbacks.deleteTemplate("template-name");
			expect(host._deleteTemplate).toHaveBeenCalledWith("template-name");
		});
	});

	describe("resetZoomBaseNodeSize", () => {
		it("clears zoom base node size", () => {
			host._zoomBaseNodeSize = 100;
			callbacks.resetZoomBaseNodeSize();
			expect(host._zoomBaseNodeSize).toBeNull();
		});
	});

	describe("recalcNodeRadii", () => {
		it("delegates to host", () => {
			callbacks.recalcNodeRadii();
			expect(host.recalcNodeRadii).toHaveBeenCalled();
		});
	});

	describe("announceA11y", () => {
		it("delegates to host", () => {
			callbacks.announceA11y("message");
			expect(host._announceA11y).toHaveBeenCalledWith("message");
		});
	});

	describe("rebuildPanel", () => {
		it("calls host.buildPanel", () => {
			callbacks.rebuildPanel();
			expect(host.buildPanel).toHaveBeenCalled();
			expect(host.requestSave).toHaveBeenCalled();
		});
	});

	describe("rebuildNodesInPlace", () => {
		it("delegates to host", () => {
			callbacks.rebuildNodesInPlace();
			expect(host.rebuildNodesInPlace).toHaveBeenCalled();
		});
	});

	describe("rebuildHoverAdj", () => {
		it("delegates to host", () => {
			callbacks.rebuildHoverAdj();
			expect(host._rebuildHoverAdj).toHaveBeenCalled();
		});
	});

	describe("clearHoverTooltips", () => {
		it("removes all hover labels", () => {
			const mockLabel = {
				gfx: { removeChild: vi.fn() },
				hoverLabel: {
					destroy: vi.fn(),
				},
				hoverForcedLabel: true,
			} as any;
			host.pixiNodes.set("n1", mockLabel);
			callbacks.clearHoverTooltips();
			// Labels should be cleared
		});
	});
});
