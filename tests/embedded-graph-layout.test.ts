import { describe, it, expect } from "vitest";
import { layoutConcentric, getColor } from "../src/views/EmbeddedGraphRenderer";
import { DEFAULT_COLORS } from "../src/types";
import type { GraphNode } from "../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string, filePath?: string): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, isTag: false, filePath: filePath ?? id + ".md" } as GraphNode;
}

// ---------------------------------------------------------------------------
// getColor
// ---------------------------------------------------------------------------

describe("getColor", () => {
	it("returns the first DEFAULT_COLOR for index 0", () => {
		expect(getColor(0)).toBe(DEFAULT_COLORS[0]);
	});

	it("returns the correct color for each index within range", () => {
		for (let i = 0; i < DEFAULT_COLORS.length; i++) {
			expect(getColor(i)).toBe(DEFAULT_COLORS[i]);
		}
	});

	it("wraps around with modulo beyond array length", () => {
		const len = DEFAULT_COLORS.length;
		expect(getColor(len)).toBe(DEFAULT_COLORS[0]);
		expect(getColor(len + 1)).toBe(DEFAULT_COLORS[1]);
		expect(getColor(len * 3)).toBe(DEFAULT_COLORS[0]);
	});

	it("returns a CSS hex color string", () => {
		const color = getColor(0);
		expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
	});
});

// ---------------------------------------------------------------------------
// layoutConcentric
// ---------------------------------------------------------------------------

describe("layoutConcentric", () => {
	it("does nothing for empty node list", () => {
		expect(() => layoutConcentric([])).not.toThrow();
	});

	it("places the single node at origin", () => {
		const nodes = [mkNode("a")];
		layoutConcentric(nodes);
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("places center node (index 0) at origin without centerPath", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		layoutConcentric(nodes);
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("places center node identified by filePath at origin", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		layoutConcentric(nodes, "b.md");
		expect(nodes[1].x).toBe(0);
		expect(nodes[1].y).toBe(0);
	});

	it("places center node identified by id at origin", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		layoutConcentric(nodes, "b");
		expect(nodes[1].x).toBe(0);
		expect(nodes[1].y).toBe(0);
	});

	it("falls back to index 0 when centerPath is not found", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		layoutConcentric(nodes, "nonexistent.md");
		expect(nodes[0].x).toBe(0);
		expect(nodes[0].y).toBe(0);
	});

	it("assigns non-zero positions to all non-center nodes", () => {
		const nodes = [mkNode("center"), mkNode("n1"), mkNode("n2"), mkNode("n3")];
		layoutConcentric(nodes, "center");
		for (let i = 1; i < nodes.length; i++) {
			const dist = Math.sqrt(nodes[i].x ** 2 + nodes[i].y ** 2);
			expect(dist).toBeGreaterThan(0);
		}
	});

	it("places first ring nodes at radius 80", () => {
		const nodes = [mkNode("c"), mkNode("n1")];
		layoutConcentric(nodes, "c");
		const dist = Math.sqrt(nodes[1].x ** 2 + nodes[1].y ** 2);
		expect(dist).toBeCloseTo(80, 1);
	});

	it("places second-ring nodes at radius 160 when first ring is full (8 nodes)", () => {
		// center + 8 first-ring + 1 second-ring = 10 nodes
		const nodes = Array.from({ length: 10 }, (_, i) => mkNode(i === 0 ? "center" : `n${i}`));
		layoutConcentric(nodes, "center");
		// Last node (index 9) should be in ring 1 (radius 160)
		const last = nodes[9];
		const dist = Math.sqrt(last.x ** 2 + last.y ** 2);
		expect(dist).toBeCloseTo(160, 1);
	});

	it("spaces nodes at equal angular intervals within the ring", () => {
		// 8 non-center nodes fill the first ring (capacity=8), each at 2π/8 = π/4 apart
		const nodes = [mkNode("c"), ...Array.from({ length: 8 }, (_, i) => mkNode(`n${i}`))];
		layoutConcentric(nodes, "c");
		// All non-center nodes should be at radius 80
		for (let i = 1; i < nodes.length; i++) {
			const dist = Math.sqrt(nodes[i].x ** 2 + nodes[i].y ** 2);
			expect(dist).toBeCloseTo(80, 1);
		}
		// Adjacent nodes should be spaced π/4 apart (360°/8 = 45°)
		const len1 = Math.sqrt(nodes[1].x ** 2 + nodes[1].y ** 2);
		const len2 = Math.sqrt(nodes[2].x ** 2 + nodes[2].y ** 2);
		const dot = (nodes[1].x * nodes[2].x + nodes[1].y * nodes[2].y) / (len1 * len2);
		expect(dot).toBeCloseTo(Math.cos(Math.PI / 4), 3);
	});
});
