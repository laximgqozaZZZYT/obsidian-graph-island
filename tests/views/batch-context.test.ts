import { describe, it, expect } from "vitest";
import {
	computeViewportBounds,
	collectVisibleNodes,
	type ViewportBounds,
	type VisibleNodeFilter,
} from "../../src/views/batch-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePixiNode(id: string, x: number, y: number, collapsed?: string[]): any {
	return {
		data: { id, x, y, collapsedMembers: collapsed ?? null },
		gfx: { visible: true },
	};
}

function makeMap(nodes: any[]): Map<string, any> {
	return new Map(nodes.map((n) => [n.data.id, n]));
}

function baseFilter(overrides: Partial<VisibleNodeFilter> = {}): VisibleNodeFilter {
	return {
		hiddenBySearch: new Set(),
		hasHighlight: false,
		activeSet: new Set(),
		aggregateMode: false,
		screenshotMode: false,
		viewport: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// computeViewportBounds
// ---------------------------------------------------------------------------
describe("computeViewportBounds", () => {
	it("computes correct bounds at scale 1 with no offset", () => {
		const vp = computeViewportBounds(0, 0, 1, 800, 600, 60);
		expect(vp.minX).toBeCloseTo(-60);
		expect(vp.minY).toBeCloseTo(-60);
		expect(vp.maxX).toBeCloseTo(860);
		expect(vp.maxY).toBeCloseTo(660);
	});

	it("accounts for world offset", () => {
		const vp = computeViewportBounds(-200, -100, 1, 800, 600, 0);
		expect(vp.minX).toBeCloseTo(200);
		expect(vp.minY).toBeCloseTo(100);
		expect(vp.maxX).toBeCloseTo(1000);
		expect(vp.maxY).toBeCloseTo(700);
	});

	it("scales margin by worldScale", () => {
		const vp = computeViewportBounds(0, 0, 2, 800, 600, 60);
		// margin = 60/2 = 30
		expect(vp.minX).toBeCloseTo(-30);
		expect(vp.minY).toBeCloseTo(-30);
		expect(vp.maxX).toBeCloseTo(430); // -30 + 800/2 + 30*2
		expect(vp.maxY).toBeCloseTo(330); // -30 + 600/2 + 30*2
	});
});

// ---------------------------------------------------------------------------
// collectVisibleNodes
// ---------------------------------------------------------------------------
describe("collectVisibleNodes", () => {
	it("collects nodes inside viewport", () => {
		const nodes = [makePixiNode("a", 0, 0), makePixiNode("b", 50, 50)];
		const map = makeMap(nodes);
		const out: any[] = [];
		collectVisibleNodes(map, out, baseFilter());
		expect(out).toHaveLength(2);
		expect(nodes[0].gfx.visible).toBe(true);
	});

	it("excludes nodes outside viewport", () => {
		const nodes = [makePixiNode("a", 0, 0), makePixiNode("b", 999, 999)];
		const map = makeMap(nodes);
		const out: any[] = [];
		collectVisibleNodes(map, out, baseFilter());
		expect(out).toHaveLength(1);
		expect(out[0].data.id).toBe("a");
		expect(nodes[1].gfx.visible).toBe(false);
	});

	it("skips search-hidden nodes", () => {
		const nodes = [makePixiNode("a", 0, 0), makePixiNode("b", 10, 10)];
		const map = makeMap(nodes);
		const out: any[] = [];
		collectVisibleNodes(map, out, baseFilter({ hiddenBySearch: new Set(["b"]) }));
		expect(out).toHaveLength(1);
		expect(out[0].data.id).toBe("a");
	});

	it("skips highlighted nodes when hasHighlight is true", () => {
		const nodes = [makePixiNode("a", 0, 0), makePixiNode("b", 10, 10)];
		const map = makeMap(nodes);
		const out: any[] = [];
		collectVisibleNodes(
			map,
			out,
			baseFilter({ hasHighlight: true, activeSet: new Set(["a"]) }),
		);
		expect(out).toHaveLength(1);
		expect(out[0].data.id).toBe("b");
	});

	it("hides non-super nodes in aggregate mode", () => {
		const nodes = [
			makePixiNode("a", 0, 0), // not super
			makePixiNode("b", 10, 10, ["child1", "child2"]), // super
		];
		const map = makeMap(nodes);
		const out: any[] = [];
		collectVisibleNodes(map, out, baseFilter({ aggregateMode: true }));
		expect(out).toHaveLength(1);
		expect(out[0].data.id).toBe("b");
		expect(nodes[0].gfx.visible).toBe(false);
	});

	it("shows non-super nodes in aggregate+screenshot mode", () => {
		const nodes = [makePixiNode("a", 0, 0)];
		const map = makeMap(nodes);
		const out: any[] = [];
		collectVisibleNodes(
			map,
			out,
			baseFilter({ aggregateMode: true, screenshotMode: true }),
		);
		expect(out).toHaveLength(1);
	});

	it("clears output array before collecting", () => {
		const nodes = [makePixiNode("a", 0, 0)];
		const map = makeMap(nodes);
		const out: any[] = [{ stale: true }];
		collectVisibleNodes(map, out, baseFilter());
		expect(out).toHaveLength(1);
		expect(out[0].data.id).toBe("a");
	});

	it("handles empty map", () => {
		const out: any[] = [];
		collectVisibleNodes(new Map(), out, baseFilter());
		expect(out).toHaveLength(0);
	});
});
