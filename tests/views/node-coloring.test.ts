import { describe, it, expect } from "vitest";
import {
	computeNodeDisplayColor,
	COMMUNITY_PALETTE,
} from "../../src/views/node-coloring";
import type { GraphNode } from "../../src/types";
import { DEFAULT_COLORS } from "../../src/types";
import { parseQueryExpr } from "../../src/utils/query-expr";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
	return {
		id: "note-a",
		label: "Note A",
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		...overrides,
	};
}

function baseCtx(
	overrides: Record<string, unknown> = {},
): Parameters<typeof computeNodeDisplayColor>[1] {
	return {
		groups: [],
		colorMode: "default",
		colorMap: new Map(),
		communityMap: null,
		getNodeProperty: () => undefined,
		...overrides,
	} as Parameters<typeof computeNodeDisplayColor>[1];
}

const DEFAULT_COLOR = 0xaabbcc;

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe("computeNodeDisplayColor", () => {
	/* ---------- fallback ------------------------------------------ */
	it("returns defaultColor when no mode matches", () => {
		const result = computeNodeDisplayColor(
			makeNode(),
			baseCtx(),
			DEFAULT_COLOR,
		);
		expect(result).toBe(DEFAULT_COLOR);
	});

	/* ---------- group rule priority ------------------------------ */
	it("group rule overrides all other modes", () => {
		const expr = parseQueryExpr('id:"note-a"');
		const ctx = baseCtx({
			groups: [{ expression: expr, color: "#ff0000" }],
			colorMode: "community",
			communityMap: new Map([["note-a", 3]]),
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			0xff0000,
		);
	});

	it("skips group rule with null expression (no match-all)", () => {
		const ctx = baseCtx({
			groups: [{ expression: null, color: "#ff0000" }],
		});
		// null expression → evaluateExpr returns false → skip
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});

	it("applies first matching group rule", () => {
		const expr1 = parseQueryExpr('id:"note-a"');
		const expr2 = parseQueryExpr('id:"note-a"');
		const ctx = baseCtx({
			groups: [
				{ expression: expr1, color: "#00ff00" },
				{ expression: expr2, color: "#0000ff" },
			],
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			0x00ff00,
		);
	});

	it("skips non-matching group rule and falls through", () => {
		const expr = parseQueryExpr('id:"other"');
		const ctx = baseCtx({
			groups: [{ expression: expr, color: "#ff0000" }],
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});

	/* ---------- category mode ------------------------------------ */
	it("category mode uses node.category via colorMap", () => {
		const ctx = baseCtx({
			colorMode: "category",
			colorMap: new Map([["character", "#34d399"]]),
		});
		const node = makeNode({ category: "character" });
		expect(computeNodeDisplayColor(node, ctx, DEFAULT_COLOR)).toBe(0x34d399);
	});

	it("category mode falls back to DEFAULT_COLORS[0] for unmapped category", () => {
		const ctx = baseCtx({
			colorMode: "category",
			colorMap: new Map(),
		});
		const node = makeNode({ category: "unknown" });
		const expected = parseInt(DEFAULT_COLORS[0].slice(1), 16);
		expect(computeNodeDisplayColor(node, ctx, DEFAULT_COLOR)).toBe(expected);
	});

	it("category mode uses first tag when no category", () => {
		const ctx = baseCtx({
			colorMode: "category",
			colorMap: new Map([["tag:fiction", "#fbbf24"]]),
		});
		const node = makeNode({ tags: ["fiction", "drama"] });
		expect(computeNodeDisplayColor(node, ctx, DEFAULT_COLOR)).toBe(0xfbbf24);
	});

	it("category mode returns defaultColor for node without category or tags", () => {
		const ctx = baseCtx({ colorMode: "category" });
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});

	it("category mode returns defaultColor when tags array is empty", () => {
		const ctx = baseCtx({ colorMode: "category" });
		const node = makeNode({ tags: [] });
		expect(computeNodeDisplayColor(node, ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});

	/* ---------- field mode --------------------------------------- */
	it("field mode assigns color from field value", () => {
		const colorMap = new Map<string, string>();
		const ctx = baseCtx({
			colorMode: "field",
			colorField: "status",
			colorMap,
			getNodeProperty: (_id: string, field: string) =>
				field === "status" ? "active" : undefined,
		});
		const result = computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR);
		// Should have assigned from DEFAULT_COLORS palette
		expect(colorMap.has("active")).toBe(true);
		expect(typeof result).toBe("number");
		expect(result).not.toBe(DEFAULT_COLOR);
	});

	it("field mode reuses existing color from colorMap", () => {
		const colorMap = new Map([["active", "#d62728"]]);
		const ctx = baseCtx({
			colorMode: "field",
			colorField: "status",
			colorMap,
			getNodeProperty: (_id: string, field: string) =>
				field === "status" ? "active" : undefined,
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			0xd62728,
		);
		// Map should not have grown
		expect(colorMap.size).toBe(1);
	});

	it("field mode uses customColorPalette when provided", () => {
		const colorMap = new Map<string, string>();
		const ctx = baseCtx({
			colorMode: "field",
			colorField: "status",
			colorMap,
			customColorPalette: "#aaaaaa, #bbbbbb",
			getNodeProperty: (_id: string, field: string) =>
				field === "status" ? "draft" : undefined,
		});
		computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR);
		expect(colorMap.get("draft")).toBe("#aaaaaa");
	});

	it("field mode returns defaultColor when field value is empty string", () => {
		const ctx = baseCtx({
			colorMode: "field",
			colorField: "status",
			getNodeProperty: () => "",
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});

	it("field mode returns defaultColor when field value is undefined", () => {
		const ctx = baseCtx({
			colorMode: "field",
			colorField: "status",
			getNodeProperty: () => undefined,
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});

	it("field mode returns defaultColor when colorField is not set", () => {
		const ctx = baseCtx({
			colorMode: "field",
			// colorField omitted
			getNodeProperty: () => "val",
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});

	it("field mode wraps palette index when many values exist", () => {
		const colorMap = new Map<string, string>();
		// Pre-fill to force wrap
		const palette = DEFAULT_COLORS as unknown as string[];
		for (let i = 0; i < palette.length; i++) {
			colorMap.set(`v${i}`, palette[i]);
		}
		const ctx = baseCtx({
			colorMode: "field",
			colorField: "cat",
			colorMap,
			getNodeProperty: (_id: string, field: string) =>
				field === "cat" ? "overflow" : undefined,
		});
		computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR);
		// Should wrap to palette[0]
		expect(colorMap.get("overflow")).toBe(palette[0]);
	});

	/* ---------- community mode ----------------------------------- */
	it("community mode uses COMMUNITY_PALETTE by community id", () => {
		const ctx = baseCtx({
			colorMode: "community",
			communityMap: new Map([["note-a", 5]]),
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			COMMUNITY_PALETTE[5],
		);
	});

	it("community mode defaults to community 0 for unmapped node", () => {
		const ctx = baseCtx({
			colorMode: "community",
			communityMap: new Map(),
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			COMMUNITY_PALETTE[0],
		);
	});

	it("community mode wraps palette for large community ids", () => {
		const largeCid = COMMUNITY_PALETTE.length + 3;
		const ctx = baseCtx({
			colorMode: "community",
			communityMap: new Map([["note-a", largeCid]]),
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			COMMUNITY_PALETTE[3],
		);
	});

	it("community mode returns defaultColor when communityMap is null", () => {
		const ctx = baseCtx({
			colorMode: "community",
			communityMap: null,
		});
		expect(computeNodeDisplayColor(makeNode(), ctx, DEFAULT_COLOR)).toBe(
			DEFAULT_COLOR,
		);
	});
});

/* ------------------------------------------------------------------ */
/*  COMMUNITY_PALETTE constant                                        */
/* ------------------------------------------------------------------ */

describe("COMMUNITY_PALETTE", () => {
	it("has 20 entries (D3 category-20)", () => {
		expect(COMMUNITY_PALETTE).toHaveLength(20);
	});

	it("all entries are valid 24-bit hex colors", () => {
		for (const c of COMMUNITY_PALETTE) {
			expect(c).toBeGreaterThanOrEqual(0);
			expect(c).toBeLessThanOrEqual(0xffffff);
		}
	});
});
