import { describe, test, expect } from "vitest";
import { computeGaps, hitTestTimelineBars, autoBundleStrength } from "../src/utils/graph-helpers";

// ==========================================================================
// computeGaps
// ==========================================================================
describe("computeGaps", () => {
	test("finds gap between nodes sharing a tag with common neighbor", () => {
		// A-C connected, B-C connected, A and B share tag "battle" but not connected
		const nodes = [
			{ id: "A", tags: ["battle"] },
			{ id: "B", tags: ["battle"] },
			{ id: "C", tags: [] },
		];
		const adj = new Map<string, Set<string>>([
			["A", new Set(["C"])],
			["B", new Set(["C"])],
			["C", new Set(["A", "B"])],
		]);
		const gaps = computeGaps(nodes, adj);
		expect(gaps).toEqual([{ from: "A", to: "B" }]);
	});

	test("returns empty when nodes are directly connected", () => {
		const nodes = [
			{ id: "A", tags: ["x"] },
			{ id: "B", tags: ["x"] },
		];
		const adj = new Map<string, Set<string>>([
			["A", new Set(["B"])],
			["B", new Set(["A"])],
		]);
		expect(computeGaps(nodes, adj)).toEqual([]);
	});

	test("returns empty when no shared tags", () => {
		const nodes = [
			{ id: "A", tags: ["x"] },
			{ id: "B", tags: ["y"] },
		];
		const adj = new Map<string, Set<string>>();
		expect(computeGaps(nodes, adj)).toEqual([]);
	});

	test("returns empty for empty input", () => {
		expect(computeGaps([], new Map())).toEqual([]);
	});

	test("caps at 20 results", () => {
		// Create many nodes with same tag and a shared hub neighbor
		const nodes = Array.from({ length: 50 }, (_, i) => ({
			id: `N${i}`,
			tags: ["common"],
		}));
		// All connected to hub H, none connected to each other
		const adj = new Map<string, Set<string>>();
		adj.set("H", new Set(nodes.map((n) => n.id)));
		for (const n of nodes) adj.set(n.id, new Set(["H"]));

		const gaps = computeGaps(nodes, adj);
		expect(gaps.length).toBe(20);
	});

	test("handles nodes without tags", () => {
		const nodes = [{ id: "A" }, { id: "B", tags: ["x"] }];
		const adj = new Map<string, Set<string>>();
		expect(computeGaps(nodes as any, adj)).toEqual([]);
	});
});

// ==========================================================================
// hitTestTimelineBars
// ==========================================================================
describe("hitTestTimelineBars", () => {
	const bars = [
		{ nodeId: "n1", xStart: 0, xEnd: 100, yCenter: 50, barHeight: 20 },
		{ nodeId: "n2", xStart: 150, xEnd: 250, yCenter: 80, barHeight: 10 },
	];

	test("hits bar center", () => {
		expect(hitTestTimelineBars(bars, 50, 50)).toBe("n1");
	});

	test("hits bar edge", () => {
		expect(hitTestTimelineBars(bars, 0, 40)).toBe("n1"); // left edge, top edge
		expect(hitTestTimelineBars(bars, 100, 60)).toBe("n1"); // right edge, bottom edge
	});

	test("misses between bars", () => {
		expect(hitTestTimelineBars(bars, 120, 50)).toBeNull();
	});

	test("hits second bar", () => {
		expect(hitTestTimelineBars(bars, 200, 80)).toBe("n2");
	});

	test("misses above bar", () => {
		expect(hitTestTimelineBars(bars, 50, 30)).toBeNull(); // above n1 (yCenter=50, halfH=10)
	});

	test("returns null for empty bars", () => {
		expect(hitTestTimelineBars([], 50, 50)).toBeNull();
	});

	test("returns first match when bars overlap", () => {
		const overlapping = [
			{ nodeId: "a", xStart: 0, xEnd: 100, yCenter: 50, barHeight: 40 },
			{ nodeId: "b", xStart: 50, xEnd: 150, yCenter: 50, barHeight: 40 },
		];
		expect(hitTestTimelineBars(overlapping, 75, 50)).toBe("a");
	});
});

// ==========================================================================
// autoBundleStrength
// ==========================================================================
describe("autoBundleStrength", () => {
	test("returns 0.3 for small graphs", () => {
		expect(autoBundleStrength(10)).toBe(0.3);
		expect(autoBundleStrength(50)).toBe(0.3);
	});

	test("returns 0.5 for medium graphs", () => {
		expect(autoBundleStrength(51)).toBe(0.5);
		expect(autoBundleStrength(200)).toBe(0.5);
	});

	test("returns 0.7 for large graphs", () => {
		expect(autoBundleStrength(201)).toBe(0.7);
		expect(autoBundleStrength(500)).toBe(0.7);
	});

	test("returns 0.85 for very large graphs", () => {
		expect(autoBundleStrength(501)).toBe(0.85);
		expect(autoBundleStrength(5000)).toBe(0.85);
	});

	test("boundary values are correct", () => {
		expect(autoBundleStrength(0)).toBe(0.3);
		expect(autoBundleStrength(50)).toBe(0.3);
		expect(autoBundleStrength(51)).toBe(0.5);
		expect(autoBundleStrength(200)).toBe(0.5);
		expect(autoBundleStrength(201)).toBe(0.7);
		expect(autoBundleStrength(500)).toBe(0.7);
		expect(autoBundleStrength(501)).toBe(0.85);
	});

	test("is monotonically non-decreasing", () => {
		let prev = autoBundleStrength(0);
		for (let i = 1; i <= 1000; i += 10) {
			const cur = autoBundleStrength(i);
			expect(cur).toBeGreaterThanOrEqual(prev);
			prev = cur;
		}
	});
});
