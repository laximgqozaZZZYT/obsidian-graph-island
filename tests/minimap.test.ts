import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	Minimap,
	minimapDotRadius,
	clampViewportRect,
	MINIMAP_WIDTH,
	MINIMAP_HEIGHT,
	MINIMAP_LARGE_GRAPH_THRESHOLD,
	MINIMAP_MEDIUM_GRAPH_THRESHOLD,
	MINIMAP_DOT_SCALE_LARGE,
	MINIMAP_DOT_SCALE_MEDIUM,
	MINIMAP_VIEWPORT_MIN_SIZE,
	type MinimapHost,
} from "../src/views/Minimap";

// ---------------------------------------------------------------------------
// Minimal DOM stubs (vitest runs in Node, no real DOM)
// ---------------------------------------------------------------------------
function createMockCanvas() {
	const ctx = {
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 0,
		beginPath: vi.fn(),
		arc: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		strokeRect: vi.fn(),
		font: "",
		textAlign: "",
		textBaseline: "",
		fillText: vi.fn(),
		scale: vi.fn(),
	};
	return {
		width: 180,
		height: 120,
		className: "",
		style: {} as Record<string, any>,
		getContext: vi.fn(() => ctx),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 180, height: 120 })),
		_ctx: ctx,
	};
}

function createMockDiv() {
	return {
		className: "",
		style: {} as Record<string, any>,
		setAttribute: vi.fn(),
		appendChild: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		remove: vi.fn(),
		getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 200, height: 140 })),
		parentElement: null as any,
	};
}

// Stub document.createElement and document.addEventListener
const canvasMock = createMockCanvas();
const wrapperMock = createMockDiv();
const handleMock = createMockDiv();

let createElCallCount = 0;
const origCreateElement = globalThis.document?.createElement;
const origAddEventListener = globalThis.document?.addEventListener;
const origRemoveEventListener = globalThis.document?.removeEventListener;
const origGetComputedStyle = globalThis.getComputedStyle;

beforeEach(() => {
	createElCallCount = 0;

	// Provide minimal document stubs
	if (!globalThis.document) {
		(globalThis as any).document = {};
	}
	(globalThis.document as any).createElement = vi.fn((tag: string) => {
		createElCallCount++;
		if (tag === "canvas") return canvasMock;
		// First div = wrapper, second = handle
		return createElCallCount <= 2 ? wrapperMock : handleMock;
	});
	(globalThis.document as any).addEventListener = vi.fn();
	(globalThis.document as any).removeEventListener = vi.fn();
	(globalThis as any).getComputedStyle = vi.fn(() => ({
		getPropertyValue: () => "",
	}));
});

function createMockHost(overrides?: Partial<MinimapHost>): MinimapHost {
	return {
		getNodePositions: () => [],
		getWorldTransform: () => ({ x: 0, y: 0, scaleX: 1, scaleY: 1 }),
		getViewportSize: () => ({ width: 800, height: 600 }),
		setWorldPosition: vi.fn(),
		wakeRenderLoop: vi.fn(),
		announceViewportChange: vi.fn(),
		...overrides,
	};
}

function createMockParent() {
	return {
		appendChild: vi.fn(),
		getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 1000, height: 800 })),
	} as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Minimap", () => {
	it("constructs without error", () => {
		const host = createMockHost();
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		expect(minimap).toBeTruthy();
		minimap.destroy();
	});

	it("setVisible hides wrapper", () => {
		const host = createMockHost();
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		minimap.setVisible(false);
		// draw should be a no-op when not visible
		minimap.draw();
		// clearRect should not be called since visible=false
		expect(canvasMock._ctx.clearRect).not.toHaveBeenCalled();
		minimap.destroy();
	});

	it("draw clears canvas when no nodes", () => {
		const host = createMockHost({ getNodePositions: () => [] });
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		minimap.setVisible(true);
		canvasMock._ctx.clearRect.mockClear();
		minimap.draw();
		expect(canvasMock._ctx.clearRect).toHaveBeenCalledWith(0, 0, 180, 120);
		minimap.destroy();
	});

	it("draw renders dots for nodes", () => {
		const positions = [
			{ x: 0, y: 0, id: "a" },
			{ x: 100, y: 100, id: "b" },
			{ x: 200, y: 200, id: "c" },
		];
		const host = createMockHost({ getNodePositions: () => positions });
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		minimap.setVisible(true);
		canvasMock._ctx.arc.mockClear();
		canvasMock._ctx.fill.mockClear();
		minimap.draw();
		// Should have drawn 3 dots
		expect(canvasMock._ctx.arc).toHaveBeenCalledTimes(3);
		expect(canvasMock._ctx.fill).toHaveBeenCalledTimes(3);
		minimap.destroy();
	});

	it("draw renders viewport rectangle when zoomed in", () => {
		const positions = [
			{ x: 0, y: 0, id: "a" },
			{ x: 1000, y: 1000, id: "b" },
		];
		const host = createMockHost({
			getNodePositions: () => positions,
			getWorldTransform: () => ({ x: -100, y: -100, scaleX: 2, scaleY: 2 }),
			getViewportSize: () => ({ width: 800, height: 600 }),
		});
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		minimap.setVisible(true);
		canvasMock._ctx.strokeRect.mockClear();
		minimap.draw();
		// When zoomed in, viewport rect should be drawn
		expect(canvasMock._ctx.strokeRect).toHaveBeenCalled();
		minimap.destroy();
	});

	it("destroy removes event listeners", () => {
		const host = createMockHost();
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		minimap.destroy();
		// Should have called remove listeners
		expect(canvasMock.removeEventListener).toHaveBeenCalled();
		expect((globalThis.document as any).removeEventListener).toHaveBeenCalled();
	});

	it("setRenderThresholds stores thresholds", () => {
		const host = createMockHost();
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		// Should not throw
		minimap.setRenderThresholds({ minimapThinThreshold: 500 } as any);
		minimap.destroy();
	});

	it("draw with thinning for large node counts", () => {
		// Create 1000+ node positions
		const positions = Array.from({ length: 1000 }, (_, i) => ({
			x: i * 10,
			y: i * 5,
			id: `n${i}`,
		}));
		const host = createMockHost({ getNodePositions: () => positions });
		const parent = createMockParent();
		const minimap = new Minimap(host, parent);
		minimap.setVisible(true);
		canvasMock._ctx.arc.mockClear();
		minimap.draw();
		// With default thinning (>800 nodes, step=3), not all 1000 should be drawn
		const arcCalls = canvasMock._ctx.arc.mock.calls.length;
		expect(arcCalls).toBeLessThan(1000);
		expect(arcCalls).toBeGreaterThan(0);
		minimap.destroy();
	});
});

// ---------------------------------------------------------------------------
// Pure-function tests: minimapDotRadius
// ---------------------------------------------------------------------------
describe("minimapDotRadius", () => {
	const BASE = 2.5;

	it("returns base radius for empty graph", () => {
		expect(minimapDotRadius(0, BASE)).toBe(BASE);
	});

	it("returns base radius for small graph (<= medium threshold)", () => {
		expect(minimapDotRadius(MINIMAP_MEDIUM_GRAPH_THRESHOLD, BASE)).toBe(BASE);
	});

	it("returns medium-scaled radius just above medium threshold", () => {
		expect(minimapDotRadius(MINIMAP_MEDIUM_GRAPH_THRESHOLD + 1, BASE)).toBeCloseTo(BASE * MINIMAP_DOT_SCALE_MEDIUM);
	});

	it("returns medium-scaled radius at the upper edge (== large threshold)", () => {
		expect(minimapDotRadius(MINIMAP_LARGE_GRAPH_THRESHOLD, BASE)).toBeCloseTo(BASE * MINIMAP_DOT_SCALE_MEDIUM);
	});

	it("returns large-scaled radius just above large threshold", () => {
		expect(minimapDotRadius(MINIMAP_LARGE_GRAPH_THRESHOLD + 1, BASE)).toBeCloseTo(BASE * MINIMAP_DOT_SCALE_LARGE);
	});

	it("scales linearly with baseDotR", () => {
		// Same nodeCount band but different base → output stays proportional.
		const big = MINIMAP_LARGE_GRAPH_THRESHOLD + 100;
		expect(minimapDotRadius(big, 1)).toBeCloseTo(MINIMAP_DOT_SCALE_LARGE);
		expect(minimapDotRadius(big, 4)).toBeCloseTo(4 * MINIMAP_DOT_SCALE_LARGE);
	});

	it("monotonically non-increasing as node count crosses thresholds", () => {
		// Larger graphs get smaller (or equal) dots, never bigger.
		const small = minimapDotRadius(0, BASE);
		const medium = minimapDotRadius(MINIMAP_MEDIUM_GRAPH_THRESHOLD + 1, BASE);
		const large = minimapDotRadius(MINIMAP_LARGE_GRAPH_THRESHOLD + 1, BASE);
		expect(medium).toBeLessThanOrEqual(small);
		expect(large).toBeLessThanOrEqual(medium);
	});

	it("handles zero baseDotR (degenerate)", () => {
		expect(minimapDotRadius(0, 0)).toBe(0);
		expect(minimapDotRadius(MINIMAP_LARGE_GRAPH_THRESHOLD + 1, 0)).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Pure-function tests: clampViewportRect
// ---------------------------------------------------------------------------
describe("clampViewportRect", () => {
	// Identity converters: world coords == minimap coords. scale=1 keeps math obvious.
	const id = (v: number) => v;

	it("returns null when viewport covers entire minimap (max-zoom-out)", () => {
		// Rect covers full minimap → not drawn (the user's view IS the whole graph).
		const r = clampViewportRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT, id, id, 1);
		expect(r).toBeNull();
	});

	it("returns null for sub-pixel viewport (below MIN_SIZE)", () => {
		const tiny = MINIMAP_VIEWPORT_MIN_SIZE / 2;
		const r = clampViewportRect(10, 10, tiny, tiny, id, id, 1);
		expect(r).toBeNull();
	});

	it("returns rect for in-bounds viewport", () => {
		const r = clampViewportRect(20, 30, 50, 40, id, id, 1);
		expect(r).toEqual({ rx: 20, ry: 30, rw: 50, rh: 40 });
	});

	it("clamps left edge when rx < 0 and shrinks width accordingly", () => {
		// World x=-10 maps to mx=-10, should clamp to rx=0 with rw reduced by 10.
		const r = clampViewportRect(-10, 20, 60, 40, id, id, 1);
		expect(r).not.toBeNull();
		expect(r!.rx).toBe(0);
		expect(r!.rw).toBe(50); // 60 - 10
	});

	it("clamps top edge when ry < 0 and shrinks height accordingly", () => {
		const r = clampViewportRect(20, -15, 60, 50, id, id, 1);
		expect(r).not.toBeNull();
		expect(r!.ry).toBe(0);
		expect(r!.rh).toBe(35); // 50 - 15
	});

	it("clamps right edge when viewport extends past MINIMAP_WIDTH", () => {
		// rx=150, rw=80 → would extend to 230, clamped to MINIMAP_WIDTH (180).
		const r = clampViewportRect(150, 20, 80, 40, id, id, 1);
		expect(r).not.toBeNull();
		expect(r!.rx).toBe(150);
		expect(r!.rw).toBe(MINIMAP_WIDTH - 150);
	});

	it("clamps bottom edge when viewport extends past MINIMAP_HEIGHT", () => {
		const r = clampViewportRect(20, 100, 60, 80, id, id, 1);
		expect(r).not.toBeNull();
		expect(r!.ry).toBe(100);
		expect(r!.rh).toBe(MINIMAP_HEIGHT - 100);
	});

	it("applies world-to-minimap scale to width/height", () => {
		// scale=0.5 means the viewport on the minimap is half its world size.
		const r = clampViewportRect(0, 0, 100, 80, id, id, 0.5);
		expect(r).not.toBeNull();
		expect(r!.rw).toBe(50);
		expect(r!.rh).toBe(40);
	});

	it("uses converter functions for rx/ry origin", () => {
		// shifted converter: subtract a world offset before mapping.
		const offsetX = 100;
		const offsetY = 200;
		const tx = (wx: number) => wx - offsetX;
		const ty = (wy: number) => wy - offsetY;
		const r = clampViewportRect(120, 230, 50, 40, tx, ty, 1);
		expect(r).not.toBeNull();
		expect(r!.rx).toBe(20);
		expect(r!.ry).toBe(30);
	});

	it("returns rect when only one dimension covers full minimap (still partial view)", () => {
		// Width fills minimap but height is small → still draw the strip indicator.
		const r = clampViewportRect(0, 50, MINIMAP_WIDTH, 20, id, id, 1);
		expect(r).not.toBeNull();
		expect(r!.rw).toBe(MINIMAP_WIDTH);
		expect(r!.rh).toBe(20);
	});

	it("returns null when zero-size viewport", () => {
		const r = clampViewportRect(20, 20, 0, 0, id, id, 1);
		expect(r).toBeNull();
	});
});
