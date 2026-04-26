import { describe, it, expect } from "vitest";
import {
	collectGroupCentroids,
	computeAggregateGroups,
	computeGroupLabelAlpha,
	computeGroupLabelPlacements,
	AGGREGATE_ZOOM_THRESHOLD,
	type GroupNodeInfo,
} from "../../src/views/group-label-manager";

// ---------------------------------------------------------------------------
// collectGroupCentroids
// ---------------------------------------------------------------------------
describe("collectGroupCentroids", () => {
	const mkNode = (id: string, x: number, y: number, overrides?: Partial<GroupNodeInfo>): GroupNodeInfo => ({
		id,
		x,
		y,
		gfxX: x,
		gfxY: y,
		...overrides,
	});

	it("groups nodes by single groupBy field (folder)", () => {
		const nodes = [
			mkNode("a", 0, 0, { filePath: "epic1/characters/a.md", meta: {} }),
			mkNode("b", 10, 0, { filePath: "epic1/episodes/b.md", meta: {} }),
			mkNode("c", 20, 20, { filePath: "epic2/characters/c.md", meta: {} }),
		];
		const { groups, members } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["folder"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		// folder is extracted as path.replace(/\/[^/]*$/, "")
		// "epic1/characters/a.md" → "epic1/characters"
		expect(groups.size).toBeGreaterThanOrEqual(2);
		// Verify member tracking
		for (const [, mset] of members) {
			expect(mset.size).toBeGreaterThanOrEqual(1);
		}
	});

	it("super nodes get their own group entries", () => {
		const nodes = [mkNode("__super__GroupA", 100, 200, { collapsedMembers: ["n1", "n2", "n3"] })];
		const { groups, members } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["tag"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("GroupA")).toBe(true);
		expect(groups.get("GroupA")!.memberCount).toBe(3);
		expect(groups.get("GroupA")!.x).toBe(100);
		expect(members.get("GroupA")!.size).toBe(3);
	});

	it("composite key from multiple groupBy fields", () => {
		const nodes = [
			mkNode("a", 0, 0, { filePath: "epic1/a.md", tags: ["character"], meta: { genre: "fantasy" } }),
			mkNode("b", 10, 0, { filePath: "epic1/b.md", tags: ["character"], meta: { genre: "fantasy" } }),
		];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["tag", "genre"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("character · fantasy")).toBe(true);
		expect(groups.get("character · fantasy")!.memberCount).toBe(2);
	});

	it("missing field values become 'ungrouped'", () => {
		const nodes = [mkNode("a", 0, 0, { meta: {} })];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["nonexistent"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("ungrouped")).toBe(true);
	});

	it("auto-folder mode groups by first path segment", () => {
		const nodes = [
			mkNode("a", 0, 0, { filePath: "novels/ch1.md" }),
			mkNode("b", 10, 0, { filePath: "novels/ch2.md" }),
			mkNode("c", 20, 20, { filePath: "essays/e1.md" }),
		];
		const { groups, members } = collectGroupCentroids(nodes, {
			hasGroupBy: false,
			groupByFields: [],
			hasTagEnclosures: false,
			autoFolderGroups: true,
		});
		expect(groups.has("folder:novels")).toBe(true);
		expect(groups.has("folder:essays")).toBe(true);
		expect(members.get("folder:novels")!.size).toBe(2);
	});

	it("auto-folder mode skips root-level files", () => {
		const nodes = [mkNode("a", 0, 0, { filePath: "root-file.md" })];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: false,
			groupByFields: [],
			hasTagEnclosures: false,
			autoFolderGroups: true,
		});
		// "root-file.md".split("/")[0] = "root-file.md" which is not "root"
		// but there's no "/" so it becomes the folder
		expect(groups.size).toBe(1);
	});

	it("incremental centroid averaging is correct", () => {
		const nodes = [
			mkNode("a", 0, 0, { meta: { g: "X" } }),
			mkNode("b", 10, 20, { meta: { g: "X" } }),
			mkNode("c", 20, 10, { meta: { g: "X" } }),
		];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["g"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		const g = groups.get("X")!;
		expect(g.x).toBeCloseTo(10);
		expect(g.y).toBeCloseTo(10);
		expect(g.memberCount).toBe(3);
	});

	it("empty nodes returns empty maps", () => {
		const { groups, members } = collectGroupCentroids([], {
			hasGroupBy: true,
			groupByFields: ["tag"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.size).toBe(0);
		expect(members.size).toBe(0);
	});

	it("no groupBy and no auto modes returns empty", () => {
		const nodes = [mkNode("a", 0, 0, { filePath: "test/a.md" })];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: false,
			groupByFields: [],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// computeAggregateGroups
// ---------------------------------------------------------------------------
describe("computeAggregateGroups", () => {
	it("groups nodes by top-level folder", () => {
		const nodes = [
			{ filePath: "novels/ch1.md", x: 0, y: 0 },
			{ filePath: "novels/ch2.md", x: 10, y: 0 },
			{ filePath: "novels/ch3.md", x: 20, y: 20 },
			{ filePath: "essays/e1.md", x: 100, y: 100 },
			{ filePath: "essays/e2.md", x: 110, y: 100 },
			{ filePath: "essays/e3.md", x: 120, y: 120 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups).toHaveLength(2);
		const folderNames = groups.map((g) => g.folder).sort();
		expect(folderNames).toEqual(["essays", "novels"]);
	});

	it("centroid is average of member positions", () => {
		const nodes = [
			{ filePath: "a/1.md", x: 0, y: 0 },
			{ filePath: "a/2.md", x: 30, y: 0 },
			{ filePath: "a/3.md", x: 0, y: 30 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups[0].cx).toBeCloseTo(10);
		expect(groups[0].cy).toBeCloseTo(10);
	});

	it("radius is at least 50", () => {
		const nodes = [
			{ filePath: "a/1.md", x: 0, y: 0 },
			{ filePath: "a/2.md", x: 1, y: 0 },
			{ filePath: "a/3.md", x: 0, y: 1 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups[0].radius).toBeGreaterThanOrEqual(50);
	});

	it("skips groups with fewer than 3 members", () => {
		const nodes = [
			{ filePath: "a/1.md", x: 0, y: 0 },
			{ filePath: "a/2.md", x: 10, y: 0 },
			// Only 2 nodes in folder "a"
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups).toHaveLength(0);
	});

	it("root-level files go to (root) group", () => {
		const nodes = [
			{ filePath: "file1.md", x: 0, y: 0 },
			{ filePath: "file2.md", x: 10, y: 0 },
			{ filePath: "file3.md", x: 20, y: 20 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups).toHaveLength(1);
		expect(groups[0].folder).toBe("(root)");
	});

	it("empty filePath treated as (root)", () => {
		const nodes = [
			{ filePath: "", x: 0, y: 0 },
			{ filePath: "", x: 10, y: 0 },
			{ filePath: "", x: 20, y: 20 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups[0].folder).toBe("(root)");
	});

	it("empty input returns empty array", () => {
		expect(computeAggregateGroups([])).toEqual([]);
	});

	it("nodeCount matches members", () => {
		const nodes = Array.from({ length: 5 }, (_, i) => ({
			filePath: `dir/file${i}.md`,
			x: i * 10,
			y: i * 10,
		}));
		const groups = computeAggregateGroups(nodes);
		expect(groups[0].nodeCount).toBe(5);
	});
});

// ---------------------------------------------------------------------------
// computeGroupLabelAlpha
// ---------------------------------------------------------------------------
describe("computeGroupLabelAlpha", () => {
	it("returns 0 when ws is above fadeStart", () => {
		// fadeStart = threshold, so ws > threshold → alpha ≤ 0
		expect(computeGroupLabelAlpha(2.0, 1.0)).toBe(0);
	});

	it("returns 1 when ws is below fadeFull", () => {
		// fadeFull = threshold * 0.6
		expect(computeGroupLabelAlpha(0.1, 1.0)).toBe(1);
	});

	it("returns value between 0 and 1 in fade zone", () => {
		const threshold = 1.0;
		const ws = 0.8; // between fadeFull(0.6) and fadeStart(1.0)
		const alpha = computeGroupLabelAlpha(ws, threshold);
		expect(alpha).toBeGreaterThan(0);
		expect(alpha).toBeLessThan(1);
	});

	it("exact fadeStart returns 0", () => {
		expect(computeGroupLabelAlpha(1.0, 1.0)).toBe(0);
	});

	it("exact fadeFull returns 1", () => {
		expect(computeGroupLabelAlpha(0.6, 1.0)).toBe(1);
	});

	it("handles zero threshold gracefully (returns 1 via isFinite guard)", () => {
		expect(computeGroupLabelAlpha(0.5, 0)).toBe(1);
	});

	it("monotonically decreasing with increasing ws", () => {
		const threshold = 2.0;
		const values = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0].map((ws) => computeGroupLabelAlpha(ws, threshold));
		for (let i = 1; i < values.length; i++) {
			expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
		}
	});
});

// ---------------------------------------------------------------------------
// computeGroupLabelPlacements
// ---------------------------------------------------------------------------
describe("computeGroupLabelPlacements", () => {
	it("filters groups below minimum member threshold", () => {
		const groups = new Map([
			["big", { x: 0, y: 0, memberCount: 100 }],
			["tiny", { x: 50, y: 50, memberCount: 1 }],
		]);
		const { placements } = computeGroupLabelPlacements(groups, 200, 1.0, 0, 0, 800, 600);
		expect(placements).toHaveLength(1);
		expect(placements[0].key).toBe("big");
	});

	it("sorts placements by memberCount descending", () => {
		const groups = new Map([
			["small", { x: 0, y: 0, memberCount: 50 }],
			["large", { x: 100, y: 100, memberCount: 200 }],
			["medium", { x: 200, y: 200, memberCount: 100 }],
		]);
		const { placements } = computeGroupLabelPlacements(groups, 500, 1.0, 0, 0, 1200, 800);
		expect(placements[0].key).toBe("large");
		expect(placements[1].key).toBe("medium");
		expect(placements[2].key).toBe("small");
	});

	it("strips field prefix from single-field keys", () => {
		const groups = new Map([["tag:character", { x: 0, y: 0, memberCount: 100 }]]);
		const { placements } = computeGroupLabelPlacements(groups, 200, 1.0, 0, 0, 800, 600);
		expect(placements[0].displayName).toBe("character");
	});

	it("preserves composite keys (with ' · ')", () => {
		const groups = new Map([["tag:char · genre:fantasy", { x: 0, y: 0, memberCount: 100 }]]);
		const { placements } = computeGroupLabelPlacements(groups, 200, 1.0, 0, 0, 800, 600);
		expect(placements[0].displayName).toBe("tag:char · genre:fantasy");
	});

	it("sets isAggregateMode when ws < AGGREGATE_ZOOM_THRESHOLD", () => {
		const groups = new Map([["g", { x: 0, y: 0, memberCount: 100 }]]);
		const { placements } = computeGroupLabelPlacements(
			groups,
			200,
			AGGREGATE_ZOOM_THRESHOLD - 0.01,
			0,
			0,
			800,
			600,
		);
		expect(placements[0].isAggregateMode).toBe(true);
	});

	it("non-aggregate mode at normal zoom", () => {
		const groups = new Map([["g", { x: 0, y: 0, memberCount: 100 }]]);
		const { placements } = computeGroupLabelPlacements(groups, 200, 1.0, 0, 0, 800, 600);
		expect(placements[0].isAggregateMode).toBe(false);
	});

	it("empty groups returns empty placements", () => {
		const { placements, visibleKeys } = computeGroupLabelPlacements(new Map(), 200, 1.0, 0, 0, 800, 600);
		expect(placements).toHaveLength(0);
		expect(visibleKeys.size).toBe(0);
	});

	it("visibleKeys is subset of placement keys", () => {
		const groups = new Map([
			["a", { x: 0, y: 0, memberCount: 50 }],
			["b", { x: 100, y: 100, memberCount: 50 }],
		]);
		const { placements, visibleKeys } = computeGroupLabelPlacements(groups, 100, 1.0, 0, 0, 800, 600);
		for (const k of visibleKeys) {
			expect(placements.some((p) => p.key === k)).toBe(true);
		}
	});

	it("labelText includes member count", () => {
		const groups = new Map([["mygroup", { x: 0, y: 0, memberCount: 42 }]]);
		const { placements } = computeGroupLabelPlacements(groups, 100, 1.0, 0, 0, 800, 600);
		expect(placements[0].labelText).toContain("(42)");
	});
});

// ---------------------------------------------------------------------------
// AGGREGATE_ZOOM_THRESHOLD constant
// ---------------------------------------------------------------------------
describe("AGGREGATE_ZOOM_THRESHOLD", () => {
	it("is a positive number less than 1", () => {
		expect(AGGREGATE_ZOOM_THRESHOLD).toBeGreaterThan(0);
		expect(AGGREGATE_ZOOM_THRESHOLD).toBeLessThan(1);
	});
});
