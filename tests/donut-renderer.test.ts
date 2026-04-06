import { describe, it, expect, vi } from "vitest";
import {
	renderDonutMode,
	renderDonutBreakdown,
	renderSunburstSegmentMode,
	RING_STROKE_DARKEN,
	RING_STROKE_ALPHA,
	SUNBURST_SEGMENT_ARC_DEG,
	type DonutRenderCtx,
} from "../src/views/donut-renderer";
import { DEFAULT_RENDER_THRESHOLDS } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkGfx() {
	return {
		lineStyle: vi.fn(),
		beginFill: vi.fn(),
		drawCircle: vi.fn(),
		endFill: vi.fn(),
		moveTo: vi.fn(),
		arc: vi.fn(),
		lineTo: vi.fn(),
	} as any;
}

function mkNode(overrides: Record<string, unknown> = {}) {
	return {
		radius: 10,
		color: 0xff0000,
		data: {
			id: "n1",
			x: 100,
			y: 200,
			collapsedMembers: undefined,
			meta: {},
			...((overrides.data as object) ?? {}),
		},
		...overrides,
		// re-apply data if overridden
		...(overrides.data ? { data: { id: "n1", x: 100, y: 200, collapsedMembers: undefined, meta: {}, ...(overrides.data as object) } } : {}),
	} as any;
}

function mkHost(overrides: Record<string, unknown> = {}) {
	return {
		getDonutDisplayConfig: vi.fn().mockReturnValue({ innerRadius: 0.6 }),
		getRenderThresholds: vi.fn().mockReturnValue(DEFAULT_RENDER_THRESHOLDS),
		isDarkTheme: vi.fn().mockReturnValue(false),
		getPixiNodes: vi.fn().mockReturnValue(new Map()),
		...overrides,
	} as any;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("donut-renderer constants", () => {
	it("exports expected constant values", () => {
		expect(RING_STROKE_DARKEN).toBe(0.4);
		expect(RING_STROKE_ALPHA).toBe(0.5);
		expect(SUNBURST_SEGMENT_ARC_DEG).toBe(30);
	});
});

// ---------------------------------------------------------------------------
// renderDonutMode
// ---------------------------------------------------------------------------

describe("renderDonutMode", () => {
	it("renders single-color ring for non-super node", () => {
		const g = mkGfx();
		const host = mkHost();
		const node = mkNode();
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 5,
		};
		renderDonutMode(host, g, ctx, { filteredNodeAlpha: 0.3 });

		// Outer ring
		expect(g.beginFill).toHaveBeenCalledWith(0xff0000, 1);
		expect(g.drawCircle).toHaveBeenCalledWith(100, 200, 10);
		// Inner cutout
		expect(g.drawCircle).toHaveBeenCalledWith(100, 200, 10 * 0.6);
	});

	it("uses minWorldRadius when node radius is smaller", () => {
		const g = mkGfx();
		const host = mkHost();
		const node = mkNode({ radius: 2 });
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 8,
		};
		renderDonutMode(host, g, ctx, { filteredNodeAlpha: 0.3 });

		expect(g.drawCircle).toHaveBeenCalledWith(100, 200, 8);
	});

	it("applies filteredNodeAlpha for timeline-filtered nodes", () => {
		const g = mkGfx();
		const host = mkHost();
		const node = mkNode();
		const tlSet = new Set(["n1"]);
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: tlSet,
			alpha: 0.8,
			minWorldRadius: 5,
		};
		renderDonutMode(host, g, ctx, { filteredNodeAlpha: 0.3 });

		// alpha * filteredNodeAlpha = 0.8 * 0.3 = 0.24
		expect(g.beginFill).toHaveBeenCalledWith(0xff0000, expect.closeTo(0.24, 4));
	});

	it("delegates to breakdown for super nodes with breakdownField", () => {
		const g = mkGfx();
		const members = ["m1", "m2"];
		const pixiNodes = new Map([
			["m1", { data: { meta: { category: "A" } } }],
			["m2", { data: { meta: { category: "B" } } }],
		]);
		const host = mkHost({
			getDonutDisplayConfig: vi.fn().mockReturnValue({ innerRadius: 0.6, breakdownField: "category" }),
			getPixiNodes: vi.fn().mockReturnValue(pixiNodes),
		});
		const node = mkNode({ data: { id: "s1", x: 50, y: 50, collapsedMembers: members, meta: {} } });
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 5,
		};
		renderDonutMode(host, g, ctx, { filteredNodeAlpha: 0.3 });

		// Breakdown renders arcs — moveTo is called for sector rendering
		expect(g.moveTo).toHaveBeenCalled();
	});

	it("uses dark theme bg color when dark theme", () => {
		const g = mkGfx();
		const host = mkHost({ isDarkTheme: vi.fn().mockReturnValue(true) });
		const node = mkNode();
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 5,
		};
		renderDonutMode(host, g, ctx, { filteredNodeAlpha: 0.3 });

		// Inner cutout should use dark bg
		expect(g.beginFill).toHaveBeenCalledWith(DEFAULT_RENDER_THRESHOLDS.donutBgDark, 1);
	});

	it("falls back to defaults when getRenderThresholds returns undefined", () => {
		const g = mkGfx();
		const host = mkHost({ getRenderThresholds: vi.fn().mockReturnValue(undefined) });
		const node = mkNode();
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 5,
		};
		renderDonutMode(host, g, ctx, { filteredNodeAlpha: 0.3 });

		// Should not throw; falls back to DEFAULT_RENDER_THRESHOLDS
		expect(g.drawCircle).toHaveBeenCalled();
	});

	it("uses default innerRadius when not specified", () => {
		const g = mkGfx();
		const host = mkHost({
			getDonutDisplayConfig: vi.fn().mockReturnValue({}),
		});
		const node = mkNode();
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 5,
		};
		renderDonutMode(host, g, ctx, { filteredNodeAlpha: 0.3 });

		// Default innerRadius is 0.6
		expect(g.drawCircle).toHaveBeenCalledWith(100, 200, 10 * 0.6);
	});
});

// ---------------------------------------------------------------------------
// renderDonutBreakdown
// ---------------------------------------------------------------------------

describe("renderDonutBreakdown", () => {
	it("draws sectors for each unique value", () => {
		const g = mkGfx();
		const pixiNodes = new Map([
			["m1", { data: { meta: { cat: "A" } } }],
			["m2", { data: { meta: { cat: "B" } } }],
			["m3", { data: { meta: { cat: "A" } } }],
		]);
		const host = mkHost({ getPixiNodes: vi.fn().mockReturnValue(pixiNodes) });
		const pn = mkNode({ data: { id: "s1", x: 10, y: 20, collapsedMembers: ["m1", "m2", "m3"], meta: {} } });

		renderDonutBreakdown(host, g, pn, 15, 1, 0.6, 0x000000, "cat");

		// 2 unique values → 2 arcs + 1 inner cutout = 3 beginFill calls
		expect(g.arc).toHaveBeenCalledTimes(2);
		// Inner cutout
		expect(g.drawCircle).toHaveBeenCalledWith(10, 20, 15 * 0.6);
	});

	it("uses 'other' for members without the breakdown field", () => {
		const g = mkGfx();
		const pixiNodes = new Map([
			["m1", { data: { meta: {} } }],
		]);
		const host = mkHost({ getPixiNodes: vi.fn().mockReturnValue(pixiNodes) });
		const pn = mkNode({ data: { id: "s1", x: 0, y: 0, collapsedMembers: ["m1"], meta: {} } });

		renderDonutBreakdown(host, g, pn, 10, 1, 0.5, 0x000000, "missing");

		// 1 sector for "other"
		expect(g.arc).toHaveBeenCalledTimes(1);
	});

	it("handles member not in pixiNodes map", () => {
		const g = mkGfx();
		const host = mkHost({ getPixiNodes: vi.fn().mockReturnValue(new Map()) });
		const pn = mkNode({ data: { id: "s1", x: 0, y: 0, collapsedMembers: ["unknown"], meta: {} } });

		renderDonutBreakdown(host, g, pn, 10, 1, 0.5, 0x000000, "field");

		// Falls back to "other"
		expect(g.arc).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// renderSunburstSegmentMode
// ---------------------------------------------------------------------------

describe("renderSunburstSegmentMode", () => {
	it("renders arc segment for each visible node", () => {
		const g = mkGfx();
		const nodes = [mkNode({ data: { id: "a", x: 0, y: 0 } }), mkNode({ data: { id: "b", x: 10, y: 10 } })];
		const ctx: DonutRenderCtx = {
			visible: nodes,
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 5,
		};

		renderSunburstSegmentMode(g, ctx, { filteredNodeAlpha: 0.3 });

		expect(g.arc).toHaveBeenCalledTimes(2);
		expect(g.moveTo).toHaveBeenCalledTimes(2);
	});

	it("applies filtered alpha for timeline-filtered nodes", () => {
		const g = mkGfx();
		const node = mkNode({ data: { id: "f1", x: 0, y: 0 } });
		const ctx: DonutRenderCtx = {
			visible: [node],
			tlFilteredOut: new Set(["f1"]),
			alpha: 0.5,
			minWorldRadius: 5,
		};

		renderSunburstSegmentMode(g, ctx, { filteredNodeAlpha: 0.4 });

		// 0.5 * 0.4 = 0.2
		expect(g.beginFill).toHaveBeenCalledWith(0xff0000, expect.closeTo(0.2, 4));
	});

	it("handles empty visible array", () => {
		const g = mkGfx();
		const ctx: DonutRenderCtx = {
			visible: [],
			tlFilteredOut: null,
			alpha: 1,
			minWorldRadius: 5,
		};

		renderSunburstSegmentMode(g, ctx, { filteredNodeAlpha: 0.3 });

		expect(g.arc).not.toHaveBeenCalled();
	});
});
