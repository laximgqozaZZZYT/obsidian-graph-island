import { describe, it, expect } from "vitest";
import {
	TIMELINE_ROW_GAP_PX,
	sortTimelineBars,
	nextTimelineBarIndex,
	resolveNextTimelineBar,
} from "../src/views/timeline-keyboard-nav";
import type { TimelineBarInfo } from "../src/layouts/cluster-force";

function bar(nodeId: string, yCenter: number, xStart: number, xEnd = xStart + 10): TimelineBarInfo {
	return { nodeId, xStart, xEnd, barHeight: 6, yCenter };
}

describe("timeline-keyboard-nav constants", () => {
	it("TIMELINE_ROW_GAP_PX is a positive finite number", () => {
		expect(TIMELINE_ROW_GAP_PX).toBeGreaterThan(0);
		expect(Number.isFinite(TIMELINE_ROW_GAP_PX)).toBe(true);
	});
});

describe("sortTimelineBars", () => {
	it("sorts by Y ascending, then X ascending", () => {
		const bars: TimelineBarInfo[] = [bar("c", 100, 50), bar("a", 50, 0), bar("b", 50, 30), bar("d", 100, 10)];
		const sorted = sortTimelineBars(bars);
		expect(sorted.map((b) => b.nodeId)).toEqual(["a", "b", "d", "c"]);
	});

	it("preserves original index for back-mapping", () => {
		const bars: TimelineBarInfo[] = [bar("a", 50, 0), bar("b", 50, 30), bar("c", 100, 50)];
		const sorted = sortTimelineBars(bars);
		expect(sorted.find((b) => b.nodeId === "a")?.origIdx).toBe(0);
		expect(sorted.find((b) => b.nodeId === "b")?.origIdx).toBe(1);
		expect(sorted.find((b) => b.nodeId === "c")?.origIdx).toBe(2);
	});

	it("returns empty array for empty input", () => {
		expect(sortTimelineBars([])).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const bars: TimelineBarInfo[] = [bar("c", 100, 50), bar("a", 50, 0)];
		const before = [...bars];
		sortTimelineBars(bars);
		expect(bars).toEqual(before);
	});
});

describe("nextTimelineBarIndex — empty / no-op", () => {
	it("returns -1 for empty bars", () => {
		expect(nextTimelineBarIndex([], -1, "ArrowRight")).toBe(-1);
		expect(nextTimelineBarIndex([], 0, "ArrowLeft")).toBe(-1);
	});

	it("ArrowUp with no current selection is a no-op (-1)", () => {
		// Matches original behaviour: the loop body never executes when
		// currentSortedIdx = -1, so no bar is selected.
		const sorted = [{ yCenter: 50 }, { yCenter: 100 }, { yCenter: 200 }];
		expect(nextTimelineBarIndex(sorted, -1, "ArrowUp")).toBe(-1);
	});
});

describe("nextTimelineBarIndex — ArrowRight / ArrowLeft", () => {
	const sorted = [{ yCenter: 50 }, { yCenter: 50 }, { yCenter: 100 }, { yCenter: 100 }];

	it("ArrowRight advances by one and clamps at the end", () => {
		expect(nextTimelineBarIndex(sorted, 0, "ArrowRight")).toBe(1);
		expect(nextTimelineBarIndex(sorted, 2, "ArrowRight")).toBe(3);
		expect(nextTimelineBarIndex(sorted, 3, "ArrowRight")).toBe(3);
	});

	it("ArrowRight starts at 0 with no current selection", () => {
		expect(nextTimelineBarIndex(sorted, -1, "ArrowRight")).toBe(0);
	});

	it("ArrowLeft retreats by one and clamps at 0", () => {
		expect(nextTimelineBarIndex(sorted, 3, "ArrowLeft")).toBe(2);
		expect(nextTimelineBarIndex(sorted, 1, "ArrowLeft")).toBe(0);
		expect(nextTimelineBarIndex(sorted, 0, "ArrowLeft")).toBe(0);
	});

	it("ArrowLeft stays at 0 with no current selection", () => {
		expect(nextTimelineBarIndex(sorted, -1, "ArrowLeft")).toBe(0);
	});
});

describe("nextTimelineBarIndex — ArrowDown / ArrowUp row jumps", () => {
	// Three rows: y=50 (idx 0,1), y=100 (idx 2,3), y=200 (idx 4)
	const sorted = [{ yCenter: 50 }, { yCenter: 50 }, { yCenter: 100 }, { yCenter: 100 }, { yCenter: 200 }];

	it("ArrowDown jumps to first bar in the next row", () => {
		expect(nextTimelineBarIndex(sorted, 0, "ArrowDown")).toBe(2);
		expect(nextTimelineBarIndex(sorted, 1, "ArrowDown")).toBe(2);
		expect(nextTimelineBarIndex(sorted, 2, "ArrowDown")).toBe(4);
	});

	it("ArrowDown returns the same index when no further row exists", () => {
		// Original behaviour: sortedIdx unchanged → caller still applies it,
		// but resolveNextTimelineBar guards against re-selecting the same node.
		expect(nextTimelineBarIndex(sorted, 4, "ArrowDown")).toBe(4);
	});

	it("ArrowUp walks back to the closest bar in the previous row", () => {
		expect(nextTimelineBarIndex(sorted, 4, "ArrowUp")).toBe(3);
		expect(nextTimelineBarIndex(sorted, 3, "ArrowUp")).toBe(1);
		expect(nextTimelineBarIndex(sorted, 1, "ArrowUp")).toBe(1); // top row → no change
	});

	it("ArrowDown row gap is exactly TIMELINE_ROW_GAP_PX (strict greater-than)", () => {
		// curY = 50, candidates need yCenter > 50 + GAP. yCenter=60 fails, yCenter=61 passes.
		const tight = [{ yCenter: 50 }, { yCenter: 50 + TIMELINE_ROW_GAP_PX }];
		expect(nextTimelineBarIndex(tight, 0, "ArrowDown")).toBe(0);
		const loose = [{ yCenter: 50 }, { yCenter: 50 + TIMELINE_ROW_GAP_PX + 0.5 }];
		expect(nextTimelineBarIndex(loose, 0, "ArrowDown")).toBe(1);
	});
});

describe("resolveNextTimelineBar", () => {
	const bars: TimelineBarInfo[] = [
		bar("alpha", 50, 0),
		bar("beta", 50, 30),
		bar("gamma", 100, 0),
		bar("delta", 200, 10),
	];

	it("returns null for empty bars", () => {
		expect(resolveNextTimelineBar([], "alpha", "ArrowRight")).toBeNull();
		expect(resolveNextTimelineBar([], null, "ArrowDown")).toBeNull();
	});

	it("ArrowRight from current selection → next bar", () => {
		const next = resolveNextTimelineBar(bars, "alpha", "ArrowRight");
		expect(next?.nodeId).toBe("beta");
	});

	it("ArrowRight with unknown current id → first bar", () => {
		const next = resolveNextTimelineBar(bars, "ghost", "ArrowRight");
		expect(next?.nodeId).toBe("alpha");
	});

	it("ArrowDown crosses to next Y row", () => {
		const next = resolveNextTimelineBar(bars, "beta", "ArrowDown");
		expect(next?.nodeId).toBe("gamma");
	});

	it("ArrowUp crosses to previous Y row", () => {
		const next = resolveNextTimelineBar(bars, "delta", "ArrowUp");
		expect(next?.nodeId).toBe("gamma");
	});

	it("ArrowUp with no selection is a no-op", () => {
		expect(resolveNextTimelineBar(bars, null, "ArrowUp")).toBeNull();
	});

	it("ArrowLeft from first bar stays on the first bar", () => {
		const next = resolveNextTimelineBar(bars, "alpha", "ArrowLeft");
		expect(next?.nodeId).toBe("alpha");
	});

	it("includes origIdx referencing the unsorted bars array", () => {
		// Re-order bars so that sort permutes them
		const reordered: TimelineBarInfo[] = [bars[3], bars[2], bars[1], bars[0]];
		const next = resolveNextTimelineBar(reordered, reordered[3].nodeId, "ArrowRight");
		// "alpha" is at unsorted index 3; ArrowRight from it should not advance
		// (alpha and beta share Y, but in sorted order alpha precedes beta).
		expect(next?.nodeId).toBe("beta");
		// origIdx must still point back into reordered (beta is at unsorted index 2).
		expect(reordered[next!.origIdx].nodeId).toBe("beta");
	});
});
