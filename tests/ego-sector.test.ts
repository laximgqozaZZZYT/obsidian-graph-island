import { describe, it, expect } from "vitest";
import { classifyEgoNeighbors, computeEgoSectorPositions } from "../src/layouts/ego-sector";

// ---------- classifyEgoNeighbors ----------

describe("classifyEgoNeighbors", () => {
	const CENTER = "ego";

	it("returns empty buckets when no edges", () => {
		const buckets = classifyEgoNeighbors(CENTER, [], new Set(["a"]));
		for (const ids of buckets.values()) {
			expect(ids).toEqual([]);
		}
		expect(buckets.size).toBe(5);
	});

	it("classifies inheritance edges by direction", () => {
		const edges = [
			{ source: "parent", target: CENTER, type: "inheritance" as const },
			{ source: CENTER, target: "child", type: "inheritance" as const },
		];
		const valid = new Set(["parent", "child"]);
		const buckets = classifyEgoNeighbors(CENTER, edges, valid);
		expect(buckets.get("inheritParent")).toEqual(["parent"]);
		expect(buckets.get("inheritChild")).toEqual(["child"]);
	});

	it("classifies aggregation edges", () => {
		const edges = [{ source: CENTER, target: "agg1", type: "aggregation" as const }];
		const buckets = classifyEgoNeighbors(CENTER, edges, new Set(["agg1"]));
		expect(buckets.get("aggregation")).toEqual(["agg1"]);
	});

	it("classifies similar and sibling edges into 'similar' bucket", () => {
		const edges = [
			{ source: CENTER, target: "s1", type: "similar" as const },
			{ source: "s2", target: CENTER, type: "sibling" as const },
		];
		const buckets = classifyEgoNeighbors(CENTER, edges, new Set(["s1", "s2"]));
		expect(buckets.get("similar")).toEqual(["s1", "s2"]);
	});

	it("classifies link and unknown types into 'other' bucket", () => {
		const edges = [
			{ source: CENTER, target: "a", type: "link" as const },
			{ source: CENTER, target: "b" }, // no type
		];
		const buckets = classifyEgoNeighbors(CENTER, edges, new Set(["a", "b"]));
		expect(buckets.get("other")).toEqual(["a", "b"]);
	});

	it("excludes neighbors not in validIds", () => {
		const edges = [
			{ source: CENTER, target: "valid", type: "link" as const },
			{ source: CENTER, target: "invalid", type: "link" as const },
		];
		const buckets = classifyEgoNeighbors(CENTER, edges, new Set(["valid"]));
		expect(buckets.get("other")).toEqual(["valid"]);
	});

	it("ignores edges not incident to center", () => {
		const edges = [{ source: "a", target: "b", type: "link" as const }];
		const buckets = classifyEgoNeighbors(CENTER, edges, new Set(["a", "b"]));
		for (const ids of buckets.values()) {
			expect(ids).toEqual([]);
		}
	});
});

// ---------- computeEgoSectorPositions ----------

describe("computeEgoSectorPositions", () => {
	const CENTER = "ego";
	const CX = 100;
	const CY = 200;

	it("returns empty array when no neighbors", () => {
		const result = computeEgoSectorPositions(CENTER, CX, CY, [], new Set());
		expect(result).toEqual([]);
	});

	it("places single neighbor at sector center angle", () => {
		const edges = [{ source: CENTER, target: "a", type: "link" as const }];
		const result = computeEgoSectorPositions(CENTER, CX, CY, edges, new Set(["a"]), 100);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("a");
		// single node → placed at startAngle (centerAngle - spread/2)
		const dist = Math.sqrt((result[0].x - CX) ** 2 + (result[0].y - CY) ** 2);
		expect(dist).toBeCloseTo(100, 5);
	});

	it("places multiple neighbors spread across sector", () => {
		const edges = [
			{ source: CENTER, target: "a", type: "link" as const },
			{ source: CENTER, target: "b", type: "link" as const },
			{ source: CENTER, target: "c", type: "link" as const },
		];
		const valid = new Set(["a", "b", "c"]);
		const result = computeEgoSectorPositions(CENTER, CX, CY, edges, valid, 50);
		expect(result).toHaveLength(3);

		// All at ring radius distance
		for (const p of result) {
			const dist = Math.sqrt((p.x - CX) ** 2 + (p.y - CY) ** 2);
			expect(dist).toBeCloseTo(50, 5);
		}
	});

	it("does not place the center node itself", () => {
		// Edge where center appears as both source and target of different edges
		const edges = [{ source: CENTER, target: "a", type: "link" as const }];
		const valid = new Set([CENTER, "a"]);
		const result = computeEgoSectorPositions(CENTER, CX, CY, edges, valid);
		const ids = result.map((p) => p.id);
		expect(ids).not.toContain(CENTER);
	});

	it("does not duplicate a node that appears in multiple sectors", () => {
		// Node appears in both inheritance (as parent) and aggregation
		const edges = [
			{ source: "x", target: CENTER, type: "inheritance" as const },
			{ source: CENTER, target: "x", type: "aggregation" as const },
		];
		const valid = new Set(["x"]);
		const result = computeEgoSectorPositions(CENTER, CX, CY, edges, valid);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("x");
	});

	it("uses custom ringRadius", () => {
		const edges = [{ source: CENTER, target: "n", type: "link" as const }];
		const result = computeEgoSectorPositions(CENTER, 0, 0, edges, new Set(["n"]), 250);
		const dist = Math.sqrt(result[0].x ** 2 + result[0].y ** 2);
		expect(dist).toBeCloseTo(250, 5);
	});

	it("distributes nodes across different sector types", () => {
		const edges = [
			{ source: "parent", target: CENTER, type: "inheritance" as const },
			{ source: CENTER, target: "child", type: "inheritance" as const },
			{ source: CENTER, target: "agg", type: "aggregation" as const },
			{ source: CENTER, target: "sim", type: "similar" as const },
			{ source: CENTER, target: "other", type: "link" as const },
		];
		const valid = new Set(["parent", "child", "agg", "sim", "other"]);
		const result = computeEgoSectorPositions(CENTER, 0, 0, edges, valid, 100);
		expect(result).toHaveLength(5);

		const ids = new Set(result.map((p) => p.id));
		expect(ids).toEqual(valid);

		// Each node at different angle (no two at same position)
		for (let i = 0; i < result.length; i++) {
			for (let j = i + 1; j < result.length; j++) {
				const dx = result[i].x - result[j].x;
				const dy = result[i].y - result[j].y;
				expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThan(1);
			}
		}
	});
});
