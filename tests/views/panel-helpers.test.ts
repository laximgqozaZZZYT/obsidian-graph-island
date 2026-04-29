/**
 * Unit tests for src/views/panel-helpers.ts
 *
 * `panel-helpers` is a 2-line module exposing typed `getPanelValue` /
 * `setPanelValue` accessors over `PanelState`. The functions are trivial
 * one-liners but they previously had 0% coverage, so even direct tests
 * lock in their no-side-effect contract:
 *   - `getPanelValue` is a pure read (no clone, no copy).
 *   - `setPanelValue` mutates exactly the named key by reference.
 *
 * Why this matters: PanelBuilder uses these accessors as the single
 * funnel for panel-state writes during settings-panel rebuilds. If a
 * future refactor accidentally swaps the getter/setter roles or wraps
 * the value in a clone, these tests catch it.
 */
import { describe, it, expect } from "vitest";
import { getPanelValue, setPanelValue } from "../../src/views/panel-helpers";
import type { PanelState } from "../../src/views/PanelBuilder";

// PanelState is a wide interface; we only need a tiny subset for these
// tests. The cast is safe because each test only touches the keys it
// declares — the helpers are typed-generic over `keyof PanelState`.
type PanelLike = Pick<PanelState, "viewMode" | "minDegreeFilter" | "showOrphans" | "searchQuery">;

function makePanel(overrides: Partial<PanelLike> = {}): PanelState {
	return {
		viewMode: "graph",
		minDegreeFilter: 0,
		showOrphans: true,
		searchQuery: "",
		...overrides,
	} as unknown as PanelState;
}

describe("getPanelValue", () => {
	it("reads a string-typed key without copying or wrapping", () => {
		const panel = makePanel({ searchQuery: "alpha" });
		expect(getPanelValue(panel, "searchQuery")).toBe("alpha");
	});

	it("reads a number-typed key", () => {
		const panel = makePanel({ minDegreeFilter: 3 });
		expect(getPanelValue(panel, "minDegreeFilter")).toBe(3);
	});

	it("reads a boolean-typed key", () => {
		const panel = makePanel({ showOrphans: false });
		expect(getPanelValue(panel, "showOrphans")).toBe(false);
	});

	it("reflects subsequent mutations via the same panel reference", () => {
		// Verify that getPanelValue is NOT a snapshot — it reads through to
		// the live object. This protects against an accidental refactor that
		// caches the read.
		const panel = makePanel({ searchQuery: "first" });
		expect(getPanelValue(panel, "searchQuery")).toBe("first");
		(panel as { searchQuery: string }).searchQuery = "second";
		expect(getPanelValue(panel, "searchQuery")).toBe("second");
	});
});

describe("setPanelValue", () => {
	it("mutates the panel object in place (no return value, no clone)", () => {
		const panel = makePanel();
		const result = setPanelValue(panel, "searchQuery", "new-query");
		// Contract: the helper is void; do not start returning the panel or
		// the value, or callers will silently rely on it.
		expect(result).toBeUndefined();
		expect(panel.searchQuery).toBe("new-query");
	});

	it("only touches the named key — sibling keys remain stable", () => {
		const panel = makePanel({ minDegreeFilter: 5, showOrphans: true });
		setPanelValue(panel, "minDegreeFilter", 10);
		expect(panel.minDegreeFilter).toBe(10);
		// showOrphans must NOT be cleared as a side effect.
		expect(panel.showOrphans).toBe(true);
	});

	it("preserves the panel's identity (===), so external refs stay valid", () => {
		// Many callers hold a long-lived reference to the panel object; a
		// helper that swapped the panel for a clone would silently break
		// those references.
		const panel = makePanel({ minDegreeFilter: 1 });
		const ref = panel;
		setPanelValue(panel, "minDegreeFilter", 2);
		expect(ref).toBe(panel);
		expect(ref.minDegreeFilter).toBe(2);
	});

	it("round-trips through getPanelValue", () => {
		const panel = makePanel();
		setPanelValue(panel, "showOrphans", false);
		expect(getPanelValue(panel, "showOrphans")).toBe(false);
		setPanelValue(panel, "showOrphans", true);
		expect(getPanelValue(panel, "showOrphans")).toBe(true);
	});
});
