/**
 * timeline-keyboard-nav.ts — Pure logic for timeline arrow-key navigation.
 * Extracted from GraphViewContainer._handleTimelineArrowKey to reduce GVC size
 * and to make the navigation order independently testable.
 */
import type { TimelineBarInfo } from "../layouts/cluster-force";

export type TimelineArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * Minimum vertical distance (world px) for ArrowUp/ArrowDown to consider
 * another bar as belonging to a different "row". Bars within this band are
 * treated as the same row and traversed via ArrowLeft/ArrowRight only.
 */
export const TIMELINE_ROW_GAP_PX = 10;

/**
 * Sort bars by Y (top → bottom), then X (left → right). The original index is
 * preserved so callers can map back to the unsorted bars array if needed.
 */
export function sortTimelineBars(bars: readonly TimelineBarInfo[]): Array<TimelineBarInfo & { origIdx: number }> {
	return bars.map((b, i) => ({ ...b, origIdx: i })).sort((a, b) => a.yCenter - b.yCenter || a.xStart - b.xStart);
}

/**
 * Compute the next sorted index given the current sorted index and the arrow
 * key. Returns -1 when no navigation should occur (empty bars, or
 * ArrowUp/ArrowDown with no current selection and no candidate row).
 *
 * Behavior — preserves the exact semantics of the original
 * GraphViewContainer._handleTimelineArrowKey:
 *   - ArrowRight: next bar in time order (clamped at end). When no current
 *                 selection (idx = -1), starts at 0.
 *   - ArrowLeft : previous bar in time order (clamped at start). When no
 *                 current selection, stays at 0.
 *   - ArrowDown : jump to the first bar whose Y is more than
 *                 TIMELINE_ROW_GAP_PX below the current bar's Y. With no
 *                 current selection, treats curY = 0 (matches original).
 *                 Returns the original idx unchanged when no row is found.
 *   - ArrowUp   : walk backward and pick the first bar whose Y is more than
 *                 TIMELINE_ROW_GAP_PX above the current bar. With no current
 *                 selection, returns -1 (no-op, matches original).
 */
export function nextTimelineBarIndex(
	sorted: ReadonlyArray<{ yCenter: number }>,
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
			const nextRel = sorted.findIndex((b, i) => i > idx && b.yCenter > curY + TIMELINE_ROW_GAP_PX);
			if (nextRel >= 0) idx = nextRel;
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
	if (idx < 0 || idx >= sorted.length) return -1;
	return idx;
}

/**
 * Resolve the next bar to highlight given the bars list, the currently
 * highlighted node id (or null), and the pressed arrow key.
 *
 * Returns null when the bars list is empty.
 */
export function resolveNextTimelineBar(
	bars: readonly TimelineBarInfo[],
	currentNodeId: string | null,
	key: TimelineArrowKey,
): (TimelineBarInfo & { origIdx: number }) | null {
	if (bars.length === 0) return null;
	const sorted = sortTimelineBars(bars);
	const currentIdx = currentNodeId ? bars.findIndex((b) => b.nodeId === currentNodeId) : -1;
	const sortedIdx = currentIdx >= 0 ? sorted.findIndex((b) => b.origIdx === currentIdx) : -1;
	const nextIdx = nextTimelineBarIndex(sorted, sortedIdx, key);
	return nextIdx >= 0 ? sorted[nextIdx] : null;
}
