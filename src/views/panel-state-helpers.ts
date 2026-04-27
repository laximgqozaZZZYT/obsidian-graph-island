/**
 * Type-safe accessors for {@link PanelState} fields, used to replace dynamic
 * key access patterns of the form
 *   `(panel as unknown as Record<string, unknown>)[key]`
 * inside panel-sections*.ts. The generic `K` constraint preserves the link
 * between the key and the field's value type, so callers no longer have to
 * launder writes through an `unknown` cast.
 */
import type { PanelState } from "./PanelBuilder";

export function getPanelKey<K extends keyof PanelState>(panel: PanelState, key: K): PanelState[K] {
	return panel[key];
}

export function setPanelKey<K extends keyof PanelState>(panel: PanelState, key: K, value: PanelState[K]): void {
	panel[key] = value;
}
