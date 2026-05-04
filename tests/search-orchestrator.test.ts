// ---------------------------------------------------------------------------
// Tests for SearchOrchestrator — pure search/filter functions
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { classifySearchMatch } from "../src/views/SearchOrchestrator";

// ---------------------------------------------------------------------------
// classifySearchMatch
// ---------------------------------------------------------------------------
describe("classifySearchMatch", () => {
	it("matches when no filters active", () => {
		const r = classifySearchMatch("x", null, null);
		expect(r).toEqual({ isMatch: true, hopMatch: true, textMatch: true });
	});

	it("hop miss", () => {
		const r = classifySearchMatch("x", new Set(["y"]), null);
		expect(r.isMatch).toBe(false);
		expect(r.hopMatch).toBe(false);
	});

	it("text miss", () => {
		const r = classifySearchMatch("x", null, new Set(["y"]));
		expect(r.isMatch).toBe(false);
		expect(r.textMatch).toBe(false);
	});

	it("both must match", () => {
		const r = classifySearchMatch("x", new Set(["x"]), new Set(["y"]));
		expect(r.isMatch).toBe(false);
	});

	it("both match", () => {
		const r = classifySearchMatch("x", new Set(["x"]), new Set(["x"]));
		expect(r.isMatch).toBe(true);
	});
});
