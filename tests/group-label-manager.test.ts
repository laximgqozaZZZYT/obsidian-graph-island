import { describe, it, expect } from "vitest";
import {
	collectGroupCentroids,
	computeGroupLabelAlpha,
	computeGroupLabelPlacements,
	computeAggregateGroups,
	drawClusterBoundaries,
	applyGroupLabelPlacements,
	drawAggregateGroups,
	parseGroupByFields,
	type GroupNodeInfo,
} from "../src/views/group-label-manager";
import { CanvasContainer, CanvasGraphics, CanvasText } from "../src/views/canvas2d";

// ---------------------------------------------------------------------------
// collectGroupCentroids
// ---------------------------------------------------------------------------
describe("collectGroupCentroids", () => {
	const makeNode = (id: string, x: number, y: number, overrides?: Partial<GroupNodeInfo>): GroupNodeInfo => ({
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
		const nodes = [makeNode("__super__team-a", 50, 50, { collapsedMembers: ["x", "y", "z"] })];
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
		const nodes = [makeNode("a", 0, 0, { meta: { type: "char", era: "modern" } })];
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
		const nodes = [makeNode("a", 0, 0, { tags: ["fantasy"] }), makeNode("b", 10, 10, { tags: ["scifi"] })];
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

// ---------------------------------------------------------------------------
// drawClusterBoundaries
// ---------------------------------------------------------------------------
describe("drawClusterBoundaries", () => {
	const makeMembers = (count: number, prefix = "n") => {
		const set = new Set<string>();
		for (let i = 0; i < count; i++) set.add(`${prefix}${i}`);
		return set;
	};
	const makePositions = (count: number, radius: number, prefix = "n") => {
		const positions = new Map<string, { x: number; y: number }>();
		for (let i = 0; i < count; i++) {
			const angle = (i / count) * Math.PI * 2;
			positions.set(`${prefix}${i}`, {
				x: Math.cos(angle) * radius,
				y: Math.sin(angle) * radius,
			});
		}
		return positions;
	};

	it("clears graphics when no members meet threshold", () => {
		const gfx = new CanvasGraphics();
		gfx.lineStyle(1, 0xff0000);
		gfx.drawRect(0, 0, 10, 10);
		expect(gfx.commandCount).toBeGreaterThan(0);

		const members = new Map<string, Set<string>>();
		members.set("tiny", makeMembers(2));
		drawClusterBoundaries(gfx, members, new Map(), 100, null, new Map());
		// Cleared (no further draws emitted because groups are below threshold)
		expect(gfx.commandCount).toBe(0);
	});

	it("emits bezier curves for groups meeting the minMembers threshold", () => {
		const gfx = new CanvasGraphics();
		const members = new Map<string, Set<string>>();
		members.set("big", makeMembers(10));
		const positions = makePositions(10, 100);
		drawClusterBoundaries(gfx, members, positions, 500, null, new Map());
		expect(gfx.commandCount).toBeGreaterThan(0);
	});

	it("caches hull on first call and reuses it when centroid stable", () => {
		const gfx = new CanvasGraphics();
		const members = new Map<string, Set<string>>();
		members.set("g", makeMembers(10));
		const positions = makePositions(10, 100);
		const cache = new Map();

		drawClusterBoundaries(gfx, members, positions, 500, null, cache);
		expect(cache.has("g")).toBe(true);
		const cachedHull = cache.get("g")!.hull;

		drawClusterBoundaries(gfx, members, positions, 500, null, cache);
		// Same hull object reused (no recomputation)
		expect(cache.get("g")!.hull).toBe(cachedHull);
	});

	it("recomputes hull when centroid drifts beyond threshold", () => {
		const gfx = new CanvasGraphics();
		const members = new Map<string, Set<string>>();
		members.set("g", makeMembers(10));
		const positions1 = makePositions(10, 100);
		const cache = new Map();
		drawClusterBoundaries(gfx, members, positions1, 500, null, cache);
		const firstHull = cache.get("g")!.hull;

		// Shift all positions far beyond HULL_DRIFT_THRESHOLD (50)
		const positions2 = new Map<string, { x: number; y: number }>();
		for (const [id, p] of positions1) positions2.set(id, { x: p.x + 500, y: p.y + 500 });
		drawClusterBoundaries(gfx, members, positions2, 500, null, cache);
		expect(cache.get("g")!.hull).not.toBe(firstHull);
	});

	it("skips groups with fewer than 3 positioned members", () => {
		const gfx = new CanvasGraphics();
		const members = new Map<string, Set<string>>();
		members.set("g", makeMembers(6)); // 6 IDs, but only 2 positions provided
		const positions = new Map<string, { x: number; y: number }>();
		positions.set("n0", { x: 0, y: 0 });
		positions.set("n1", { x: 10, y: 10 });
		const cache = new Map();
		drawClusterBoundaries(gfx, members, positions, 100, null, cache);
		expect(cache.has("g")).toBe(false);
	});

	it("applies hovered styling when key matches hoveredGroupLabel", () => {
		const gfxHover = new CanvasGraphics();
		const members = new Map<string, Set<string>>();
		members.set("target", makeMembers(10));
		const positions = makePositions(10, 100);
		drawClusterBoundaries(gfxHover, members, positions, 500, "target", new Map());

		const gfxNormal = new CanvasGraphics();
		drawClusterBoundaries(gfxNormal, members, positions, 500, null, new Map());
		// Hovered variant emits same command shape but with stronger alpha — at least confirm both drew something
		expect(gfxHover.commandCount).toBeGreaterThan(0);
		expect(gfxNormal.commandCount).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// applyGroupLabelPlacements
// ---------------------------------------------------------------------------
describe("applyGroupLabelPlacements", () => {
	const makePlacement = (key: string, isAggregateMode = false) => ({
		key,
		displayName: key,
		labelText: `${key} (10)`,
		worldX: 0,
		worldY: 0,
		isAggregateMode,
	});

	it("creates a new CanvasText for first-time placement", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		const placements = [makePlacement("alpha")];
		const visibleKeys = new Set(["alpha"]);

		applyGroupLabelPlacements(placements, visibleKeys, labels, container, 1, 1, null);

		expect(labels.has("alpha")).toBe(true);
		expect(labels.get("alpha")!.text).toBe("alpha (10)");
		expect(container.children).toContain(labels.get("alpha"));
	});

	it("reuses existing label on subsequent calls (duplicate keys)", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		const placements = [makePlacement("k")];
		applyGroupLabelPlacements(placements, new Set(["k"]), labels, container, 1, 1, null);
		const first = labels.get("k")!;
		const childCountBefore = container.children.length;

		// Second call with same key — same text object is reused, not re-added
		applyGroupLabelPlacements(placements, new Set(["k"]), labels, container, 1, 1, null);
		expect(labels.get("k")).toBe(first);
		expect(container.children.length).toBe(childCountBefore);
	});

	it("hides stale labels not present in current placements (viewMode cleanup)", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		applyGroupLabelPlacements(
			[makePlacement("old")],
			new Set(["old"]),
			labels,
			container,
			1,
			1,
			null,
		);
		expect(labels.get("old")!.visible).toBe(true);

		// Next frame (e.g. after viewMode switch) — "old" is no longer in placements
		applyGroupLabelPlacements([makePlacement("new")], new Set(["new"]), labels, container, 1, 1, null);
		expect(labels.get("old")!.visible).toBe(false);
		expect(labels.get("new")!.visible).toBe(true);
	});

	it("marks keys not in visibleKeys as not visible but still present", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		const placements = [makePlacement("p1"), makePlacement("p2")];
		const visibleKeys = new Set(["p1"]); // p2 placed but suppressed by overlap
		applyGroupLabelPlacements(placements, visibleKeys, labels, container, 1, 1, null);
		expect(labels.get("p1")!.visible).toBe(true);
		expect(labels.get("p2")!.visible).toBe(false);
	});

	it("applies aggregate-mode padding/stroke when isAggregateMode is true", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		applyGroupLabelPlacements(
			[makePlacement("agg", true)],
			new Set(["agg"]),
			labels,
			container,
			0.1,
			1,
			null,
		);
		const lbl = labels.get("agg")!;
		// Aggregate-mode padding differs from normal mode
		expect(lbl.bgPadX).toBe(16); // GROUP_LABEL_PAD_X_AGGREGATE
		expect(lbl.bgPadY).toBe(8); // GROUP_LABEL_PAD_Y_AGGREGATE
		expect(lbl.strokeWidth).toBe(6); // GROUP_LABEL_STROKE_WIDTH_AGGREGATE
	});

	it("applies hovered background color when key matches hoveredGroupLabel", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		applyGroupLabelPlacements(
			[makePlacement("h")],
			new Set(["h"]),
			labels,
			container,
			1,
			1,
			"h",
		);
		const lbl = labels.get("h")!;
		expect(lbl.bgColor).toBe(0x4a4a8e); // GROUP_LABEL_BG_COLOR_HOVERED
		expect(lbl.bgAlpha).toBe(0.95); // GROUP_LABEL_BG_ALPHA_HOVERED
		expect(lbl.style.fill).toBe(0xffffff); // GROUP_LABEL_FILL_HOVERED
	});

	it("updates text and fontSize when called with changed labelText", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		applyGroupLabelPlacements(
			[{ ...makePlacement("k"), labelText: "first text" }],
			new Set(["k"]),
			labels,
			container,
			1,
			1,
			null,
		);
		expect(labels.get("k")!.text).toBe("first text");

		applyGroupLabelPlacements(
			[{ ...makePlacement("k"), labelText: "updated text" }],
			new Set(["k"]),
			labels,
			container,
			1,
			1,
			null,
		);
		expect(labels.get("k")!.text).toBe("updated text");
	});

	it("handles empty placements list without errors", () => {
		const container = new CanvasContainer();
		const labels = new Map<string, CanvasText>();
		// Pre-existing label should be hidden
		const stale = new CanvasText("stale", {});
		labels.set("stale", stale);
		container.addChild(stale);

		applyGroupLabelPlacements([], new Set(), labels, container, 1, 1, null);
		expect(stale.visible).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// drawAggregateGroups
// ---------------------------------------------------------------------------
describe("drawAggregateGroups", () => {
	it("emits hit regions for each group drawn", () => {
		const gfx = new CanvasGraphics();
		const container = new CanvasContainer();
		const labels: CanvasText[] = [];
		const groups = [
			{ folder: "a", cx: 0, cy: 0, radius: 100, nodeCount: 5 },
			{ folder: "b", cx: 300, cy: 300, radius: 80, nodeCount: 8 },
		];
		const { hitRegions, labelCount } = drawAggregateGroups(groups, gfx, container, labels, 0.1);
		expect(hitRegions.length).toBe(2);
		expect(labelCount).toBe(2);
		expect(hitRegions[0].cx).toBe(0);
		expect(hitRegions[1].cx).toBe(300);
	});

	it("creates and appends new label objects when label pool is empty", () => {
		const gfx = new CanvasGraphics();
		const container = new CanvasContainer();
		const labels: CanvasText[] = [];
		const groups = [{ folder: "stories", cx: 0, cy: 0, radius: 50, nodeCount: 3 }];
		drawAggregateGroups(groups, gfx, container, labels, 0.1);
		expect(labels.length).toBe(1);
		expect(labels[0].text).toBe("stories (3)");
		expect(container.children).toContain(labels[0]);
	});

	it("reuses pooled labels when called again (i18n-style text update)", () => {
		const gfx = new CanvasGraphics();
		const container = new CanvasContainer();
		const labels: CanvasText[] = [];
		drawAggregateGroups(
			[{ folder: "en", cx: 0, cy: 0, radius: 50, nodeCount: 3 }],
			gfx,
			container,
			labels,
			0.1,
		);
		const first = labels[0];
		const childCountBefore = container.children.length;

		// Second call with same slot but different text — pool entry reused
		drawAggregateGroups(
			[{ folder: "日本語", cx: 0, cy: 0, radius: 50, nodeCount: 5 }],
			gfx,
			container,
			labels,
			0.1,
		);
		expect(labels[0]).toBe(first);
		expect(labels[0].text).toBe("日本語 (5)");
		expect(container.children.length).toBe(childCountBefore);
	});

	it("hides unused pooled labels when group count shrinks (viewMode cleanup)", () => {
		const gfx = new CanvasGraphics();
		const container = new CanvasContainer();
		const labels: CanvasText[] = [];
		drawAggregateGroups(
			[
				{ folder: "a", cx: 0, cy: 0, radius: 50, nodeCount: 3 },
				{ folder: "b", cx: 100, cy: 0, radius: 50, nodeCount: 4 },
			],
			gfx,
			container,
			labels,
			0.1,
		);
		expect(labels.length).toBe(2);
		expect(labels[1].visible).toBe(true);

		drawAggregateGroups(
			[{ folder: "a", cx: 0, cy: 0, radius: 50, nodeCount: 3 }],
			gfx,
			container,
			labels,
			0.1,
		);
		// Pool size retained, but extra slot hidden
		expect(labels.length).toBe(2);
		expect(labels[1].visible).toBe(false);
	});

	it("caps counter-scale to AGGREGATE_MAX_COUNTER_SCALE for extremely small ws", () => {
		const gfx = new CanvasGraphics();
		const container = new CanvasContainer();
		const labels: CanvasText[] = [];
		drawAggregateGroups(
			[{ folder: "f", cx: 0, cy: 0, radius: 50, nodeCount: 3 }],
			gfx,
			container,
			labels,
			0.001, // 1/ws = 1000, should clamp to MAX (8)
		);
		expect(labels[0].scale.x).toBe(8);
	});

	it("returns zero labels and empty hit regions for empty input", () => {
		const gfx = new CanvasGraphics();
		const container = new CanvasContainer();
		const labels: CanvasText[] = [];
		const { hitRegions, labelCount } = drawAggregateGroups([], gfx, container, labels, 0.1);
		expect(hitRegions.length).toBe(0);
		expect(labelCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// parseGroupByFields re-export
// ---------------------------------------------------------------------------
describe("parseGroupByFields (re-exported)", () => {
	it("is re-exported from group-label-manager for convenience", () => {
		expect(typeof parseGroupByFields).toBe("function");
		expect(parseGroupByFields("folder,tag")).toEqual(["folder", "tag"]);
		expect(parseGroupByFields("none")).toEqual([]);
		expect(parseGroupByFields(null)).toEqual([]);
	});
});
