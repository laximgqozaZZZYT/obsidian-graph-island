// ---------------------------------------------------------------------------
// KeyboardHandler — keyboard shortcut handling extracted from GVC (Phase 4)
// ---------------------------------------------------------------------------
import type { App } from "obsidian";
import { t } from "../i18n";

/** Minimal interface for GVC methods needed by keyboard shortcuts */
export interface KeyboardHost {
	panelEl: HTMLElement | null;
	containerEl: HTMLElement;
	worldContainer: { x: number; y: number } | null;
	highlightedNodeId: string | null;
	isKeyboardFocused: boolean;
	panel: {
		showLegend: boolean;
		showMinimap: boolean;
		showDotGrid: boolean;
		hoverHops: number;
		multiSelectNodeIds?: string[];
		localGraphCenter?: string | null;
	};
	compareNodeIds: string[];
	pixiNodes: Map<string, { data: { label: string; filePath?: string } }>;
	app: App;

	autoFitView(w: number, h: number): void;
	zoomBy(factor: number): void;
	setZoom(level: number): void;
	markDirty(force?: boolean): void;
	applyHover(): void;
	updateLegend(): void;
	requestSave(): void;
	copyGraphToClipboard(): void;
	cycleFocusNode(direction: 1 | -1): void;
	focusZoomToNode(nodeId: string): void;
	navigateNeighbor(dir: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): void;
	announceA11y(msg: string): void;
	announceZoomLevel(): void;
	toggleHelpOverlay(): void;
	toggleMultiSelect?(nodeId: string): void;
	addCompareNode(nodeId: string): void;
	setPathfinderNode(nodeId: string, endpoint: "start" | "end"): void;
	openFile(filePath: string): void;
}

const PAN_STEP = 50;

/** Helper: check that neither Ctrl nor Meta is held */
function isPlainKey(e: KeyboardEvent): boolean {
	return !e.ctrlKey && !e.metaKey;
}

/** Handle modifier-based shortcuts (Ctrl/Cmd combinations) */
function handleModifierShortcut(host: KeyboardHost, key: string, e: KeyboardEvent): boolean {
	// Ctrl/Cmd+F: focus search input
	if ((e.ctrlKey || e.metaKey) && key === "f") {
		e.preventDefault();
		const search = host.panelEl?.querySelector<HTMLInputElement>(".gi-settings-filter");
		if (search) {
			host.panelEl?.classList.remove("is-hidden");
			search.focus();
		}
		return true;
	}

	// Ctrl/Cmd+Shift+C: copy graph as PNG
	if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "C") {
		e.preventDefault();
		host.copyGraphToClipboard();
		return true;
	}

	return false;
}

/** Handle navigation keys: arrows, tab, escape */
function handleNavigationKey(host: KeyboardHost, key: string, e: KeyboardEvent): boolean {
	// Arrow keys: navigate neighbors or pan
	if (key.startsWith("Arrow") && isPlainKey(e)) {
		e.preventDefault();
		if (host.isKeyboardFocused && host.highlightedNodeId) {
			host.navigateNeighbor(key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown");
		} else {
			const world = host.worldContainer;
			if (world) {
				if (key === "ArrowUp") world.y += PAN_STEP;
				else if (key === "ArrowDown") world.y -= PAN_STEP;
				else if (key === "ArrowLeft") world.x += PAN_STEP;
				else if (key === "ArrowRight") world.x -= PAN_STEP;
				host.markDirty(true);
			}
		}
		return true;
	}

	// Tab/Shift+Tab: cycle focus
	if (key === "Tab") {
		e.preventDefault();
		host.cycleFocusNode(e.shiftKey ? -1 : 1);
		return true;
	}

	// Escape: clear focus/selection
	if (key === "Escape") {
		if (host.isKeyboardFocused) {
			host.cycleFocusNode(0 as any); // clear
		}
		return true;
	}

	return false;
}

/** Handle zoom-related shortcuts: +/-/0-9 */
function handleZoomKey(host: KeyboardHost, key: string, e: KeyboardEvent): boolean {
	// +/=: zoom in
	if ((key === "+" || key === "=") && isPlainKey(e)) {
		e.preventDefault();
		host.zoomBy(1.2);
		host.announceZoomLevel();
		return true;
	}
	// -: zoom out
	if (key === "-" && isPlainKey(e)) {
		e.preventDefault();
		host.zoomBy(1 / 1.2);
		host.announceZoomLevel();
		return true;
	}

	// 1-4: switch panel tabs
	if (key >= "1" && key <= "4" && isPlainKey(e) && !e.altKey) {
		const tabs = host.panelEl?.querySelectorAll<HTMLButtonElement>(".gi-tab-btn");
		if (tabs && tabs[parseInt(key) - 1]) {
			tabs[parseInt(key) - 1].click();
		}
		return true;
	}

	// 0: zoom reset (100%), 5-9: zoom to 50%-90%
	if (/^[0-9]$/.test(key) && isPlainKey(e) && !e.altKey) {
		e.preventDefault();
		const level = parseInt(key, 10);
		host.setZoom(level === 0 ? 1.0 : level / 10);
		host.announceA11y(`Zoom: ${level === 0 ? 100 : level * 10}%`);
		return true;
	}

	return false;
}

/** Handle UI toggle shortcuts: panel, legend, minimap, grid, hoverHops */
function handleToggleKey(host: KeyboardHost, key: string, e: KeyboardEvent): boolean {
	if (!isPlainKey(e)) return false;

	// P: toggle panel visibility
	if (key === "p") {
		host.panelEl?.classList.toggle("is-hidden");
		return true;
	}

	// L: toggle legend
	if (key === "l") {
		host.panel.showLegend = !host.panel.showLegend;
		host.updateLegend();
		host.requestSave();
		return true;
	}

	// M: toggle minimap
	if (key === "m") {
		host.panel.showMinimap = !host.panel.showMinimap;
		host.markDirty(true);
		return true;
	}

	// G: toggle grid
	if (key === "g") {
		host.panel.showDotGrid = !host.panel.showDotGrid;
		host.markDirty(true);
		return true;
	}

	// [: decrease hoverHops
	if (key === "[") {
		host.panel.hoverHops = Math.max(0, host.panel.hoverHops - 1);
		host.applyHover();
		host.markDirty(true);
		return true;
	}
	// ]: increase hoverHops
	if (key === "]") {
		host.panel.hoverHops = Math.min(10, host.panel.hoverHops + 1);
		host.applyHover();
		host.markDirty(true);
		return true;
	}

	return false;
}

/** Handle node-action shortcuts: Enter, Z, S, E, and focused-node ops */
function handleNodeActionKey(host: KeyboardHost, key: string, e: KeyboardEvent): boolean {
	// Enter: activate focused node
	if (key === "Enter" && host.isKeyboardFocused && host.highlightedNodeId) {
		e.preventDefault();
		if (e.shiftKey) {
			host.toggleMultiSelect?.(host.highlightedNodeId);
			const selTotal = host.panel.multiSelectNodeIds?.length ?? 0;
			const nodeName = host.pixiNodes.get(host.highlightedNodeId)?.data.label ?? host.highlightedNodeId;
			const isAdded = host.panel.multiSelectNodeIds?.includes(host.highlightedNodeId);
			host.announceA11y(
				`${isAdded ? (t("a11y.selected") ?? "Selected") : (t("a11y.deselected") ?? "Deselected")}: ${nodeName} (${selTotal} total)`,
			);
		} else if (e.ctrlKey || e.metaKey) {
			host.addCompareNode(host.highlightedNodeId);
			const cmpCount = host.compareNodeIds.length;
			const nodeName = host.pixiNodes.get(host.highlightedNodeId)?.data.label ?? host.highlightedNodeId;
			host.announceA11y(`${t("a11y.compared") ?? "Compare"}: ${nodeName} (${cmpCount} nodes)`);
		} else {
			const pn = host.pixiNodes.get(host.highlightedNodeId);
			if (pn?.data.filePath) {
				host.openFile(pn.data.filePath);
			}
		}
		return true;
	}

	if (!isPlainKey(e)) return false;

	// Z: zoom to focused node
	if (key === "z" && host.highlightedNodeId) {
		host.focusZoomToNode(host.highlightedNodeId);
		return true;
	}

	// S/E: set pathfinder start/end
	if (key === "s" && host.highlightedNodeId) {
		host.setPathfinderNode(host.highlightedNodeId, "start");
		return true;
	}
	if (key === "e" && host.highlightedNodeId) {
		host.setPathfinderNode(host.highlightedNodeId, "end");
		return true;
	}

	return false;
}

/**
 * Handle keyboard shortcuts for the graph view.
 * Returns true if the key was handled, false otherwise.
 */
export function handleShortcutKey(host: KeyboardHost, key: string, e: KeyboardEvent): boolean {
	// Modifier shortcuts (Ctrl/Cmd combos) first
	if (handleModifierShortcut(host, key, e)) return true;

	// Space: auto-fit view
	if (key === " " && isPlainKey(e)) {
		e.preventDefault();
		const wrap = host.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
		if (wrap) host.autoFitView(wrap.clientWidth, wrap.clientHeight);
		return true;
	}

	// F: fit view
	if (key === "f" && isPlainKey(e)) {
		e.preventDefault();
		const wrap = host.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
		if (wrap) host.autoFitView(wrap.clientWidth, wrap.clientHeight);
		return true;
	}

	// ?: toggle help
	if (key === "?" || (e.shiftKey && key === "/")) {
		host.toggleHelpOverlay();
		return true;
	}

	if (handleNavigationKey(host, key, e)) return true;
	if (handleZoomKey(host, key, e)) return true;
	if (handleToggleKey(host, key, e)) return true;
	if (handleNodeActionKey(host, key, e)) return true;

	return false;
}
