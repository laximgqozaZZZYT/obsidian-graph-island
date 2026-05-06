import type { TimelineBarInfo } from "../layouts/cluster-force";

/**
 * Y-coordinate gap (world units) used to detect a "different row" when
 * navigating with ArrowUp / ArrowDown across timeline bars. Two bars whose
 * vertical centers differ by more than this threshold are treated as living
 * on different rows (typically distinct works/series in the timeline view).
 */
export const TIMELINE_ROW_GAP = 10;

/** Bar paired with its index in the original input array. */
export interface IndexedTimelineBar extends TimelineBarInfo {
	origIdx: number;
}

/**
 * Sort timeline bars by Y (row), breaking ties by X (start position). Returns
 * a new array of bars with their original index preserved as `origIdx` so
 * callers can map back to the source order after navigation.
 */
export function sortTimelineBarsForNav(bars: TimelineBarInfo[]): IndexedTimelineBar[] {
	return bars.map((b, i) => ({ ...b, origIdx: i })).sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);
}

/**
 * Compute the next selected index in `sorted` after pressing an arrow key.
 *
 * - ArrowRight: advance one position (clamped to last; -1 → 0).
 * - ArrowLeft: retreat one position (clamped to 0).
 * - ArrowDown: jump to the next bar whose Y is more than {@link TIMELINE_ROW_GAP}
 *   below the current bar (i.e. next row).
 * - ArrowUp: jump to the previous bar whose Y is more than {@link TIMELINE_ROW_GAP}
 *   above the current bar.
 *
 * Unknown keys leave the index unchanged. The returned index is `-1` only when
 * `sorted` is empty.
 */
export function nextSortedIndexForArrow(sorted: IndexedTimelineBar[], currentSortedIdx: number, key: string): number {
	if (sorted.length === 0) return -1;
	switch (key) {
		case "ArrowRight": {
			const next = Math.min(currentSortedIdx + 1, sorted.length - 1);
			return next < 0 ? 0 : next;
		}
		case "ArrowLeft":
			return Math.max(currentSortedIdx - 1, 0);
		case "ArrowDown": {
			const curY = currentSortedIdx >= 0 ? sorted[currentSortedIdx].yCenter : 0;
			for (let i = currentSortedIdx + 1; i < sorted.length; i++) {
				if (sorted[i].yCenter > curY + TIMELINE_ROW_GAP) return i;
			}
			return currentSortedIdx;
		}
		case "ArrowUp": {
			const curY = currentSortedIdx >= 0 ? sorted[currentSortedIdx].yCenter : Infinity;
			for (let i = currentSortedIdx - 1; i >= 0; i--) {
				if (sorted[i].yCenter < curY - TIMELINE_ROW_GAP) return i;
			}
			return currentSortedIdx;
		}
		default:
			return currentSortedIdx;
	}
}

/**
 * High-level navigation: given the bars, the currently selected node id, and
 * the pressed arrow key, return the bar to focus next, or `null` when there is
 * nothing to navigate to (empty bars or no movement possible).
 *
 * `currentId` may be `null` when no bar is currently selected — in that case
 * the navigation starts from "before the first bar", so ArrowRight focuses the
 * first bar.
 */
export function pickNextTimelineBar(
	bars: TimelineBarInfo[],
	currentId: string | null,
	key: string,
): TimelineBarInfo | null {
	if (!bars || bars.length === 0) return null;
	const sorted = sortTimelineBarsForNav(bars);
	const currentOrigIdx = currentId ? bars.findIndex((b) => b.nodeId === currentId) : -1;
	const currentSortedIdx = currentOrigIdx >= 0 ? sorted.findIndex((b) => b.origIdx === currentOrigIdx) : -1;
	const nextIdx = nextSortedIndexForArrow(sorted, currentSortedIdx, key);
	if (nextIdx < 0 || nextIdx >= sorted.length) return null;
	const target = sorted[nextIdx];
	return {
		nodeId: target.nodeId,
		xStart: target.xStart,
		xEnd: target.xEnd,
		barHeight: target.barHeight,
		yCenter: target.yCenter,
	};
}
