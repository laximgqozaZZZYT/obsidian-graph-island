import { describe, it, expect } from "vitest";
import { expandSuperNodeIds } from "../src/utils/node-grouping";

describe("expandSuperNodeIds", () => {
	const nodes = [
		{ id: "a", collapsedMembers: undefined },
		{ id: "b", collapsedMembers: undefined },
		{ id: "__super__cat:hero", collapsedMembers: ["c", "d", "e"] },
		{ id: "__super__cat:villain", collapsedMembers: ["f", "g"] },
	];

	it("passes through regular node IDs unchanged", () => {
		const result = expandSuperNodeIds(["a", "b"], nodes);
		expect(result).toEqual(new Set(["a", "b"]));
	});

	it("expands super node into member IDs", () => {
		const result = expandSuperNodeIds(["__super__cat:hero"], nodes);
		expect(result).toEqual(new Set(["c", "d", "e"]));
	});

	it("mixes regular and super node IDs", () => {
		const result = expandSuperNodeIds(["a", "__super__cat:villain"], nodes);
		expect(result).toEqual(new Set(["a", "f", "g"]));
	});

	it("returns empty set for empty input", () => {
		const result = expandSuperNodeIds([], nodes);
		expect(result).toEqual(new Set());
	});

	it("ignores super node ID not found in nodes", () => {
		const result = expandSuperNodeIds(["__super__cat:unknown"], nodes);
		expect(result).toEqual(new Set(["__super__cat:unknown"]));
	});

	it("handles super node with empty collapsedMembers", () => {
		const nodesWithEmpty = [...nodes, { id: "__super__cat:empty", collapsedMembers: [] as string[] }];
		const result = expandSuperNodeIds(["__super__cat:empty"], nodesWithEmpty);
		expect(result).toEqual(new Set());
	});
});
