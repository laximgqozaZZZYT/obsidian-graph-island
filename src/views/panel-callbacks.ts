/**
 * Panel callback builder extracted from GraphViewContainer.
 * Wires panel UI actions to graph view methods via a host interface.
 */
import type { GroupPreset, LayoutType } from "../types";
import type { PanelCallbacks, NodeTreeEntry, PanelState } from "./PanelBuilder";
import type { PixiNode } from "./InteractionManager";
import { invalidateBundleCache, type EdgeRenderCache } from "./EdgeRenderer";
import { getNodeFieldValues } from "../utils/node-grouping";
import { viewModeToLayout } from "../utils/view-mode-map";
import type { Simulation } from "d3-force";
import type { GraphNode, GraphEdge, GraphData } from "../types";
import type { Minimap } from "./Minimap";
import type { RenderPipeline } from "./RenderPipeline";

// ---------------------------------------------------------------------------
// Host interface — narrow contract for the graph view container
// ---------------------------------------------------------------------------

/** Subset of GraphViewContainer that panel callbacks need. */
export interface PanelCallbackHost {
	// Core render/lifecycle
	doRender(): Promise<void>;
	requestSave(): void;
	markDirty(force: boolean): void;
	wakeRenderLoop(): void;
	buildPanel(): void;
	applySearch(): void;
	applyTextFade(): void;
	applyHover(): void;
	applyNodeRulesForce(): void;
	applyClusterForce(reset?: boolean): void;
	startOrbitAnimation(): void;
	stopOrbitAnimation(): void;
	updateForces(): void;
	setZoom(level: number): void;
	jumpToNode(nodeId: string): void;
	recolorNodes(): void;
	recalcNodeRadii(): void;
	rebuildNodesInPlace(): void;
	navBack(): void;
	navForward(): void;
	applyEgoToVisible(): void;
	bulkAddTag(nodeIds: string[], tag: string): void;
	bulkSetField(nodeIds: string[], field: string, value: string): void;
	restoreViewport(name: string): void;
	autoFitView(w: number, h: number): void;
	collectFrontmatterKeys(): string[];
	updateGraphStats(gd: GraphData): void;
	updateRelationMatrix(gd: GraphData): void;
	updateThumbnails(): void;
	updateHierarchyBreadcrumb(): void;
	updateLegend(): void;

	// Internal helpers (prefixed with _)
	_announceA11y(msg: string): void;
	_buildResetPanelCallback(): void;
	_buildAutoOptimizeCallback(): void;
	_getPresetSummary(key: string): string;
	_getNodeTreeData(): NodeTreeEntry[];
	_getForwardLinks(nodeId: string): string[];
	_getBacklinks(nodeId: string): string[];
	_toggleNodeVisibility(nodeId: string): void;
	_rebuildHoverAdj(): void;
	_saveTemplate(name: string): boolean;
	_loadTemplate(name: string): void;
	_deleteTemplate(name: string): void;
	_similarCache: { clear(): void };
	_zoomBaseNodeSize: number | null;

	// State
	skipPanelRebuildCount: number;
	edgeCache: EdgeRenderCache;
	renderPipeline: RenderPipeline | null;
	rawData: GraphData | null;
	panel: PanelState;
	pixiNodes: Map<string, PixiNode>;
	graphEdges: GraphEdge[];
	originalGraphData: GraphData | null;
	highlightedNodeId: string | null;
	currentLayout: LayoutType;
	simulation: Simulation<GraphNode, GraphEdge> | null;
	minimap: Minimap | null;
	canvasWrap: HTMLElement | null;
	plugin: { settings: { groupPresets: GroupPreset[] }; saveSettings(): void };
	app: { workspace: { getActiveFile(): { path: string } | null } };

	// Preset map
	allPresets: Record<string, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Builder function
// ---------------------------------------------------------------------------

/** Build the PanelCallbacks object wiring panel UI actions to graph view methods. */
export function buildPanelCallbacks(host: PanelCallbackHost): PanelCallbacks {
	return {
		doRender: () => {
			host.doRender();
			host.requestSave();
		},
		doRenderKeepPanel: () => {
			host.skipPanelRebuildCount++;
			host.doRender().finally(() => {
				host.skipPanelRebuildCount = Math.max(0, host.skipPanelRebuildCount - 1);
			});
			host.requestSave();
		},
		markDirty: () => {
			invalidateBundleCache(host.edgeCache);
			host.markDirty(true);
			host.requestSave();
			// Fallback: force render if rAF is throttled (background tabs)
			setTimeout(() => {
				host.renderPipeline?.forceRender();
			}, 100);
		},
		updateForces: () => {
			host.updateForces();
			host.requestSave();
		},
		applySearch: () => host.applySearch(),
		applyTextFade: () => {
			host.applyTextFade();
			host.requestSave();
		},
		applyHover: () => {
			host.applyHover();
		},
		applyDirectionalGravityForce: () => {
			host.applyNodeRulesForce();
			host.requestSave();
		},
		applyNodeRules: () => {
			host.applyNodeRulesForce();
			host.applyClusterForce();
			host.requestSave();
		},
		applyClusterForce: (reset?: boolean) => {
			host.applyClusterForce(reset);
			host.requestSave();
		},
		startOrbitAnimation: () => {
			host.startOrbitAnimation();
			host.requestSave();
		},
		stopOrbitAnimation: () => {
			host.stopOrbitAnimation();
			host.requestSave();
		},
		wakeRenderLoop: () => host.wakeRenderLoop(),
		rebuildPanel: () => {
			host.buildPanel();
			host.requestSave();
		},
		announceA11y: (msg: string) => host._announceA11y(msg),
		invalidateData: () => {
			host.rawData = null;
			host._similarCache.clear();
			host.doRender();
			host.requestSave();
		},
		setZoom: (level: number) => host.setZoom(level),
		invalidateDataKeepPanel: () => {
			host.rawData = null;
			host._similarCache.clear();
			host.skipPanelRebuildCount++;
			host.doRender().finally(() => {
				host.skipPanelRebuildCount = Math.max(0, host.skipPanelRebuildCount - 1);
				// GK: Auto-fit view after filter change
				if (host.panel.autoFitOnFilter && host.canvasWrap) {
					host.autoFitView(host.canvasWrap.clientWidth, host.canvasWrap.clientHeight);
				}
			});
			host.requestSave();
		},
		restartSimulation: (alpha: number) => {
			if (host.simulation) {
				host.simulation.alpha(alpha).restart();
				host.wakeRenderLoop();
			}
		},
		collectFieldSuggestions: () => {
			const builtIn = ["label", "tag", "category", "folder", "path", "file", "id", "isTag"];
			const fmKeys = host.collectFrontmatterKeys();
			return [...new Set([...builtIn, ...fmKeys])];
		},
		collectValueSuggestions: (field: string) => {
			const values = new Set<string>();
			for (const pn of host.pixiNodes.values()) {
				for (const v of getNodeFieldValues(pn.data, field)) values.add(v);
				// "label" is not in getNodeFieldValues, handle explicitly
				if (field === "label") values.add(pn.data.label);
			}
			return [...values].sort();
		},
		saveGroupPreset: () => {
			// Reverse-derive commonQueries from clusterGroupRules for preset backward compat
			const derivedQueries = host.panel.clusterGroupRules.map((r) => {
				// Convert "field:?" → "field:*" for query format
				const field = r.groupBy.endsWith(":?") ? r.groupBy.slice(0, -2) : r.groupBy;
				// Legacy mapping for backward compat
				const legacyMap: Record<string, string> = { node_type: "category", none: "tag" };
				const queryField = legacyMap[field] ?? field;
				return { query: `${queryField}:*`, recursive: r.recursive };
			});
			const preset: GroupPreset = {
				condition: {
					layout: host.currentLayout,
					tagDisplay: host.panel.tagDisplay,
				},
				groups: host.panel.groups.map((g) => ({ ...g })),
				commonQueries: derivedQueries,
			};
			host.plugin.settings.groupPresets.push(preset);
			host.plugin.saveSettings();
		},
		resetPanel: () => host._buildResetPanelCallback(),
		restoreViewport: (name: string) => host.restoreViewport(name),
		applyPreset: (preset: string) => {
			const p = host.allPresets[preset];
			if (p) {
				// Reset groupByRules so new groupBy string is re-parsed
				if ("groupBy" in p && !("groupByRules" in p)) {
					host.panel.groupByRules = null;
				}
				Object.assign(host.panel, p);
				// Fix A: localGraphCenter="__active__" means "use active file" — resolve dynamically
				if (host.panel.localGraphCenter === "__active__") {
					const af = host.app.workspace.getActiveFile();
					host.panel.localGraphCenter = af?.path ?? null;
				}
				host.doRender();
				host.requestSave();
			}
		},
		getPresetSummary: (key: string) => host._getPresetSummary(key),
		jumpToNode: (nodeId: string) => host.jumpToNode(nodeId),
		getNodeIds: () => [...host.pixiNodes.keys()],
		recolorNodes: () => {
			host.recolorNodes();
			host.requestSave();
		},
		autoOptimize: () => host._buildAutoOptimizeCallback(),
		saveTemplate: (name: string) => host._saveTemplate(name),
		loadTemplate: (name: string) => host._loadTemplate(name),
		deleteTemplate: (name: string) => host._deleteTemplate(name),
		resetZoomBaseNodeSize: () => {
			host._zoomBaseNodeSize = null;
		},
		recalcNodeRadii: () => {
			host.recalcNodeRadii();
		},
		navBack: () => host.navBack(),
		navForward: () => host.navForward(),
		applyEgoToVisible: () => host.applyEgoToVisible(),
		bulkAddTag: (nodeIds: string[], tag: string) => host.bulkAddTag(nodeIds, tag),
		bulkSetField: (nodeIds: string[], field: string, value: string) => host.bulkSetField(nodeIds, field, value),
		getNodeTreeData: () => host._getNodeTreeData(),
		getHoveredNodeId: () => host.highlightedNodeId,
		getForwardLinks: (nodeId: string) => host._getForwardLinks(nodeId),
		getBacklinks: (nodeId: string) => host._getBacklinks(nodeId),
		toggleNodeVisibility: (nodeId: string) => host._toggleNodeVisibility(nodeId),
		refreshOverlays: () => {
			const gd =
				host.originalGraphData ??
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial GraphData
				({ nodes: [...host.pixiNodes.values()].map((pn) => pn.data), edges: host.graphEdges } as any);
			host.updateGraphStats(gd);
			host.updateRelationMatrix(gd);
			host.updateThumbnails();
			host.updateHierarchyBreadcrumb();
			host.updateLegend();
			if (host.minimap) host.minimap.setVisible(host.panel.showMinimap && host.panel.viewMode === "graph");
			host.markDirty(true);
			host.requestSave();
		},
		rebuildNodesInPlace: () => {
			host.rebuildNodesInPlace();
		},
		rebuildHoverAdj: () => {
			host._rebuildHoverAdj();
		},
		clearHoverTooltips: () => {
			for (const pn of host.pixiNodes.values()) {
				if (pn.hoverLabel) {
					pn.gfx.removeChild(pn.hoverLabel);
					pn.hoverLabel.destroy();
					pn.hoverLabel = null;
					pn.hoverForcedLabel = false;
				}
			}
		},
		setViewMode: (mode) => {
			host.panel.viewMode = mode;
			host.currentLayout = viewModeToLayout(mode);
			host.doRender();
		},
	};
}
