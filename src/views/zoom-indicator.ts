/**
 * Pure functions for zoom indicator text, tooltip, and a11y announcements.
 * Extracted from GraphViewContainer.updateZoomIndicator to reduce complexity.
 */

/** Determine the single-char label mode indicator. */
export function labelModeChar(scale: number, override: string, initialsZoom: number, truncateZoom: number): string {
	if (override !== "auto") {
		return override === "initials" ? "I" : override === "truncated" ? "T" : "F";
	}
	return scale < initialsZoom ? "I" : scale < truncateZoom ? "T" : "F";
}

/** Build the label info suffix shown after the zoom percentage (e.g. " · 42L·T"). */
export function buildLabelInfo(visibleCount: number, modeChar: string): string {
	return ` · ${visibleCount}L·${modeChar}`;
}

/** Map a mode char to its human-readable description for tooltips. */
export function modeDescription(mChar: string): string {
	switch (mChar) {
		case "I":
			return "Initials mode (2 chars)";
		case "T":
			return "Truncated mode (5-12 chars)";
		case "F":
			return "Full name mode";
		default:
			return "";
	}
}

/** Build the tooltip text for the zoom indicator element. */
export function buildZoomTooltip(modeDesc: string): string {
	return `Click to reset to 100%\n${modeDesc ? `Label: ${modeDesc}\n` : ""}Keys: 0-9 for zoom, Z for focus-zoom`;
}

/** Parse the density-culled count from the badge element text. */
export function parseCulledCount(badgeVisible: boolean, badgeText: string | null): number {
	if (!badgeVisible) return 0;
	return parseInt(badgeText?.match(/\+(\d+)/)?.[1] ?? "0", 10);
}

/** Build the a11y announcement string for zoom changes. */
export function buildZoomA11yMessage(pct: string, labelInfo: string, culledCount: number): string {
	const culledInfo = culledCount > 0 ? `, ${culledCount} hidden` : "";
	return `Zoom: ${pct}${labelInfo ? `, ${labelInfo.trim()} labels visible` : ""}${culledInfo}`;
}
