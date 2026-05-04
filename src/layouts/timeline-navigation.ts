// ---------------------------------------------------------------------------
// Timeline Navigation — pure helpers for keyboard navigation across timeline bars
// ---------------------------------------------------------------------------
// Extracted from GraphViewContainer._handleTimelineArrowKey so the
// "given current selection + key, what is the next bar?" logic is testable
// without DOM/PixiJS state.
// ---------------------------------------------------------------------------

export interface TimelineNavBar {
	nodeId: string;
	xStart: number;
	yCenter: number;
}

export type TimelineNavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** Y-distance (world px) above which a bar is considered to be on a different row. */
export const TIMELINE_NAV_Y_THRESHOLD = 10;

/**
 * Compute the next bar to navigate to based on arrow key direction.
 *
 * - ArrowRight / ArrowLeft step linearly through bars sorted by (yCenter, xStart).
 * - ArrowDown jumps to the first bar whose yCenter is at least `yThreshold`
 *   below the current selection (next "row" in the swim-lane layout).
 * - ArrowUp jumps to the last bar whose yCenter is at least `yThreshold`
 *   above the current selection.
 *
 * Returns `null` when `bars` is empty or no movement is possible.
 */
export function nextTimelineBar<B extends TimelineNavBar>(
	bars: readonly B[],
	currentNodeId: string | null,
	key: TimelineNavKey,
	yThreshold: number = TIMELINE_NAV_Y_THRESHOLD,
): B | null {
	if (bars.length === 0) return null;

	const sorted = bars
		.map((bar, origIdx) => ({ bar, origIdx }))
		.sort((a, b) => a.bar.yCenter - b.bar.yCenter || a.bar.xStart - b.bar.xStart);

	const currentOrigIdx = currentNodeId ? bars.findIndex((b) => b.nodeId === currentNodeId) : -1;
	let sortedIdx = currentOrigIdx >= 0 ? sorted.findIndex((s) => s.origIdx === currentOrigIdx) : -1;

	switch (key) {
		case "ArrowRight":
			sortedIdx = Math.min(sortedIdx + 1, sorted.length - 1);
			if (sortedIdx < 0) sortedIdx = 0;
			break;
		case "ArrowLeft":
			sortedIdx = Math.max(sortedIdx - 1, 0);
			break;
		case "ArrowDown": {
			const curY = sortedIdx >= 0 ? sorted[sortedIdx].bar.yCenter : 0;
			const next = sorted.find((s, i) => i > sortedIdx && s.bar.yCenter > curY + yThreshold);
			if (next) sortedIdx = sorted.indexOf(next);
			break;
		}
		case "ArrowUp": {
			const curY = sortedIdx >= 0 ? sorted[sortedIdx].bar.yCenter : Infinity;
			for (let i = sortedIdx - 1; i >= 0; i--) {
				if (sorted[i].bar.yCenter < curY - yThreshold) {
					sortedIdx = i;
					break;
				}
			}
			break;
		}
	}

	if (sortedIdx < 0 || sortedIdx >= sorted.length) return null;
	return sorted[sortedIdx].bar;
}
