import { describe, it, expect } from "vitest";
import {
	buildClusterSummaryLabel,
	computeClusterDensityPercent,
	computeClusterTopTags,
} from "../src/views/cluster-summary";

const tagsMap = (m: Record<string, string[]>) => (id: string) => m[id];

describe("computeClusterTopTags", () => {
	it("returns empty array when members undefined", () => {
		expect(computeClusterTopTags(undefined, () => undefined, "x")).toEqual([]);
	});

	it("excludes the cluster's own tag", () => {
		const get = tagsMap({ a: ["foo", "bar"], b: ["foo", "baz"] });
		const top = computeClusterTopTags(["a", "b"], get, "foo");
		expect(top).not.toContain("foo");
		expect(top.sort()).toEqual(["bar", "baz"]);
	});

	it("orders by descending count and respects limit", () => {
		const get = tagsMap({
			a: ["x", "y", "z"],
			b: ["x", "y"],
			c: ["x"],
			d: ["w"],
		});
		expect(computeClusterTopTags(["a", "b", "c", "d"], get, "self", 2)).toEqual(["x", "y"]);
	});

	it("skips members whose tags are missing", () => {
		const get = tagsMap({ a: ["foo"] });
		expect(computeClusterTopTags(["a", "missing"], get, "self")).toEqual(["foo"]);
	});

	it("default limit is 3", () => {
		const get = tagsMap({
			a: ["t1", "t2", "t3", "t4", "t5"],
		});
		expect(computeClusterTopTags(["a"], get, "self")).toHaveLength(3);
	});
});

describe("computeClusterDensityPercent", () => {
	it("returns 0 when memberSet has fewer than 2 entries", () => {
		expect(computeClusterDensityPercent(new Set([]), [])).toBe(0);
		expect(computeClusterDensityPercent(new Set(["a"]), [])).toBe(0);
	});

	it("returns 0 when graphEdges null/undefined", () => {
		expect(computeClusterDensityPercent(new Set(["a", "b"]), null)).toBe(0);
		expect(computeClusterDensityPercent(new Set(["a", "b"]), undefined)).toBe(0);
	});

	it("ignores edges where either endpoint is outside member set", () => {
		const set = new Set(["a", "b"]);
		const edges = [
			{ source: "a", target: "outside" },
			{ source: "outside", target: "b" },
		];
		expect(computeClusterDensityPercent(set, edges)).toBe(0);
	});

	it("computes 100% when all possible edges present", () => {
		const set = new Set(["a", "b", "c"]);
		// max = 3*2/2 = 3
		const edges = [
			{ source: "a", target: "b" },
			{ source: "b", target: "c" },
			{ source: "a", target: "c" },
		];
		expect(computeClusterDensityPercent(set, edges)).toBe(100);
	});

	it("computes 50% partial density", () => {
		const set = new Set(["a", "b", "c", "d"]);
		// max = 4*3/2 = 6, internal = 3 → 50%
		const edges = [
			{ source: "a", target: "b" },
			{ source: "c", target: "d" },
			{ source: "a", target: "c" },
		];
		expect(computeClusterDensityPercent(set, edges)).toBe(50);
	});
});

describe("buildClusterSummaryLabel", () => {
	const get = tagsMap({
		a: ["self", "alpha", "beta"],
		b: ["self", "alpha"],
		c: ["self", "beta", "gamma"],
	});

	it("falls back to bare label when members undefined", () => {
		expect(buildClusterSummaryLabel("x", 5, undefined, get, [], "rich")).toBe("#x (5)");
	});

	it("'detailed' mode includes top tags but no health suffix", () => {
		const members = new Set(["a", "b", "c"]);
		const label = buildClusterSummaryLabel("self", 3, members, get, [], "detailed");
		expect(label).toContain("#self (3)");
		expect(label).toContain(" · ");
		// no [..%] health badge
		expect(label).not.toMatch(/\[\d+%\]/);
	});

	it("'rich' mode adds health badge when memberSet.size >= 3", () => {
		const members = new Set(["a", "b", "c"]);
		const edges = [
			{ source: "a", target: "b" },
			{ source: "b", target: "c" },
			{ source: "a", target: "c" },
		];
		const label = buildClusterSummaryLabel("self", 3, members, get, edges, "rich");
		expect(label).toContain("#self (3)");
		expect(label).toContain("[100%]");
		expect(label).toContain(" · ");
	});

	it("'rich' mode skips health badge when memberSet.size < 3", () => {
		const members = new Set(["a", "b"]);
		const label = buildClusterSummaryLabel("self", 2, members, get, [], "rich");
		expect(label).not.toMatch(/\[\d+%\]/);
	});

	it("emits no top-tag suffix when no shared tags exist", () => {
		const members = new Set(["a"]);
		const onlyOwn = (_id: string) => ["self"];
		const label = buildClusterSummaryLabel("self", 1, members, onlyOwn, [], "rich");
		expect(label).toBe("#self (1)");
	});

	it("rounds density to integer percent in health badge", () => {
		// 4 members, max edges = 6, internal = 1 → 16.66... → "17%"
		const members = new Set(["a", "b", "c", "d"]);
		const edges = [{ source: "a", target: "b" }];
		const labelOf = (id: string) => (id === "a" ? ["self"] : undefined);
		const label = buildClusterSummaryLabel("self", 4, members, labelOf, edges, "rich");
		expect(label).toMatch(/\[17%\]/);
	});

	it("unknown detail value falls through to rich behaviour", () => {
		const members = new Set(["a", "b", "c"]);
		const edges = [{ source: "a", target: "b" }];
		const label = buildClusterSummaryLabel("self", 3, members, get, edges, "minimal");
		// minimal here is not "detailed", so density badge should appear (size>=3)
		expect(label).toMatch(/\[\d+%\]/);
	});
});
