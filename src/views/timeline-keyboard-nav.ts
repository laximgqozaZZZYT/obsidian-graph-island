import type { TimelineBarInfo } from "../layouts/cluster-force";

export type TimelineArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** Y-distance treated as "different row" when jumping with ArrowUp/ArrowDown. */
export const TIMELINE_ROW_GAP_THRESHOLD = 10;

/** Bar shape needed for navigation — a structural subset of TimelineBarInfo. */
export interface NavBar {
	nodeId: string;
	yCenter: number;
	xStart: number;
}

/**
 * Sort bars by Y (row) then X (time) so keyboard navigation walks rows
 * top-to-bottom, left-to-right.
 */
export function sortBarsForNavigation<T extends NavBar>(bars: readonly T[]): T[] {
	return [...bars].sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);
}

/**
 * Compute the next selection index after pressing an arrow key.
 *
 * @param sortedBars  bars in navigation order (see {@link sortBarsForNavigation})
 * @param currentIdx  current index in `sortedBars` (or -1 if nothing is selected)
 * @param key         arrow key
 * @param rowGap      Y-distance treated as a "different row" for ArrowUp/Down
 * @returns the new index, or -1 if the list is empty
 */
export function nextTimelineBarIndex(
	sortedBars: readonly { yCenter: number }[],
	currentIdx: number,
	key: TimelineArrowKey,
	rowGap: number = TIMELINE_ROW_GAP_THRESHOLD,
): number {
	if (sortedBars.length === 0) return -1;
	switch (key) {
		case "ArrowRight": {
			const next = Math.min(currentIdx + 1, sortedBars.length - 1);
			return next < 0 ? 0 : next;
		}
		case "ArrowLeft":
			return Math.max(currentIdx - 1, 0);
		case "ArrowDown": {
			const curY = currentIdx >= 0 ? sortedBars[currentIdx].yCenter : 0;
			const found = sortedBars.findIndex((b, i) => i > currentIdx && b.yCenter > curY + rowGap);
			return found >= 0 ? found : currentIdx;
		}
		case "ArrowUp": {
			const curY = currentIdx >= 0 ? sortedBars[currentIdx].yCenter : Infinity;
			for (let i = currentIdx - 1; i >= 0; i--) {
				if (sortedBars[i].yCenter < curY - rowGap) return i;
			}
			return currentIdx;
		}
		default:
			return currentIdx;
	}
}

/**
 * Resolve the bar to highlight after an arrow-key press.
 *
 * Returns `null` when there is nothing to do (no bars, or no movement possible
 * because the current selection is already at the edge with no row to jump to).
 */
export function resolveTimelineNavTarget(
	bars: readonly TimelineBarInfo[] | undefined,
	currentNodeId: string | null,
	key: TimelineArrowKey,
	rowGap: number = TIMELINE_ROW_GAP_THRESHOLD,
): TimelineBarInfo | null {
	if (!bars || bars.length === 0) return null;
	const sorted = sortBarsForNavigation(bars);
	const currentIdx = currentNodeId ? sorted.findIndex((b) => b.nodeId === currentNodeId) : -1;
	const nextIdx = nextTimelineBarIndex(sorted, currentIdx, key, rowGap);
	if (nextIdx < 0 || nextIdx >= sorted.length) return null;
	return sorted[nextIdx];
}
