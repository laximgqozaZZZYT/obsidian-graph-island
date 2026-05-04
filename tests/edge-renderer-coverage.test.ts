import { describe, it, expect } from "vitest";
import {
	EDGE_TYPE_FALLBACK_COLORS,
	EDGE_TYPE_SPECS,
	resolveEdgeColor,
	defaultColor,
	deduplicatePath,
	mergeNearbyValues,
} from "../src/views/EdgeRenderer";
import { smartTruncateLabel } from "../src/views/LabelManager";
import { parseCulledCount } from "../src/views/zoom-indicator";
import type { GraphEdge } from "../src/types";

const noRelColors = new Map<string, string>();

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
	return { source: "a", target: "b", type: "link", ...overrides } as GraphEdge;
}

describe("EDGE_TYPE_FALLBACK_COLORS integrity", () => {
	it("contains 'category' key for relation-fallback color", () => {
		expect(EDGE_TYPE_FALLBACK_COLORS.has("category")).toBe(true);
	});

	it("every fallback color value is a valid 24-bit hex number", () => {
		for (const [, color] of EDGE_TYPE_FALLBACK_COLORS) {
			expect(typeof color).toBe("number");
			expect(Number.isInteger(color)).toBe(true);
			expect(color).toBeGreaterThanOrEqual(0);
			expect(color).toBeLessThanOrEqual(0xffffff);
		}
	});

	it("every fallback key corresponds to a generic (color=null) spec entry", () => {
		// The fallback map should only cover types that don't have a fixed color in SPECS
		for (const key of EDGE_TYPE_FALLBACK_COLORS.keys()) {
			const spec = EDGE_TYPE_SPECS.get(key);
			expect(spec).toBeDefined();
			expect(spec!.color).toBeNull();
		}
	});
});

describe("resolveEdgeColor — additional branches", () => {
	it("category edge with useRelColor=true uses category fallback color", () => {
		const color = resolveEdgeColor(makeEdge({ type: "category" }), true, noRelColors, true);
		expect(color).toBe(EDGE_TYPE_FALLBACK_COLORS.get("category"));
	});

	it("category edge with useRelColor=false falls back to default theme color", () => {
		const color = resolveEdgeColor(makeEdge({ type: "category" }), false, noRelColors, true);
		expect(color).toBe(defaultColor(true));
	});

	it("relation present but useRelColor=false ignores relation map entirely", () => {
		const relColors = new Map([["Author", "#ff00ff"]]);
		const color = resolveEdgeColor(makeEdge({ type: "link", relation: "Author" }), false, relColors, false);
		// Should NOT use the magenta relation color — relation lookup is gated by useRelColor
		expect(color).not.toBe(0xff00ff);
		expect(color).toBe(defaultColor(false));
	});
});

describe("deduplicatePath — boundary distance handling", () => {
	it("merges points whose dx and dy are both exactly 0.5 (boundary is strict >)", () => {
		const path = [
			{ x: 0, y: 0 },
			{ x: 0.5, y: 0.5 },
		];
		const result = deduplicatePath(path);
		// Boundary is `Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5`, so 0.5 exactly does NOT pass
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ x: 0, y: 0 });
	});

	it("collapses many identical consecutive points into a single point", () => {
		const path = [
			{ x: 10, y: 20 },
			{ x: 10, y: 20 },
			{ x: 10, y: 20 },
			{ x: 10, y: 20 },
		];
		const result = deduplicatePath(path);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ x: 10, y: 20 });
	});
});

describe("mergeNearbyValues — gap-equality boundary", () => {
	it("treats gap exactly equal to minSpacing as 'still in cluster' (> is strict)", () => {
		// Both gaps equal 5 → all three values merge into one average
		const result = mergeNearbyValues([0, 5, 10], 5);
		expect(result).toHaveLength(1);
		expect(result[0]).toBeCloseTo(5);
	});

	it("separates three clusters when gaps are strictly greater than minSpacing", () => {
		// Gaps of 6 (> 5) split the runs cleanly
		const result = mergeNearbyValues([0, 1, 7, 8, 14, 15], 5);
		expect(result).toHaveLength(3);
		expect(result[0]).toBeCloseTo(0.5);
		expect(result[1]).toBeCloseTo(7.5);
		expect(result[2]).toBeCloseTo(14.5);
	});
});

describe("parseCulledCount — pattern matching edge cases", () => {
	it("captures the FIRST +<digits> token when multiple appear", () => {
		// Regex `\+(\d+)` is non-anchored & non-global, so first match wins
		expect(parseCulledCount(true, "+7 hidden, +99 culled")).toBe(7);
	});
});

describe("smartTruncateLabel — slash-position edge cases", () => {
	it("trailing slash is ignored (slashIdx === length-1) — falls through to ellipsis", () => {
		// "abcdefghij/" → slash at end, condition `slashIdx < length-1` fails
		// So falls to dash branch (no dash) → ellipsis fallback
		const result = smartTruncateLabel("abcdefghij/", 5);
		expect(result.endsWith("…")).toBe(true);
		expect(result).toHaveLength(5);
	});

	it("very short parent (< 3 chars) before slash still produces parent/child hint", () => {
		// "ab/longchildname" → parent="ab", parentDistinct uses Math.max(3, ...) lookahead
		// Even though parent is only 2 chars, slice(0, 3) returns "ab" (no padding)
		const result = smartTruncateLabel("ab/longchildname", 4);
		expect(result).toContain("/");
		const [parent, child] = result.split("/");
		expect(parent).toBe("ab");
		expect(child.length).toBeLessThanOrEqual(3);
	});
});
