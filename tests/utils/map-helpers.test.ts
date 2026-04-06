import { describe, it, expect } from "vitest";
import { pushToMapArray, addToMapSet, getOrCreateArray } from "../../src/utils/map-helpers";

describe("pushToMapArray", () => {
	it("creates array if key does not exist", () => {
		const map = new Map<string, number[]>();
		pushToMapArray(map, "a", 1);
		expect(map.get("a")).toEqual([1]);
	});

	it("pushes to existing array", () => {
		const map = new Map<string, number[]>();
		map.set("a", [1]);
		pushToMapArray(map, "a", 2);
		expect(map.get("a")).toEqual([1, 2]);
	});

	it("handles multiple keys", () => {
		const map = new Map<string, string[]>();
		pushToMapArray(map, "x", "hello");
		pushToMapArray(map, "y", "world");
		pushToMapArray(map, "x", "foo");
		expect(map.get("x")).toEqual(["hello", "foo"]);
		expect(map.get("y")).toEqual(["world"]);
	});
});

describe("addToMapSet", () => {
	it("creates set if key does not exist", () => {
		const map = new Map<string, Set<number>>();
		addToMapSet(map, "a", 1);
		expect(map.get("a")).toEqual(new Set([1]));
	});

	it("adds to existing set", () => {
		const map = new Map<string, Set<number>>();
		map.set("a", new Set([1]));
		addToMapSet(map, "a", 2);
		expect(map.get("a")).toEqual(new Set([1, 2]));
	});

	it("deduplicates values", () => {
		const map = new Map<string, Set<string>>();
		addToMapSet(map, "k", "v");
		addToMapSet(map, "k", "v");
		expect(map.get("k")!.size).toBe(1);
	});
});

describe("getOrCreateArray", () => {
	it("creates and returns new array", () => {
		const map = new Map<string, number[]>();
		const arr = getOrCreateArray(map, "a");
		expect(arr).toEqual([]);
		expect(map.get("a")).toBe(arr);
	});

	it("returns existing array", () => {
		const map = new Map<string, number[]>();
		const existing = [1, 2, 3];
		map.set("a", existing);
		const arr = getOrCreateArray(map, "a");
		expect(arr).toBe(existing);
	});
});
