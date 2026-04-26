import type { PanelState } from "./PanelBuilder";

/** Encapsulates the dynamic-key cast in one place so callers don't sprinkle
 *  `as unknown as Record<string, unknown>` casts at every key-by-string access. */
const asPanelRecord = (panel: PanelState): Record<string, unknown> => panel as unknown as Record<string, unknown>;

/** Read a PanelState field by string key (returns unknown — caller narrows). */
export function readPanelField(panel: PanelState, key: string): unknown {
	return asPanelRecord(panel)[key];
}

/** Write a PanelState field by string key. Caller must ensure value type matches. */
export function writePanelField(panel: PanelState, key: string, value: unknown): void {
	asPanelRecord(panel)[key] = value;
}

/** Object.entries view of a PanelState (string keys, unknown values). */
export function panelEntries(panel: PanelState): [string, unknown][] {
	return Object.entries(asPanelRecord(panel));
}
