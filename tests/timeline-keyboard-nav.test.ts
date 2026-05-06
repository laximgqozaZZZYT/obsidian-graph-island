import { describe, it, expect } from "vitest";
import {
	TIMELINE_ROW_GAP,
	sortTimelineBarsForNav,
	nextSortedIndexForArrow,
	pickNextTimelineBar,
} from "../src/views/timeline-keyboard-nav";
import type { TimelineBarInfo } from "../src/layouts/cluster-force";

function bar(nodeId: string, xStart: number, yCenter: number, xEnd = xStart + 10, h = 6): TimelineBarInfo {
	return { nodeId, xStart, xEnd, barHeight: h, yCenter };
}

describe("sortTimelineBarsForNav", () => {
	it("sorts by Y then X, preserving origIdx from input order", () => {
		const bars = [bar("a", 30, 100), bar("b", 10, 50), bar("c", 20, 50)];
		const sorted = sortTimelineBarsForNav(bars);
		expect(sorted.map((b) => b.nodeId)).toEqual(["b", "c", "a"]);
		expect(sorted.map((b) => b.origIdx)).toEqual([1, 2, 0]);
	});

	it("returns an empty array for empty input", () => {
		expect(sortTimelineBarsForNav([])).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const bars = [bar("a", 30, 100), bar("b", 10, 50)];
		const before = bars.map((b) => b.nodeId);
		sortTimelineBarsForNav(bars);
		expect(bars.map((b) => b.nodeId)).toEqual(before);
	});
});

describe("nextSortedIndexForArrow", () => {
	const sorted = sortTimelineBarsForNav([
		bar("a", 0, 50),
		bar("b", 20, 50),
		bar("c", 0, 50 + TIMELINE_ROW_GAP + 5),
		bar("d", 30, 50 + TIMELINE_ROW_GAP + 5),
	]);

	it("returns -1 for empty bars regardless of key", () => {
		expect(nextSortedIndexForArrow([], -1, "ArrowRight")).toBe(-1);
		expect(nextSortedIndexForArrow([], 5, "ArrowDown")).toBe(-1);
	});

	it("ArrowRight from no selection lands on the first bar", () => {
		expect(nextSortedIndexForArrow(sorted, -1, "ArrowRight")).toBe(0);
	});

	it("ArrowRight advances by one and clamps at the last bar", () => {
		expect(nextSortedIndexForArrow(sorted, 0, "ArrowRight")).toBe(1);
		expect(nextSortedIndexForArrow(sorted, sorted.length - 1, "ArrowRight")).toBe(sorted.length - 1);
	});

	it("ArrowLeft retreats by one and clamps at zero", () => {
		expect(nextSortedIndexForArrow(sorted, 2, "ArrowLeft")).toBe(1);
		expect(nextSortedIndexForArrow(sorted, 0, "ArrowLeft")).toBe(0);
	});

	it("ArrowDown jumps to the next row beyond TIMELINE_ROW_GAP", () => {
		// from index 0 (Y=50): next bar with Y > 50 + 10 → index 2 (Y=65)
		expect(nextSortedIndexForArrow(sorted, 0, "ArrowDown")).toBe(2);
	});

	it("ArrowDown stays put when no further row exists", () => {
		expect(nextSortedIndexForArrow(sorted, sorted.length - 1, "ArrowDown")).toBe(sorted.length - 1);
	});

	it("ArrowDown from no selection finds the first bar far enough below Y=0", () => {
		// curY treated as 0 → first bar with yCenter > 10 is index 0 (Y=50)
		expect(nextSortedIndexForArrow(sorted, -1, "ArrowDown")).toBe(0);
	});

	it("ArrowUp jumps to the previous row beyond TIMELINE_ROW_GAP", () => {
		// from index 3 (Y=65): previous with Y < 65 - 10 → index 1 (Y=50)
		expect(nextSortedIndexForArrow(sorted, 3, "ArrowUp")).toBe(1);
	});

	it("ArrowUp stays put when no earlier row exists", () => {
		expect(nextSortedIndexForArrow(sorted, 0, "ArrowUp")).toBe(0);
	});

	it("ignores unknown keys (returns the input index)", () => {
		expect(nextSortedIndexForArrow(sorted, 2, "Enter")).toBe(2);
		expect(nextSortedIndexForArrow(sorted, 2, "")).toBe(2);
	});

	it("does not jump within the same row on ArrowDown", () => {
		// index 0 and 1 share Y=50; ArrowDown must skip to a later row
		const result = nextSortedIndexForArrow(sorted, 0, "ArrowDown");
		expect(sorted[result].yCenter).toBeGreaterThan(50 + TIMELINE_ROW_GAP);
	});
});

describe("pickNextTimelineBar", () => {
	const bars = [bar("a", 0, 50), bar("b", 20, 50), bar("c", 0, 50 + TIMELINE_ROW_GAP + 5)];

	it("returns null for empty bars", () => {
		expect(pickNextTimelineBar([], null, "ArrowRight")).toBeNull();
	});

	it("returns null when an unknown key with no current selection produces no movement", () => {
		// currentId=null → currentSortedIdx=-1; "Enter" returns -1; index < 0 → null
		expect(pickNextTimelineBar(bars, null, "Enter")).toBeNull();
	});

	it("selects the first bar with ArrowRight when nothing is selected", () => {
		const target = pickNextTimelineBar(bars, null, "ArrowRight");
		expect(target?.nodeId).toBe("a");
	});

	it("advances to the sibling bar in the same row on ArrowRight", () => {
		const target = pickNextTimelineBar(bars, "a", "ArrowRight");
		expect(target?.nodeId).toBe("b");
	});

	it("falls through to the next row on ArrowDown", () => {
		const target = pickNextTimelineBar(bars, "a", "ArrowDown");
		expect(target?.nodeId).toBe("c");
	});

	it("returns the bar payload (nodeId, xStart, xEnd, yCenter, barHeight)", () => {
		const target = pickNextTimelineBar(bars, null, "ArrowRight");
		expect(target).toMatchObject({
			nodeId: "a",
			xStart: 0,
			xEnd: 10,
			yCenter: 50,
			barHeight: 6,
		});
	});

	it("treats an unknown currentId as 'no selection'", () => {
		const target = pickNextTimelineBar(bars, "does-not-exist", "ArrowRight");
		expect(target?.nodeId).toBe("a");
	});
});
