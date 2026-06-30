import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderSemanticZoomMode } from "../src/views/semantic-zoom-renderer";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";
import type { PixiNode } from "../src/views/InteractionManager";
import type { GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Helper mocks (mirrors tests/card-renderer.test.ts conventions)
// ---------------------------------------------------------------------------

function makePixiNode(id: string, overrides?: Partial<PixiNode>): PixiNode {
	return {
		data: {
			id,
			label: `Node ${id}`,
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
		} as unknown as GraphData,
		color: 0x3498db,
		radius: 10,
		gfx: new CanvasContainer(),
		...overrides,
	} as PixiNode;
}

function makeHost(overrides?: Record<string, unknown>) {
	return {
		getDefinitionField: vi.fn(() => ""),
		isHighContrastMode: vi.fn(() => false),
		getLabelColor: vi.fn(() => 0xffffff),
		...overrides,
	};
}

function makeGraphics() {
	return {
		lineStyle: vi.fn(),
		beginFill: vi.fn(),
		endFill: vi.fn(),
		drawRect: vi.fn(),
		drawRoundedRect: vi.fn(),
		drawCircle: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		closePath: vi.fn(),
	};
}

const crc: Record<string, number> = {
	filteredNodeAlpha: 0.3,
	strokeDarken: 0.2,
	strokeAlpha: 1,
	semanticCardFillAlpha: 0.8,
	cardSubTextAlpha: 0.7,
	semanticCardFullFillAlpha: 0.9,
	semanticCardHeaderHeightRatio: 0.5,
	semanticCardHeaderFillAlpha: 1,
	cardBodyPreviewAlpha: 0.6,
};

const rt: Record<string, number | boolean | string> = {
	semanticZoomDotPx: 2,
	semanticZoomCompactPx: 20,
	semanticZoomFullPx: 60,
	labelMaxChars: 30,
};

function baseCtx(visible: PixiNode[], worldScale: number) {
	return {
		visible,
		pixiNodes: new Map(visible.map((n) => [n.data.id, n])),
		tlFilteredOut: null as Set<string> | null,
		alpha: 1,
		nodeCount: visible.length,
		shapeRules: [{ match: "default" as const, shape: "circle" as const }],
		worldScale,
		minWorldRadius: 1,
	};
}

describe("renderSemanticZoomMode", () => {
	let host: ReturnType<typeof makeHost>;
	let g: ReturnType<typeof makeGraphics>;

	beforeEach(() => {
		host = makeHost();
		g = makeGraphics();
	});

	it("does nothing for an empty visible list", () => {
		expect(() => renderSemanticZoomMode(host as any, g as any, baseCtx([], 1), crc, rt)).not.toThrow();
		expect(g.beginFill).not.toHaveBeenCalled();
	});

	it("renders tier 1 (colored dot) for tiny screen px", () => {
		const node = makePixiNode("n1", { radius: 0.1 });
		// effR*2*worldScale must be < dotPx(=2)
		renderSemanticZoomMode(host as any, g as any, baseCtx([node], 0.1), crc, rt);
		expect(g.drawRect).toHaveBeenCalled();
		expect(g.beginFill).toHaveBeenCalledWith(node.color, 1);
	});

	it("renders tier 2 (circle + label) for small-but-visible screen px", () => {
		const node = makePixiNode("n2", { radius: 2 });
		// effR*2*worldScale = 4 -> between dotPx(2) and compactPx(20)
		renderSemanticZoomMode(host as any, g as any, baseCtx([node], 1), crc, rt);
		expect(g.drawCircle).toHaveBeenCalled();
		expect(g.lineStyle).toHaveBeenCalled();
	});

	it("renders tier 3 (compact card) for mid screen px and attaches card text", () => {
		const node = makePixiNode("n3", { radius: 8 });
		// effR*2*worldScale = 32 -> between compactPx(20) and fullPx(60)
		renderSemanticZoomMode(host as any, g as any, baseCtx([node], 2), crc, rt);
		expect(g.drawRoundedRect).toHaveBeenCalled();
		expect(node.gfx.children.length).toBeGreaterThan(0);
	});

	it("renders tier 4 (full card) for large screen px and attaches header + name", () => {
		const node = makePixiNode("n4", { radius: 20 });
		// effR*2*worldScale = 80 -> >= fullPx(60)
		renderSemanticZoomMode(host as any, g as any, baseCtx([node], 2), crc, rt);
		// header bar + card body both call drawRoundedRect (at least twice)
		expect((g.drawRoundedRect as any).mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(node.gfx.children.length).toBeGreaterThan(0);
	});

	it("includes a definition field text node in the compact card when present", () => {
		host = makeHost({ getDefinitionField: vi.fn(() => "def") });
		const node = makePixiNode("n5", {
			radius: 8,
			data: { id: "n5", label: "Node 5", x: 0, y: 0, vx: 0, vy: 0, meta: { def: "hello" } } as any,
		});
		renderSemanticZoomMode(host as any, g as any, baseCtx([node], 2), crc, rt);
		// name text + definition text
		expect(node.gfx.children.length).toBe(2);
	});

	it("includes a body preview text node in the full card when present", () => {
		const node = makePixiNode("n6", {
			radius: 20,
			data: { id: "n6", label: "Node 6", x: 0, y: 0, vx: 0, vy: 0, bodyPreview: "a preview" } as any,
		});
		renderSemanticZoomMode(host as any, g as any, baseCtx([node], 2), crc, rt);
		expect(node.gfx.children.length).toBeGreaterThanOrEqual(2);
	});

	it("reduces alpha for nodes filtered by the timeline filter", () => {
		const node = makePixiNode("n7", { radius: 0.1 });
		const ctx = baseCtx([node], 0.1);
		ctx.tlFilteredOut = new Set(["n7"]);
		renderSemanticZoomMode(host as any, g as any, ctx, crc, rt);
		expect(g.beginFill).toHaveBeenCalledWith(node.color, 1 * crc.filteredNodeAlpha);
	});

	it("does not reduce alpha for nodes not in the filtered-out set", () => {
		const node = makePixiNode("n8", { radius: 0.1 });
		const ctx = baseCtx([node], 0.1);
		ctx.tlFilteredOut = new Set(["other"]);
		renderSemanticZoomMode(host as any, g as any, ctx, crc, rt);
		expect(g.beginFill).toHaveBeenCalledWith(node.color, 1);
	});

	it("uses high contrast stroke width when host reports high contrast mode", () => {
		host = makeHost({ isHighContrastMode: vi.fn(() => true) });
		const node = makePixiNode("n9", { radius: 2 });
		renderSemanticZoomMode(host as any, g as any, baseCtx([node], 1), crc, rt);
		expect(g.lineStyle).toHaveBeenCalledWith(2, expect.anything(), expect.anything());
	});

	it("clamps effective radius to minWorldRadius", () => {
		const node = makePixiNode("n10", { radius: 0.001 });
		const ctx = baseCtx([node], 0.1);
		ctx.minWorldRadius = 5;
		// effR = max(0.001, 5) = 5 -> screenPx = 5*2*0.1 = 1 < dotPx(2) -> tier 1
		renderSemanticZoomMode(host as any, g as any, ctx, crc, rt);
		expect(g.drawRect).toHaveBeenCalled();
	});

	it("handles multiple nodes spanning different tiers in one call", () => {
		const dot = makePixiNode("d1", { radius: 0.1 });
		const card = makePixiNode("c1", { radius: 20 });
		renderSemanticZoomMode(host as any, g as any, baseCtx([dot, card], 0.5), crc, rt);
		expect(g.drawRect).toHaveBeenCalled();
		expect(g.drawRoundedRect).toHaveBeenCalled();
	});
});
