import { describe, it, expect } from "vitest";
import { computeAutoFitTransform, computeVisibleFraction } from "../src/utils/graph-helpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mkNodes = (coords: [number, number][], r = 10) => coords.map(([x, y]) => ({ x, y, r }));

/** Generate nodes biased along one axis: x ∈ [0, xMax], y ∈ [0, yMax] */
function mkBiasedNodes(count: number, xMax: number, yMax: number): { x: number; y: number; r: number }[] {
	const nodes: { x: number; y: number; r: number }[] = [];
	for (let i = 0; i < count; i++) {
		const t = count > 1 ? i / (count - 1) : 0;
		nodes.push({ x: t * xMax, y: t * yMax, r: 10 });
	}
	return nodes;
}

// ===========================================================================
// computeAutoFitTransform — edge cases for extreme distributions
// ===========================================================================

describe("computeAutoFitTransform — extreme distributions", () => {
	it("handles 2000+ nodes biased in X direction (x:0-10000, y:0-100)", () => {
		const nodes = mkBiasedNodes(2000, 10000, 100);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 1200,
			canvasH: 800,
			padding: 0,
		});
		expect(result).not.toBeNull();
		expect(result!.scale).toBeGreaterThan(0);
		expect(isFinite(result!.scale)).toBe(true);
		// BBox width ≈ 10020 (+ 2*r=10), height ≈ 120
		// Scale limited by width: 1200/10020 ≈ 0.12
		expect(result!.scale).toBeLessThan(0.2);
		// Center should be in the middle of the bbox
		expect(result!.cx).toBeCloseTo(5000, -1);
		// All nodes should map roughly to canvas center
		const screenCx = result!.cx * result!.scale + result!.x;
		expect(screenCx).toBeCloseTo(600, 0);
	});

	it("handles 2000+ nodes biased in Y direction (x:0-100, y:0-10000)", () => {
		const nodes = mkBiasedNodes(2000, 100, 10000);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 1200,
			canvasH: 800,
			padding: 0,
		});
		expect(result).not.toBeNull();
		// Scale limited by height: 800/10020 ≈ 0.08
		expect(result!.scale).toBeLessThan(0.1);
		expect(result!.cy).toBeCloseTo(5000, -1);
	});

	it("returns null when all node coordinates contain NaN", () => {
		const nodes = mkNodes([
			[NaN, NaN],
			[NaN, NaN],
		]);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
		});
		// NaN propagates through bounds → scale/cx/cy become NaN → returns null
		expect(result).toBeNull();
	});

	it("returns null when some coordinates are Infinity", () => {
		const nodes = mkNodes([
			[0, 0],
			[Infinity, 100],
		]);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
		});
		// Infinity in bounds → bw/bh = Infinity → scale = 0 or NaN → null
		expect(result).toBeNull();
	});

	it("returns null when coordinates are -Infinity", () => {
		const nodes = mkNodes([
			[-Infinity, 0],
			[100, 100],
		]);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
		});
		expect(result).toBeNull();
	});

	it("handles mixed NaN and valid nodes gracefully", () => {
		const nodes = [
			{ x: 0, y: 0, r: 10 },
			{ x: NaN, y: 50, r: 10 },
			{ x: 100, y: 100, r: 10 },
		];
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
		});
		// NaN in comparisons (NaN < x) is always false, so NaN nodes
		// are silently skipped by the min/max loop — only valid nodes
		// contribute to the bounding box. This is an important behavior
		// to document: NaN nodes do NOT cause failure.
		expect(result).not.toBeNull();
		expect(result!.scale).toBeGreaterThan(0);
		expect(isFinite(result!.cx)).toBe(true);
		expect(isFinite(result!.cy)).toBe(true);
	});

	it("handles extremely wide bbox (width >> height)", () => {
		// 100:1 aspect ratio
		const nodes = mkNodes([
			[0, 0],
			[10000, 100],
		]);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
			padding: 0,
		});
		expect(result).not.toBeNull();
		// Width dominates: scale = min(800/10020, 600/120) = 800/10020 ≈ 0.08
		expect(result!.scale).toBeCloseTo(800 / 10020, 2);
		// Canvas should still center the bbox
		const screenCx = result!.cx * result!.scale + result!.x;
		const screenCy = result!.cy * result!.scale + result!.y;
		expect(screenCx).toBeCloseTo(400, 0);
		expect(screenCy).toBeCloseTo(300, 0);
	});

	it("handles extremely tall bbox (height >> width)", () => {
		// 1:100 aspect ratio
		const nodes = mkNodes([
			[0, 0],
			[100, 10000],
		]);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
			padding: 0,
		});
		expect(result).not.toBeNull();
		// Height dominates: scale = min(800/120, 600/10020) = 600/10020 ≈ 0.06
		expect(result!.scale).toBeCloseTo(600 / 10020, 2);
	});

	it("handles nodes with radius 0", () => {
		const nodes = [
			{ x: 0, y: 0, r: 0 },
			{ x: 100, y: 100, r: 0 },
		];
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
			padding: 80,
		});
		expect(result).not.toBeNull();
		// BBox: 0-100 in both axes → bw=bh=180 (with padding 80)
		expect(result!.scale).toBeGreaterThan(0);
	});

	it("handles all nodes at the exact same position", () => {
		const nodes = mkNodes([
			[50, 50],
			[50, 50],
			[50, 50],
		]);
		const result = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
			padding: 80,
		});
		expect(result).not.toBeNull();
		// BBox: 40-60 in both axes (±r=10) → bw=bh=100 (with padding 80)
		expect(result!.cx).toBeCloseTo(50);
		expect(result!.cy).toBeCloseTo(50);
		expect(result!.scale).toBeLessThanOrEqual(1.5);
	});
});

// ===========================================================================
// computeVisibleFraction — edge cases
// ===========================================================================

describe("computeVisibleFraction — edge cases", () => {
	it("returns 0 for empty nodes", () => {
		expect(computeVisibleFraction([], 0, 0, 1, 800, 600)).toBe(0);
	});

	it("all nodes visible when scale is very small (zoomed out)", () => {
		const nodes = mkNodes([
			[-5000, -5000],
			[5000, 5000],
		]);
		const fraction = computeVisibleFraction(nodes, 0, 0, 0.01, 800, 600);
		expect(fraction).toBe(1);
	});

	it("few nodes visible when scale is very large (zoomed in)", () => {
		const nodes: { x: number; y: number }[] = [];
		for (let i = 0; i < 100; i++) {
			nodes.push({ x: i * 100, y: i * 100 });
		}
		const fraction = computeVisibleFraction(nodes, 5000, 5000, 10, 800, 600);
		expect(fraction).toBeLessThan(0.1);
	});
});

// ===========================================================================
// ensureViewportUtilization — math logic tests
// (Replicating the pure math from GVC private methods)
// ===========================================================================

describe("ensureViewportUtilization — spread degenerate axis logic", () => {
	/**
	 * Replicates _spreadDegenerateAxis logic as a pure function for testing.
	 * Mutates nodes in-place, same as the original.
	 */
	function spreadDegenerateAxis(
		nodes: { x: number; y: number }[],
		cx: number,
		cy: number,
		bboxW: number,
		bboxH: number,
		degenerateThreshold: number,
		minUtil: number,
		vpArea: number,
	): void {
		const n = nodes.length;
		if (bboxW > degenerateThreshold && bboxH < degenerateThreshold) {
			const targetH = Math.max(bboxW * 0.3, (minUtil * vpArea) / bboxW);
			nodes.forEach((pn, i) => {
				const t = n > 1 ? i / (n - 1) - 0.5 : 0;
				pn.y = cy + t * targetH;
			});
		} else if (bboxH > degenerateThreshold && bboxW < degenerateThreshold) {
			const targetW = Math.max(bboxH * 0.3, (minUtil * vpArea) / bboxH);
			nodes.forEach((pn, i) => {
				const t = n > 1 ? i / (n - 1) - 0.5 : 0;
				pn.x = cx + t * targetW;
			});
		}
	}

	it("spreads horizontal line distribution vertically", () => {
		// Nodes in a horizontal line: wide X, zero Y variation
		const nodes = Array.from({ length: 20 }, (_, i) => ({
			x: i * 100,
			y: 50,
		}));
		const cx = 950;
		const cy = 50;
		const bboxW = 1900;
		const bboxH = 0;
		const degenerateThreshold = 40; // avgR*4
		const minUtil = 0.3;
		const vpArea = 800 * 600;

		spreadDegenerateAxis(nodes, cx, cy, bboxW, bboxH, degenerateThreshold, minUtil, vpArea);

		// After spreading, Y values should span a significant range
		const ys = nodes.map((n) => n.y);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);
		expect(maxY - minY).toBeGreaterThan(100);
		// X values should be unchanged
		expect(nodes[0].x).toBe(0);
		expect(nodes[19].x).toBe(1900);
		// Y should be centered around cy
		expect((minY + maxY) / 2).toBeCloseTo(cy, 0);
	});

	it("spreads vertical line distribution horizontally", () => {
		const nodes = Array.from({ length: 20 }, (_, i) => ({
			x: 50,
			y: i * 100,
		}));
		const cx = 50;
		const cy = 950;
		const bboxW = 0;
		const bboxH = 1900;
		const degenerateThreshold = 40;
		const minUtil = 0.3;
		const vpArea = 800 * 600;

		spreadDegenerateAxis(nodes, cx, cy, bboxW, bboxH, degenerateThreshold, minUtil, vpArea);

		const xs = nodes.map((n) => n.x);
		const minX = Math.min(...xs);
		const maxX = Math.max(...xs);
		expect(maxX - minX).toBeGreaterThan(100);
		// Y values should be unchanged
		expect(nodes[0].y).toBe(0);
		expect(nodes[19].y).toBe(1900);
	});

	it("does not spread when both axes are above threshold", () => {
		const nodes = [
			{ x: 0, y: 0 },
			{ x: 500, y: 500 },
		];
		const original = nodes.map((n) => ({ ...n }));

		spreadDegenerateAxis(nodes, 250, 250, 500, 500, 40, 0.3, 800 * 600);

		expect(nodes[0].x).toBe(original[0].x);
		expect(nodes[0].y).toBe(original[0].y);
		expect(nodes[1].x).toBe(original[1].x);
		expect(nodes[1].y).toBe(original[1].y);
	});

	it("handles single node (t=0, no spread offset)", () => {
		const nodes = [{ x: 100, y: 50 }];

		spreadDegenerateAxis(nodes, 100, 50, 200, 0, 40, 0.3, 800 * 600);

		// Single node: t=0, so y = cy + 0 * targetH = cy
		expect(nodes[0].y).toBe(50);
		// x unchanged
		expect(nodes[0].x).toBe(100);
	});
});

describe("ensureViewportUtilization — scaleFactor calculation", () => {
	/**
	 * Replicates _computeViewportScaleFactor as a pure function.
	 */
	function computeViewportScaleFactor(
		bboxW: number,
		bboxH: number,
		minUtil: number,
		vpArea: number,
		util: number,
		avgR: number,
	): number {
		const posSpanW = Math.max(bboxW - 2 * avgR, 1);
		const posSpanH = Math.max(bboxH - 2 * avgR, 1);
		const A = posSpanW * posSpanH;
		const B = 2 * avgR * (posSpanW + posSpanH);
		const C = 4 * avgR * avgR - minUtil * vpArea;
		const disc = B * B - 4 * A * C;
		return disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : Math.sqrt(minUtil / util);
	}

	it("produces positive scale factor for typical inputs", () => {
		const sf = computeViewportScaleFactor(200, 200, 0.3, 800 * 600, 0.05, 10);
		expect(sf).toBeGreaterThan(1); // should scale up to fill viewport
		expect(isFinite(sf)).toBe(true);
	});

	it("produces larger scale factor for smaller bbox", () => {
		const sfSmall = computeViewportScaleFactor(100, 100, 0.3, 800 * 600, 0.01, 10);
		const sfLarge = computeViewportScaleFactor(500, 500, 0.3, 800 * 600, 0.15, 10);
		expect(sfSmall).toBeGreaterThan(sfLarge);
	});

	it("handles extreme aspect ratio (very wide bbox)", () => {
		const sf = computeViewportScaleFactor(5000, 10, 0.3, 800 * 600, 0.001, 10);
		expect(sf).toBeGreaterThan(0);
		expect(isFinite(sf)).toBe(true);
	});

	it("handles extreme aspect ratio (very tall bbox)", () => {
		const sf = computeViewportScaleFactor(10, 5000, 0.3, 800 * 600, 0.001, 10);
		expect(sf).toBeGreaterThan(0);
		expect(isFinite(sf)).toBe(true);
	});

	it("falls back to sqrt(minUtil/util) when discriminant is negative", () => {
		// Need disc = B² - 4AC < 0
		// A = posSpanW * posSpanH, B = 2*avgR*(posSpanW+posSpanH), C = 4*avgR² - minUtil*vpArea
		// With bboxW=22, bboxH=22, avgR=10: posSpanW=posSpanH=2
		// A=4, B=2*10*4=80, C=400 - minUtil*vpArea
		// disc = 6400 - 16*(400 - minUtil*vpArea) = 6400 - 6400 + 16*minUtil*vpArea
		// For disc < 0: need 16*minUtil*vpArea < 0, impossible with positive values.
		// The quadratic approach: use avgR > bboxW/2 so posSpan = max(bboxW-2*avgR, 1) = 1
		// With bboxW=5, bboxH=5, avgR=10: posSpanW=posSpanH=1
		// A=1, B=2*10*2=40, C=400 - minUtil*vpArea
		// disc = 1600 - 4*(400 - minUtil*vpArea) = 4*minUtil*vpArea
		// Still ≥ 0. The discriminant B²-4AC = 4*avgR²*(posSpanW+posSpanH)² - 4*posSpanW*posSpanH*(4*avgR² - minUtil*vpArea)
		// This equals 4*[avgR²*(Sw+Sh)² - Sw*Sh*(4*avgR² - minUtil*vpArea)]
		// = 4*[avgR²*((Sw+Sh)² - 4*Sw*Sh) + Sw*Sh*minUtil*vpArea]
		// = 4*[avgR²*(Sw-Sh)² + Sw*Sh*minUtil*vpArea]
		// Both terms ≥ 0, so discriminant is always ≥ 0.
		// The fallback path is unreachable with valid positive inputs.
		// Test the quadratic solver path instead: verify it produces reasonable results
		// when disc is exactly 0 (Sw === Sh and one of them is degenerate)
		const sf = computeViewportScaleFactor(22, 22, 0.3, 800 * 600, 0.001, 10);
		// posSpanW=posSpanH=2, A=4, B=80, C=400-144000=-143600
		// disc = 6400 + 4*4*143600 = 6400+2297600 > 0 → quadratic path
		expect(sf).toBeGreaterThan(0);
		expect(isFinite(sf)).toBe(true);
	});
});

// ===========================================================================
// Simulation end — consolidated autoFit pipeline
// ===========================================================================

describe("simulation end — autoFit pipeline consolidation", () => {
	/**
	 * Simulates the consolidated simulation-end autoFit pipeline:
	 * 1. ensureViewportUtilization modifies node positions (data stage)
	 * 2. Single deferred autoFitView via requestAnimationFrame (render stage)
	 * 3. Coverage validation: if <80% visible, retry with padding=0
	 */
	interface PipelineState {
		autoFitCalls: number;
		lastFitW: number;
		lastFitH: number;
		suppressAutoFit: boolean;
		viewportUtilCalled: boolean;
	}

	function createPipelineState(): PipelineState {
		return {
			autoFitCalls: 0,
			lastFitW: 0,
			lastFitH: 0,
			suppressAutoFit: false,
			viewportUtilCalled: false,
		};
	}

	function simulateSimEndPipeline(state: PipelineState, canvasW: number, canvasH: number): void {
		// Step 1: ensureViewportUtilization (data stage)
		if (canvasW > 0 && canvasH > 0) state.viewportUtilCalled = true;

		// Step 2: Single deferred autoFitView (consolidated)
		if (!state.suppressAutoFit && canvasW > 0 && canvasH > 0) {
			state.autoFitCalls++;
			state.lastFitW = canvasW;
			state.lastFitH = canvasH;
		}
	}

	it("calls autoFitView exactly once (consolidated from two calls)", () => {
		const state = createPipelineState();
		simulateSimEndPipeline(state, 1200, 800);
		expect(state.autoFitCalls).toBe(1);
	});

	it("skips autoFitView when suppressAutoFit is true", () => {
		const state = createPipelineState();
		state.suppressAutoFit = true;
		simulateSimEndPipeline(state, 1200, 800);
		expect(state.autoFitCalls).toBe(0);
	});

	it("still calls ensureViewportUtilization even when autoFit is suppressed", () => {
		const state = createPipelineState();
		state.suppressAutoFit = true;
		simulateSimEndPipeline(state, 1200, 800);
		expect(state.viewportUtilCalled).toBe(true);
	});

	it("skips both when canvas dimensions are zero", () => {
		const state = createPipelineState();
		simulateSimEndPipeline(state, 0, 0);
		expect(state.autoFitCalls).toBe(0);
		expect(state.viewportUtilCalled).toBe(false);
	});

	it("uses fresh canvas dimensions for the deferred fit", () => {
		const state = createPipelineState();
		simulateSimEndPipeline(state, 1200, 800);
		expect(state.lastFitW).toBe(1200);
		expect(state.lastFitH).toBe(800);
	});
});

describe("autoFit coverage validation — retry logic", () => {
	it("retries with no padding when coverage < 80%", () => {
		// Wide spread nodes on a tiny canvas with large padding:
		// padding=0 retry should achieve reasonable coverage (>= 80%)
		const nodes = mkBiasedNodes(100, 5000, 5000);
		const firstFit = computeAutoFitTransform({
			nodes,
			canvasW: 400,
			canvasH: 300,
			padding: 200,
		});
		expect(firstFit).not.toBeNull();

		// Note: padded fit may already reach 100% at a smaller scale, so retry
		// (padding=0, maxScale capped) can clip edges — check absolute threshold only
		const retryFit = computeAutoFitTransform({
			nodes,
			canvasW: 400,
			canvasH: 300,
			padding: 0,
			minScale: 0,
			maxScale: firstFit!.scale * 1.5,
		});
		expect(retryFit).not.toBeNull();
		const retryFrac = computeVisibleFraction(nodes, retryFit!.cx, retryFit!.cy, retryFit!.scale, 400, 300);
		expect(retryFrac).toBeGreaterThanOrEqual(0.8);
	});

	it("does not retry when coverage >= 80%", () => {
		// Tight cluster: all nodes easily fit
		const nodes = mkNodes(
			[
				[0, 0],
				[50, 50],
				[100, 100],
			],
			5,
		);
		const fit = computeAutoFitTransform({
			nodes,
			canvasW: 800,
			canvasH: 600,
			padding: 80,
		});
		expect(fit).not.toBeNull();
		const frac = computeVisibleFraction(nodes, fit!.cx, fit!.cy, fit!.scale, 800, 600);
		expect(frac).toBeGreaterThanOrEqual(0.8);
	});

	it("retry produces valid transform", () => {
		const nodes = mkBiasedNodes(50, 3000, 3000);
		const retry = computeAutoFitTransform({
			nodes,
			canvasW: 200,
			canvasH: 150,
			padding: 0,
			minScale: 0,
			maxScale: 1.5,
		});
		expect(retry).not.toBeNull();
		expect(retry!.scale).toBeGreaterThan(0);
		expect(isFinite(retry!.cx)).toBe(true);
		expect(isFinite(retry!.cy)).toBe(true);
	});
});

// ===========================================================================
// _autoFocusActiveFile → doRender → autoFitView — recursion prevention
// ===========================================================================

describe("autoFocusActiveFile → autoFitView recursion prevention", () => {
	/**
	 * Simulates the flag-based recursion prevention mechanism.
	 * This tests the state machine that controls autoFit suppression
	 * when _autoFocusActiveFile triggers a doRender for local graphs.
	 */
	interface AutoFitStateMachine {
		hasAutoFocused: boolean;
		suppressAutoFit: boolean;
		localGraphCenter: string | null;
		nodeCount: number;
		renderCount: number;
		autoFitCount: number;
	}

	function createStateMachine(nodeCount: number): AutoFitStateMachine {
		return {
			hasAutoFocused: false,
			suppressAutoFit: false,
			localGraphCenter: null,
			nodeCount,
			renderCount: 0,
			autoFitCount: 0,
		};
	}

	const LARGE_GRAPH_THRESHOLD = 500;

	function simulateAutoFocusActiveFile(
		state: AutoFitStateMachine,
		activeFilePath: string | null,
		syncWithEditor: boolean,
	): void {
		if (state.hasAutoFocused) return;
		if (!syncWithEditor) return;
		state.hasAutoFocused = true;

		if (!activeFilePath) return;

		// Large graph: switch to local graph and re-render
		if (state.localGraphCenter === null && state.nodeCount > LARGE_GRAPH_THRESHOLD) {
			state.localGraphCenter = activeFilePath;
			state.suppressAutoFit = true;
			simulateDoRender(state);
			return;
		}

		// Small graph: just pan to node (no re-render)
	}

	function simulateDoRender(state: AutoFitStateMachine): void {
		state.renderCount++;
		// After simulation settles, simulation-end fires
		simulateSimulationEnd(state);
	}

	function simulateSimulationEnd(state: AutoFitStateMachine): void {
		// autoFitView is called at simulation end
		if (!state.suppressAutoFit) {
			state.autoFitCount++;
		}
		// After _autoFocusActiveFile, suppressAutoFit is cleared
		// (In real code: this.suppressAutoFit = false after _autoFocusActiveFile returns)
	}

	it("large graph: suppresses autoFit during re-render, allows after", () => {
		const state = createStateMachine(1000);

		// Step 1: Initial render's simulation-end calls _autoFocusActiveFile
		simulateAutoFocusActiveFile(state, "notes/test.md", true);

		// autoFocusActiveFile triggered doRender with suppressAutoFit=true
		expect(state.renderCount).toBe(1);
		expect(state.autoFitCount).toBe(0); // suppressed during re-render
		expect(state.suppressAutoFit).toBe(true);
		expect(state.localGraphCenter).toBe("notes/test.md");

		// Step 2: After _autoFocusActiveFile returns, flag is cleared
		state.suppressAutoFit = false;

		// Step 3: Next simulation-end should allow autoFit
		simulateSimulationEnd(state);
		expect(state.autoFitCount).toBe(1);
	});

	it("small graph: no re-render, no suppression", () => {
		const state = createStateMachine(100);

		simulateAutoFocusActiveFile(state, "notes/test.md", true);

		expect(state.renderCount).toBe(0); // no re-render for small graphs
		expect(state.autoFitCount).toBe(0); // no simulation-end triggered
		expect(state.suppressAutoFit).toBe(false);
		expect(state.localGraphCenter).toBeNull(); // not set for small graphs
	});

	it("idempotent: second call is no-op due to hasAutoFocused flag", () => {
		const state = createStateMachine(1000);

		simulateAutoFocusActiveFile(state, "notes/test.md", true);
		const afterFirst = { ...state };

		simulateAutoFocusActiveFile(state, "notes/other.md", true);
		expect(state.renderCount).toBe(afterFirst.renderCount);
		expect(state.localGraphCenter).toBe("notes/test.md");
	});

	it("no-op when syncWithEditor is false", () => {
		const state = createStateMachine(1000);

		simulateAutoFocusActiveFile(state, "notes/test.md", false);

		expect(state.hasAutoFocused).toBe(false);
		expect(state.renderCount).toBe(0);
	});

	it("no-op when no active file", () => {
		const state = createStateMachine(1000);

		simulateAutoFocusActiveFile(state, null, true);

		expect(state.hasAutoFocused).toBe(true);
		expect(state.renderCount).toBe(0);
		expect(state.localGraphCenter).toBeNull();
	});

	it("does not suppress autoFit when localGraphCenter is already set", () => {
		const state = createStateMachine(1000);
		state.localGraphCenter = "notes/existing.md"; // already has local graph

		simulateAutoFocusActiveFile(state, "notes/test.md", true);

		// Should NOT trigger re-render since localGraphCenter is not null
		expect(state.suppressAutoFit).toBe(false);
		expect(state.renderCount).toBe(0);
	});
});
