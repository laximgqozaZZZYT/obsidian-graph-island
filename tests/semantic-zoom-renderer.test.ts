/**
 * Unit tests for src/views/semantic-zoom-renderer.ts
 *
 * Validates all four LOD tiers of renderSemanticZoomMode:
 *   Tier 1: colored dot  (screenPx < dotPx)
 *   Tier 2: circle+label (dotPx ≤ screenPx < compactPx)
 *   Tier 3: compact card (compactPx ≤ screenPx < fullPx)
 *   Tier 4: full card    (screenPx ≥ fullPx)
 *
 * CanvasGraphics is a real command-buffer implementation (no canvas required),
 * so commands can be inspected without a DOM.
 */
import { describe, it, expect } from "vitest";
import { renderSemanticZoomMode } from "../src/views/semantic-zoom-renderer";
import { CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";
import type { RenderHost } from "../src/views/RenderPipeline";
import type { PixiNode } from "../src/views/InteractionManager";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHost(overrides: Partial<RenderHost> = {}): RenderHost {
	return {
		getLabelColor: () => 0xffffff,
		getDefinitionField: () => "",
		isHighContrastMode: () => false,
		// Remaining interface members — never reached by renderSemanticZoomMode
		...overrides,
	} as unknown as RenderHost;
}

function makePixiNode(id: string, x = 0, y = 0, radius = 5): PixiNode {
	return {
		data: {
			id,
			label: id,
			x,
			y,
			vx: 0,
			vy: 0,
		} as GraphNode,
		gfx: new CanvasContainer(),
		circle: new CanvasGraphics(),
		label: null,
		tagLabel: null,
		hoverLabel: null,
		leaderLine: null,
		radius,
		color: 0x3498db,
		held: false,
		sortRank: -1,
		priorityScore: 0,
		minShowZoom: 0,
		labelWasVisible: false,
		hoverForcedLabel: false,
		subLabels: [],
	} as unknown as PixiNode;
}

// rt thresholds: dotPx=5, compactPx=15, fullPx=50
const baseRt = {
	semanticZoomDotPx: 5,
	semanticZoomCompactPx: 15,
	semanticZoomFullPx: 50,
	labelMaxChars: 20,
};

// crc rendering config
const baseCrc = {
	filteredNodeAlpha: 0.3,
	strokeDarken: 0.2,
	strokeAlpha: 0.8,
	semanticCardFillAlpha: 0.9,
	semanticCardFullFillAlpha: 0.85,
	semanticCardHeaderHeightRatio: 0.4,
	semanticCardHeaderFillAlpha: 1.0,
	cardSubTextAlpha: 0.7,
	cardBodyPreviewAlpha: 0.5,
};

function getCommands(g: CanvasGraphics): Array<{ t: string; [k: string]: unknown }> {
	return (g as unknown as { commands: Array<{ t: string }> }).commands;
}

// ---------------------------------------------------------------------------
// Tier 1: colored dot (screenPx < dotPx)
// ---------------------------------------------------------------------------
describe("renderSemanticZoomMode — tier 1: dot", () => {
	it("emits drawRect for a tiny node (screenPx < dotPx)", () => {
		const g = new CanvasGraphics();
		// radius=1, worldScale=1 → screenPx = 1*2*1 = 2 < dotPx=5
		const pn = makePixiNode("n1", 10, 20, 1);
		renderSemanticZoomMode(
			makeHost(),
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
			baseCrc,
			baseRt,
		);
		const cmds = getCommands(g);
		expect(cmds.some((c) => c.t === "drawRect")).toBe(true);
	});

	it("applies filteredNodeAlpha when node is in tlFilteredOut", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n1", 0, 0, 1);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n1", pn]]),
				tlFilteredOut: new Set(["n1"]),
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		const fillCmd = getCommands(g).find((c) => c.t === "beginFill");
		// alpha should be filteredNodeAlpha (0.3), not 1
		expect(fillCmd).toBeDefined();
		expect((fillCmd as { alpha: number }).alpha).toBeCloseTo(baseCrc.filteredNodeAlpha);
	});

	it("does not add card text children for tier-1 nodes", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n1", 0, 0, 1);
		renderSemanticZoomMode(
			makeHost(),
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
			baseCrc,
			baseRt,
		);
		expect(pn.gfx.children.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Tier 2: circle + label (dotPx ≤ screenPx < compactPx)
// ---------------------------------------------------------------------------
describe("renderSemanticZoomMode — tier 2: circle+label", () => {
	it("emits a lineStyle command (not drawRect) for a medium node", () => {
		const g = new CanvasGraphics();
		// radius=5, worldScale=1 → screenPx=10 → 5 ≤ 10 < 15
		const pn = makePixiNode("n2", 0, 0, 5);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n2", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		const cmds = getCommands(g);
		expect(cmds.some((c) => c.t === "lineStyle")).toBe(true);
		expect(cmds.some((c) => c.t === "drawRect")).toBe(false);
	});

	it("does not add card text children for tier-2 nodes", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n2", 0, 0, 5);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n2", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		expect(pn.gfx.children.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Tier 3: compact card (compactPx ≤ screenPx < fullPx)
// ---------------------------------------------------------------------------
describe("renderSemanticZoomMode — tier 3: compact card", () => {
	it("emits a roundedRect command for a compact-card node", () => {
		const g = new CanvasGraphics();
		// radius=9, worldScale=1 → screenPx=18 → 15 ≤ 18 < 50
		const pn = makePixiNode("n3", 0, 0, 9);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n3", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		const cmds = getCommands(g);
		expect(cmds.some((c) => c.t === "roundedRect")).toBe(true);
		expect(cmds.some((c) => c.t === "drawRect")).toBe(false);
	});

	it("adds at least one card text child for tier-3 nodes", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n3", 0, 0, 9);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n3", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		// Name text should be added as a child
		expect(pn.gfx.children.length).toBeGreaterThanOrEqual(1);
	});

	it("high contrast mode doubles the stroke width (hcSem=2)", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n3hc", 0, 0, 9);
		renderSemanticZoomMode(
			makeHost({ isHighContrastMode: () => true }),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n3hc", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		const lineCmd = getCommands(g).find((c) => c.t === "lineStyle") as { width: number } | undefined;
		expect(lineCmd?.width).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Tier 4: full card (screenPx ≥ fullPx)
// ---------------------------------------------------------------------------
describe("renderSemanticZoomMode — tier 4: full card", () => {
	it("emits multiple roundedRect commands (card body + header bar)", () => {
		const g = new CanvasGraphics();
		// radius=30, worldScale=1 → screenPx=60 ≥ fullPx=50
		const pn = makePixiNode("n4", 0, 0, 30);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n4", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		const roundedRects = getCommands(g).filter((c) => c.t === "roundedRect");
		// Body card + header bar = 2 rounded rects
		expect(roundedRects.length).toBeGreaterThanOrEqual(2);
	});

	it("adds name text child for tier-4 nodes", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n4", 0, 0, 30);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n4", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		expect(pn.gfx.children.length).toBeGreaterThanOrEqual(1);
	});

	it("adds definition-field subtext when defField is set on node meta", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n4def", 0, 0, 30);
		(pn.data as GraphNode & { meta: Record<string, string> }).meta = { definition: "A test node" };
		renderSemanticZoomMode(
			makeHost({ getDefinitionField: () => "definition" }),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n4def", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		// Name text + definition text = at least 2 children
		expect(pn.gfx.children.length).toBeGreaterThanOrEqual(2);
	});

	it("adds body-preview text when bodyPreview is set", () => {
		const g = new CanvasGraphics();
		const pn = makePixiNode("n4preview", 0, 0, 30);
		(pn.data as GraphNode & { bodyPreview: string }).bodyPreview = "Preview content here";
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["n4preview", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		// Name text + body preview text = at least 2 children
		expect(pn.gfx.children.length).toBeGreaterThanOrEqual(2);
	});
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe("renderSemanticZoomMode — edge cases", () => {
	it("handles empty visible list without errors", () => {
		const g = new CanvasGraphics();
		expect(() =>
			renderSemanticZoomMode(
				makeHost(),
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
				baseCrc,
				baseRt,
			),
		).not.toThrow();
		expect(getCommands(g).length).toBe(0);
	});

	it("minWorldRadius is applied when node radius is below it", () => {
		const g = new CanvasGraphics();
		// radius=0.1, minWorldRadius=8 → effR=8, screenPx=16 → tier 3
		const pn = makePixiNode("nmin", 0, 0, 0.1);
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn],
				pixiNodes: new Map([["nmin", pn]]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 1,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 8,
			},
			baseCrc,
			baseRt,
		);
		const cmds = getCommands(g);
		expect(cmds.some((c) => c.t === "roundedRect")).toBe(true);
	});

	it("renders multiple visible nodes without interference", () => {
		const g = new CanvasGraphics();
		const pn1 = makePixiNode("a", -50, 0, 1); // tier 1
		const pn2 = makePixiNode("b", 50, 0, 5); // tier 2
		renderSemanticZoomMode(
			makeHost(),
			g,
			{
				visible: [pn1, pn2],
				pixiNodes: new Map([
					["a", pn1],
					["b", pn2],
				]),
				tlFilteredOut: null,
				alpha: 1,
				nodeCount: 2,
				shapeRules: [],
				worldScale: 1,
				minWorldRadius: 0,
			},
			baseCrc,
			baseRt,
		);
		const cmds = getCommands(g);
		expect(cmds.some((c) => c.t === "drawRect")).toBe(true);
		expect(cmds.some((c) => c.t === "lineStyle")).toBe(true);
	});
});
