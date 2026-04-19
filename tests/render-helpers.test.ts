import { describe, it, expect } from "vitest";

import {
	setFrontmatterField,
	addFrontmatterTag,
	generatePhantomNodes,
	heatmapColor,
} from "../src/views/RenderHelpers";
import { AGGREGATE_ZOOM_THRESHOLD } from "../src/constants";

// ---------------------------------------------------------------------------
// setFrontmatterField
// ---------------------------------------------------------------------------
describe("setFrontmatterField", () => {
	it("creates frontmatter block when none exists", () => {
		expect(setFrontmatterField("hello", "key", "val")).toBe("---\nkey: val\n---\nhello");
	});

	it("adds field to existing frontmatter", () => {
		const content = "---\ntitle: Test\n---\nbody";
		const result = setFrontmatterField(content, "key", "val");
		expect(result).toContain("key: val");
		expect(result).toContain("title: Test");
	});

	it("replaces existing field value", () => {
		const content = "---\nkey: old\n---\nbody";
		const result = setFrontmatterField(content, "key", "new");
		expect(result).toContain("key: new");
		expect(result).not.toContain("key: old");
	});
});

// ---------------------------------------------------------------------------
// addFrontmatterTag
// ---------------------------------------------------------------------------
describe("addFrontmatterTag", () => {
	it("creates frontmatter with tag when none exists", () => {
		const result = addFrontmatterTag("body", "mytag");
		expect(result).toBe("---\ntags: [mytag]\n---\nbody");
	});

	it("appends tag to existing inline array", () => {
		const content = "---\ntags: [existing]\n---\nbody";
		const result = addFrontmatterTag(content, "new");
		expect(result).toContain("tags: [existing, new]");
	});

	it("converts empty tags line to list format", () => {
		const content = "---\ntags:\n---\nbody";
		const result = addFrontmatterTag(content, "first");
		expect(result).toContain("tags:\n  - first");
	});

	it("adds tags field to existing frontmatter without tags", () => {
		const content = "---\ntitle: Test\n---\nbody";
		const result = addFrontmatterTag(content, "newtag");
		expect(result).toContain("tags: [newtag]");
		expect(result).toContain("title: Test");
	});
});

// ---------------------------------------------------------------------------
// generatePhantomNodes
// ---------------------------------------------------------------------------
describe("generatePhantomNodes", () => {
	const nodes = [
		{ x: 100, y: 100 },
		{ x: 200, y: 200 },
		{ x: 300, y: 300 },
	];

	it("generates grid phantom nodes for cartesian", () => {
		const phantoms = generatePhantomNodes(nodes, 200, 200, false);
		expect(phantoms.length).toBeGreaterThan(0);
		expect(phantoms[0].isPhantom).toBe(true);
		expect(phantoms[0].id).toMatch(/^__phantom_/);
	});

	it("generates polar phantom nodes when isPolar is true", () => {
		const phantoms = generatePhantomNodes(nodes, 200, 200, true);
		expect(phantoms.length).toBeGreaterThan(0);
		expect(phantoms[0].id).toMatch(/^__phantom_r/);
	});

	it("handles empty real nodes gracefully", () => {
		const phantoms = generatePhantomNodes([], 0, 0, false);
		expect(phantoms.length).toBeGreaterThan(0);
	});

	it("all phantom nodes have required fields", () => {
		const phantoms = generatePhantomNodes(nodes, 0, 0, false);
		for (const p of phantoms) {
			expect(p.id).toBeTruthy();
			expect(typeof p.x).toBe("number");
			expect(typeof p.y).toBe("number");
			expect(p.vx).toBe(0);
			expect(p.vy).toBe(0);
			expect(p.isPhantom).toBe(true);
		}
	});

	it("skips phantom nodes in max radius calculation", () => {
		const nodesWithPhantom = [
			{ x: 100, y: 100, isPhantom: true },
			{ x: 50, y: 50 },
		];
		const phantoms = generatePhantomNodes(nodesWithPhantom, 0, 0, true);
		// Should still generate phantoms without error
		expect(phantoms.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// heatmapColor — cold-to-warm gradient
// ---------------------------------------------------------------------------
describe("heatmapColor", () => {
	it("returns cold (blue) color at degree 0", () => {
		const result = heatmapColor(0, 100);
		const r = (result >> 16) & 0xff;
		const b = result & 0xff;
		expect(b).toBeGreaterThan(r); // blue-dominant
	});

	it("returns warm (red) color at max degree", () => {
		const result = heatmapColor(100, 100);
		const r = (result >> 16) & 0xff;
		const b = result & 0xff;
		expect(r).toBeGreaterThan(b); // red-dominant
	});

	it("clamps t to 1 when degree exceeds maxDegree", () => {
		const atMax = heatmapColor(100, 100);
		const beyond = heatmapColor(200, 100);
		expect(beyond).toBe(atMax);
	});

	it("handles maxDegree of 0 gracefully", () => {
		const result = heatmapColor(5, 0);
		// t = min(1, 5/max(1,0)) = min(1,5) = 1
		expect(result).toBe(heatmapColor(100, 100));
	});
});

// ---------------------------------------------------------------------------
// Shared constants imported from ../src/constants
// ---------------------------------------------------------------------------
describe("shared constants", () => {
	it("AGGREGATE_ZOOM_THRESHOLD is between 0 and 1", () => {
		expect(AGGREGATE_ZOOM_THRESHOLD).toBeGreaterThan(0);
		expect(AGGREGATE_ZOOM_THRESHOLD).toBeLessThan(1);
	});
});
