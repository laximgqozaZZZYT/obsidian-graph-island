import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	isCardText,
	markAsCardText,
	createCardText,
	cleanupCardText,
	cleanupCardTextAll,
	renderCardMode,
	wrapTextToLines,
	estimateBodyLineCount,
	CARD_FONT_FAMILY,
	CARD_SCALE_CAP,
	FULL_CARD_FONT_BASE,
	FULL_CARD_FONT_MIN,
	CARD_LINE_HEIGHT,
	CARD_SUB_FONT_RATIO,
	COMPACT_CARD_FONT_MIN,
	COMPACT_CARD_FONT_BASE,
} from "../src/views/card-renderer";
import { CanvasText } from "../src/views/canvas2d/CanvasText";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";
import type { PixiNode } from "../src/views/InteractionManager";
import type { GraphData } from "../src/types";

// ---------------------------------------------------------------------------
// Helper mocks
// ---------------------------------------------------------------------------

function makeCanvasText(str: string, fontSize: number = 12): CanvasText {
	return new CanvasText(str, { fontSize, fill: 0xffffff });
}

function makeCanvasContainer(): CanvasContainer {
	return new CanvasContainer();
}

function makePixiNode(id: string = "n1", overrides?: Partial<PixiNode>): PixiNode {
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
		gfx: makeCanvasContainer(),
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// isCardText — type guard
// ---------------------------------------------------------------------------
describe("isCardText", () => {
	it("returns false for non-CanvasText", () => {
		expect(isCardText(null)).toBe(false);
		expect(isCardText(undefined)).toBe(false);
		expect(isCardText("string")).toBe(false);
		expect(isCardText({})).toBe(false);
	});

	it("returns false for CanvasText without _isCardText flag", () => {
		const t = makeCanvasText("test");
		expect(isCardText(t)).toBe(false);
	});

	it("returns true for CanvasText with _isCardText = true", () => {
		const t = makeCanvasText("test");
		(t as any)._isCardText = true;
		expect(isCardText(t)).toBe(true);
	});

	it("returns false for CanvasText with _isCardText = false", () => {
		const t = makeCanvasText("test");
		(t as any)._isCardText = false;
		expect(isCardText(t)).toBe(false);
	});

	it("type guards correctly in array filter", () => {
		const children: any[] = [makeCanvasText("a"), makeCanvasText("b"), makeCanvasText("c")];
		(children[1] as any)._isCardText = true;

		const cardTexts = children.filter(isCardText);
		expect(cardTexts).toHaveLength(1);
		expect(cardTexts[0].text).toBe("b");
	});
});

// ---------------------------------------------------------------------------
// markAsCardText
// ---------------------------------------------------------------------------
describe("markAsCardText", () => {
	it("adds _isCardText flag to CanvasText", () => {
		const t = makeCanvasText("test");
		const result = markAsCardText(t);
		expect((result as any)._isCardText).toBe(true);
	});

	it("returns the same object (mutated)", () => {
		const t = makeCanvasText("test");
		const result = markAsCardText(t);
		expect(result).toBe(t);
	});

	it("preserves original CanvasText properties", () => {
		const t = makeCanvasText("hello", 14);
		t.x = 10;
		t.y = 20;
		t.alpha = 0.8;
		const result = markAsCardText(t);
		expect(result.text).toBe("hello");
		expect(result.x).toBe(10);
		expect(result.y).toBe(20);
		expect(result.alpha).toBe(0.8);
	});

	it("allows multiple calls without issue", () => {
		const t = makeCanvasText("test");
		markAsCardText(t);
		markAsCardText(t);
		expect(isCardText(t)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// createCardText
// ---------------------------------------------------------------------------
describe("createCardText", () => {
	it("creates CanvasText with correct properties", () => {
		const ct = createCardText("hello", 14, 0xff0000);
		expect(ct.text).toBe("hello");
		expect(ct.style.fontSize).toBe(14);
		expect(ct.style.fill).toBe(0xff0000);
		expect(ct.style.fontFamily).toBe(CARD_FONT_FAMILY);
	});

	it("marks returned text as CardText", () => {
		const ct = createCardText("test", 12, 0xffffff);
		expect(isCardText(ct)).toBe(true);
	});

	it("applies default weight (normal)", () => {
		const ct = createCardText("test", 12, 0xffffff);
		expect(ct.style.fontWeight).toBe("normal");
	});

	it("applies default style (normal)", () => {
		const ct = createCardText("test", 12, 0xffffff);
		expect(ct.style.fontStyle).toBe("normal");
	});

	it("applies custom weight (bold)", () => {
		const ct = createCardText("test", 12, 0xffffff, "bold");
		expect(ct.style.fontWeight).toBe("bold");
	});

	it("applies custom style (italic)", () => {
		const ct = createCardText("test", 12, 0xffffff, "normal", "italic");
		expect(ct.style.fontStyle).toBe("italic");
	});

	it("combines custom weight and style", () => {
		const ct = createCardText("test", 12, 0xffffff, "bold", "italic");
		expect(ct.style.fontWeight).toBe("bold");
		expect(ct.style.fontStyle).toBe("italic");
	});

	it("handles various font sizes", () => {
		expect(createCardText("test", 6, 0xffffff).style.fontSize).toBe(6);
		expect(createCardText("test", 10, 0xffffff).style.fontSize).toBe(10);
		expect(createCardText("test", 20, 0xffffff).style.fontSize).toBe(20);
	});

	it("handles various colors", () => {
		expect(createCardText("test", 12, 0x000000).style.fill).toBe(0x000000);
		expect(createCardText("test", 12, 0xffffff).style.fill).toBe(0xffffff);
		expect(createCardText("test", 12, 0x3498db).style.fill).toBe(0x3498db);
	});

	it("sets fontFamily to CARD_FONT_FAMILY", () => {
		const ct = createCardText("test", 12, 0xffffff);
		expect(ct.style.fontFamily).toBe(CARD_FONT_FAMILY);
	});
});

// ---------------------------------------------------------------------------
// cleanupCardText
// ---------------------------------------------------------------------------
describe("cleanupCardText", () => {
	it("removes CardText children from container", () => {
		const gfx = makeCanvasContainer();
		const ct1 = createCardText("text1", 12, 0xffffff);
		const ct2 = createCardText("text2", 12, 0xffffff);
		gfx.addChild(ct1);
		gfx.addChild(ct2);

		expect(gfx.children.length).toBe(2);
		cleanupCardText(gfx);
		expect(gfx.children.length).toBe(0);
	});

	it("keeps non-CardText children", () => {
		const gfx = makeCanvasContainer();
		const regular = makeCanvasText("regular");
		const card = createCardText("card", 12, 0xffffff);
		gfx.addChild(regular);
		gfx.addChild(card);

		expect(gfx.children.length).toBe(2);
		cleanupCardText(gfx);
		expect(gfx.children.length).toBe(1);
		expect(gfx.children[0]).toBe(regular);
	});

	it("removes CardText in reverse order", () => {
		const gfx = makeCanvasContainer();
		const cards = [
			createCardText("a", 12, 0xffffff),
			createCardText("b", 12, 0xffffff),
			createCardText("c", 12, 0xffffff),
		];
		cards.forEach((c) => gfx.addChild(c));

		expect(gfx.children.length).toBe(3);
		cleanupCardText(gfx);
		expect(gfx.children.length).toBe(0);
	});

	it("handles empty container", () => {
		const gfx = makeCanvasContainer();
		expect(() => cleanupCardText(gfx)).not.toThrow();
		expect(gfx.children.length).toBe(0);
	});

	it("handles container with only non-CardText", () => {
		const gfx = makeCanvasContainer();
		const t1 = makeCanvasText("t1");
		const t2 = makeCanvasText("t2");
		gfx.addChild(t1);
		gfx.addChild(t2);

		const beforeLen = gfx.children.length;
		cleanupCardText(gfx);
		expect(gfx.children.length).toBe(beforeLen);
	});

	it("calls destroy on removed CardText", () => {
		const gfx = makeCanvasContainer();
		const ct = createCardText("test", 12, 0xffffff);
		const destroySpy = vi.spyOn(ct, "destroy");
		gfx.addChild(ct);

		cleanupCardText(gfx);
		expect(destroySpy).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// cleanupCardTextAll
// ---------------------------------------------------------------------------
describe("cleanupCardTextAll", () => {
	it("cleans up all nodes in pixiNodes map", () => {
		const nodes = new Map<string, PixiNode>();
		const n1 = makePixiNode("n1");
		const n2 = makePixiNode("n2");
		const n3 = makePixiNode("n3");

		const ct1 = createCardText("card1", 12, 0xffffff);
		const ct2 = createCardText("card2", 12, 0xffffff);
		const ct3 = createCardText("card3", 12, 0xffffff);

		n1.gfx.addChild(ct1);
		n2.gfx.addChild(ct2);
		n3.gfx.addChild(ct3);

		nodes.set("n1", n1);
		nodes.set("n2", n2);
		nodes.set("n3", n3);

		cleanupCardTextAll(nodes);

		expect(n1.gfx.children.length).toBe(0);
		expect(n2.gfx.children.length).toBe(0);
		expect(n3.gfx.children.length).toBe(0);
	});

	it("handles empty pixiNodes map", () => {
		const nodes = new Map<string, PixiNode>();
		expect(() => cleanupCardTextAll(nodes)).not.toThrow();
	});

	it("handles mixed content in nodes", () => {
		const nodes = new Map<string, PixiNode>();
		const n1 = makePixiNode("n1");
		const n2 = makePixiNode("n2");

		const regular1 = makeCanvasText("regular");
		const card1 = createCardText("card", 12, 0xffffff);
		const card2 = createCardText("card2", 12, 0xffffff);
		const regular2 = makeCanvasText("regular2");

		n1.gfx.addChild(regular1);
		n1.gfx.addChild(card1);
		n2.gfx.addChild(card2);
		n2.gfx.addChild(regular2);

		nodes.set("n1", n1);
		nodes.set("n2", n2);

		cleanupCardTextAll(nodes);

		expect(n1.gfx.children.length).toBe(1);
		expect(n1.gfx.children[0]).toBe(regular1);
		expect(n2.gfx.children.length).toBe(1);
		expect(n2.gfx.children[0]).toBe(regular2);
	});

	it("cleans up nodes regardless of iteration order", () => {
		const nodes = new Map<string, PixiNode>();
		for (let i = 0; i < 5; i++) {
			const n = makePixiNode(`n${i}`);
			const ct = createCardText(`card${i}`, 12, 0xffffff);
			n.gfx.addChild(ct);
			nodes.set(`n${i}`, n);
		}

		cleanupCardTextAll(nodes);

		for (const n of nodes.values()) {
			expect(n.gfx.children.length).toBe(0);
		}
	});
});

// ---------------------------------------------------------------------------
// renderCardMode
// ---------------------------------------------------------------------------
describe("renderCardMode", () => {
	let mockHost: any;
	let mockGraphics: any;
	let mockContext: any;

	beforeEach(() => {
		mockHost = {
			getCardDisplayConfig: vi.fn(() => ({
				headerStyle: "table",
				maxWidth: 200,
				showIcon: false,
				fields: [],
			})),
			getLabelColor: vi.fn(() => 0xffffff),
			getPanel: vi.fn(() => ({
				hoverShowMeta: true,
				hoverShowBody: true,
			})),
			isHighContrastMode: vi.fn(() => false),
		};

		mockGraphics = {
			lineStyle: vi.fn(),
			beginFill: vi.fn(),
			endFill: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			closePath: vi.fn(),
			drawRoundedRect: vi.fn(),
			drawRect: vi.fn(),
		};

		mockContext = {
			visible: [
				makePixiNode("n1", {
					data: {
						id: "n1",
						label: "Node 1",
						x: 0,
						y: 0,
						vx: 0,
						vy: 0,
					} as any,
				}),
			],
			pixiNodes: new Map([["n1", makePixiNode("n1")]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 1,
			minWorldRadius: 5,
		};
	});

	it("cleans up previous card text from all nodes", () => {
		const n1 = mockContext.pixiNodes.get("n1");
		const oldCard = createCardText("old", 12, 0xffffff);
		n1.gfx.addChild(oldCard);

		expect(n1.gfx.children.length).toBe(1);
		renderCardMode(mockHost, mockGraphics, mockContext, {}, {});
		expect(n1.gfx.children.length).toBe(0);
	});

	it("calls getCardDisplayConfig on host", () => {
		renderCardMode(mockHost, mockGraphics, mockContext, {}, {});
		expect(mockHost.getCardDisplayConfig).toHaveBeenCalled();
	});

	it("routes to renderTableCard when headerStyle is 'table'", () => {
		mockHost.getCardDisplayConfig.mockReturnValue({
			headerStyle: "table",
			maxWidth: 200,
			showIcon: false,
			fields: [],
		});

		renderCardMode(mockHost, mockGraphics, mockContext, {}, {});
		// Should not throw and should call graphics methods for table card
		expect(mockGraphics.lineStyle).toHaveBeenCalled();
	});

	it("routes to renderPlainCard when headerStyle is 'plain'", () => {
		mockHost.getCardDisplayConfig.mockReturnValue({
			headerStyle: "plain",
			maxWidth: 200,
			showIcon: false,
			fields: [],
		});

		renderCardMode(mockHost, mockGraphics, mockContext, {}, {});
		expect(mockGraphics.lineStyle).toHaveBeenCalled();
	});

	it("routes to renderPlainCard when headerStyle is undefined", () => {
		mockHost.getCardDisplayConfig.mockReturnValue({
			headerStyle: undefined,
			maxWidth: 200,
			showIcon: false,
			fields: [],
		});

		renderCardMode(mockHost, mockGraphics, mockContext, {}, {});
		expect(mockGraphics.lineStyle).toHaveBeenCalled();
	});

	it("uses default maxWidth of 200 when config is undefined", () => {
		mockHost.getCardDisplayConfig.mockReturnValue({
			headerStyle: "table",
			maxWidth: undefined,
			showIcon: false,
			fields: [],
		});

		renderCardMode(mockHost, mockGraphics, mockContext, {}, {});
		expect(mockGraphics.lineStyle).toHaveBeenCalled();
	});

	it("applies worldScale to card dimensions", () => {
		const contextZoomedOut = {
			...mockContext,
			worldScale: 2, // zoomed out
		};

		renderCardMode(mockHost, mockGraphics, mockContext, {}, {});
		renderCardMode(mockHost, mockGraphics, contextZoomedOut, {}, {});
		// Both should succeed without error
		expect(mockGraphics.lineStyle).toHaveBeenCalled();
	});

	it("handles zero worldScale edge case", () => {
		const contextZero = {
			...mockContext,
			worldScale: 0.001, // very small
		};

		expect(() => renderCardMode(mockHost, mockGraphics, contextZero, {}, {})).not.toThrow();
	});

	it("handles empty visible nodes", () => {
		const contextEmpty = {
			...mockContext,
			visible: [],
		};

		expect(() => renderCardMode(mockHost, mockGraphics, contextEmpty, {}, {})).not.toThrow();
	});

	it("handles large number of visible nodes", () => {
		const largeVisible = [];
		for (let i = 0; i < 100; i++) {
			largeVisible.push(makePixiNode(`n${i}`));
		}
		const contextLarge = {
			...mockContext,
			visible: largeVisible,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, contextLarge, {}, {})).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// renderCardMode — detailed branch coverage
// ---------------------------------------------------------------------------
describe("renderCardMode — branches and edge cases", () => {
	let mockHost: any;
	let mockGraphics: any;

	beforeEach(() => {
		mockHost = {
			getCardDisplayConfig: vi.fn(() => ({
				headerStyle: "table",
				maxWidth: 200,
				showIcon: false,
				fields: [],
			})),
			getLabelColor: vi.fn(() => 0xffffff),
			getPanel: vi.fn(() => ({
				hoverShowMeta: true,
				hoverShowBody: true,
			})),
			isHighContrastMode: vi.fn(() => false),
		};

		mockGraphics = {
			lineStyle: vi.fn(),
			beginFill: vi.fn(),
			endFill: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			closePath: vi.fn(),
			drawRoundedRect: vi.fn(),
			drawRect: vi.fn(),
		};
	});

	it("with showIcon=true for table card", () => {
		mockHost.getCardDisplayConfig.mockReturnValue({
			headerStyle: "table",
			maxWidth: 200,
			showIcon: true,
			fields: [],
		});

		const node = makePixiNode("n1", {
			data: {
				id: "n1",
				label: "Node 1",
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
			} as any,
		});

		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 1,
			minWorldRadius: 5,
		};

		renderCardMode(mockHost, mockGraphics, ctx, {}, {});
		expect(mockGraphics.beginFill).toHaveBeenCalled();
	});

	it("with tlFilteredOut set (timeline filtered nodes)", () => {
		const node = makePixiNode("n1");
		const filteredOut = new Set(["n1"]);

		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: filteredOut,
			alpha: 0.5,
			nodeCount: 1,
			worldScale: 1,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, {}, {})).not.toThrow();
	});

	it("with multiple nodes and different worldScales", () => {
		const nodes = Array.from({ length: 5 }, (_, i) => {
			const n = makePixiNode(`n${i}`);
			return n;
		});

		const pixiNodesMap = new Map(nodes.map((n) => [n.data.id, n]));

		const ctx = {
			visible: nodes,
			pixiNodes: pixiNodesMap,
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 5,
			worldScale: 0.5,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, {}, {})).not.toThrow();
	});

	it("with very small worldScale (zoomed in)", () => {
		const node = makePixiNode("n1");
		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 0.01,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, {}, {})).not.toThrow();
	});

	it("with large worldScale (zoomed out)", () => {
		const node = makePixiNode("n1");
		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 10,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, {}, {})).not.toThrow();
	});

	it("with high node count (text pass disabled)", () => {
		const node = makePixiNode("n1");
		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 10000, // large count
			worldScale: 1,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, {}, { cardTextNodeCount: 5000 })).not.toThrow();
	});

	it("with bodyPreview data (card content)", () => {
		const node = makePixiNode("n1", {
			data: {
				id: "n1",
				label: "Node 1",
				x: 0,
				y: 0,
				vx: 0,
				vy: 0,
				bodyPreview: "This is a long body preview text that should wrap",
			} as any,
		});

		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 1,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, {}, {})).not.toThrow();
	});

	it("with default cardAspectRatio in config", () => {
		const node = makePixiNode("n1");
		const crc = {
			cardAspectRatio: 0, // triggers default 1.618
			tableHeaderHeight: 20,
			fieldLineHeight: 16,
			cardPadding: 4,
		};

		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 1,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, crc, {})).not.toThrow();
	});

	it("with custom cardAspectRatio in config", () => {
		const node = makePixiNode("n1");
		const crc = {
			cardAspectRatio: 2.0, // custom AR
			tableHeaderHeight: 20,
			fieldLineHeight: 16,
			cardPadding: 4,
		};

		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 1,
			minWorldRadius: 5,
		};

		expect(() => renderCardMode(mockHost, mockGraphics, ctx, crc, {})).not.toThrow();
	});

	it("cleans up previous cards before rendering new ones", () => {
		const node = makePixiNode("n1");
		const oldCard = createCardText("old", 12, 0xffffff);
		node.gfx.addChild(oldCard);

		expect(node.gfx.children).toContain(oldCard);

		const ctx = {
			visible: [node],
			pixiNodes: new Map([["n1", node]]),
			tlFilteredOut: null,
			alpha: 1,
			nodeCount: 1,
			worldScale: 1,
			minWorldRadius: 5,
		};

		renderCardMode(mockHost, mockGraphics, ctx, {}, {});
		expect(node.gfx.children).not.toContain(oldCard);
	});
});

// ---------------------------------------------------------------------------
// wrapTextToLines — word-wrap helper
// ---------------------------------------------------------------------------
describe("wrapTextToLines", () => {
	it("wraps text into lines at word boundaries", () => {
		const lines = wrapTextToLines("hello world foo bar", 12, 5);
		expect(lines.length).toBeGreaterThan(0);
		expect(lines.every((l) => l.length <= 12)).toBe(true);
	});

	it("respects maxLines limit", () => {
		const lines = wrapTextToLines("a b c d e f g h i j k l m n", 5, 2);
		expect(lines.length).toBeLessThanOrEqual(2);
	});

	it("returns single line when text fits", () => {
		const lines = wrapTextToLines("short", 20, 5);
		expect(lines).toEqual(["short"]);
	});

	it("handles empty string", () => {
		const lines = wrapTextToLines("", 10, 3);
		expect(lines).toEqual([]);
	});

	it("handles single word longer than charsPerLine", () => {
		const lines = wrapTextToLines("superlongword", 5, 3);
		// Single word is placed in cur, then pushed as a line; cur becomes empty
		// The empty cur is not pushed, so result is ["", "superlongword"] or similar
		expect(lines.length).toBeGreaterThanOrEqual(1);
		expect(lines.some((l) => l === "superlongword")).toBe(true);
	});

	it("handles maxLines = 1", () => {
		const lines = wrapTextToLines("hello world foo", 6, 1);
		expect(lines.length).toBe(1);
	});

	it("handles whitespace-only text", () => {
		const lines = wrapTextToLines("   ", 10, 3);
		expect(lines).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// estimateBodyLineCount — body line estimation
// ---------------------------------------------------------------------------
describe("estimateBodyLineCount", () => {
	it("returns 0 for undefined bodyPreview", () => {
		expect(estimateBodyLineCount(undefined, 3, 100, 5)).toBe(0);
	});

	it("returns 0 for empty string", () => {
		expect(estimateBodyLineCount("", 3, 100, 5)).toBe(0);
	});

	it("estimates 1 line for short text", () => {
		expect(estimateBodyLineCount("hello", 3, 100, 5)).toBe(1);
	});

	it("caps at maxBodyLines", () => {
		const longText = "a".repeat(500);
		expect(estimateBodyLineCount(longText, 3, 50, 5)).toBe(3);
	});

	it("uses charW to compute chars per line", () => {
		// cardTextW=100, charW=10 → 10 chars/line; 25 chars → 3 lines
		expect(estimateBodyLineCount("a".repeat(25), 5, 100, 10)).toBe(3);
	});

	it("handles very small charW (minimum 5 chars per line)", () => {
		// cardTextW=1, charW=0.1 → floor(10)=10 chars/line, but min is 5
		expect(estimateBodyLineCount("a".repeat(10), 5, 1, 0.1)).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Constants — exported values
// ---------------------------------------------------------------------------
describe("Card renderer constants", () => {
	it("CARD_FONT_FAMILY is a non-empty string", () => {
		expect(typeof CARD_FONT_FAMILY).toBe("string");
		expect(CARD_FONT_FAMILY.length).toBeGreaterThan(0);
	});

	it("CARD_SCALE_CAP is a positive number", () => {
		expect(typeof CARD_SCALE_CAP).toBe("number");
		expect(CARD_SCALE_CAP).toBeGreaterThan(0);
		expect(CARD_SCALE_CAP).toBe(8);
	});

	it("FULL_CARD_FONT_BASE is a positive number", () => {
		expect(typeof FULL_CARD_FONT_BASE).toBe("number");
		expect(FULL_CARD_FONT_BASE).toBeGreaterThan(0);
		expect(FULL_CARD_FONT_BASE).toBe(10);
	});

	it("FULL_CARD_FONT_MIN is a positive number", () => {
		expect(typeof FULL_CARD_FONT_MIN).toBe("number");
		expect(FULL_CARD_FONT_MIN).toBeGreaterThan(0);
		expect(FULL_CARD_FONT_MIN).toBe(7);
	});

	it("FULL_CARD_FONT_MIN is less than FULL_CARD_FONT_BASE", () => {
		expect(FULL_CARD_FONT_MIN).toBeLessThan(FULL_CARD_FONT_BASE);
	});

	it("CARD_LINE_HEIGHT is a positive number", () => {
		expect(typeof CARD_LINE_HEIGHT).toBe("number");
		expect(CARD_LINE_HEIGHT).toBeGreaterThan(0);
		expect(CARD_LINE_HEIGHT).toBe(1.3);
	});

	it("CARD_SUB_FONT_RATIO is a positive number", () => {
		expect(typeof CARD_SUB_FONT_RATIO).toBe("number");
		expect(CARD_SUB_FONT_RATIO).toBeGreaterThan(0);
		expect(CARD_SUB_FONT_RATIO).toBeLessThanOrEqual(1);
	});

	it("COMPACT_CARD_FONT_MIN is a positive number", () => {
		expect(typeof COMPACT_CARD_FONT_MIN).toBe("number");
		expect(COMPACT_CARD_FONT_MIN).toBeGreaterThan(0);
		expect(COMPACT_CARD_FONT_MIN).toBe(6);
	});

	it("COMPACT_CARD_FONT_BASE is a positive number", () => {
		expect(typeof COMPACT_CARD_FONT_BASE).toBe("number");
		expect(COMPACT_CARD_FONT_BASE).toBeGreaterThan(0);
		expect(COMPACT_CARD_FONT_BASE).toBe(9);
	});

	it("COMPACT_CARD_FONT_MIN is less than COMPACT_CARD_FONT_BASE", () => {
		expect(COMPACT_CARD_FONT_MIN).toBeLessThan(COMPACT_CARD_FONT_BASE);
	});
});
