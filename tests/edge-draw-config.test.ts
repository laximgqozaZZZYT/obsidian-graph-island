import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	createDefaultEdgeDrawConfig,
	computeEffectiveHighlight,
	computeMaxDegree,
	resolveCableClusters,
	populateEdgeDrawConfig,
	type EdgeDrawConfigInput,
} from "../src/views/edge-draw-config";
import type { EdgeDrawConfig } from "../src/views/EdgeRenderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCfg(overrides: Partial<EdgeDrawConfig> = {}): EdgeDrawConfig {
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
		...overrides,
	} as EdgeDrawConfig;
}

function makeInput(overrides: Partial<EdgeDrawConfigInput> = {}): EdgeDrawConfigInput {
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
		colorEdgesByRelation: false,
		showEdgeLabels: false,
		showArrows: false,
		fadeEdgesByDegree: false,
		edgeBundleStrength: null,
		clusterArrangement: "grid",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Tests: createDefaultEdgeDrawConfig
// ---------------------------------------------------------------------------

describe("createDefaultEdgeDrawConfig", () => {
	it("creates config with all required fields initialized", () => {
		const cfg = createDefaultEdgeDrawConfig();
		expect(cfg.showLinks).toBe(false);
		expect(cfg.showTagEdges).toBe(false);
		expect(cfg.showInheritance).toBe(false);
		expect(cfg.colorEdgesByRelation).toBe(false);
		expect(cfg.highlightedNodeId).toBeNull();
		expect(cfg.bgColor).toBe(0);
		expect(cfg.bundleStrength).toBe(0);
	});

	it("initializes highlight set as empty Set", () => {
		const cfg = createDefaultEdgeDrawConfig();
		expect(cfg.highlightSet).toBeInstanceOf(Set);
		expect(cfg.highlightSet.size).toBe(0);
	});

	it("initializes relationship colors as empty Map", () => {
		const cfg = createDefaultEdgeDrawConfig();
		expect(cfg.relationColors).toBeInstanceOf(Map);
		expect(cfg.relationColors.size).toBe(0);
	});

	it("initializes degrees as empty Map", () => {
		const cfg = createDefaultEdgeDrawConfig();
		expect(cfg.degrees).toBeInstanceOf(Map);
		expect(cfg.degrees.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Tests: computeEffectiveHighlight
// ---------------------------------------------------------------------------

describe("computeEffectiveHighlight", () => {
	it("prefers ephemeral highlight when present", () => {
		const ephSet = new Set(["a", "b"]);
		const result = computeEffectiveHighlight(ephSet, "manual-id", false, null, new Set());
		expect(result.effectiveId).toBe("__ephemeral__");
		expect(result.effectiveSet).toBe(ephSet);
	});

	it("uses highlightedNodeId when no ephemeral highlight", () => {
		const result = computeEffectiveHighlight(null, "highlight-id", false, null, new Set());
		expect(result.effectiveId).toBe("highlight-id");
	});

	it("uses focus node ID as fallback when no highlighted ID", () => {
		const result = computeEffectiveHighlight(null, null, true, "focus-id", new Set());
		expect(result.effectiveId).toBe("focus-id");
	});

	it("prefers highlighted ID over focus ID even in focus mode", () => {
		const result = computeEffectiveHighlight(null, "manual-id", true, "focus-id", new Set());
		expect(result.effectiveId).toBe("manual-id");
	});

	it("returns null when no highlight sources available", () => {
		const result = computeEffectiveHighlight(null, null, false, null, new Set());
		expect(result.effectiveId).toBeNull();
	});

	it("returns previous highlight set when no ephemeral highlight", () => {
		const prevSet = new Set(["x", "y"]);
		const result = computeEffectiveHighlight(null, "id", false, null, prevSet);
		expect(result.effectiveSet).toBe(prevSet);
	});

	it("ignores empty ephemeral highlight (treats as null)", () => {
		const emptySet = new Set<string>();
		const prevSet = new Set(["x"]);
		const result = computeEffectiveHighlight(emptySet, "manual-id", false, null, prevSet);
		expect(result.effectiveId).toBe("manual-id");
		expect(result.effectiveSet).toBe(prevSet);
	});
});

// ---------------------------------------------------------------------------
// Tests: computeMaxDegree
// ---------------------------------------------------------------------------

describe("computeMaxDegree", () => {
	it("returns 0 when fadeByDegree is false", () => {
		const degrees = new Map([
			["a", 10],
			["b", 20],
		]);
		expect(computeMaxDegree(degrees, false)).toBe(0);
	});

	it("computes max degree when enabled", () => {
		const degrees = new Map([
			["a", 10],
			["b", 30],
			["c", 15],
		]);
		expect(computeMaxDegree(degrees, true)).toBe(30);
	});

	it("handles single-entry map", () => {
		const degrees = new Map([["a", 42]]);
		expect(computeMaxDegree(degrees, true)).toBe(42);
	});

	it("returns 0 for empty map even when enabled", () => {
		const degrees = new Map<string, number>();
		expect(computeMaxDegree(degrees, true)).toBe(0);
	});

	it("handles negative degrees", () => {
		const degrees = new Map([
			["a", -10],
			["b", 5],
			["c", -20],
		]);
		expect(computeMaxDegree(degrees, true)).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// Tests: resolveCableClusters
// ---------------------------------------------------------------------------

describe("resolveCableClusters", () => {
	it("returns all nulls when clusterMeta is null", () => {
		const result = resolveCableClusters(null, () => null);
		expect(result.nodeClusterMap).toBeNull();
		expect(result.clusterCentroids).toBeNull();
		expect(result.clusterRadii).toBeNull();
	});

	it("returns all nulls when fewer than 2 centroids", () => {
		const clusterMeta = {
			clusterCentroids: new Map([["c1", { x: 0, y: 0 }]]),
		};
		const result = resolveCableClusters(clusterMeta, () => null);
		expect(result.nodeClusterMap).toBeNull();
		expect(result.clusterCentroids).toBeNull();
		expect(result.clusterRadii).toBeNull();
	});

	it("resolves cluster data when 2+ centroids available", () => {
		const nodeClusterMap = new Map([["n1", "c1"]]);
		const clusterCentroids = new Map([
			["c1", { x: 0, y: 0 }],
			["c2", { x: 100, y: 100 }],
		]);
		const clusterRadii = new Map([
			["c1", 10],
			["c2", 20],
		]);
		const clusterMeta = { nodeClusterMap, clusterCentroids, clusterRadii };
		const result = resolveCableClusters(clusterMeta, () => null);
		expect(result.nodeClusterMap).toBe(nodeClusterMap);
		expect(result.clusterCentroids).toBe(clusterCentroids);
		expect(result.clusterRadii).toBe(clusterRadii);
	});

	it("uses meta centroids if cached is smaller", () => {
		const cachedCentroids = new Map([
			["c1", { x: 1, y: 1 }],
			["c2", { x: 101, y: 101 }],
		]);
		const metaCentroids = new Map([
			["c1", { x: 0, y: 0 }],
			["c2", { x: 100, y: 100 }],
			["c3", { x: 200, y: 200 }],
		]);
		const clusterMeta = {
			clusterCentroids: metaCentroids,
			nodeClusterMap: new Map([["n1", "c1"]]),
		};
		const result = resolveCableClusters(clusterMeta, () => cachedCentroids);
		expect(result.clusterCentroids).toBe(metaCentroids);
	});

	it("uses meta centroids if larger or cached is null", () => {
		const metaCentroids = new Map([
			["c1", { x: 0, y: 0 }],
			["c2", { x: 100, y: 100 }],
		]);
		const clusterMeta = {
			clusterCentroids: metaCentroids,
			nodeClusterMap: new Map([["n1", "c1"]]),
		};
		const result = resolveCableClusters(clusterMeta, () => null);
		expect(result.clusterCentroids).toBe(metaCentroids);
	});
});

// ---------------------------------------------------------------------------
// Tests: populateEdgeDrawConfig
// ---------------------------------------------------------------------------

describe("populateEdgeDrawConfig", () => {
	let cfg: EdgeDrawConfig;
	let input: EdgeDrawConfigInput;

	beforeEach(() => {
		cfg = makeCfg();
		input = makeInput();
	});

	it("copies panel toggle fields", () => {
		input.showLinks = true;
		input.showTagEdges = true;
		input.showInheritance = true;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.showLinks).toBe(true);
		expect(cfg.showTagEdges).toBe(true);
		expect(cfg.showInheritance).toBe(true);
	});

	it("computes isArcLayout from currentLayout", () => {
		populateEdgeDrawConfig(
			cfg,
			input,
			"arc",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.isArcLayout).toBe(true);
	});

	it("copies highlight data", () => {
		const highlightSet = new Set(["a", "b"]);
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			"highlight-id",
			highlightSet,
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.highlightedNodeId).toBe("highlight-id");
		expect(cfg.highlightSet).toBe(highlightSet);
	});

	it("uses default bundle strength when input is null", () => {
		input.edgeBundleStrength = null;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			100,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		// autoBundleStrength is used, should not be 0
		expect(cfg.bundleStrength).toBeGreaterThan(0);
	});

	it("uses user-provided bundle strength when >= 0", () => {
		input.edgeBundleStrength = 0.75;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.bundleStrength).toBe(0.75);
	});

	it("copies cable bundle settings", () => {
		input.cableBundleMode = "always";
		input.cableTrunkWidth = 15;
		input.cableTrunkAlpha = 0.8;
		input.cableSpacing = 5;
		input.cableFanWidth = 20;
		input.cableFanAlpha = 0.6;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.cableBundleMode).toBe("always");
		expect(cfg.cableTrunkWidth).toBe(15);
		expect(cfg.cableTrunkAlpha).toBe(0.8);
		expect(cfg.cableSpacing).toBe(5);
		expect(cfg.cableFanWidth).toBe(20);
		expect(cfg.cableFanAlpha).toBe(0.6);
	});

	it("copies cluster data from cluster parameter", () => {
		const nodeClusterMap = new Map([["n1", "c1"]]);
		const clusterCentroids = new Map([
			["c1", { x: 0, y: 0 }],
			["c2", { x: 100, y: 100 }],
		]);
		const clusterRadii = new Map([
			["c1", 10],
			["c2", 20],
		]);
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap, clusterCentroids, clusterRadii },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.nodeClusterMap).toBe(nodeClusterMap);
		expect(cfg.clusterCentroids).toBe(clusterCentroids);
		expect(cfg.clusterRadii).toBe(clusterRadii);
	});

	it("copies viewport data", () => {
		const viewport = { scale: 2, x: 50, y: 60, w: 1024, h: 768 };
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			viewport,
			() => new Map(),
			() => null,
		);
		expect(cfg.worldScale).toBe(2);
		expect(cfg.viewportX).toBe(50);
		expect(cfg.viewportY).toBe(60);
		expect(cfg.viewportW).toBe(1024);
		expect(cfg.viewportH).toBe(768);
	});

	it("sets coordinate system to polar when clusterArrangement is polar", () => {
		input.clusterArrangement = "concentric";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.coordinateSystem).toBe("polar");
	});

	it("sets coordinate system to cartesian for non-polar arrangements", () => {
		input.clusterArrangement = "grid";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.coordinateSystem).toBe("cartesian");
	});

	it("honors explicit coordinateLayout.system override", () => {
		input.coordinateLayout = { system: "polar" };
		input.clusterArrangement = "grid";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.coordinateSystem).toBe("polar");
	});

	it("retrieves node radii when arrows or cardinality requested", () => {
		const cachedRadii = new Map([["n1", 10]]);
		input.showArrows = true;
		input.edgeCardinalityMode = "none";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => cachedRadii,
			() => null,
		);
		expect(cfg.nodeRadii).toBe(cachedRadii);
	});

	it("omits node radii when neither arrows nor cardinality active", () => {
		input.showArrows = false;
		input.edgeCardinalityMode = "none";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.nodeRadii).toBeNull();
	});

	it("copies all edge type visibility toggles", () => {
		input.showCategoryEdges = true;
		input.showSemanticEdges = true;
		input.showAggregation = true;
		input.showSimilar = true;
		input.showSibling = true;
		input.showSequence = true;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.showCategoryEdges).toBe(true);
		expect(cfg.showSemanticEdges).toBe(true);
		expect(cfg.showAggregation).toBe(true);
		expect(cfg.showSimilar).toBe(true);
		expect(cfg.showSibling).toBe(true);
		expect(cfg.showSequence).toBe(true);
	});

	it("copies color and fade configuration", () => {
		const relationColors = new Map([
			["rel1", "#ff0000"],
			["rel2", "#00ff00"],
		]);
		const degrees = new Map([
			["n1", 5],
			["n2", 10],
		]);
		input.colorEdgesByRelation = true;
		input.fadeEdgesByDegree = true;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0xffffff,
			relationColors,
			degrees,
			15,
			1000,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			true,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.colorEdgesByRelation).toBe(true);
		expect(cfg.fadeByDegree).toBe(true);
		expect(cfg.relationColors).toBe(relationColors);
		expect(cfg.degrees).toBe(degrees);
		expect(cfg.maxDegree).toBe(15);
		expect(cfg.bgColor).toBe(0xffffff);
		expect(cfg.isDark).toBe(true);
		expect(cfg.totalEdgeCount).toBe(1000);
	});

	it("handles undefined edgeBundleStrength by computing from node count", () => {
		input.edgeBundleStrength = undefined;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			200,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.bundleStrength).toBeGreaterThan(0);
	});

	it("uses negative bundle strength fallback", () => {
		input.edgeBundleStrength = -1;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.bundleStrength).toBeGreaterThan(0);
	});

	it("copies edge label and arrow configuration", () => {
		input.showEdgeLabels = true;
		input.edgeLabelPlacement = "smart";
		input.showArrows = true;
		input.edgeCardinalityMode = "count";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map([["n1", 10]]),
			() => null,
		);
		expect(cfg.showEdgeLabels).toBe(true);
		expect(cfg.edgeLabelPlacement).toBe("smart");
		expect(cfg.showArrows).toBe(true);
		expect(cfg.edgeCardinalityMode).toBe("count");
		expect(cfg.nodeRadii).not.toBeNull();
	});

	it("copies ontology and direction filter settings", () => {
		input.showOntologyBackbone = true;
		input.edgeDirectionFilter = "bidirectional";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.showOntologyBackbone).toBe(true);
		expect(cfg.edgeDirectionFilter).toBe("bidirectional");
	});

	it("defaults edgeDirectionFilter to 'all' when undefined", () => {
		input.edgeDirectionFilter = undefined;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.edgeDirectionFilter).toBe("all");
	});

	it("covers edge case: hoverDistMap parameter", () => {
		const hoverMap = new Map([
			["n1", 10],
			["n2", 20],
		]);
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			hoverMap,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.hoverDistMap).toBe(hoverMap);
	});

	it("covers branch: cardinality mode other than 'none'", () => {
		const cachedRadii = new Map([["n1", 10]]);
		input.showArrows = false;
		input.edgeCardinalityMode = "count";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => cachedRadii,
			() => null,
		);
		expect(cfg.nodeRadii).toBe(cachedRadii);
	});

	it("covers branch: polar coordinate system via clusterArrangement", () => {
		input.clusterArrangement = "concentric";
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.coordinateSystem).toBe("polar");
	});

	it("covers all show* fields in panel toggles", () => {
		input.showTagNodes = true;
		input.colorEdgesByRelation = true;
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => null,
		);
		expect(cfg.showTagNodes).toBe(true);
		expect(cfg.colorEdgesByRelation).toBe(true);
	});

	it("covers getRoadNetwork callback", () => {
		const roadNetwork = { dummy: "roadData" };
		populateEdgeDrawConfig(
			cfg,
			input,
			"force",
			null,
			new Set(),
			undefined,
			0,
			new Map(),
			new Map(),
			0,
			100,
			50,
			{ nodeClusterMap: null, clusterCentroids: null, clusterRadii: null },
			false,
			{ scale: 1, x: 0, y: 0, w: 800, h: 600 },
			() => new Map(),
			() => roadNetwork as unknown,
		);
		expect(cfg.roadNetwork).toBe(roadNetwork);
	});
});
