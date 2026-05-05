/**
 * Unit tests for src/views/semantic-zoom-renderer.ts
 *
 * Uses a minimal mock for the CanvasGraphics drawing commands and a
 * lightweight RenderHost stub so we can exercise all four LOD tiers
 * without a real canvas or Obsidian environment.
 */
import { describe, it, expect, vi } from "vitest";
import { renderSemanticZoomMode } from "../src/views/semantic-zoom-renderer";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";
import type { PixiNode } from "../src/views/InteractionManager";
import type { RenderHost } from "../src/views/RenderPipeline";

// ---------------------------------------------------------------------------
// Mock factory: graphics context
// ---------------------------------------------------------------------------

function mkGfx() {
	return {
		lineStyle: vi.fn(),
		beginFill: vi.fn(),
		endFill: vi.fn(),
		drawRect: vi.fn(),
		drawCircle: vi.fn(),
		drawRoundedRect: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		arc: vi.fn(),
	} as unknown as import("../src/views/canvas2d/CanvasGraphics").CanvasGraphics;
}

// ---------------------------------------------------------------------------
// Mock factory: RenderHost (only the methods used by semantic-zoom-renderer)
// ---------------------------------------------------------------------------

function mkHost(defField = "", hiContrast = false, labelColor = 0xffffff): RenderHost {
	return {
		getDefinitionField: vi.fn().mockReturnValue(defField),
		isHighContrastMode: vi.fn().mockReturnValue(hiContrast),
		getLabelColor: vi.fn().mockReturnValue(labelColor),
	} as unknown as RenderHost;
}

// ---------------------------------------------------------------------------
// Mock factory: PixiNode
// ---------------------------------------------------------------------------

function mkPixiNode(id: string, radius: number, overrides: Partial<PixiNode["data"]> = {}): PixiNode {
	return {
		data: {
			id,
			label: `Node ${id}`,
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			meta: {},
			...overrides,
		} as PixiNode["data"],
		color: 0x3498db,
		radius,
		gfx: new CanvasContainer(),
		circle: mkGfx() as any,
		label: null,
		tagLabel: null,
		hoverLabel: null,
		leaderLine: null,
		held: false,
		sortRank: 0,
		priorityScore: 0,
	};
}

// ---------------------------------------------------------------------------
// Shared render context values
// ---------------------------------------------------------------------------

const BASE_CRC: Record<string, number> = {
	filteredNodeAlpha: 0.3,
	strokeDarken: 0.4,
	strokeAlpha: 0.7,
	semanticCardFillAlpha: 0.85,
	semanticCardFullFillAlpha: 0.9,
	semanticCardHeaderFillAlpha: 0.95,
	semanticCardHeaderHeightRatio: 0.4,
	cardSubTextAlpha: 0.75,
	cardBodyPreviewAlpha: 0.6,
};

const BASE_RT: Record<string, number | boolean | string> = {
	semanticZoomDotPx: 5,
	semanticZoomCompactPx: 40,
	semanticZoomFullPx: 80,
	labelMaxChars: 32,
};

// ---------------------------------------------------------------------------
// Helpers to build the ctx argument
// ---------------------------------------------------------------------------

function mkCtx(nodes: PixiNode[], worldScale = 1, minWorldRadius = 0, extra: Partial<Parameters<typeof renderSemanticZoomMode>[2]> = {}) {
	return {
		visible: nodes,
		pixiNodes: new Map(nodes.map((n) => [n.data.id, n])),
		tlFilteredOut: null,
		alpha: 1,
		nodeCount: nodes.length,
		shapeRules: [],
		worldScale,
		minWorldRadius,
		...extra,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — Tier 1: dot (screenPx < dotPx)", () => {
	it("draws a rect for very small nodes and calls no label helpers", () => {
		const host = mkHost();
		const g = mkGfx();
		// radius=2, worldScale=1 → screenPx=4 < dotPx=5
		const node = mkPixiNode("n1", 2);
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		expect(g.drawRect).toHaveBeenCalledOnce();
		// No rounded-rect calls (those belong to Tiers 3 & 4)
		expect(g.drawRoundedRect).not.toHaveBeenCalled();
		expect(g.beginFill).toHaveBeenCalled();
		expect(g.endFill).toHaveBeenCalled();
	});

	it("applies reduced alpha when node is in tlFilteredOut set", () => {
		const host = mkHost();
		const g = mkGfx();
		const node = mkPixiNode("n1", 2);
		const tlFilteredOut = new Set(["n1"]);
		renderSemanticZoomMode(host, g, mkCtx([node], 1, 0, { tlFilteredOut, alpha: 1 }), BASE_CRC, BASE_RT);

		const call = (g.beginFill as ReturnType<typeof vi.fn>).mock.calls[0];
		// nodeAlpha = 1 * filteredNodeAlpha(0.3) = 0.3
		expect(call[1]).toBeCloseTo(0.3, 5);
	});
});

describe("renderSemanticZoomMode — Tier 2: circle + label (dotPx ≤ screenPx < compactPx)", () => {
	it("draws a shape for mid-sized nodes", () => {
		const host = mkHost();
		const g = mkGfx();
		// radius=10, worldScale=1 → screenPx=20; dotPx=5, compactPx=40
		const node = mkPixiNode("n1", 10);
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		// drawCircle is invoked by drawShapeAt (default "circle" shape)
		expect(g.drawCircle).toHaveBeenCalledOnce();
		expect(g.drawRoundedRect).not.toHaveBeenCalled();
	});

	it("applies high-contrast line width of 2 when isHighContrastMode is true", () => {
		const host = mkHost("", true);
		const g = mkGfx();
		const node = mkPixiNode("n1", 10);
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		const lineStyleCalls = (g.lineStyle as ReturnType<typeof vi.fn>).mock.calls;
		const strokeCall = lineStyleCalls.find((c: unknown[]) => c[0] === 2);
		expect(strokeCall).toBeTruthy();
	});
});

describe("renderSemanticZoomMode — Tier 3: compact card (compactPx ≤ screenPx < fullPx)", () => {
	it("draws a rounded card rect for medium nodes", () => {
		const host = mkHost();
		const g = mkGfx();
		// radius=25, worldScale=1 → screenPx=50; compactPx=40, fullPx=80
		const node = mkPixiNode("n1", 25);
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		expect(g.drawRoundedRect).toHaveBeenCalled();
		// Name text must have been added to gfx
		expect(node.gfx.children.length).toBeGreaterThan(0);
	});

	it("adds definition sub-text when defField is set on node meta", () => {
		const host = mkHost("category");
		const g = mkGfx();
		const node = mkPixiNode("n1", 25, { meta: { category: "Character" } });
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		// Should have 2 card text children: name + definition
		expect(node.gfx.children.length).toBe(2);
	});

	it("adds only name text when node has no meta value for defField", () => {
		const host = mkHost("category");
		const g = mkGfx();
		const node = mkPixiNode("n1", 25, { meta: {} });
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		expect(node.gfx.children.length).toBe(1);
	});
});

describe("renderSemanticZoomMode — Tier 4: full card (screenPx ≥ fullPx)", () => {
	it("draws card and header bar for large nodes", () => {
		const host = mkHost();
		const g = mkGfx();
		// radius=50, worldScale=1 → screenPx=100; fullPx=80
		const node = mkPixiNode("n1", 50);
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		// Full card calls drawRoundedRect at least twice (outer + header bar)
		expect((g.drawRoundedRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(node.gfx.children.length).toBeGreaterThan(0);
	});

	it("adds definition text in header when defField meta value is present", () => {
		const host = mkHost("desc");
		const g = mkGfx();
		const node = mkPixiNode("n1", 50, { meta: { desc: "A hero" } });
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		// name + def texts
		expect(node.gfx.children.length).toBeGreaterThanOrEqual(2);
	});

	it("adds body preview text when bodyPreview is set on node data", () => {
		const host = mkHost();
		const g = mkGfx();
		const node = mkPixiNode("n1", 50, { bodyPreview: "Once upon a time…" });
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		// name + bodyPreview
		expect(node.gfx.children.length).toBeGreaterThanOrEqual(2);
	});

	it("adds all three texts when defField and bodyPreview are both set", () => {
		const host = mkHost("summary");
		const g = mkGfx();
		const node = mkPixiNode("n1", 50, { meta: { summary: "Short" }, bodyPreview: "Long preview" });
		renderSemanticZoomMode(host, g, mkCtx([node], 1), BASE_CRC, BASE_RT);

		expect(node.gfx.children.length).toBe(3);
	});
});

describe("renderSemanticZoomMode — multiple nodes", () => {
	it("processes all visible nodes in a single call", () => {
		const host = mkHost();
		const g = mkGfx();
		const nodes = [
			mkPixiNode("dot", 2),       // Tier 1
			mkPixiNode("circle", 10),   // Tier 2
			mkPixiNode("compact", 25),  // Tier 3
			mkPixiNode("full", 50),     // Tier 4
		];
		renderSemanticZoomMode(host, g, mkCtx(nodes, 1), BASE_CRC, BASE_RT);

		expect(g.drawRect).toHaveBeenCalledOnce(); // dot tier
		expect(g.drawCircle).toHaveBeenCalledOnce(); // circle tier
		// compact + full each call drawRoundedRect
		expect((g.drawRoundedRect as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it("uses minWorldRadius as effective radius floor", () => {
		const host = mkHost();
		const g = mkGfx();
		// radius=0 but minWorldRadius=30, worldScale=1 → screenPx=60 (Tier 3)
		const node = mkPixiNode("n1", 0);
		renderSemanticZoomMode(host, g, mkCtx([node], 1, 30), BASE_CRC, BASE_RT);

		expect(g.drawRoundedRect).toHaveBeenCalled();
	});
});
