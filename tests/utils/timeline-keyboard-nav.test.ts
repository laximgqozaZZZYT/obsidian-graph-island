import { describe, it, expect } from "vitest";
import {
	TIMELINE_ROW_GAP_PX,
	computeTimelineArrowTarget,
	nextTimelineNavIndex,
	sortBarsForNavigation,
	type SortedTimelineBar,
} from "../../src/utils/timeline-keyboard-nav";
import type { TimelineBarInfo } from "../../src/layouts/cluster-force";

function bar(nodeId: string, xStart: number, yCenter: number, xEnd = xStart + 10): TimelineBarInfo {
	return { nodeId, xStart, xEnd, barHeight: 6, yCenter };
}

describe("sortBarsForNavigation", () => {
	it("sorts top-to-bottom then left-to-right and preserves origIdx", () => {
		const bars: TimelineBarInfo[] = [
			bar("c", 30, 100), // origIdx 0
			bar("a", 10, 50), //  origIdx 1
			bar("b", 20, 50), //  origIdx 2
		];
		const sorted = sortBarsForNavigation(bars);
		expect(sorted.map((b) => b.nodeId)).toEqual(["a", "b", "c"]);
		expect(sorted.map((b) => b.origIdx)).toEqual([1, 2, 0]);
	});

	it("returns empty array for empty input", () => {
		expect(sortBarsForNavigation([])).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const bars: TimelineBarInfo[] = [bar("a", 10, 50), bar("b", 5, 50)];
		const snapshot = bars.map((b) => b.nodeId);
		sortBarsForNavigation(bars);
		expect(bars.map((b) => b.nodeId)).toEqual(snapshot);
	});
});

describe("nextTimelineNavIndex — empty / boundary", () => {
	it("returns -1 for empty sorted array", () => {
		expect(nextTimelineNavIndex([], -1, "ArrowRight")).toBe(-1);
		expect(nextTimelineNavIndex([], 0, "ArrowDown")).toBe(-1);
	});

	it("ArrowRight from no-selection (-1) snaps to first bar", () => {
		const sorted: SortedTimelineBar[] = [
			{ ...bar("a", 0, 0), origIdx: 0 },
			{ ...bar("b", 10, 0), origIdx: 1 },
		];
		expect(nextTimelineNavIndex(sorted, -1, "ArrowRight")).toBe(0);
	});

	it("ArrowLeft from no-selection (-1) snaps to first bar (clamped to 0)", () => {
		const sorted: SortedTimelineBar[] = [
			{ ...bar("a", 0, 0), origIdx: 0 },
			{ ...bar("b", 10, 0), origIdx: 1 },
		];
		expect(nextTimelineNavIndex(sorted, -1, "ArrowLeft")).toBe(0);
	});

	it("ArrowRight at last index stays at last (clamped)", () => {
		const sorted: SortedTimelineBar[] = [
			{ ...bar("a", 0, 0), origIdx: 0 },
			{ ...bar("b", 10, 0), origIdx: 1 },
		];
		expect(nextTimelineNavIndex(sorted, 1, "ArrowRight")).toBe(1);
	});

	it("ArrowLeft at index 0 stays at 0 (clamped)", () => {
		const sorted: SortedTimelineBar[] = [
			{ ...bar("a", 0, 0), origIdx: 0 },
			{ ...bar("b", 10, 0), origIdx: 1 },
		];
		expect(nextTimelineNavIndex(sorted, 0, "ArrowLeft")).toBe(0);
	});
});

describe("nextTimelineNavIndex — Up/Down row jumps", () => {
	const sorted: SortedTimelineBar[] = [
		{ ...bar("r0a", 0, 0), origIdx: 0 },
		{ ...bar("r0b", 10, 0), origIdx: 1 },
		{ ...bar("r1a", 0, 50), origIdx: 2 }, // > 10px gap below row 0
		{ ...bar("r1b", 10, 50), origIdx: 3 },
		{ ...bar("r2a", 0, 100), origIdx: 4 },
	];

	it("ArrowDown jumps to first bar of next row, skipping same-row siblings", () => {
		expect(nextTimelineNavIndex(sorted, 0, "ArrowDown")).toBe(2);
		expect(nextTimelineNavIndex(sorted, 1, "ArrowDown")).toBe(2);
	});

	it("ArrowDown preserves index when no next row exists", () => {
		expect(nextTimelineNavIndex(sorted, 4, "ArrowDown")).toBe(4);
	});

	it("ArrowUp jumps to last bar of previous row", () => {
		// from r1a (idx 2): scanning back, first bar with yCenter < 50-10 is r0b (idx 1)
		expect(nextTimelineNavIndex(sorted, 2, "ArrowUp")).toBe(1);
		// from r2a (idx 4): first prior with y < 100-10 is r1b (idx 3)
		expect(nextTimelineNavIndex(sorted, 4, "ArrowUp")).toBe(3);
	});

	it("ArrowUp preserves index when at top row", () => {
		expect(nextTimelineNavIndex(sorted, 0, "ArrowUp")).toBe(0);
		expect(nextTimelineNavIndex(sorted, 1, "ArrowUp")).toBe(1);
	});

	it("respects TIMELINE_ROW_GAP_PX boundary (not strictly greater)", () => {
		// Bars at exactly TIMELINE_ROW_GAP_PX apart should NOT count as different rows
		const tight: SortedTimelineBar[] = [
			{ ...bar("a", 0, 0), origIdx: 0 },
			{ ...bar("b", 0, TIMELINE_ROW_GAP_PX), origIdx: 1 },
		];
		expect(nextTimelineNavIndex(tight, 0, "ArrowDown")).toBe(0);
	});
});

describe("computeTimelineArrowTarget — integration", () => {
	const bars: TimelineBarInfo[] = [bar("a", 0, 0), bar("b", 10, 0), bar("c", 0, 50), bar("d", 10, 50)];

	it("returns null for empty / undefined bars", () => {
		expect(computeTimelineArrowTarget(undefined, "a", "ArrowRight")).toBeNull();
		expect(computeTimelineArrowTarget([], "a", "ArrowRight")).toBeNull();
	});

	it("ArrowRight from current selection moves to next sorted bar", () => {
		const t = computeTimelineArrowTarget(bars, "a", "ArrowRight");
		expect(t?.nodeId).toBe("b");
	});

	it("ArrowDown from row 0 jumps to row 1", () => {
		const t = computeTimelineArrowTarget(bars, "a", "ArrowDown");
		expect(t?.nodeId).toBe("c");
	});

	it("ArrowUp from row 1 returns last bar of row 0", () => {
		const t = computeTimelineArrowTarget(bars, "c", "ArrowUp");
		expect(t?.nodeId).toBe("b");
	});

	it("with no current selection, ArrowRight selects first sorted bar", () => {
		const t = computeTimelineArrowTarget(bars, null, "ArrowRight");
		expect(t?.nodeId).toBe("a");
	});

	it("with unknown current node id, falls back to no-selection behavior", () => {
		const t = computeTimelineArrowTarget(bars, "unknown-node", "ArrowRight");
		expect(t?.nodeId).toBe("a");
	});

	it("uses input array order to resolve current node, even when sort order differs", () => {
		const reorderedBars: TimelineBarInfo[] = [
			bar("c", 0, 50), // input idx 0, sort idx 2
			bar("a", 0, 0), //  input idx 1, sort idx 0
			bar("b", 10, 0), // input idx 2, sort idx 1
		];
		// Current is "a" (sort idx 0). ArrowRight should land on "b".
		const t = computeTimelineArrowTarget(reorderedBars, "a", "ArrowRight");
		expect(t?.nodeId).toBe("b");
	});
});
