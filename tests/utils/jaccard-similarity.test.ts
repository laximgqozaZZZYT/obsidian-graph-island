import { describe, it, expect } from "vitest";
import { jaccardSimilarity } from "../../src/utils/jaccard-similarity";

describe("jaccardSimilarity", () => {
	it("returns 1 for identical non-empty sets", () => {
		const a = new Set(["a", "b", "c"]);
		const b = new Set(["a", "b", "c"]);
		expect(jaccardSimilarity(a, b)).toBe(1);
	});

	it("returns 1 for identical singletons", () => {
		expect(jaccardSimilarity(new Set(["x"]), new Set(["x"]))).toBe(1);
	});

	it("returns 0 for fully disjoint sets", () => {
		const a = new Set(["a", "b", "c"]);
		const b = new Set(["x", "y", "z"]);
		expect(jaccardSimilarity(a, b)).toBe(0);
	});

	it("returns the correct ratio for partial overlap", () => {
		// {a,b,c} ∩ {b,c,d} = {b,c} (size 2)
		// {a,b,c} ∪ {b,c,d} = {a,b,c,d} (size 4)
		// 2 / 4 = 0.5
		const a = new Set(["a", "b", "c"]);
		const b = new Set(["b", "c", "d"]);
		expect(jaccardSimilarity(a, b)).toBe(0.5);
	});

	it("returns 1/3 when one element of two-element sets matches", () => {
		// {a,b} ∩ {b,c} = {b} (size 1)
		// {a,b} ∪ {b,c} = {a,b,c} (size 3)
		expect(jaccardSimilarity(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
	});

	it("returns 0 when both sets are empty (NaN guard)", () => {
		expect(jaccardSimilarity(new Set<string>(), new Set<string>())).toBe(0);
	});

	it("returns 0 when only the first set is empty", () => {
		expect(jaccardSimilarity(new Set<string>(), new Set(["a", "b"]))).toBe(0);
	});

	it("returns 0 when only the second set is empty", () => {
		expect(jaccardSimilarity(new Set(["a", "b"]), new Set<string>())).toBe(0);
	});

	it("is symmetric: J(A,B) === J(B,A)", () => {
		const a = new Set(["a", "b", "c", "d"]);
		const b = new Set(["c", "d", "e"]);
		expect(jaccardSimilarity(a, b)).toBe(jaccardSimilarity(b, a));
	});

	it("treats sets built from arrays with duplicates as deduplicated", () => {
		// new Set(["a","a","b"]) === {"a","b"} (size 2)
		// new Set(["a","b","b"]) === {"a","b"} (size 2)
		// Identical sets → 1
		const fromDupA = new Set(["a", "a", "b"]);
		const fromDupB = new Set(["a", "b", "b"]);
		expect(fromDupA.size).toBe(2);
		expect(fromDupB.size).toBe(2);
		expect(jaccardSimilarity(fromDupA, fromDupB)).toBe(1);
	});

	it("does not double-count repeated array entries when one side has only one of two duplicates", () => {
		// Confirms Set semantics — even though both arrays contain "a" twice,
		// the underlying sets are {a,b} and {a,c}, so intersection is {a} (size 1)
		// and union is {a,b,c} (size 3).
		const a = new Set(["a", "a", "b"]);
		const b = new Set(["a", "a", "c"]);
		expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3);
	});

	it("returns a value in [0, 1] for arbitrary inputs", () => {
		const a = new Set(["1", "2", "3", "4", "5"]);
		const b = new Set(["3", "4", "5", "6", "7"]);
		const result = jaccardSimilarity(a, b);
		expect(result).toBeGreaterThanOrEqual(0);
		expect(result).toBeLessThanOrEqual(1);
		// {3,4,5} / {1..7} = 3 / 7
		expect(result).toBeCloseTo(3 / 7);
	});
});
