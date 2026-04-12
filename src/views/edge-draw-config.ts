/**
 * Pure functions for building EdgeDrawConfig from panel state.
 * Extracted from GraphViewContainer._buildEdgeDrawConfig to reduce complexity.
 */
import type { EdgeDrawConfig } from "./EdgeRenderer";
import { mergeRenderThresholds, type RenderThresholds } from "../types";
import { autoBundleStrength } from "../utils/graph-helpers";
import { LAYOUT_ARC, POLAR_ARRANGEMENTS } from "../constants";

/** Create a zero-initialized EdgeDrawConfig with all required fields. */
export function createDefaultEdgeDrawConfig(): EdgeDrawConfig {
	return {
		showLinks: false,
		showTagEdges: false,
		showCategoryEdges: false,
		showSemanticEdges: false,
		showInheritance: false,
		showAggregation: false,
		showTagNodes: false,
		showSimilar: false,
		showSibling: false,
		showSequence: false,
		showInlineRelation: false,
		showNamedRelation: false,
		colorEdgesByRelation: false,
		isArcLayout: false,
		highlightedNodeId: null,
		highlightSet: new Set(),
		bgColor: 0,
		relationColors: new Map(),
		fadeByDegree: false,
		degrees: new Map(),
		maxDegree: 0,
		nodeClusterMap: null,
		clusterCentroids: null,
		clusterRadii: null,
		bundleStrength: 0,
		isDark: false,
		showEdgeLabels: false,
		showArrows: false,
		nodeRadii: null,
	} as EdgeDrawConfig;
}

/** Input data needed to populate edge visibility toggles on EdgeDrawConfig. */
interface EdgeDrawConfigInput {
	// Panel toggle fields
	showLinks: boolean;
	showTagEdges: boolean;
	showCategoryEdges: boolean;
	showSemanticEdges: boolean;
	showInheritance: boolean;
	showAggregation: boolean;
	showTagNodes: boolean;
	showSimilar: boolean;
	showSibling: boolean;
	showSequence: boolean;
	showInlineRelation: boolean;
	showNamedRelation: boolean;
	colorEdgesByRelation: boolean;
	showEdgeLabels: boolean;
	showArrows: boolean;
	fadeEdgesByDegree: boolean;
	edgeBundleStrength: number | null | undefined;
	cableBundleMode?: "auto" | "always" | "never";
	cableTrunkWidth?: number;
	cableTrunkAlpha?: number;
	cableSpacing?: number;
	cableFanWidth?: number;
	cableFanAlpha?: number;
	edgeLabelPlacement?: "center" | "offset" | "smart";
	edgeLayerMode?: boolean;
	edgeCardinalityMode?: string;
	cardinalityRules?: unknown;
	cardinalityRenderConfig?: unknown;
	edgeWeightThickness?: boolean;
	edgeDirectionFilter?: "all" | "bidirectional" | "unidirectional";
	showOntologyBackbone?: boolean;
	clusterArrangement: string;
	coordinateLayout?: { system?: string } | null;
	renderThresholds?: Partial<RenderThresholds>;
	highContrastMode?: boolean;
	focusMode?: boolean;
	focusNodeId?: string | null;
}

/** Compute the effective highlight ID and set for edge drawing, considering ephemeral and focus modes. */
export function computeEffectiveHighlight(
	ephemeralHighlight: Set<string> | null,
	highlightedNodeId: string | null,
	focusMode: boolean,
	focusNodeId: string | null,
	prevHighlightSet: Set<string>,
): { effectiveId: string | null; effectiveSet: Set<string> } {
	const ephActive = ephemeralHighlight && ephemeralHighlight.size > 0;
	const focusFallbackId = focusMode && focusNodeId && !highlightedNodeId ? focusNodeId : null;
	const effectiveId = ephActive ? "__ephemeral__" : highlightedNodeId || focusFallbackId;
	const effectiveSet = ephActive ? ephemeralHighlight! : prevHighlightSet;
	return { effectiveId, effectiveSet };
}

/** Compute maxDegree from degrees map (for fade normalization). */
export function computeMaxDegree(degrees: Map<string, number>, fadeByDegree: boolean): number {
	if (!fadeByDegree) return 0;
	let maxDeg = 0;
	for (const d of degrees.values()) {
		if (d > maxDeg) maxDeg = d;
	}
	return maxDeg;
}

/** Resolve cable-tray cluster data from clusterMeta. */
export function resolveCableClusters(
	clusterMeta: {
		clusterCentroids?: Map<string, { x: number; y: number }>;
		nodeClusterMap?: Map<string, string>;
		clusterRadii?: Map<string, number>;
	} | null,
	getCachedCentroids: () => Map<string, { x: number; y: number }> | null,
): {
	nodeClusterMap: Map<string, string> | null;
	clusterCentroids: Map<string, { x: number; y: number }> | null;
	clusterRadii: Map<string, number> | null;
} {
	const centroidsAvailable = clusterMeta?.clusterCentroids?.size ?? 0;
	const hasCableClusters = centroidsAvailable >= 2;
	const nodeClusterMap = hasCableClusters ? (clusterMeta?.nodeClusterMap ?? null) : null;
	const liveCentroids = hasCableClusters ? getCachedCentroids() : null;
	const metaCentroids = hasCableClusters ? (clusterMeta?.clusterCentroids ?? null) : null;
	const clusterCentroids =
		liveCentroids && metaCentroids && liveCentroids.size < metaCentroids.size
			? metaCentroids
			: (liveCentroids ?? metaCentroids);
	const clusterRadii = hasCableClusters ? (clusterMeta?.clusterRadii ?? null) : null;
	return { nodeClusterMap, clusterCentroids, clusterRadii };
}

/** Assign all panel-derived fields onto cfg. Called by _buildEdgeDrawConfig. */
export function populateEdgeDrawConfig(
	cfg: EdgeDrawConfig,
	input: EdgeDrawConfigInput,
	currentLayout: string,
	effectiveHighlightId: string | null,
	effectiveHighlightSet: Set<string>,
	hoverDistMap: Map<string, number> | undefined,
	bgColor: number,
	relationColors: Map<string, string>,
	degrees: Map<string, number>,
	maxDeg: number,
	totalEdgeCount: number,
	nodeCount: number,
	cluster: {
		nodeClusterMap: Map<string, string> | null;
		clusterCentroids: Map<string, { x: number; y: number }> | null;
		clusterRadii: Map<string, number> | null;
	},
	isDark: boolean,
	viewport: { scale: number; x: number; y: number; w: number; h: number },
	getCachedNodeRadii: () => Map<string, number>,
	getRoadNetwork: () => unknown | null,
): void {
	const edgeRt = mergeRenderThresholds(input.renderThresholds);

	cfg.showLinks = input.showLinks;
	cfg.showTagEdges = input.showTagEdges;
	cfg.showCategoryEdges = input.showCategoryEdges;
	cfg.showSemanticEdges = input.showSemanticEdges;
	cfg.showInheritance = input.showInheritance;
	cfg.showAggregation = input.showAggregation;
	cfg.showTagNodes = input.showTagNodes;
	cfg.showSimilar = input.showSimilar;
	cfg.showSibling = input.showSibling;
	cfg.showSequence = input.showSequence;
	cfg.showInlineRelation = input.showInlineRelation;
	cfg.showNamedRelation = input.showNamedRelation;
	cfg.colorEdgesByRelation = input.colorEdgesByRelation;
	cfg.isArcLayout = currentLayout === LAYOUT_ARC;
	cfg.highlightedNodeId = effectiveHighlightId;
	cfg.highlightSet = effectiveHighlightSet;
	cfg.hoverDistMap = hoverDistMap;
	cfg.hoverEdgeFalloff = edgeRt.hoverEdgeFalloff;
	cfg.bgColor = bgColor;
	cfg.relationColors = relationColors;
	cfg.fadeByDegree = input.fadeEdgesByDegree;
	cfg.degrees = degrees;
	cfg.maxDegree = maxDeg;
	cfg.totalEdgeCount = totalEdgeCount;
	cfg.globalEdgeAlpha = edgeRt.globalEdgeAlpha;
	cfg.edgeLabelFontSize = edgeRt.edgeLabelFontSize;
	cfg.nodeClusterMap = cluster.nodeClusterMap;
	cfg.clusterCentroids = cluster.clusterCentroids;
	cfg.clusterRadii = cluster.clusterRadii;
	const userBundle = input.edgeBundleStrength;
	cfg.bundleStrength = userBundle != null && userBundle >= 0 ? userBundle : autoBundleStrength(nodeCount);
	cfg.cableBundleMode = input.cableBundleMode;
	cfg.cableTrunkWidth = input.cableTrunkWidth;
	cfg.cableTrunkAlpha = input.cableTrunkAlpha;
	cfg.cableSpacing = input.cableSpacing;
	cfg.cableFanWidth = input.cableFanWidth;
	cfg.cableFanAlpha = input.cableFanAlpha;
	cfg.edgeDensityFloor = edgeRt.edgeDensityFloor;
	cfg.highlightEdgeAlpha = edgeRt.highlightEdgeAlpha;
	cfg.highlightEdgeNonMatchAlpha = edgeRt.highlightEdgeNonMatchAlpha;
	cfg.edgeBidirectionalBoost = edgeRt.edgeBidirectionalBoost;
	cfg.edgeUnidirectionalDim = edgeRt.edgeUnidirectionalDim;
	cfg.edgeHierarchyBoost = edgeRt.edgeHierarchyBoost;
	cfg.edgeBidirectionalThickFactor = edgeRt.edgeBidirectionalThickFactor;
	cfg.edgeHierarchyThickFactor = edgeRt.edgeHierarchyThickFactor;
	cfg.arcMaxEdgeCount = edgeRt.arcMaxEdgeCount;
	cfg.edgeHoverFalloffMinAlpha = edgeRt.edgeHoverFalloffMinAlpha;
	cfg.isDark = isDark;
	cfg.highContrast = input.highContrastMode;
	cfg.showEdgeLabels = input.showEdgeLabels;
	cfg.edgeLabelPlacement = input.edgeLabelPlacement;
	cfg.edgeLayerMode = input.edgeLayerMode;
	cfg.showArrows = input.showArrows;
	cfg.nodeRadii =
		input.showArrows || input.edgeCardinalityMode !== "none" ? getCachedNodeRadii() : null;
	cfg.worldScale = viewport.scale;
	cfg.viewportX = viewport.x;
	cfg.viewportY = viewport.y;
	cfg.viewportW = viewport.w;
	cfg.viewportH = viewport.h;
	cfg.edgeMinZoom = edgeRt.edgeMinZoom;
	cfg.edgeZoomFadeThreshold = edgeRt.edgeZoomFadeThreshold;
	cfg.edgeLabelZoomHide = edgeRt.edgeLabelZoomHide;
	cfg.edgeLabelZoomFade = edgeRt.edgeLabelZoomFade;
	cfg.edgeFadeMinAlpha = edgeRt.edgeFadeMinAlpha;
	cfg.edgeCardinalityMode = input.edgeCardinalityMode as EdgeDrawConfig["edgeCardinalityMode"];
	cfg.cardinalityRules = input.cardinalityRules as EdgeDrawConfig["cardinalityRules"];
	cfg.cardinalityRenderConfig = input.cardinalityRenderConfig as EdgeDrawConfig["cardinalityRenderConfig"];
	cfg.edgeWeightThickness = input.edgeWeightThickness;
	cfg.edgeStrengthGlow = edgeRt.edgeStrengthGlow;
	cfg.edgeStrengthGlowMin = edgeRt.edgeStrengthGlowMin;
	cfg.edgeStrengthGlowMax = edgeRt.edgeStrengthGlowMax;
	cfg.edgeDirectionFilter = input.edgeDirectionFilter ?? "all";
	cfg.showOntologyBackbone = input.showOntologyBackbone ?? false;
	cfg.roadNetwork = (edgeRt as Record<string, unknown>).roadRouteEdges !== false ? (getRoadNetwork() as EdgeDrawConfig["roadNetwork"]) : null;
	cfg.clusterArrangement = input.clusterArrangement;
	cfg.coordinateSystem =
		input.coordinateLayout?.system === "polar"
			? "polar"
			: POLAR_ARRANGEMENTS.has(input.clusterArrangement)
				? "polar"
				: "cartesian";
}
