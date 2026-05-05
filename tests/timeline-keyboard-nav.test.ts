import { describe, it, expect } from "vitest";
import {
	TIMELINE_ROW_GAP_THRESHOLD,
	nextTimelineBarIndex,
	resolveTimelineNavTarget,
	sortBarsForNavigation,
} from "../src/views/timeline-keyboard-nav";
import type { TimelineBarInfo } from "../src/layouts/cluster-force";

function bar(id: string, yCenter: number, xStart: number): TimelineBarInfo {
	return { nodeId: id, yCenter, xStart, xEnd: xStart + 10, barHeight: 6 };
}

describe("sortBarsForNavigation", () => {
	it("sorts by Y first then by X", () => {
		const bars = [bar("a", 100, 30), bar("b", 50, 80), bar("c", 50, 20), bar("d", 100, 10)];
		const sorted = sortBarsForNavigation(bars).map((b) => b.nodeId);
		expect(sorted).toEqual(["c", "b", "d", "a"]);
	});

	it("does not mutate the input", () => {
		const bars = [bar("a", 100, 30), bar("b", 50, 80)];
		const before = bars.map((b) => b.nodeId);
		sortBarsForNavigation(bars);
		expect(bars.map((b) => b.nodeId)).toEqual(before);
	});

	it("returns an empty array for empty input", () => {
		expect(sortBarsForNavigation([])).toEqual([]);
	});
});

describe("nextTimelineBarIndex", () => {
	const sameRow = [{ yCenter: 50 }, { yCenter: 50 }, { yCenter: 50 }];
	const twoRows = [
		{ yCenter: 50 },
		{ yCenter: 50 },
		{ yCenter: 100 }, // gap = 50, well above threshold
		{ yCenter: 100 },
	];

	it("returns -1 when there are no bars", () => {
		expect(nextTimelineBarIndex([], -1, "ArrowRight")).toBe(-1);
		expect(nextTimelineBarIndex([], 0, "ArrowDown")).toBe(-1);
	});

	it("ArrowRight from -1 selects index 0", () => {
		expect(nextTimelineBarIndex(sameRow, -1, "ArrowRight")).toBe(0);
	});

	it("ArrowRight advances by one and clamps at end", () => {
		expect(nextTimelineBarIndex(sameRow, 0, "ArrowRight")).toBe(1);
		expect(nextTimelineBarIndex(sameRow, 2, "ArrowRight")).toBe(2);
	});

	it("ArrowLeft from -1 clamps to 0", () => {
		expect(nextTimelineBarIndex(sameRow, -1, "ArrowLeft")).toBe(0);
	});

	it("ArrowLeft moves back by one and clamps at 0", () => {
		expect(nextTimelineBarIndex(sameRow, 2, "ArrowLeft")).toBe(1);
		expect(nextTimelineBarIndex(sameRow, 0, "ArrowLeft")).toBe(0);
	});

	it("ArrowDown jumps to the next row beyond the gap threshold", () => {
		// from index 0 (y=50), next bar with yCenter > 50 + 10 is index 2 (y=100)
		expect(nextTimelineBarIndex(twoRows, 0, "ArrowDown")).toBe(2);
		expect(nextTimelineBarIndex(twoRows, 1, "ArrowDown")).toBe(2);
	});

	it("ArrowDown stays put when there is no further row", () => {
		expect(nextTimelineBarIndex(twoRows, 2, "ArrowDown")).toBe(2);
		expect(nextTimelineBarIndex(twoRows, 3, "ArrowDown")).toBe(3);
	});

	it("ArrowDown from -1 finds the first row above 0+gap", () => {
		// curY=0, threshold=10, find first bar with yCenter > 10. That's index 0 (y=50).
		expect(nextTimelineBarIndex(twoRows, -1, "ArrowDown")).toBe(0);
	});

	it("ArrowUp jumps to the previous row beyond the gap threshold", () => {
		expect(nextTimelineBarIndex(twoRows, 2, "ArrowUp")).toBe(1);
		expect(nextTimelineBarIndex(twoRows, 3, "ArrowUp")).toBe(1);
	});

	it("ArrowUp stays put when there is no row above", () => {
		expect(nextTimelineBarIndex(twoRows, 0, "ArrowUp")).toBe(0);
	});

	it("ArrowUp from -1 stays at -1 (Infinity sentinel never matches)", () => {
		expect(nextTimelineBarIndex(twoRows, -1, "ArrowUp")).toBe(-1);
	});

	it("respects a custom row gap threshold", () => {
		const closeRows = [{ yCenter: 50 }, { yCenter: 55 }];
		// default threshold (10): no jump
		expect(nextTimelineBarIndex(closeRows, 0, "ArrowDown")).toBe(0);
		// threshold 1: yCenter > 51 → index 1 matches
		expect(nextTimelineBarIndex(closeRows, 0, "ArrowDown", 1)).toBe(1);
	});

	it("exposes the default threshold", () => {
		expect(TIMELINE_ROW_GAP_THRESHOLD).toBe(10);
	});
});

describe("resolveTimelineNavTarget", () => {
	const bars: TimelineBarInfo[] = [bar("a", 50, 10), bar("b", 50, 20), bar("c", 100, 5), bar("d", 100, 15)];

	it("returns null for missing or empty bars", () => {
		expect(resolveTimelineNavTarget(undefined, null, "ArrowRight")).toBeNull();
		expect(resolveTimelineNavTarget([], null, "ArrowRight")).toBeNull();
	});

	it("ArrowRight from no selection picks the first bar in nav order", () => {
		const t = resolveTimelineNavTarget(bars, null, "ArrowRight");
		expect(t?.nodeId).toBe("a"); // sorted first by y=50,x=10
	});

	it("ArrowRight advances within the same row", () => {
		const t = resolveTimelineNavTarget(bars, "a", "ArrowRight");
		expect(t?.nodeId).toBe("b");
	});

	it("ArrowDown jumps from row 1 to row 2 at the matching column", () => {
		// From "a" (y=50,x=10), down moves to first bar with y > 60 → "c" (y=100,x=5)
		const t = resolveTimelineNavTarget(bars, "a", "ArrowDown");
		expect(t?.nodeId).toBe("c");
	});

	it("ArrowUp from row 2 returns to row 1", () => {
		const t = resolveTimelineNavTarget(bars, "d", "ArrowUp");
		expect(t?.nodeId).toBe("b"); // sorted index 1 in row above
	});

	it("returns null when current id is not in the bars list and arrow up has nowhere to go", () => {
		// unknown current → currentIdx = -1, ArrowUp returns -1
		expect(resolveTimelineNavTarget(bars, "ghost", "ArrowUp")).toBeNull();
	});

	it("treats unknown current id as no selection for ArrowRight", () => {
		const t = resolveTimelineNavTarget(bars, "ghost", "ArrowRight");
		expect(t?.nodeId).toBe("a");
	});
});
