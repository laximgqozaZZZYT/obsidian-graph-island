import { describe, it, expect, vi } from "vitest";

// Mock PIXI before importing
vi.mock("pixi.js", () => ({
	Text: class MockText {
		x = 0;
		y = 0;
		alpha = 1;
		visible = true;
		resolution = 1;
		eventMode = "auto";
		cursor = "";
		anchor = { set: vi.fn() };
		scale = { set: vi.fn() };
		on = vi.fn();
		constructor(
			public text: string,
			public style: any,
		) {}
	},
}));

import { drawSmoothHull, drawCapsule } from "../src/views/EnclosureRenderer";

// Minimal CanvasGraphics mock that records calls
function createMockGraphics() {
	const calls: { method: string; args: any[] }[] = [];
	const handler: ProxyHandler<any> = {
		get(target, prop) {
			if (prop === "parent") return { addChild: vi.fn() };
			return (...args: any[]) => {
				calls.push({ method: String(prop), args });
				return proxy;
			};
		},
	};
	const proxy = new Proxy({}, handler);
	return { g: proxy, calls };
}

// ---------------------------------------------------------------------------
// drawSmoothHull — straight-line polygon drawing
// ---------------------------------------------------------------------------
describe("drawSmoothHull", () => {
	it("draws polygon with moveTo + lineTo + closePath for 3+ points", () => {
		const { g, calls } = createMockGraphics();
		const pts = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 50, y: 80 },
		];
		drawSmoothHull(g, pts);

		expect(calls[0]).toEqual({ method: "moveTo", args: [0, 0] });
		expect(calls[1]).toEqual({ method: "lineTo", args: [100, 0] });
		expect(calls[2]).toEqual({ method: "lineTo", args: [50, 80] });
		expect(calls[3]).toEqual({ method: "closePath", args: [] });
		expect(calls).toHaveLength(4);
	});

	it("skips drawing when fewer than 3 points", () => {
		const { g, calls } = createMockGraphics();
		drawSmoothHull(g, [
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
		]);
		expect(calls).toHaveLength(0);
	});

	it("skips drawing for empty array", () => {
		const { g, calls } = createMockGraphics();
		drawSmoothHull(g, []);
		expect(calls).toHaveLength(0);
	});

	it("handles many points correctly", () => {
		const { g, calls } = createMockGraphics();
		const pts = Array.from({ length: 10 }, (_, i) => ({ x: i * 10, y: i * 5 }));
		drawSmoothHull(g, pts);

		// 1 moveTo + 9 lineTo + 1 closePath = 11 calls
		expect(calls).toHaveLength(11);
		expect(calls[0].method).toBe("moveTo");
		expect(calls.filter((c) => c.method === "lineTo")).toHaveLength(9);
		expect(calls[10].method).toBe("closePath");
	});

	it("uses exact coordinates from input points", () => {
		const { g, calls } = createMockGraphics();
		const pts = [
			{ x: -50.5, y: 100.3 },
			{ x: 0, y: -200 },
			{ x: 999, y: 0.001 },
		];
		drawSmoothHull(g, pts);
		expect(calls[0].args).toEqual([-50.5, 100.3]);
		expect(calls[1].args).toEqual([0, -200]);
		expect(calls[2].args).toEqual([999, 0.001]);
	});
});

// ---------------------------------------------------------------------------
// drawCapsule — rectangular capsule around two points
// ---------------------------------------------------------------------------
describe("drawCapsule", () => {
	it("draws 4 vertices + closePath for horizontal segment", () => {
		const { g, calls } = createMockGraphics();
		drawCapsule(g, { x: 0, y: 0 }, { x: 100, y: 0 }, 20);

		const moveCalls = calls.filter((c) => c.method === "moveTo");
		const lineCalls = calls.filter((c) => c.method === "lineTo");
		const closeCalls = calls.filter((c) => c.method === "closePath");
		expect(moveCalls).toHaveLength(1);
		expect(lineCalls).toHaveLength(3);
		expect(closeCalls).toHaveLength(1);
	});

	it("produces vertices offset by radius perpendicular to segment", () => {
		const { g, calls } = createMockGraphics();
		// Horizontal segment at y=50 with radius=10 → vertices at y=40 and y=60
		drawCapsule(g, { x: 0, y: 50 }, { x: 100, y: 50 }, 10);

		const allCoords = calls
			.filter((c) => c.method === "moveTo" || c.method === "lineTo")
			.map((c) => ({ x: c.args[0], y: c.args[1] }));

		// All y-coordinates should be either 40 or 60 (perpendicular offset)
		const yValues = allCoords.map((c) => Math.round(c.y));
		expect(yValues.every((y) => y === 40 || y === 60)).toBe(true);
	});

	it("handles vertical segment correctly", () => {
		const { g, calls } = createMockGraphics();
		drawCapsule(g, { x: 50, y: 0 }, { x: 50, y: 100 }, 15);

		const allCoords = calls
			.filter((c) => c.method === "moveTo" || c.method === "lineTo")
			.map((c) => ({ x: c.args[0], y: c.args[1] }));

		// For vertical segment, perpendicular is horizontal → x offsets at 35 and 65
		const xValues = allCoords.map((c) => Math.round(c.x));
		expect(xValues.every((x) => x === 35 || x === 65)).toBe(true);
	});

	it("handles zero-length segment (coincident points)", () => {
		const { g, calls } = createMockGraphics();
		// Should not throw — Math.hypot returns 0, but code guards with || 1
		expect(() => drawCapsule(g, { x: 50, y: 50 }, { x: 50, y: 50 }, 10)).not.toThrow();

		// Should still produce a closed shape
		const closeCalls = calls.filter((c) => c.method === "closePath");
		expect(closeCalls).toHaveLength(1);
	});

	it("all coordinates are finite", () => {
		const { g, calls } = createMockGraphics();
		drawCapsule(g, { x: -100, y: 200 }, { x: 300, y: -50 }, 25);

		const coords = calls.filter((c) => c.method === "moveTo" || c.method === "lineTo").flatMap((c) => c.args);

		for (const v of coords) {
			expect(isFinite(v)).toBe(true);
		}
	});

	it("diagonal segment produces 4 distinct vertices", () => {
		const { g, calls } = createMockGraphics();
		drawCapsule(g, { x: 0, y: 0 }, { x: 100, y: 100 }, 10);

		const verts = calls
			.filter((c) => c.method === "moveTo" || c.method === "lineTo")
			.map((c) => `${c.args[0].toFixed(2)},${c.args[1].toFixed(2)}`);

		// All 4 vertices should be distinct
		expect(new Set(verts).size).toBe(4);
	});

	it("very small radius still produces valid shape", () => {
		const { g, calls } = createMockGraphics();
		drawCapsule(g, { x: 0, y: 0 }, { x: 50, y: 0 }, 0.001);

		const closeCalls = calls.filter((c) => c.method === "closePath");
		expect(closeCalls).toHaveLength(1);
		const coords = calls.filter((c) => c.method === "moveTo" || c.method === "lineTo").flatMap((c) => c.args);
		for (const v of coords) {
			expect(isFinite(v)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// drawSmoothHull — additional edge cases (cycle197)
// ---------------------------------------------------------------------------
describe("drawSmoothHull — edge cases", () => {
	it("handles exactly 3 points (minimum valid polygon)", () => {
		const { g, calls } = createMockGraphics();
		drawSmoothHull(g, [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
		]);
		expect(calls).toHaveLength(4); // moveTo + 2 lineTo + closePath
	});

	it("handles collinear points without error", () => {
		const { g, calls } = createMockGraphics();
		const pts = [
			{ x: 0, y: 0 },
			{ x: 50, y: 0 },
			{ x: 100, y: 0 },
		];
		drawSmoothHull(g, pts);
		// Still draws — degenerate polygon but no crash
		expect(calls).toHaveLength(4);
		expect(calls[3].method).toBe("closePath");
	});

	it("handles points with negative coordinates", () => {
		const { g, calls } = createMockGraphics();
		const pts = [
			{ x: -100, y: -200 },
			{ x: -50, y: 300 },
			{ x: 400, y: -100 },
		];
		drawSmoothHull(g, pts);
		expect(calls[0].args).toEqual([-100, -200]);
	});
});
