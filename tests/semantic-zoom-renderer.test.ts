/**
 * Tests for src/views/semantic-zoom-renderer.ts
 *
 * Tests the renderSemanticZoomMode function and its tier-selection logic.
 * The four tiers are determined by screen-space pixel size (effR * 2 * worldScale):
 *   Tier 1: screenPx < dotPx        → colored dot
 *   Tier 2: screenPx < compactPx    → circle + label
 *   Tier 3: screenPx < fullPx       → compact card
 *   Tier 4: screenPx >= fullPx      → full card
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderSemanticZoomMode } from "../src/views/semantic-zoom-renderer";
import type { PixiNode } from "../src/views/InteractionManager";
import type { RenderHost } from "../src/views/RenderPipeline";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";
import { CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGraphics(): any {
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

function makeGfxContainer(): any {
	const children: any[] = [];
	return {
		children,
		addChild: vi.fn((child: any) => {
			children.push(child);
			return child;
		}),
		removeChild: vi.fn((child: any) => {
			const idx = children.indexOf(child);
			if (idx >= 0) children.splice(idx, 1);
			return child;
		}),
	};
}

function makePixiNode(id: string = "n1", overrides?: Partial<PixiNode>): PixiNode {
	return {
		data: {
			id,
			label: `Node ${id}`,
			x: 10,
			y: 20,
			vx: 0,
			vy: 0,
		} as any,
		color: 0x3498db,
		radius: 10,
		gfx: makeGfxContainer(),
		circle: makeGraphics(),
		label: null,
		tagLabel: null,
		hoverLabel: null,
		leaderLine: null,
		held: false,
		sortRank: 0,
		priorityScore: 0,
		minShowZoom: 0,
		labelWasVisible: false,
		hoverForcedLabel: false,
		subLabels: [],
		...overrides,
	} as any as PixiNode;
}

function makeHost(overrides?: Partial<RenderHost>): any {
	return {
		getDefinitionField: vi.fn(() => ""),
		isHighContrastMode: vi.fn(() => false),
		getLabelColor: vi.fn(() => 0xffffff),
		...overrides,
	};
}

function makeCtx(nodes: PixiNode[], worldScale = 1, overrides?: object) {
	return {
		visible: nodes,
		pixiNodes: new Map(nodes.map((n) => [n.data.id, n])),
		tlFilteredOut: null as Set<string> | null,
		alpha: 1,
		nodeCount: nodes.length,
		shapeRules: [],
		worldScale,
		minWorldRadius: 5,
		...overrides,
	};
}

/** Default render thresholds used in tests */
const DEFAULT_RT: Record<string, number | boolean | string> = {
	semanticZoomDotPx: 4,
	semanticZoomCompactPx: 12,
	semanticZoomFullPx: 30,
	labelMaxChars: 20,
};

/**
 * Compute screenPx for a node:  effR = max(radius, minWorldRadius), screenPx = effR * 2 * worldScale
 *
 * Tier 1 (dot):         screenPx < dotPx      (< 4)
 * Tier 2 (circle):      screenPx < compactPx  (< 12)
 * Tier 3 (compact card):screenPx < fullPx     (< 30)
 * Tier 4 (full card):   screenPx >= fullPx    (>= 30)
 *
 * To force tier 1:  need effR * 2 * worldScale < 4
 *   → use radius=1, minWorldRadius=1, worldScale=1 → effR=1 → screenPx=2 < 4 ✓
 * To force tier 2:  screenPx in [4, 12)
 *   → use radius=3, minWorldRadius=1, worldScale=1 → effR=3 → screenPx=6 ∈ [4,12) ✓
 * To force tier 3:  screenPx in [12, 30)
 *   → use radius=8, minWorldRadius=1, worldScale=1 → effR=8 → screenPx=16 ∈ [12,30) ✓
 * To force tier 4:  screenPx >= 30
 *   → use radius=20, minWorldRadius=1, worldScale=1 → effR=20 → screenPx=40 >= 30 ✓
 */
const CTX_DEFAULTS = { minWorldRadius: 1 };

/** Default color render config */
const DEFAULT_CRC: Record<string, number> = {
	filteredNodeAlpha: 0.3,
	strokeDarken: 0.2,
	strokeAlpha: 0.8,
	semanticCardFillAlpha: 0.9,
	semanticCardFullFillAlpha: 0.95,
	semanticCardHeaderHeightRatio: 0.35,
	semanticCardHeaderFillAlpha: 1.0,
	cardSubTextAlpha: 0.7,
	cardBodyPreviewAlpha: 0.6,
};

// ---------------------------------------------------------------------------
// renderSemanticZoomMode — Tier 1: colored dot
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — Tier 1 (dot)", () => {
	it("draws a rect for each node when screenPx < dotPx", () => {
		// radius=1, minWorldRadius=1, worldScale=1 → effR=1, screenPx=2 < dotPx(4) → tier 1
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 1 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.drawRect).toHaveBeenCalledTimes(1);
	});

	it("uses node color for fill in tier 1", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 1, color: 0xff0000 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.beginFill).toHaveBeenCalledWith(0xff0000, expect.any(Number));
	});

	it("applies alpha 1 when node is not in tlFilteredOut", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 1 });
		const ctx = makeCtx([node], 1, { ...CTX_DEFAULTS, tlFilteredOut: new Set<string>(["other"]) });

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// Should be called with alpha = 1 (not filtered)
		expect(g.beginFill).toHaveBeenCalledWith(expect.any(Number), 1);
	});

	it("applies reduced alpha for nodes in tlFilteredOut", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 1 });
		const ctx = makeCtx([node], 1, { ...CTX_DEFAULTS, tlFilteredOut: new Set<string>(["n1"]), alpha: 1 });

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// filteredNodeAlpha = 0.3, so fill alpha should be 1 * 0.3 = 0.3
		expect(g.beginFill).toHaveBeenCalledWith(expect.any(Number), 0.3);
	});

	it("calls lineStyle(0) before drawing dot", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 1 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.lineStyle).toHaveBeenCalledWith(0);
	});

	it("calls endFill after drawing dot", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 1 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.endFill).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// renderSemanticZoomMode — Tier 2: circle + label
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — Tier 2 (circle + label)", () => {
	it("draws shape (no rect) for tier 2 nodes", () => {
		// radius=3, minWorldRadius=1, worldScale=1 → effR=3, screenPx=6 ∈ [4,12) → tier 2
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 3 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// In tier 2 a shape is drawn — drawRect should NOT be called
		expect(g.drawRect).not.toHaveBeenCalled();
	});

	it("sets lineStyle for stroke in tier 2", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 3 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// lineStyle(hcSem, strokeColor, strokeAlpha * nodeAlpha)
		expect(g.lineStyle).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number));
	});

	it("uses hcSem=2 in high contrast mode", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 3 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);
		const host = makeHost({ isHighContrastMode: vi.fn(() => true) });

		renderSemanticZoomMode(host, g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.lineStyle).toHaveBeenCalledWith(2, expect.any(Number), expect.any(Number));
	});

	it("uses hcSem=1 in normal mode", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 3 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);
		const host = makeHost({ isHighContrastMode: vi.fn(() => false) });

		renderSemanticZoomMode(host, g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.lineStyle).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number));
	});
});

// ---------------------------------------------------------------------------
// renderSemanticZoomMode — Tier 3: compact card
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — Tier 3 (compact card)", () => {
	it("draws a rounded rect for compact card", () => {
		// radius=8, minWorldRadius=1, worldScale=1 → effR=8, screenPx=16 ∈ [12,30) → tier 3
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 8 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.drawRoundedRect).toHaveBeenCalled();
	});

	it("does not draw a basic rect for tier 3 nodes", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 8 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.drawRect).not.toHaveBeenCalled();
	});

	it("adds name text child to node gfx container", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 8 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(node.gfx.addChild).toHaveBeenCalled();
	});

	it("adds definition field text when defField is set and node has that meta", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", {
			radius: 8,
			data: {
				id: "n1",
				label: "Node n1",
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				meta: { summary: "A brief summary" },
			} as any,
		});
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);
		const host = makeHost({ getDefinitionField: vi.fn(() => "summary") });

		renderSemanticZoomMode(host, g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// Two text children: name + def field
		expect(node.gfx.addChild).toHaveBeenCalledTimes(2);
	});

	it("only adds name text when defField is missing from node meta", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 8 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);
		const host = makeHost({ getDefinitionField: vi.fn(() => "summary") });

		renderSemanticZoomMode(host, g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// Only name text — no meta, no def field
		expect(node.gfx.addChild).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// renderSemanticZoomMode — Tier 4: full card
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — Tier 4 (full card)", () => {
	it("draws multiple rounded rects for full card (body + header bar)", () => {
		// radius=20, minWorldRadius=1, worldScale=1 → effR=20, screenPx=40 >= fullPx(30) → tier 4
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 20 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// Full card draws both body and header bar
		expect(g.drawRoundedRect).toHaveBeenCalledTimes(2);
	});

	it("adds name text to gfx container for full card", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 20 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(node.gfx.addChild).toHaveBeenCalled();
	});

	it("adds bodyPreview text when bodyPreview is present", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", {
			radius: 20,
			data: {
				id: "n1",
				label: "Node n1",
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				bodyPreview: "Some preview content",
			} as any,
		});
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// name + bodyPreview = 2 children
		expect(node.gfx.addChild).toHaveBeenCalledTimes(2);
	});

	it("adds def field + bodyPreview when both are present", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", {
			radius: 20,
			data: {
				id: "n1",
				label: "Node n1",
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				meta: { definition: "The main definition" },
				bodyPreview: "Some body content",
			} as any,
		});
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);
		const host = makeHost({ getDefinitionField: vi.fn(() => "definition") });

		renderSemanticZoomMode(host, g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// name + def + bodyPreview = 3 children
		expect(node.gfx.addChild).toHaveBeenCalledTimes(3);
	});
});

// ---------------------------------------------------------------------------
// renderSemanticZoomMode — minWorldRadius enforcement
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — minWorldRadius", () => {
	it("uses minWorldRadius when node radius is smaller", () => {
		// node.radius=1 but minWorldRadius=20 → effR=20
		// screenPx = 20*2*1 = 40, fullPx=30 → tier 4 (not tier 1!)
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 1 });
		const ctx = makeCtx([node], 1, { minWorldRadius: 20 });

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// Should be tier 4 due to minWorldRadius, not tier 1
		expect(g.drawRect).not.toHaveBeenCalled();
		// Full card draws 2 rounded rects (body + header)
		expect(g.drawRoundedRect).toHaveBeenCalledTimes(2);
	});

	it("uses node radius when it exceeds minWorldRadius", () => {
		// node.radius=20, minWorldRadius=1 → effR=20 → screenPx=40 → tier 4
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 20 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.drawRoundedRect).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// renderSemanticZoomMode — multiple nodes, mixed tiers
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — multiple nodes", () => {
	it("handles an empty visible array without error", () => {
		const g = makeGraphics();
		const ctx = makeCtx([], 1, CTX_DEFAULTS);

		expect(() => renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT)).not.toThrow();
	});

	it("processes all nodes in the visible array", () => {
		const g = makeGraphics();
		// 3 nodes in different tiers (minWorldRadius=1 to prevent tier shift)
		const n1 = makePixiNode("n1", { radius: 1 }); // effR=1, screenPx=2 → tier 1
		const n2 = makePixiNode("n2", { radius: 3 }); // effR=3, screenPx=6 → tier 2
		const n3 = makePixiNode("n3", { radius: 8 }); // effR=8, screenPx=16 → tier 3
		const ctx = makeCtx([n1, n2, n3], 1, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// Tier 1 draws a rect, tier 3 draws a rounded rect
		expect(g.drawRect).toHaveBeenCalledTimes(1);
		expect(g.drawRoundedRect).toHaveBeenCalledTimes(1);
	});

	it("respects worldScale when determining tier", () => {
		// node.radius=3, minWorldRadius=1, worldScale=5 → effR=3, screenPx=30 >= fullPx(30) → tier 4
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 3 });
		const ctx = makeCtx([node], 5, CTX_DEFAULTS);

		renderSemanticZoomMode(makeHost(), g, ctx, DEFAULT_CRC, DEFAULT_RT);

		// Tier 4 draws 2 rounded rects
		expect(g.drawRoundedRect).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// renderSemanticZoomMode — host without optional methods
// ---------------------------------------------------------------------------

describe("renderSemanticZoomMode — host optional methods", () => {
	it("uses empty string for defField when getDefinitionField is absent", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 8 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);
		// host without getDefinitionField
		const host = { getLabelColor: vi.fn(() => 0xffffff) } as any;

		expect(() => renderSemanticZoomMode(host, g, ctx, DEFAULT_CRC, DEFAULT_RT)).not.toThrow();
	});

	it("uses hcSem=1 when isHighContrastMode is absent", () => {
		const g = makeGraphics();
		const node = makePixiNode("n1", { radius: 3 });
		const ctx = makeCtx([node], 1, CTX_DEFAULTS);
		const host = { getLabelColor: vi.fn(() => 0xffffff) } as any;

		renderSemanticZoomMode(host, g, ctx, DEFAULT_CRC, DEFAULT_RT);

		expect(g.lineStyle).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number));
	});
});
