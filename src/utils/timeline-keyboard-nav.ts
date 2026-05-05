import type { TimelineBarInfo } from "../layouts/cluster-force";

export type TimelineArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** Y-axis distance (px) above which two bars are considered to be on different timeline rows. */
export const TIMELINE_ROW_GAP_PX = 10;

/** Bar augmented with its position in the source array (used to recover original ordering). */
export interface SortedTimelineBar extends TimelineBarInfo {
	origIdx: number;
}

/** Sort bars top-to-bottom (yCenter), then left-to-right (xStart) for keyboard traversal. */
export function sortBarsForNavigation(bars: readonly TimelineBarInfo[]): SortedTimelineBar[] {
	return bars.map((b, i) => ({ ...b, origIdx: i })).sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);
}

/**
 * Resolve next index in the sorted-bar array after pressing an arrow key.
 *
 * - ArrowLeft / ArrowRight: step ±1 inside the sorted sequence (clamped to bounds).
 * - ArrowUp / ArrowDown: jump to the next bar whose yCenter differs by more than
 *   TIMELINE_ROW_GAP_PX, i.e. the next "row" / work group.
 *
 * Returns -1 only when sorted is empty. For non-empty sorted, the returned index
 * is always a valid in-range index (clamped). When no jump target is found for
 * Up/Down, the current index is preserved.
 */
export function nextTimelineNavIndex(
	sorted: readonly SortedTimelineBar[],
	currentSortedIdx: number,
	key: TimelineArrowKey,
): number {
	if (sorted.length === 0) return -1;
	let idx = currentSortedIdx;
	switch (key) {
		case "ArrowRight":
			idx = Math.min(idx + 1, sorted.length - 1);
			if (idx < 0) idx = 0;
			break;
		case "ArrowLeft":
			idx = Math.max(idx - 1, 0);
			break;
		case "ArrowDown": {
			const curY = idx >= 0 ? sorted[idx].yCenter : 0;
			const next = sorted.find((b, i) => i > idx && b.yCenter > curY + TIMELINE_ROW_GAP_PX);
			if (next) idx = sorted.indexOf(next);
			break;
		}
		case "ArrowUp": {
			const curY = idx >= 0 ? sorted[idx].yCenter : Infinity;
			for (let i = idx - 1; i >= 0; i--) {
				if (sorted[i].yCenter < curY - TIMELINE_ROW_GAP_PX) {
					idx = i;
					break;
				}
			}
			break;
		}
	}
	return idx;
}

/**
 * Given current bars + selected node + arrow key, compute the bar to focus next.
 * Returns null when there are no bars or the key produces no effective movement
 * outside the array. Pure function — pan / hover / redraw are caller's concern.
 */
export function computeTimelineArrowTarget(
	bars: readonly TimelineBarInfo[] | undefined,
	currentNodeId: string | null,
	key: TimelineArrowKey,
): TimelineBarInfo | null {
	if (!bars || bars.length === 0) return null;
	const sorted = sortBarsForNavigation(bars);
	const currentIdx = currentNodeId ? bars.findIndex((b) => b.nodeId === currentNodeId) : -1;
	const startSortedIdx = currentIdx >= 0 ? sorted.findIndex((b) => b.origIdx === currentIdx) : -1;
	const nextIdx = nextTimelineNavIndex(sorted, startSortedIdx, key);
	if (nextIdx < 0 || nextIdx >= sorted.length) return null;
	return sorted[nextIdx];
}
