import type { PanelState } from "./PanelBuilder";

export function setPanelValue<K extends keyof PanelState>(panel: PanelState, key: K, value: PanelState[K]): void {
	panel[key] = value;
}

export function getPanelValue<K extends keyof PanelState>(panel: PanelState, key: K): PanelState[K] {
	return panel[key];
}
