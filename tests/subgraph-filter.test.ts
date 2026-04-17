import { describe, it, expect } from "vitest";
import { filterBySubgraph } from "../src/utils/graph-filter";

describe("filterBySubgraph", () => {
	const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
	const edges = [
		{ source: "a", target: "b", type: "link" },
		{ source: "b", target: "c", type: "link" },
		{ source: "c", target: "d", type: "link" },
		{ source: "a", target: "d", type: "semantic" },
	];

	it("returns all nodes/edges when subgraphIds is empty", () => {
		const result = filterBySubgraph(nodes, edges, []);
		expect(result.nodes).toHaveLength(4);
		expect(result.edges).toHaveLength(4);
	});

	it("filters to only subgraph nodes", () => {
		const result = filterBySubgraph(nodes, edges, ["a", "b"]);
		expect(result.nodes.map((n) => n.id)).toEqual(["a", "b"]);
	});

	it("keeps only edges within subgraph", () => {
		const result = filterBySubgraph(nodes, edges, ["a", "b"]);
		expect(result.edges).toHaveLength(1);
		expect(result.edges[0]).toMatchObject({ source: "a", target: "b" });
	});

	it("keeps cross-subgraph edges when both endpoints are in set", () => {
		const result = filterBySubgraph(nodes, edges, ["a", "b", "d"]);
		expect(result.edges).toHaveLength(2); // a-b, a-d
	});

	it("handles single node subgraph (no edges)", () => {
		const result = filterBySubgraph(nodes, edges, ["c"]);
		expect(result.nodes).toHaveLength(1);
		expect(result.edges).toHaveLength(0);
	});
});
