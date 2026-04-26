import { describe, it, expect } from "vitest";
import { getDashPattern } from "../src/views/EdgeRenderer";

describe("getDashPattern", () => {
	it("semantic → even dots [4, 4]", () => {
		expect(getDashPattern("semantic")).toEqual([4, 4]);
	});

	it("tag → long dash [8, 3]", () => {
		expect(getDashPattern("tag")).toEqual([8, 3]);
	});

	it("has-tag → same as tag [8, 3]", () => {
		expect(getDashPattern("has-tag")).toEqual([8, 3]);
	});

	it("similar → short dash [3, 5]", () => {
		expect(getDashPattern("similar")).toEqual([3, 5]);
	});

	it("sequence → dash-dot [6, 2, 2, 2]", () => {
		expect(getDashPattern("sequence")).toEqual([6, 2, 2, 2]);
	});

	it("sibling → fine dots [2, 2]", () => {
		expect(getDashPattern("sibling")).toEqual([2, 2]);
	});

	it("link → null (solid)", () => {
		expect(getDashPattern("link")).toBeNull();
	});

	it("inheritance → null (solid)", () => {
		expect(getDashPattern("inheritance")).toBeNull();
	});

	it("aggregation → null (solid)", () => {
		expect(getDashPattern("aggregation")).toBeNull();
	});

	it("unknown type → null (solid)", () => {
		expect(getDashPattern("unknown")).toBeNull();
		expect(getDashPattern("")).toBeNull();
	});

	it("all non-null patterns have even number of segments or 4 segments", () => {
		const types = ["semantic", "tag", "has-tag", "similar", "sequence", "sibling"];
		for (const t of types) {
			const p = getDashPattern(t);
			expect(p).not.toBeNull();
			expect(p!.length % 2).toBe(0);
		}
	});

	it("all pattern values are positive", () => {
		const types = ["semantic", "tag", "has-tag", "similar", "sequence", "sibling"];
		for (const t of types) {
			const p = getDashPattern(t)!;
			for (const v of p) {
				expect(v).toBeGreaterThan(0);
			}
		}
	});

	it("each dashed type produces a distinct pattern", () => {
		const patterns = new Set(
			["semantic", "tag", "similar", "sequence", "sibling"].map((t) => JSON.stringify(getDashPattern(t))),
		);
		expect(patterns.size).toBe(5);
	});
});
