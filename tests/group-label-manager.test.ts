import { describe, it, expect } from "vitest";
import {
	collectGroupCentroids,
	computeGroupLabelAlpha,
	computeGroupLabelPlacements,
	computeAggregateGroups,
	type GroupNodeInfo,
} from "../src/views/group-label-manager";

// ---------------------------------------------------------------------------
// collectGroupCentroids
// ---------------------------------------------------------------------------
describe("collectGroupCentroids", () => {
	const makeNode = (
		id: string,
		x: number,
		y: number,
		overrides?: Partial<GroupNodeInfo>,
	): GroupNodeInfo => ({
		id,
		filePath: `folder/${id}.md`,
		x,
		y,
		gfxX: x,
		gfxY: y,
		...overrides,
	});

	it("groups by explicit groupBy field", () => {
		const nodes = [
			makeNode("a", 0, 0, { meta: { category: "hero" } }),
			makeNode("b", 10, 0, { meta: { category: "hero" } }),
			makeNode("c", 20, 20, { meta: { category: "villain" } }),
		];
		const { groups, members } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["category"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("hero")).toBe(true);
		expect(groups.has("villain")).toBe(true);
		expect(groups.get("hero")!.memberCount).toBe(2);
		expect(members.get("hero")!.size).toBe(2);
	});

	it("handles super-nodes (collapsed groups)", () => {
		const nodes = [
			makeNode("__super__team-a", 50, 50, { collapsedMembers: ["x", "y", "z"] }),
		];
		const { groups, members } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["team"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("team-a")).toBe(true);
		expect(groups.get("team-a")!.memberCount).toBe(3);
		expect(members.get("team-a")!.size).toBe(3);
	});

	it("builds composite keys for multiple fields", () => {
		const nodes = [
			makeNode("a", 0, 0, { meta: { type: "char", era: "modern" } }),
		];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["type", "era"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("char \u00B7 modern")).toBe(true);
	});

	it("falls back to ungrouped when field is missing", () => {
		const nodes = [makeNode("a", 0, 0, { meta: {} })];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["missing_field"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("ungrouped")).toBe(true);
	});

	it("auto-folder groups by first path segment", () => {
		const nodes = [
			makeNode("a", 0, 0, { filePath: "stories/a.md" }),
			makeNode("b", 10, 10, { filePath: "stories/b.md" }),
			makeNode("c", 20, 20, { filePath: "characters/c.md" }),
		];
		const { groups, members } = collectGroupCentroids(nodes, {
			hasGroupBy: false,
			groupByFields: [],
			hasTagEnclosures: false,
			autoFolderGroups: true,
		});
		expect(groups.has("folder:stories")).toBe(true);
		expect(groups.get("folder:stories")!.memberCount).toBe(2);
		expect(members.get("folder:characters")!.size).toBe(1);
	});

	it("skips root-level files in auto-folder mode", () => {
		const nodes = [makeNode("a", 0, 0, { filePath: "root" })];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: false,
			groupByFields: [],
			hasTagEnclosures: false,
			autoFolderGroups: true,
		});
		expect(groups.size).toBe(0);
	});

	it("returns empty maps when no grouping mode is active", () => {
		const nodes = [makeNode("a", 0, 0)];
		const { groups, members } = collectGroupCentroids(nodes, {
			hasGroupBy: false,
			groupByFields: [],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.size).toBe(0);
		expect(members.size).toBe(0);
	});

	it("computes running centroid correctly", () => {
		const nodes = [
			makeNode("a", 0, 0, { meta: { g: "x" } }),
			makeNode("b", 10, 20, { meta: { g: "x" } }),
			makeNode("c", 20, 10, { meta: { g: "x" } }),
		];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["g"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		const g = groups.get("x")!;
		expect(g.x).toBeCloseTo(10, 5);
		expect(g.y).toBeCloseTo(10, 5);
		expect(g.memberCount).toBe(3);
	});

	it("uses tag as groupBy field", () => {
		const nodes = [
			makeNode("a", 0, 0, { tags: ["fantasy"] }),
			makeNode("b", 10, 10, { tags: ["scifi"] }),
		];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["tag"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("fantasy")).toBe(true);
		expect(groups.has("scifi")).toBe(true);
	});

	it("uses folder as groupBy field", () => {
		const nodes = [
			makeNode("a", 0, 0, { filePath: "stories/a.md" }),
			makeNode("b", 10, 10, { filePath: "chars/b.md" }),
		];
		const { groups } = collectGroupCentroids(nodes, {
			hasGroupBy: true,
			groupByFields: ["folder"],
			hasTagEnclosures: false,
			autoFolderGroups: false,
		});
		expect(groups.has("stories")).toBe(true);
		expect(groups.has("chars")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// computeGroupLabelAlpha
// ---------------------------------------------------------------------------
describe("computeGroupLabelAlpha", () => {
	it("returns 1 when fully zoomed out (ws far below fadeThreshold)", () => {
		expect(computeGroupLabelAlpha(0.1, 1.0)).toBe(1);
	});

	it("returns 0 at or above fadeThreshold", () => {
		expect(computeGroupLabelAlpha(1.0, 1.0)).toBe(0);
		expect(computeGroupLabelAlpha(1.5, 1.0)).toBe(0);
	});

	it("returns value between 0 and 1 in the fade zone", () => {
		const alpha = computeGroupLabelAlpha(0.8, 1.0);
		expect(alpha).toBeGreaterThan(0);
		expect(alpha).toBeLessThan(1);
	});

	it("clamps to [0, 1] range", () => {
		// Far below: should be clamped to 1
		expect(computeGroupLabelAlpha(0.01, 1.0)).toBe(1);
		// Far above: should be clamped to 0
		expect(computeGroupLabelAlpha(5.0, 1.0)).toBe(0);
	});

	it("handles edge case where fadeThreshold is very small", () => {
		const alpha = computeGroupLabelAlpha(0.01, 0.02);
		expect(alpha).toBeGreaterThanOrEqual(0);
		expect(alpha).toBeLessThanOrEqual(1);
	});
});

// ---------------------------------------------------------------------------
// computeGroupLabelPlacements
// ---------------------------------------------------------------------------
describe("computeGroupLabelPlacements", () => {
	it("filters out small groups below threshold", () => {
		const groups = new Map([
			["big", { x: 0, y: 0, memberCount: 100 }],
			["tiny", { x: 50, y: 50, memberCount: 2 }],
		]);
		const { placements } = computeGroupLabelPlacements(groups, 1000, 0.5, 0, 0, 800, 600);
		expect(placements.length).toBe(1);
		expect(placements[0].key).toBe("big");
	});

	it("strips field prefix from single-field keys", () => {
		const groups = new Map([["tag:character", { x: 0, y: 0, memberCount: 50 }]]);
		const { placements } = computeGroupLabelPlacements(groups, 100, 0.5, 0, 0, 800, 600);
		expect(placements[0].displayName).toBe("character");
	});

	it("preserves composite keys without stripping", () => {
		const groups = new Map([["hero \u00B7 modern", { x: 0, y: 0, memberCount: 50 }]]);
		const { placements } = computeGroupLabelPlacements(groups, 100, 0.5, 0, 0, 800, 600);
		expect(placements[0].displayName).toBe("hero \u00B7 modern");
	});

	it("sorts placements by member count (largest first)", () => {
		const groups = new Map([
			["small", { x: 0, y: 0, memberCount: 20 }],
			["large", { x: 100, y: 100, memberCount: 50 }],
			["medium", { x: 200, y: 200, memberCount: 30 }],
		]);
		const { placements } = computeGroupLabelPlacements(groups, 100, 0.5, 0, 0, 800, 600);
		expect(placements[0].key).toBe("large");
		expect(placements[1].key).toBe("medium");
		expect(placements[2].key).toBe("small");
	});

	it("marks aggregate mode when ws is very low", () => {
		const groups = new Map([["g", { x: 0, y: 0, memberCount: 50 }]]);
		const { placements } = computeGroupLabelPlacements(groups, 100, 0.1, 0, 0, 800, 600);
		expect(placements[0].isAggregateMode).toBe(true);
	});

	it("returns empty for empty groups", () => {
		const groups = new Map<string, { x: number; y: number; memberCount: number }>();
		const { placements, visibleKeys } = computeGroupLabelPlacements(groups, 100, 0.5, 0, 0, 800, 600);
		expect(placements.length).toBe(0);
		expect(visibleKeys.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// computeAggregateGroups
// ---------------------------------------------------------------------------
describe("computeAggregateGroups", () => {
	it("groups nodes by top-level folder", () => {
		const nodes = [
			{ filePath: "stories/a.md", x: 0, y: 0 },
			{ filePath: "stories/b.md", x: 10, y: 10 },
			{ filePath: "stories/c.md", x: 20, y: 20 },
			{ filePath: "chars/d.md", x: 100, y: 100 },
			{ filePath: "chars/e.md", x: 110, y: 110 },
			{ filePath: "chars/f.md", x: 120, y: 120 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups.length).toBe(2);
		const stories = groups.find((g) => g.folder === "stories");
		expect(stories).toBeDefined();
		expect(stories!.nodeCount).toBe(3);
	});

	it("skips groups with fewer than 3 members", () => {
		const nodes = [
			{ filePath: "big/a.md", x: 0, y: 0 },
			{ filePath: "big/b.md", x: 10, y: 10 },
			{ filePath: "big/c.md", x: 20, y: 20 },
			{ filePath: "small/d.md", x: 100, y: 100 },
			{ filePath: "small/e.md", x: 110, y: 110 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups.length).toBe(1);
		expect(groups[0].folder).toBe("big");
	});

	it("computes centroid correctly", () => {
		const nodes = [
			{ filePath: "f/a.md", x: 0, y: 0 },
			{ filePath: "f/b.md", x: 30, y: 0 },
			{ filePath: "f/c.md", x: 0, y: 30 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups[0].cx).toBeCloseTo(10, 5);
		expect(groups[0].cy).toBeCloseTo(10, 5);
	});

	it("ensures minimum radius of 50", () => {
		const nodes = [
			{ filePath: "f/a.md", x: 0, y: 0 },
			{ filePath: "f/b.md", x: 1, y: 1 },
			{ filePath: "f/c.md", x: 2, y: 2 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups[0].radius).toBe(50);
	});

	it("puts files without slash into (root)", () => {
		const nodes = [
			{ filePath: "a.md", x: 0, y: 0 },
			{ filePath: "b.md", x: 10, y: 10 },
			{ filePath: "c.md", x: 20, y: 20 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups.length).toBe(1);
		expect(groups[0].folder).toBe("(root)");
	});

	it("handles empty file paths", () => {
		const nodes = [
			{ filePath: "", x: 0, y: 0 },
			{ filePath: "", x: 10, y: 10 },
			{ filePath: "", x: 20, y: 20 },
		];
		const groups = computeAggregateGroups(nodes);
		expect(groups.length).toBe(1);
		expect(groups[0].folder).toBe("(root)");
	});

	it("returns empty for no nodes", () => {
		const groups = computeAggregateGroups([]);
		expect(groups.length).toBe(0);
	});
});
