import { describe, it, expect } from "vitest";
import { renderSemanticZoomMode } from "../src/views/semantic-zoom-renderer";
import { CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";
import { CanvasText } from "../src/views/canvas2d/CanvasText";
import type { PixiNode } from "../src/views/InteractionManager";
import type { RenderHost } from "../src/views/RenderPipeline";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGraphNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
	return {
		id,
		label: `Node ${id}`,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		isTag: false,
		...overrides,
	} as GraphNode;
}

function makePixiNode(id: string, radius = 10, overrides: Partial<PixiNode> = {}): PixiNode {
	return {
		data: makeGraphNode(id),
		color: 0x3498db,
		radius,
		gfx: new CanvasContainer(),
		circle: new CanvasGraphics(),
		label: null,
		tagLabel: null,
		hoverLabel: null,
		leaderLine: null,
		held: false,
		sortRank: -1,
		priorityScore: 0,
		minShowZoom: 0,
		labelWasVisible: false,
		hoverForcedLabel: false,
		subLabels: [],
		...overrides,
	} as PixiNode;
}

function makeRenderHost(): RenderHost {
	return {
		getLabelColor: () => 0xffffff,
		getDefinitionField: () => "",
		isHighContrastMode: () => false,
		// Minimal stubs for remaining required properties
		timers: {} as any,
		getPixiApp: () => null,
		getPixiNodes: () => new Map(),
		getWorldContainer: () => null,
		getWorldScale: () => 1,
		getNodeCircleBatch: () => null,
		getDegrees: () => new Map(),
		isDarkTheme: () => false,
		getHighlightedNodeId: () => null,
		getPrevHighlightSet: () => new Set(),
		getEphemeralHighlight: () => null,
		rebuildSpatialGrid: () => {},
		drawGuides: () => {},
	} as unknown as RenderHost;
}

/** Build the `rt` render-thresholds record used by semantic-zoom. */
function makeRT(dotPx = 4, compactPx = 20, fullPx = 60) {
	return {
		semanticZoomDotPx: dotPx,
		semanticZoomCompactPx: compactPx,
		semanticZoomFullPx: fullPx,
		labelMaxChars: 30,
	} as Record<string, number | boolean | string>;
}

/** Build the `crc` card-render-config record. */
function makeCRC() {
	return {
		filteredNodeAlpha: 0.3,
		strokeDarken: 0.2,
		strokeAlpha: 0.8,
		semanticCardFillAlpha: 0.9,
		semanticCardFullFillAlpha: 0.95,
		semanticCardHeaderHeightRatio: 0.4,
		semanticCardHeaderFillAlpha: 1.0,
		cardSubTextAlpha: 0.6,
		cardBodyPreviewAlpha: 0.5,
	} as Record<string, number>;
}

function getCommands(g: CanvasGraphics): { t: string }[] {
	return (g as any).commands as { t: string }[];
}

function hasCommandType(g: CanvasGraphics, type: string): boolean {
	return getCommands(g).some((c) => c.t === type);
}

// ---------------------------------------------------------------------------
// Tier 1: colored dot (screenPx < dotPx)
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — tier 1 (dot)", () => {
	it("draws a rect (dot) for very small screenPx", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n1", 1);
		// screenPx = 1 * 2 * 1 = 2 < dotPx=4 → tier 1
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 20, 60),
		);
		expect(hasCommandType(g, "drawRect")).toBe(true);
	});

	it("uses filteredNodeAlpha for timeline-filtered nodes", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("filtered", 1);
		const tlFilteredOut = new Set(["filtered"]);
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["filtered", pn]]),
				tlFilteredOut,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 20, 60),
		);
		// Should still draw a dot, just at reduced alpha
		expect(hasCommandType(g, "drawRect")).toBe(true);
	});

	it("does nothing when visible list is empty", () => {
		const g = new CanvasGraphics();
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [],
				pixiNodes: new Map(),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 0,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 20, 60),
		);
		expect(getCommands(g).length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Tier 2: circle + label (dotPx <= screenPx < compactPx)
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — tier 2 (circle)", () => {
	it("draws a shape (not just a rect) for mid-range screenPx", () => {
		const g = new CanvasGraphics();
		// radius=5, worldScale=2 → screenPx = 5*2*2 = 20 → tier 2 (dotPx=4, compactPx=25)
		const pn = makePixiNode("n1", 5);
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 25, 60),
		);
		// Tier 2 draws lineStyle + beginFill + shape commands + endFill
		expect(hasCommandType(g, "beginFill")).toBe(true);
		expect(hasCommandType(g, "endFill")).toBe(true);
		// No drawRect in tier 2 (that's tier 1)
		expect(hasCommandType(g, "drawRect")).toBe(false);
	});

	it("uses high-contrast stroke width 2 when isHighContrastMode returns true", () => {
		const host = makeRenderHost();
		(host as any).isHighContrastMode = () => true;
		const g = new CanvasGraphics();
		const pn = makePixiNode("n1", 5);
		renderSemanticZoomMode(
			host,
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 25, 60),
		);
		const lineStyleCmd = getCommands(g).find((c) => c.t === "lineStyle");
		expect((lineStyleCmd as any)?.width).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Tier 3: compact card (compactPx <= screenPx < fullPx)
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — tier 3 (compact card)", () => {
	it("draws a rounded rect for compact card tier", () => {
		const g = new CanvasGraphics();
		// radius=10, worldScale=2 → screenPx = 10*2*2 = 40, between compactPx=30 and fullPx=60
		const pn = makePixiNode("n1", 10);
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 30, 60),
		);
		expect(hasCommandType(g, "roundedRect")).toBe(true);
	});

	it("adds a card text child to node gfx", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n1", 10);
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 30, 60),
		);
		// A CanvasText label should have been added to pn.gfx
		const textChildren = pn.gfx.children.filter((c) => c instanceof CanvasText);
		expect(textChildren.length).toBeGreaterThan(0);
	});

	it("adds definition field text when defField is set on node", () => {
		const g = new CanvasGraphics();
		const host = makeRenderHost();
		(host as any).getDefinitionField = () => "category";
		const pn = makePixiNode("n1", 10);
		pn.data = { ...pn.data, meta: { category: "character" } };
		renderSemanticZoomMode(
			host,
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 30, 60),
		);
		const textChildren = pn.gfx.children.filter((c) => c instanceof CanvasText);
		// Should have both name text and definition text
		expect(textChildren.length).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// Tier 4: full card (screenPx >= fullPx)
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — tier 4 (full card)", () => {
	it("draws a rounded rect for full card tier", () => {
		const g = new CanvasGraphics();
		// radius=20, worldScale=2 → screenPx = 20*2*2 = 80 >= fullPx=60
		const pn = makePixiNode("n1", 20);
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 30, 60),
		);
		expect(hasCommandType(g, "roundedRect")).toBe(true);
		// Full card also draws header bar (second roundedRect)
		const rrCmds = getCommands(g).filter((c) => c.t === "roundedRect");
		expect(rrCmds.length).toBeGreaterThanOrEqual(2);
	});

	it("adds body preview text when bodyPreview is set", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n1", 20);
		pn.data = { ...pn.data, bodyPreview: "Some preview text here" };
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 30, 60),
		);
		const textChildren = pn.gfx.children.filter((c) => c instanceof CanvasText);
		// Should have name text + preview text (at minimum)
		expect(textChildren.length).toBeGreaterThanOrEqual(2);
	});

	it("handles minWorldRadius clamping effR", () => {
		const g = new CanvasGraphics();
		// radius=5 but minWorldRadius=20, so effR=20 → screenPx=20*2*2=80 → tier 4
		const pn = makePixiNode("n1", 5);
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 2,
				minWorldRadius: 20,
			},
			makeCRC(),
			makeRT(4, 30, 60),
		);
		expect(hasCommandType(g, "roundedRect")).toBe(true);
	});

	it("renders multiple nodes in different tiers simultaneously", () => {
		const g = new CanvasGraphics();
		// n1: radius=1, worldScale=1 → screenPx=2 → tier 1 (dot)
		// n2: radius=20, worldScale=1 → screenPx=40 → tier 3 (compact, dotPx=4, compactPx=25, fullPx=60)
		const n1 = makePixiNode("n1", 1);
		const n2 = makePixiNode("n2", 20);
		renderSemanticZoomMode(
			makeRenderHost(),
			g,
			{
				visible: [n1, n2],
				pixiNodes: new Map([["n1", n1], ["n2", n2]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 2,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			makeCRC(),
			makeRT(4, 25, 60),
		);
		// Both drawRect (tier 1) and drawRoundedRect (tier 3) should appear
		expect(hasCommandType(g, "drawRect")).toBe(true);
		expect(hasCommandType(g, "roundedRect")).toBe(true);
	});
});
