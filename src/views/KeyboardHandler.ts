// ---------------------------------------------------------------------------
// KeyboardHandler — keyboard shortcut handling extracted from GVC (Phase 4)
// ---------------------------------------------------------------------------
import type { App, TFile } from "obsidian";
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

/**
 * Handle keyboard shortcuts for the graph view.
 * Returns true if the key was handled, false otherwise.
 */
export function handleShortcutKey(host: KeyboardHost, key: string, e: KeyboardEvent): boolean {
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

	// Space: auto-fit view
	if (key === " " && !e.ctrlKey && !e.metaKey) {
		e.preventDefault();
		const wrap = host.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
		if (wrap) host.autoFitView(wrap.clientWidth, wrap.clientHeight);
		return true;
	}

	// P: toggle panel visibility
	if (key === "p" && !e.ctrlKey && !e.metaKey) {
		host.panelEl?.classList.toggle("is-hidden");
		return true;
	}

	// Arrow keys: navigate neighbors or pan
	if (key.startsWith("Arrow") && !e.ctrlKey && !e.metaKey) {
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

	// +/=: zoom in
	if ((key === "+" || key === "=") && !e.ctrlKey && !e.metaKey) {
		e.preventDefault();
		host.zoomBy(1.2);
		host.announceZoomLevel();
		return true;
	}
	// -: zoom out
	if (key === "-" && !e.ctrlKey && !e.metaKey) {
		e.preventDefault();
		host.zoomBy(1 / 1.2);
		host.announceZoomLevel();
		return true;
	}

	// 1-4: switch panel tabs (handled by PanelBuilder tab buttons)
	if (key >= "1" && key <= "4" && !e.ctrlKey && !e.metaKey && !e.altKey) {
		const tabs = host.panelEl?.querySelectorAll<HTMLButtonElement>(".gi-tab-btn");
		if (tabs && tabs[parseInt(key) - 1]) {
			tabs[parseInt(key) - 1].click();
		}
		return true;
	}

	// 0: zoom reset (100%), 5-9: zoom to 50%-90%
	if (/^[0-9]$/.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
		e.preventDefault();
		const level = parseInt(key, 10);
		host.setZoom(level === 0 ? 1.0 : level / 10);
		host.announceA11y(`Zoom: ${level === 0 ? 100 : level * 10}%`);
		return true;
	}

	// F: fit view
	if (key === "f" && !e.ctrlKey && !e.metaKey) {
		e.preventDefault();
		const wrap = host.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
		if (wrap) host.autoFitView(wrap.clientWidth, wrap.clientHeight);
		return true;
	}

	// L: toggle legend
	if (key === "l" && !e.ctrlKey && !e.metaKey) {
		host.panel.showLegend = !host.panel.showLegend;
		host.updateLegend();
		host.requestSave();
		return true;
	}

	// M: toggle minimap
	if (key === "m" && !e.ctrlKey && !e.metaKey) {
		host.panel.showMinimap = !host.panel.showMinimap;
		host.markDirty(true);
		return true;
	}

	// G: toggle grid
	if (key === "g" && !e.ctrlKey && !e.metaKey) {
		host.panel.showDotGrid = !host.panel.showDotGrid;
		host.markDirty(true);
		return true;
	}

	// [: decrease hoverHops
	if (key === "[" && !e.ctrlKey && !e.metaKey) {
		host.panel.hoverHops = Math.max(0, host.panel.hoverHops - 1);
		host.applyHover();
		host.markDirty(true);
		return true;
	}
	// ]: increase hoverHops
	if (key === "]" && !e.ctrlKey && !e.metaKey) {
		host.panel.hoverHops = Math.min(10, host.panel.hoverHops + 1);
		host.applyHover();
		host.markDirty(true);
		return true;
	}

	// Ctrl/Cmd+Shift+C: copy graph as PNG
	if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "C") {
		e.preventDefault();
		host.copyGraphToClipboard();
		return true;
	}

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

	// Tab/Shift+Tab: cycle focus
	if (key === "Tab") {
		e.preventDefault();
		host.cycleFocusNode(e.shiftKey ? -1 : 1);
		return true;
	}

	// Escape: clear focus/selection
	if (key === "Escape") {
		if (host.isKeyboardFocused) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0 used as sentinel to clear focus
			host.cycleFocusNode(0 as any); // clear
		}
		return true;
	}

	// ?: toggle help
	if (key === "?" || (e.shiftKey && key === "/")) {
		host.toggleHelpOverlay();
		return true;
	}

	// Z: zoom to focused node
	if (key === "z" && !e.ctrlKey && !e.metaKey && host.highlightedNodeId) {
		host.focusZoomToNode(host.highlightedNodeId);
		return true;
	}

	// S/E: set pathfinder start/end
	if (key === "s" && !e.ctrlKey && !e.metaKey && host.highlightedNodeId) {
		host.setPathfinderNode(host.highlightedNodeId, "start");
		return true;
	}
	if (key === "e" && !e.ctrlKey && !e.metaKey && host.highlightedNodeId) {
		host.setPathfinderNode(host.highlightedNodeId, "end");
		return true;
	}

	return false;
}
