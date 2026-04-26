import { describe, it, expect } from "vitest";
import { VIEW_TYPE_NODE_COMPARE } from "../src/views/NodeComparisonView";

// ---------------------------------------------------------------------------
// VIEW_TYPE_NODE_COMPARE constant
// ---------------------------------------------------------------------------
describe("VIEW_TYPE_NODE_COMPARE", () => {
	it("is a non-empty string", () => {
		expect(typeof VIEW_TYPE_NODE_COMPARE).toBe("string");
		expect(VIEW_TYPE_NODE_COMPARE.length).toBeGreaterThan(0);
	});

	it("equals 'graph-node-compare'", () => {
		expect(VIEW_TYPE_NODE_COMPARE).toBe("graph-node-compare");
	});

	it("is kebab-case (no uppercase, no underscores)", () => {
		expect(VIEW_TYPE_NODE_COMPARE).toMatch(/^[a-z][a-z0-9-]*$/);
	});
});
