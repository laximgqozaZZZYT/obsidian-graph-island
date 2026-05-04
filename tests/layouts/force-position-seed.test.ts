import { describe, it, expect, vi, afterEach } from "vitest";
import { seedForceLayoutPositions, type FadeInSeed } from "../../src/layouts/force-position-seed";
import type { GraphNode } from "../../src/types";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

const baseCtx = {
	fade: null as FadeInSeed | null,
	savedPositionsValid: false,
	savedPositions: new Map<string, { x: number; y: number }>(),
	pinnedPositions: {} as Record<string, { x: number; y: number }>,
	cx: 100,
	cy: 200,
	W: 800,
	H: 600,
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("seedForceLayoutPositions — saved positions", () => {
	it("uses saved positions when valid and present", () => {
		const node = makeNode("a", { x: 0, y: 0 });
		const ctx = {
			...baseCtx,
			savedPositionsValid: true,
			savedPositions: new Map([["a", { x: 42, y: 84 }]]),
		};
		seedForceLayoutPositions([node], ctx);
		expect(node.x).toBe(42);
		expect(node.y).toBe(84);
	});

	it("ignores saved positions when savedPositionsValid is false", () => {
		// Mock random so the random reseed branch is deterministic
		vi.spyOn(Math, "random").mockReturnValue(0.5); // produces (cx, cy) since (0.5-0.5)=0
		const node = makeNode("a", { x: 0, y: 0 });
		const ctx = {
			...baseCtx,
			savedPositionsValid: false,
			savedPositions: new Map([["a", { x: 42, y: 84 }]]),
		};
		seedForceLayoutPositions([node], ctx);
		expect(node.x).toBe(100); // cx, NOT 42 (saved was ignored)
		expect(node.y).toBe(200); // cy
	});
});

describe("seedForceLayoutPositions — random reseed (outlier detection)", () => {
	it("reseeds NaN coordinates", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const node = makeNode("a", { x: NaN, y: NaN });
		seedForceLayoutPositions([node], baseCtx);
		expect(node.x).toBe(100);
		expect(node.y).toBe(200);
	});

	it("reseeds (0, 0) origin (treated as uninitialised)", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const node = makeNode("a", { x: 0, y: 0 });
		seedForceLayoutPositions([node], baseCtx);
		expect(node.x).toBe(100);
		expect(node.y).toBe(200);
	});

	it("reseeds coordinates outside maxReasonable range (max(W,H)*5)", () => {
		// W=800, H=600 → maxReasonable = 4000
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const node = makeNode("a", { x: 5000, y: 100 });
		seedForceLayoutPositions([node], baseCtx);
		expect(node.x).toBe(100);
		expect(node.y).toBe(200);
	});

	it("preserves finite, in-range, non-origin positions", () => {
		const node = makeNode("a", { x: 50, y: 75 });
		seedForceLayoutPositions([node], baseCtx);
		expect(node.x).toBe(50);
		expect(node.y).toBe(75);
	});

	it("reseed offset spans ±W*0.4 (RANDOM_REPLACE_SPAN/2)", () => {
		vi.spyOn(Math, "random").mockReturnValue(1); // (1 - 0.5) = 0.5 max offset
		const node = makeNode("a", { x: 0, y: 0 });
		seedForceLayoutPositions([node], baseCtx);
		expect(node.x).toBe(100 + 0.5 * 800 * 0.8); // cx + 320
		expect(node.y).toBe(200 + 0.5 * 600 * 0.8); // cy + 240
	});
});

describe("seedForceLayoutPositions — pinned positions", () => {
	it("overrides random reseed with pinned position and sets fx/fy", () => {
		const node = makeNode("a", { x: 0, y: 0 });
		const ctx = { ...baseCtx, pinnedPositions: { a: { x: 999, y: -999 } } };
		seedForceLayoutPositions([node], ctx);
		expect(node.x).toBe(999);
		expect(node.y).toBe(-999);
		expect(node.fx).toBe(999);
		expect(node.fy).toBe(-999);
	});

	it("overrides saved position with pinned position", () => {
		const node = makeNode("a", { x: 0, y: 0 });
		const ctx = {
			...baseCtx,
			savedPositionsValid: true,
			savedPositions: new Map([["a", { x: 1, y: 2 }]]),
			pinnedPositions: { a: { x: 999, y: -999 } },
		};
		seedForceLayoutPositions([node], ctx);
		expect(node.x).toBe(999);
		expect(node.y).toBe(-999);
		expect(node.fx).toBe(999);
		expect(node.fy).toBe(-999);
	});

	it("does not set fx/fy for non-pinned nodes", () => {
		const node = makeNode("a", { x: 50, y: 75 });
		seedForceLayoutPositions([node], baseCtx);
		expect(node.fx).toBeUndefined();
		expect(node.fy).toBeUndefined();
	});
});

describe("seedForceLayoutPositions — fade-in spiral", () => {
	function makeFade(staggerIds: string[]): FadeInSeed {
		const stagger = new Map(staggerIds.map((id) => [id, 0]));
		return { stagger, originX: 50, originY: 60 };
	}

	it("places fade-in nodes on a Fermat spiral around the fade origin", () => {
		const fade = makeFade(["a"]);
		const node = makeNode("a", { x: 0, y: 0 });
		seedForceLayoutPositions([node], { ...baseCtx, fade });

		// fadeIdx=0 → r = FADE_RING_BASE + 0 = 22, theta = 0 → (originX + 22, originY)
		expect(node.x).toBe(50 + 22);
		expect(node.y).toBe(60);
		// Outward velocity nudge
		expect(node.vx).toBeCloseTo(0.8, 5);
		expect(node.vy).toBeCloseTo(0, 5);
	});

	it("increments fadeIdx so successive members get distinct positions", () => {
		const fade = makeFade(["a", "b"]);
		const a = makeNode("a", { x: 0, y: 0 });
		const b = makeNode("b", { x: 0, y: 0 });
		seedForceLayoutPositions([a, b], { ...baseCtx, fade });
		expect(a.x).not.toBe(b.x);
		expect(a.y).not.toBe(b.y);
	});

	it("skips fade-in branch for nodes not in the stagger map", () => {
		const fade = makeFade(["a"]);
		const fadingNode = makeNode("a", { x: 0, y: 0 });
		const normalNode = makeNode("b", { x: 50, y: 75 }); // finite, in-range
		seedForceLayoutPositions([fadingNode, normalNode], { ...baseCtx, fade });
		// fadingNode placed on spiral; normalNode left untouched
		expect(fadingNode.x).toBe(50 + 22);
		expect(normalNode.x).toBe(50);
		expect(normalNode.y).toBe(75);
	});

	it("does not advance fadeIdx for non-fade-in nodes (mixed list)", () => {
		const fade = makeFade(["a", "c"]);
		const a = makeNode("a", { x: 0, y: 0 });
		const b = makeNode("b", { x: 100, y: 200 }); // not in fade
		const c = makeNode("c", { x: 0, y: 0 });
		seedForceLayoutPositions([a, b, c], { ...baseCtx, fade });
		// 'a' at fadeIdx=0, 'c' at fadeIdx=1 (not 2 — 'b' didn't consume an index)
		// fadeIdx=1 → r = 22 + sqrt(1)*2.4*3 = 22 + 7.2 = 29.2
		const goldenAngle = Math.PI * (3 - Math.sqrt(5));
		expect(c.x).toBeCloseTo(50 + Math.cos(goldenAngle) * 29.2, 5);
		expect(c.y).toBeCloseTo(60 + Math.sin(goldenAngle) * 29.2, 5);
	});
});

describe("seedForceLayoutPositions — combined / edge cases", () => {
	it("handles empty node list without throwing", () => {
		expect(() => seedForceLayoutPositions([], baseCtx)).not.toThrow();
	});

	it("does not mutate already-good non-fade non-saved non-pinned nodes", () => {
		const node = makeNode("a", { x: 12, y: 34, vx: 5, vy: 6 });
		seedForceLayoutPositions([node], baseCtx);
		expect(node.x).toBe(12);
		expect(node.y).toBe(34);
		expect(node.vx).toBe(5);
		expect(node.vy).toBe(6);
	});
});
