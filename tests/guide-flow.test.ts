/**
 * Tests for guide data flow: arrangement → groupGuides → drawGuides
 *
 * Verifies that guides are correctly generated and propagated for:
 * - Grid arrangement (no groupBy)
 * - Grid arrangement (with groupBy)
 * - Concentric arrangement (perGroup=false)
 * - Timeline arrangement
 * - Coordinate engine (custom layout)
 */
import { describe, it, expect } from "vitest";
import { buildClusterForce, type ClusterForceConfig } from "../src/layouts/cluster-force";
import type { GraphNode, GraphEdge } from "../src/types";
import { ARRANGEMENT_PRESETS } from "../src/layouts/coordinate-presets";

function makeNode(id: string, overrides?: Partial<GraphNode>): GraphNode {
	return { id, label: id, x: 0, y: 0, vx: 0, vy: 0, ...overrides };
}

function makeEdge(source: string, target: string): GraphEdge {
	return { id: `${source}->${target}`, source, target };
}

function baseCfg(overrides?: Partial<ClusterForceConfig>): ClusterForceConfig {
	return {
		groupRules: [],
		arrangement: "grid",
		centerX: 400,
		centerY: 300,
		width: 800,
		height: 600,
		nodeSize: 8,
		nodeSpacing: 3.0,
		groupScale: 3.0,
		groupSpacing: 2.0,
		coordinateLayout: ARRANGEMENT_PRESETS["grid"],
		...overrides,
	};
}

describe("guide data flow", () => {
	const nodes = Array.from({ length: 20 }, (_, i) => makeNode(`n${i}`, { tags: [i < 10 ? "groupA" : "groupB"] }));
	const edges: GraphEdge[] = [makeEdge("n0", "n1"), makeEdge("n10", "n11")];
	const degrees = new Map(nodes.map((n) => [n.id, 1]));

	it("grid arrangement WITHOUT groupBy produces groupGuides", () => {
		const cfg = baseCfg({
			arrangement: "grid",
			groupRules: [],
			coordinateLayout: ARRANGEMENT_PRESETS["grid"],
		});
		const result = buildClusterForce(nodes, edges, degrees, cfg);
		expect(result).not.toBeNull();
		expect(result!.metadata.groupGuides).toBeDefined();
		expect(result!.metadata.groupGuides!.length).toBeGreaterThan(0);

		const guide = result!.metadata.groupGuides![0];
		expect(guide.guide).toBeDefined();
		// Coordinate engine produces "coordinate" type guides
		expect(guide.guide.type).toBe("coordinate");
	});

	it("grid arrangement WITH groupBy produces groupGuides", () => {
		const cfg = baseCfg({
			arrangement: "grid",
			groupRules: [{ groupBy: "tag", recursive: false }],
			coordinateLayout: ARRANGEMENT_PRESETS["grid"],
		});
		const result = buildClusterForce(nodes, edges, degrees, cfg);
		expect(result).not.toBeNull();
		expect(result!.metadata.groupGuides).toBeDefined();
		expect(result!.metadata.groupGuides!.length).toBeGreaterThan(0);
	});

	it("concentric arrangement (perGroup=false) produces groupGuides", () => {
		const cfg = baseCfg({
			arrangement: "concentric",
			groupRules: [],
			coordinateLayout: ARRANGEMENT_PRESETS["concentric"],
		});
		const result = buildClusterForce(nodes, edges, degrees, cfg);
		expect(result).not.toBeNull();
		expect(result!.metadata.groupGuides).toBeDefined();
		expect(result!.metadata.groupGuides!.length).toBeGreaterThan(0);

		const guide = result!.metadata.groupGuides![0];
		// Concentric with default preset uses hardcoded path → "concentric" type
		expect(guide.guide.type).toBe("concentric");
	});

	it("timeline arrangement produces groupGuides", () => {
		const timedNodes = Array.from({ length: 10 }, (_, i) =>
			makeNode(`t${i}`, {
				frontmatter: { "start-date": `2025-01-${(i + 1).toString().padStart(2, "0")}` },
			}),
		);
		const cfg = baseCfg({
			arrangement: "timeline",
			groupRules: [],
			coordinateLayout: ARRANGEMENT_PRESETS["timeline"],
			timelineKey: "start-date",
			getNodeProperty: (nodeId: string, key: string) => {
				const node = timedNodes.find((n) => n.id === nodeId);
				return node?.frontmatter?.[key];
			},
		});
		const result = buildClusterForce(timedNodes, [], degrees, cfg);
		expect(result).not.toBeNull();
		expect(result!.metadata.groupGuides).toBeDefined();
		expect(result!.metadata.groupGuides!.length).toBeGreaterThan(0);
		expect(result!.metadata.groupGuides![0].guide.type).toBe("timeline");
	});

	it("guide centerX/centerY matches cfg center for single group", () => {
		const cfg = baseCfg({
			arrangement: "grid",
			groupRules: [],
			coordinateLayout: ARRANGEMENT_PRESETS["grid"],
		});
		const result = buildClusterForce(nodes, edges, degrees, cfg);
		expect(result).not.toBeNull();
		const guide = result!.metadata.groupGuides![0];
		expect(guide.centerX).toBe(400);
		expect(guide.centerY).toBe(300);
	});

	it("triangle arrangement produces groupGuides", () => {
		const cfg = baseCfg({
			arrangement: "triangle",
			groupRules: [],
			coordinateLayout: ARRANGEMENT_PRESETS["triangle"],
		});
		const result = buildClusterForce(nodes, edges, degrees, cfg);
		expect(result).not.toBeNull();
		expect(result!.metadata.groupGuides).toBeDefined();
		expect(result!.metadata.groupGuides!.length).toBeGreaterThan(0);
	});

	it("guide centers align with clusterCentroids after overlap resolution (multi-group)", () => {
		const cfg = baseCfg({
			arrangement: "grid",
			groupRules: [{ groupBy: "tag", recursive: false }],
			coordinateLayout: ARRANGEMENT_PRESETS["grid"],
		});
		const result = buildClusterForce(nodes, edges, degrees, cfg);
		expect(result).not.toBeNull();

		const { groupGuides, clusterCentroids } = result!.metadata;
		expect(groupGuides).toBeDefined();
		expect(groupGuides!.length).toBeGreaterThan(0);

		// Each guide entry with a groupKey should have centerX/centerY
		// matching the corresponding clusterCentroid (after overlap resolution)
		for (const entry of groupGuides!) {
			if (entry.groupKey) {
				const centroid = clusterCentroids.get(entry.groupKey);
				if (centroid) {
					expect(entry.centerX).toBeCloseTo(centroid.x, 1);
					expect(entry.centerY).toBeCloseTo(centroid.y, 1);
				}
			}
		}
	});

	it("guide entries include groupKey for traceability", () => {
		const cfg = baseCfg({
			arrangement: "grid",
			groupRules: [{ groupBy: "tag", recursive: false }],
			coordinateLayout: ARRANGEMENT_PRESETS["grid"],
		});
		const result = buildClusterForce(nodes, edges, degrees, cfg);
		expect(result).not.toBeNull();
		const guides = result!.metadata.groupGuides!;
		for (const entry of guides) {
			expect(entry.groupKey).toBeDefined();
			expect(typeof entry.groupKey).toBe("string");
		}
	});
});
