import { describe, it, expect, vi, beforeEach } from "vitest";
import { Minimap, type MinimapHost } from "../src/views/Minimap";

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
