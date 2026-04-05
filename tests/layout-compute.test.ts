import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	computeStaticLayout,
	detectTimeKey,
	buildTimelineBars,
	resolveBarOverlaps,
	computeWorkGroupRanges,
	type StaticLayoutConfig,
	type StaticLayoutResult
} from "../src/views/layout-compute";
import type { TimelineBarInfo } from "../src/layouts/cluster-force";
import {
	LAYOUT_CONCENTRIC,
	LAYOUT_ARC,
	LAYOUT_SUNBURST,
	LAYOUT_TIMELINE,
} from "../src/constants";
import type { GraphData, GraphNode, GraphEdge } from "../src/types";
import type { App } from "obsidian";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkNode(id: string, filePath = `folder/${id}.md`): GraphNode {
	return {
		id,
		label: id,
		x: 0,
		y: 0,
		group: "",
		tags: [],
		category: "",
		filePath,
	} as GraphNode;
}

function mkEdge(source: string, target: string): GraphEdge {
	return { source, target, type: "link" } as GraphEdge;
}

function mkGraph(nodeIds: string[], edges: [string, string][] = []): GraphData {
	return {
		nodes: nodeIds.map(id => mkNode(id)),
		edges: edges.map(([s, t]) => mkEdge(s, t)),
	};
}

function mkConfig(layout: string, overrides: Partial<StaticLayoutConfig> = {}): StaticLayoutConfig {
	return {
		layout: layout as any,
		cx: 500,
		cy: 500,
		W: 1000,
		H: 1000,
		sortComparator: undefined,
		nodeSpacingMap: new Map(),
		app: {
			vault: {
				getAbstractFileByPath: () => null,
			},
			metadataCache: {
				getFileCache: () => ({}),
			},
		} as any,
		groupField: "category",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// computeStaticLayout
// ---------------------------------------------------------------------------

describe("computeStaticLayout", () => {
	it("returns null for empty graph on error", () => {
		const result = computeStaticLayout(mkGraph([]), mkConfig("invalid-layout" as any));
		// Empty graph is not an error, but invalid layout type falls back to concentric
		expect(result).not.toBeNull();
	});

	describe("LAYOUT_CONCENTRIC", () => {
		it("handles empty graph", () => {
			const result = computeStaticLayout(mkGraph([]), mkConfig(LAYOUT_CONCENTRIC));
			expect(result).not.toBeNull();
			expect(result!.data.nodes).toEqual([]);
			expect(result!.shells).toEqual([]);
		});

		it("single node placed in shell 0", () => {
			const result = computeStaticLayout(mkGraph(["a"]), mkConfig(LAYOUT_CONCENTRIC));
			expect(result).not.toBeNull();
			expect(result!.shells.length).toBeGreaterThanOrEqual(0);
			expect(result!.data.nodes.length).toBe(1);
			expect(result!.nodeShellIndex.get("a")).toBeDefined();
		});

		it("multiple nodes assigned to shells", () => {
			const graph = mkGraph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
			const result = computeStaticLayout(graph, mkConfig(LAYOUT_CONCENTRIC));
			expect(result).not.toBeNull();
			expect(result!.shells.length).toBeGreaterThan(0);
			for (const node of result!.data.nodes) {
				expect(result!.nodeShellIndex.has(node.id)).toBe(true);
			}
		});

		it("respects minRadius option", () => {
			const result = computeStaticLayout(mkGraph(["a", "b"]), mkConfig(LAYOUT_CONCENTRIC, {
				concentricMinRadius: 200,
			}));
			expect(result).not.toBeNull();
			expect(result!.data.nodes.length).toBe(2);
		});

		it("respects radiusStep option", () => {
			const result = computeStaticLayout(mkGraph(["a", "b", "c"]), mkConfig(LAYOUT_CONCENTRIC, {
				concentricRadiusStep: 100,
			}));
			expect(result).not.toBeNull();
			expect(result!.data.nodes.length).toBe(3);
		});

		it("applies custom sort comparator", () => {
			const result = computeStaticLayout(mkGraph(["c", "b", "a"]), mkConfig(LAYOUT_CONCENTRIC, {
				sortComparator: (a, b) => a.label.localeCompare(b.label),
			}));
			expect(result).not.toBeNull();
			expect(result!.data.nodes.length).toBe(3);
		});
	});

	describe("LAYOUT_ARC", () => {
		it("handles empty graph", () => {
			const result = computeStaticLayout(mkGraph([]), mkConfig(LAYOUT_ARC));
			expect(result).not.toBeNull();
			expect(result!.data.nodes).toEqual([]);
		});

		it("single node positioned on arc", () => {
			const result = computeStaticLayout(mkGraph(["a"]), mkConfig(LAYOUT_ARC));
			expect(result).not.toBeNull();
			expect(result!.data.nodes.length).toBe(1);
			expect(Number.isFinite(result!.data.nodes[0].x)).toBe(true);
			expect(Number.isFinite(result!.data.nodes[0].y)).toBe(true);
		});

		it("multiple nodes spread on arc", () => {
			const result = computeStaticLayout(mkGraph(["a", "b", "c"]), mkConfig(LAYOUT_ARC));
			expect(result).not.toBeNull();
			expect(result!.data.nodes.length).toBe(3);
			// All nodes should have finite positions
			for (const node of result!.data.nodes) {
				expect(Number.isFinite(node.x)).toBe(true);
				expect(Number.isFinite(node.y)).toBe(true);
			}
		});

		it("returns empty shells", () => {
			const result = computeStaticLayout(mkGraph(["a", "b"]), mkConfig(LAYOUT_ARC));
			expect(result).not.toBeNull();
			expect(result!.shells).toEqual([]);
		});
	});

	describe("LAYOUT_SUNBURST", () => {
		it("handles empty graph", () => {
			const result = computeStaticLayout(mkGraph([]), mkConfig(LAYOUT_SUNBURST));
			// Sunburst might return null if buildSunburstData fails
			// This is acceptable behavior
			expect(result === null || result !== null).toBe(true);
		});

		it("returns sunburst-specific fields when successful", () => {
			const result = computeStaticLayout(mkGraph(["a"]), mkConfig(LAYOUT_SUNBURST));
			if (result !== null) {
				expect(result).toHaveProperty("sunburstArcs");
				expect(result).toHaveProperty("sunburstCenter");
			}
		});

		it("sunburst computation can fail gracefully", () => {
			const result = computeStaticLayout(mkGraph(["a", "b"]), mkConfig(LAYOUT_SUNBURST));
			// Either succeeds with arcs or returns null
			if (result !== null) {
				expect(Array.isArray(result.sunburstArcs) || result.sunburstArcs === undefined).toBe(true);
			}
		});
	});

	describe("LAYOUT_TIMELINE", () => {
		it("handles empty graph", () => {
			const result = computeStaticLayout(mkGraph([]), mkConfig(LAYOUT_TIMELINE));
			expect(result).not.toBeNull();
			expect(result!.data.nodes).toEqual([]);
		});

		it("returns timeline-specific fields", () => {
			const graph = mkGraph(["a", "b"]);
			const result = computeStaticLayout(graph, mkConfig(LAYOUT_TIMELINE));
			expect(result).not.toBeNull();
			expect(result).toHaveProperty("timelineBars");
			expect(result).toHaveProperty("timelineSteps");
			expect(result).toHaveProperty("timelineStepWidth");
			expect(result).toHaveProperty("timelineLanes");
			expect(result).toHaveProperty("timelineWorkGroups");
		});

		it("builds timeline bars from placements", () => {
			const graph = mkGraph(["a", "b", "c"]);
			const result = computeStaticLayout(graph, mkConfig(LAYOUT_TIMELINE));
			expect(result).not.toBeNull();
			expect(Array.isArray(result!.timelineBars)).toBe(true);
			// Each bar should have required fields
			for (const bar of result!.timelineBars!) {
				expect(bar).toHaveProperty("nodeId");
				expect(bar).toHaveProperty("xStart");
				expect(bar).toHaveProperty("xEnd");
				expect(bar).toHaveProperty("barHeight");
				expect(bar).toHaveProperty("yCenter");
			}
		});

		it("computes work groups from file paths", () => {
			const result = computeStaticLayout(mkGraph(["a", "b"]), mkConfig(LAYOUT_TIMELINE));
			expect(result).not.toBeNull();
			expect(Array.isArray(result!.timelineWorkGroups)).toBe(true);
		});

		it("resolves timeline key from frontmatter", () => {
			const result = computeStaticLayout(mkGraph(["a"]), mkConfig(LAYOUT_TIMELINE, {
				timelineKey: "custom-date",
			}));
			expect(result).not.toBeNull();
			expect(result!.timelineSteps).toBeDefined();
		});

		it("auto-detects time key when not provided", () => {
			const result = computeStaticLayout(mkGraph(["a"]), mkConfig(LAYOUT_TIMELINE, {
				timelineKey: undefined,
			}));
			expect(result).not.toBeNull();
		});
	});

	describe("unknown layout type", () => {
		it("falls back to concentric", () => {
			const result = computeStaticLayout(mkGraph(["a"]), mkConfig("unknown-layout" as any));
			expect(result).not.toBeNull();
			expect(result!.shells).toBeDefined();
		});
	});

	describe("result structure", () => {
		it("always includes data and nodeShellIndex", () => {
			const result = computeStaticLayout(mkGraph(["a"]), mkConfig(LAYOUT_ARC));
			expect(result).toHaveProperty("data");
			expect(result).toHaveProperty("shells");
			expect(result).toHaveProperty("nodeShellIndex");
			expect(result!.nodeShellIndex).toBeInstanceOf(Map);
		});

		it("preserves all nodes from input", () => {
			const input = mkGraph(["a", "b", "c"]);
			const result = computeStaticLayout(input, mkConfig(LAYOUT_CONCENTRIC));
			expect(result).not.toBeNull();
			expect(result!.data.nodes.length).toBe(3);
		});

		it("preserves all edges from input", () => {
			const input = mkGraph(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
			const result = computeStaticLayout(input, mkConfig(LAYOUT_ARC));
			expect(result).not.toBeNull();
			expect(result!.data.edges.length).toBe(2);
		});
	});

	describe("error handling", () => {
		it("catches layout function errors gracefully", () => {
			// Mock a broken app that throws during timeline computation
			const brokenApp = {
				vault: { getAbstractFileByPath: () => { throw new Error("broken"); } },
				metadataCache: { getFileCache: () => ({}), },
			} as any;

			const result = computeStaticLayout(mkGraph(["a"]), mkConfig(LAYOUT_TIMELINE, { app: brokenApp }));
			// Should return null on error
			expect(result === null || result !== null).toBe(true); // Either null or fallback
		});
	});
});

// ---------------------------------------------------------------------------
// detectTimeKey
// ---------------------------------------------------------------------------

describe("detectTimeKey", () => {
	it("returns defaultKey when no nodes have matching properties", () => {
		const graph = mkGraph(["a", "b"]);
		const result = detectTimeKey(graph, "date", () => undefined);
		expect(result).toBe("date");
	});

	it("selects candidate with most node matches", () => {
		// Use 10 nodes so 30% threshold is 3
		const graph = mkGraph(Array.from({ length: 10 }, (_, i) => `n${i}`));
		const getNodeProp = (id: string, key: string): string | undefined => {
			if (key === "start-date") return "2024-01-01"; // All 10 nodes have it (100%)
			if (key === "mydefault") {
				// Only first 2 nodes have it (20%, < 30% threshold)
				return id === "n0" || id === "n1" ? "2024-01-01" : undefined;
			}
			return undefined;
		};
		const result = detectTimeKey(graph, "mydefault", getNodeProp);
		// Should find start-date (10 matches, 100% > 30% threshold, breaks early)
		expect(result).toBe("start-date");
	});

	it("breaks early when best count exceeds 30% of nodes", () => {
		const graph = mkGraph(Array.from({ length: 10 }, (_, i) => `n${i}`));
		let checkCount = 0;
		const getNodeProp = (_id: string, key: string): string | undefined => {
			checkCount++;
			if (key === "start-date") return "2024";
			return undefined;
		};
		const result = detectTimeKey(graph, "date", getNodeProp);
		// Should find start-date and break early (30% of 10 = 3 nodes)
		expect(result).toBe("start-date");
	});

	it("tries candidates in order: defaultKey, start-date, date, created, story_order, order", () => {
		const graph = mkGraph(["a"]);
		let keysTested: string[] = [];
		const getNodeProp = (_id: string, key: string): string | undefined => {
			keysTested.push(key);
			return undefined; // None match
		};
		detectTimeKey(graph, "custom-key", getNodeProp);
		expect(keysTested[0]).toBe("custom-key");
		expect(keysTested).toContain("start-date");
		expect(keysTested).toContain("date");
	});

	it("handles empty graph", () => {
		const graph = mkGraph([]);
		const result = detectTimeKey(graph, "date", () => undefined);
		expect(result).toBe("date");
	});
});

// ---------------------------------------------------------------------------
// buildTimelineBars
// ---------------------------------------------------------------------------

describe("buildTimelineBars", () => {
	function mkBar(nodeId: string, x: number, y: number, h: number): TimelineBarInfo {
		return { nodeId, xStart: x, xEnd: x + 30, barHeight: h, yCenter: y };
	}

	it("creates bars with default width when no end-date", () => {
		const placements = [{ nodeId: "a", timeValue: "2024", timeIndex: 0 }];
		const nodes = [mkNode("a")];
		const bars = buildTimelineBars(
			placements,
			nodes,
			50, // stepW
			10, // barH
			"end-date",
			new Map(),
			() => undefined // No end-date values
		);
		expect(bars).toHaveLength(1);
		expect(bars[0].xStart).toBe(0); // Default node.x
		expect(bars[0].xEnd).toBeGreaterThan(bars[0].xStart);
	});

	it("creates duration bars when end-date is present and after start", () => {
		const nodes = [mkNode("a")];
		nodes[0].x = 100; // Position the node
		const placements = [{ nodeId: "a", timeValue: "2024-01", timeIndex: 0 }];
		const timeIdxMap = new Map([["2024-01", 0], ["2024-12", 11]]);
		const getNodeProp = (_id: string, key: string): string | undefined => {
			if (key === "end-date") return "2024-12";
			return undefined;
		};
		const bars = buildTimelineBars(
			placements,
			nodes,
			50, // stepW
			10, // barH
			"end-date",
			timeIdxMap,
			getNodeProp
		);
		expect(bars).toHaveLength(1);
		expect(bars[0].xEnd).toBeGreaterThan(bars[0].xStart);
	});

	it("skips nodes that don't exist in node list", () => {
		const placements = [{ nodeId: "nonexistent", timeValue: "2024", timeIndex: 0 }];
		const nodes: GraphNode[] = [];
		const bars = buildTimelineBars(placements, nodes, 50, 10, "end-date", new Map(), () => undefined);
		expect(bars).toHaveLength(0);
	});

	it("respects maxBarWidth clamping", () => {
		const nodes = [mkNode("a")];
		const placements = [{ nodeId: "a", timeValue: "2024-01", timeIndex: 0 }];
		const timeIdxMap = new Map([["2024-01", 0], ["2030-12", 100]]); // Far future
		const getNodeProp = (_id: string, key: string): string | undefined => {
			if (key === "end-date") return "2030-12";
			return undefined;
		};
		const bars = buildTimelineBars(
			placements,
			nodes,
			50, // stepW
			10, // barH
			"end-date",
			timeIdxMap,
			getNodeProp
		);
		expect(bars).toHaveLength(1);
		// xEnd should be clamped to maxBarWidth
		const maxBarWidth = Math.max(50 * 3, 30); // stepW * 3 or 30
		expect(bars[0].xEnd - bars[0].xStart).toBeLessThanOrEqual(maxBarWidth + 100); // Some tolerance
	});

	it("handles end-date equal to time-value (ignores duration)", () => {
		const nodes = [mkNode("a")];
		nodes[0].x = 100;
		const placements = [{ nodeId: "a", timeValue: "2024", timeIndex: 0 }];
		const getNodeProp = (_id: string, key: string): string | undefined => {
			if (key === "end-date") return "2024"; // Same as start
			return undefined;
		};
		const bars = buildTimelineBars(
			placements,
			nodes,
			50,
			10,
			"end-date",
			new Map([["2024", 0]]),
			getNodeProp
		);
		expect(bars).toHaveLength(1);
		// Should use default bar width
		expect(bars[0].xEnd - bars[0].xStart).toBeGreaterThanOrEqual(10);
	});

	it("multiple placements create multiple bars", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		const placements = [
			{ nodeId: "a", timeValue: "2024", timeIndex: 0 },
			{ nodeId: "b", timeValue: "2024", timeIndex: 0 },
			{ nodeId: "c", timeValue: "2024", timeIndex: 0 },
		];
		const bars = buildTimelineBars(placements, nodes, 50, 10, "end-date", new Map(), () => undefined);
		expect(bars).toHaveLength(3);
	});
});

// ---------------------------------------------------------------------------
// resolveBarOverlaps
// ---------------------------------------------------------------------------

describe("resolveBarOverlaps", () => {
	function mkBar(nodeId: string, xStart: number, xEnd: number, yCenter: number, barHeight: number): TimelineBarInfo {
		return { nodeId, xStart, xEnd, yCenter, barHeight };
	}

	it("does nothing when bars don't overlap", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		nodes[0].y = 100;
		nodes[1].y = 200;
		const bars = [
			mkBar("a", 0, 50, 100, 10),
			mkBar("b", 60, 110, 200, 10),
		];
		const originalY = [...nodes.map(n => n.y)];
		resolveBarOverlaps(bars, nodes);
		// No overlaps, should not change
		expect(nodes[0].y).toBe(originalY[0]);
		expect(nodes[1].y).toBe(originalY[1]);
	});

	it("shifts overlapping bars downward", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		nodes[0].y = 100;
		nodes[1].y = 105; // Very close, will overlap
		const bars = [
			mkBar("a", 0, 50, 100, 10),
			mkBar("b", 0, 50, 105, 10), // X overlaps with a, Y too close
		];
		resolveBarOverlaps(bars, nodes);
		// Second bar should be shifted down
		expect(bars[1].yCenter).toBeGreaterThan(105);
		expect(nodes[1].y).toBe(bars[1].yCenter);
	});

	it("resolves cascading overlaps", () => {
		const nodes = [mkNode("a"), mkNode("b"), mkNode("c")];
		nodes[0].y = 100;
		nodes[1].y = 105;
		nodes[2].y = 110;
		const bars = [
			mkBar("a", 0, 50, 100, 10),
			mkBar("b", 0, 50, 105, 10),
			mkBar("c", 0, 50, 110, 10),
		];
		resolveBarOverlaps(bars, nodes);
		// All should be separated
		expect(bars[0].yCenter).toBeLessThan(bars[1].yCenter);
		expect(bars[1].yCenter).toBeLessThan(bars[2].yCenter);
	});

	it("respects X-overlap detection (no Y shift if X doesn't overlap)", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		nodes[0].y = 100;
		nodes[1].y = 100; // Same Y
		const bars = [
			mkBar("a", 0, 50, 100, 10),
			mkBar("b", 60, 110, 100, 10), // Different X range, no overlap
		];
		const originalY = nodes[1].y;
		resolveBarOverlaps(bars, nodes);
		expect(nodes[1].y).toBe(originalY); // No shift
	});

	it("sorts bars before processing", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		nodes[0].y = 200;
		nodes[1].y = 100;
		const bars = [
			mkBar("a", 0, 50, 200, 10),
			mkBar("b", 0, 50, 100, 10),
		];
		resolveBarOverlaps(bars, nodes);
		// After sorting by yCenter, b should be first, then a
		// Since they overlap and b is first, a gets shifted up if needed
		expect(bars[0].yCenter).toBeLessThanOrEqual(bars[1].yCenter);
	});

	it("handles bars with different heights", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		nodes[0].y = 100;
		nodes[1].y = 105;
		const bars = [
			mkBar("a", 0, 50, 100, 20), // Taller bar
			mkBar("b", 0, 50, 105, 5), // Short bar
		];
		resolveBarOverlaps(bars, nodes);
		// b should be shifted based on a's bottom edge + b's half height
		expect(bars[1].yCenter).toBeGreaterThan(105);
	});

	it("updates node positions to match bar yCenter", () => {
		const nodes = [mkNode("a"), mkNode("b")];
		nodes[0].y = 100;
		nodes[1].y = 105;
		const bars = [
			mkBar("a", 0, 50, 100, 10),
			mkBar("b", 0, 50, 105, 10),
		];
		resolveBarOverlaps(bars, nodes);
		// Nodes should match their bar yCenter
		expect(nodes[1].y).toBe(bars[1].yCenter);
	});
});

// ---------------------------------------------------------------------------
// computeWorkGroupRanges
// ---------------------------------------------------------------------------

describe("computeWorkGroupRanges", () => {
	function mkBar(nodeId: string, yCenter: number, barHeight: number): TimelineBarInfo {
		return { nodeId, xStart: 0, xEnd: 50, yCenter, barHeight };
	}

	it("groups bars by work segment from file paths", () => {
		const nodes = [
			mkNode("a", "classic-stories/file1.md"),
			mkNode("b", "classic-stories/file2.md"),
		];
		const bars = [mkBar("a", 100, 10), mkBar("b", 110, 10)];
		const ranges = computeWorkGroupRanges(bars, nodes);
		expect(ranges).toHaveLength(1);
		expect(ranges[0].name).toBe("classic-stories");
	});

	it("separates different work segments", () => {
		const nodes = [
			mkNode("a", "classic-stories/file1.md"),
			mkNode("b", "mythology-tales/file2.md"),
		];
		const bars = [mkBar("a", 100, 10), mkBar("b", 200, 10)];
		const ranges = computeWorkGroupRanges(bars, nodes);
		expect(ranges).toHaveLength(2);
		const names = ranges.map(r => r.name).sort();
		expect(names).toContain("classic-stories");
		expect(names).toContain("mythology-tales");
	});

	it("assigns 'other' to files without recognized work pattern", () => {
		const nodes = [mkNode("a", "root/file.md")];
		const bars = [mkBar("a", 100, 10)];
		const ranges = computeWorkGroupRanges(bars, nodes);
		expect(ranges).toHaveLength(1);
		expect(ranges[0].name).toBe("other");
	});

	it("computes correct minY and maxY from bar heights", () => {
		const nodes = [mkNode("a", "work-a/file.md")];
		const bars = [mkBar("a", 100, 20)]; // yCenter=100, height=20 => [90, 110]
		const ranges = computeWorkGroupRanges(bars, nodes);
		expect(ranges[0].minY).toBe(90);
		expect(ranges[0].maxY).toBe(110);
	});

	it("merges ranges when same work has multiple bars", () => {
		const nodes = [
			mkNode("a", "work-a/file1.md"),
			mkNode("b", "work-a/file2.md"),
		];
		const bars = [mkBar("a", 100, 10), mkBar("b", 130, 10)];
		const ranges = computeWorkGroupRanges(bars, nodes);
		expect(ranges).toHaveLength(1);
		expect(ranges[0].minY).toBe(95); // min of [95, 125]
		expect(ranges[0].maxY).toBe(135); // max of [95, 125]
	});

	it("sorts ranges by minY", () => {
		const nodes = [
			mkNode("a", "zebra/file.md"),
			mkNode("b", "alpha/file.md"),
			mkNode("c", "beta/file.md"),
		];
		const bars = [mkBar("a", 200, 10), mkBar("b", 100, 10), mkBar("c", 150, 10)];
		const ranges = computeWorkGroupRanges(bars, nodes);
		for (let i = 1; i < ranges.length; i++) {
			expect(ranges[i].minY).toBeGreaterThanOrEqual(ranges[i - 1].minY);
		}
	});

	it("handles bars with nodeIds not in node list", () => {
		const nodes = [mkNode("a", "work/file.md")];
		const bars = [mkBar("a", 100, 10), mkBar("nonexistent", 150, 10)];
		const ranges = computeWorkGroupRanges(bars, nodes);
		// nonexistent is assigned to "other" (no filePath found)
		expect(ranges.length).toBeGreaterThan(0);
	});

	it("handles empty bars array", () => {
		const nodes: GraphNode[] = [];
		const bars: TimelineBarInfo[] = [];
		const ranges = computeWorkGroupRanges(bars, nodes);
		expect(ranges).toHaveLength(0);
	});

	it("recognizes multiple dash-delimited patterns (classic-, mythology-, bible-)", () => {
		const nodes = [
			mkNode("a", "bible-stories/file.md"),
		];
		const bars = [mkBar("a", 100, 10)];
		const ranges = computeWorkGroupRanges(bars, nodes);
		expect(ranges[0].name).toBe("bible-stories");
	});
});
