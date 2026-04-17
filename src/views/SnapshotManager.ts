/**
 * SnapshotManager — extracted from GraphViewContainer.
 * Handles snapshot save/compare/delete/timeline UI and auto-snapshot logic.
 */

import { Menu } from "obsidian";
import type { GraphSnapshot, GraphNode, GraphEdge, LayoutType } from "../types";
import { captureSnapshot, computeSnapshotDiff, computeSnapshotToSnapshotDiff } from "../utils/snapshot";
import { buildTimelineEntries, formatDelta, formatSnapshotDate, type DiffOverlay } from "./DiffOverlay";
import { showToast } from "../utils/toast";
import { t } from "../i18n";
import type { IApp } from "./canvas2d/interfaces";

// ---------------------------------------------------------------------------
// Host interface — minimal surface required from GVC
// ---------------------------------------------------------------------------
export interface SnapshotHost {
	readonly containerEl: HTMLElement;
	readonly pixiApp: IApp | null;
	readonly pixiNodes: Map<string, unknown>;
	readonly plugin: {
		settings: {
			snapshots?: GraphSnapshot[];
			autoSnapshotIntervalMin?: number;
		};
		saveSettings(): Promise<void>;
	};
	readonly panel: {
		searchQuery?: string;
		clusterGroupRules?: Array<{ groupBy?: string }>;
	};
	readonly diffOverlay: DiffOverlay;
	readonly currentLayout: LayoutType | null;
	getGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] };
	getNodeLabel(id: string): string;
	panToNode(id: string): void;
	setHighlightedNodeId(id: string | null): void;
	applyHover(): void;
	wakeRenderLoop(): void;
}

// ---------------------------------------------------------------------------
// Snapshot operations
// ---------------------------------------------------------------------------

/** Show snapshot context menu. */
export function showSnapshotMenu(host: SnapshotHost, evt: MouseEvent): void {
	const menu = new Menu();

	// Save menu item
	menu.addItem((item) => {
		item.setTitle(t("snapshot.save"))
			.setIcon("plus")
			.onClick(() => saveSnapshot(host));
	});

	const snapshots = host.plugin.settings.snapshots ?? [];
	if (snapshots.length > 0) {
		menu.addSeparator();

		// Each snapshot submenu
		for (let i = 0; i < snapshots.length; i++) {
			const snap = snapshots[i];
			const title = snap.notes ? `${snap.name} — ${snap.notes}` : snap.name;
			menu.addItem((item) => {
				item.setTitle(title)
					.setIcon("bookmark")
					.onClick(() => compareWithSnapshot(host, snap));
			});
		}

		// Delete submenu
		menu.addSeparator();
		for (let i = 0; i < snapshots.length; i++) {
			const snap = snapshots[i];
			menu.addItem((item) => {
				item.setTitle(`${t("snapshot.delete")}: ${snap.name}`)
					.setIcon("trash")
					.onClick(() => deleteSnapshot(host, i));
			});
		}
	}

	// Timeline view
	if (snapshots.length >= 2) {
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("snapshot.timeline"))
				.setIcon("clock")
				.onClick(() => showSnapshotTimeline(host));
		});
	}

	// If diff is active, show clear button
	if (host.diffOverlay.isActive()) {
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("snapshot.clearDiff"))
				.setIcon("x")
				.onClick(() => clearDiffOverlay(host));
		});
	}

	menu.showAtMouseEvent(evt);
}

/** Save current graph state as a snapshot. */
export function saveSnapshot(host: SnapshotHost): void {
	const snapshots = host.plugin.settings.snapshots ?? [];

	// 10-snapshot limit
	if (snapshots.length >= 10) {
		showToast(t("snapshot.limitReached"), 5000);
		return;
	}

	// Name prompt
	const name = window.prompt(t("snapshot.enterName"), `Snapshot ${snapshots.length + 1}`);
	if (!name) return;

	// Optional notes
	const notes = window.prompt(t("snapshot.enterNotes"), "") ?? undefined;

	// Capture current graph data
	const data = host.getGraphData();
	const snapshot = captureSnapshot(data, name, {
		layout: host.currentLayout ?? "force",
		searchQuery: host.panel.searchQuery ?? "",
		groupBy: host.panel.clusterGroupRules?.[0]?.groupBy ?? "",
	});
	if (notes) snapshot.notes = notes;

	// Persist
	if (!host.plugin.settings.snapshots) {
		host.plugin.settings.snapshots = [];
	}
	host.plugin.settings.snapshots.push(snapshot);
	host.plugin.saveSettings();

	showToast(t("snapshot.saved").replace("{name}", name));
}

/** Compare current graph with a snapshot. */
export function compareWithSnapshot(host: SnapshotHost, snapshot: GraphSnapshot): void {
	const data = host.getGraphData();
	const diff = computeSnapshotDiff(data, snapshot);
	host.diffOverlay.activate(diff, snapshot.name);

	// Build clickable diff list panel
	const canvasArea = host.containerEl.querySelector<HTMLElement>(".gi-canvas-area");
	if (canvasArea) {
		host.diffOverlay.buildDiffList(
			canvasArea,
			(id) => host.getNodeLabel(id),
			(id) => {
				host.panToNode(id);
				host.setHighlightedNodeId(id);
				host.applyHover();
			},
			() => clearDiffOverlay(host),
		);
	}

	// Request redraw
	host.pixiApp?.markNeedsRender();
	host.wakeRenderLoop();
}

/** Delete a snapshot by index. */
export function deleteSnapshot(host: SnapshotHost, index: number): void {
	const snapshots = host.plugin.settings.snapshots ?? [];
	if (index < 0 || index >= snapshots.length) return;

	const name = snapshots[index].name;
	snapshots.splice(index, 1);
	host.plugin.saveSettings();

	showToast(t("snapshot.deleted").replace("{name}", name));
}

/** Show snapshot timeline panel. */
export function showSnapshotTimeline(host: SnapshotHost): void {
	const snapshots = host.plugin.settings.snapshots ?? [];
	if (snapshots.length < 2) return;

	const entries = buildTimelineEntries(snapshots);
	const canvasArea = host.containerEl.querySelector<HTMLElement>(".gi-canvas-area");
	if (!canvasArea) return;

	// Remove existing timeline
	canvasArea.querySelector(".gi-snapshot-timeline")?.remove();

	const panel = canvasArea.createDiv({ cls: "gi-snapshot-timeline" });

	// Header
	const header = panel.createDiv({ cls: "gi-snapshot-timeline-header" });
	header.createEl("span", {
		text: t("snapshot.timelineTitle").replace("{count}", String(entries.length)),
		cls: "gi-snapshot-timeline-title",
	});
	const closeBtn = header.createEl("button", {
		text: "\u00d7",
		cls: "gi-snapshot-timeline-close",
		attr: { "aria-label": t("a11y.closeTimeline") },
	});
	closeBtn.addEventListener("click", () => panel.remove());

	// Mini bar chart
	const maxNodes = Math.max(1, ...entries.map((e) => e.nodeCount));
	const chartEl = panel.createDiv({ cls: "gi-snapshot-chart" });
	let _selectedSnap: (typeof snapshots)[0] | null = null;
	const bars: HTMLElement[] = [];
	for (const entry of entries) {
		const bar = chartEl.createDiv({ cls: "gi-snapshot-bar" });
		bars.push(bar);
		const h = Math.max(2, (entry.nodeCount / maxNodes) * 36);
		bar.style.height = `${h}px`;
		bar.title = t("snapshot.compareTip")
			.replace("{name}", entry.name)
			.replace("{nodeCount}", String(entry.nodeCount))
			.replace("{edgeCount}", String(entry.edgeCount));
		bar.addEventListener("click", (ev: MouseEvent) => {
			const snap = snapshots.find((s) => s.name === entry.name);
			if (!snap) return;
			if (ev.shiftKey && _selectedSnap && _selectedSnap !== snap) {
				// Compare two snapshots
				const [older, newer] =
					_selectedSnap.createdAt < snap.createdAt ? [_selectedSnap, snap] : [snap, _selectedSnap];
				const diff = computeSnapshotToSnapshotDiff(newer, older);
				host.diffOverlay.activate(diff, `${older.name} → ${newer.name}`);
				panel.remove();
				host.pixiApp?.markNeedsRender();
				host.wakeRenderLoop();
			} else if (ev.shiftKey) {
				// First shift-click: select this snapshot
				_selectedSnap = snap;
				bars.forEach((b) => (b.style.outline = ""));
				bar.style.outline = "2px solid var(--text-accent)";
			} else {
				// Normal click: compare with current graph
				panel.remove();
				compareWithSnapshot(host, snap);
			}
		});
	}

	// Entry list
	for (const entry of entries) {
		const row = panel.createDiv({ cls: "gi-snapshot-row" });
		const displayName = entry.name.replace("[auto] ", "\u{1F4F7} ");
		const dateStr = formatSnapshotDate(entry.createdAt);
		row.createEl("span", {
			text: displayName,
			cls: "gi-snapshot-row-name",
			attr: { title: `${entry.name} (${dateStr})` },
		});
		row.createEl("span", { text: dateStr, cls: "gi-snapshot-row-date" });
		const statsEl = row.createDiv({ cls: "gi-snapshot-row-stats" });
		statsEl.createEl("span", { text: `${entry.nodeCount}n` });
		if (entry.nodeDelta !== undefined) {
			const d = formatDelta(entry.nodeDelta);
			statsEl.createEl("span", {
				text: d.text,
				attr: {
					style: `color:${d.color === "green" ? "var(--text-success,#38a169)" : d.color === "red" ? "var(--text-error,#e53e3e)" : "var(--text-muted)"};`,
				},
			});
		}
	}
}

/** Clear the diff overlay. */
export function clearDiffOverlay(host: SnapshotHost): void {
	host.diffOverlay.deactivate();
	const canvasArea = host.containerEl.querySelector<HTMLElement>(".gi-canvas-area");
	if (canvasArea) host.diffOverlay.removeDiffList(canvasArea);
	host.pixiApp?.markNeedsRender();
	host.wakeRenderLoop();
}

// ---------------------------------------------------------------------------
// Auto-snapshot constants
// ---------------------------------------------------------------------------
export const AUTO_SNAP_PREFIX = "[auto] ";
export const AUTO_SNAP_MAX = 10;

/** Create an auto-snapshot from the current graph state. */
export function createAutoSnapshot(host: SnapshotHost): void {
	if (!host.pixiNodes.size) return; // no graph data yet
	const snapshots = host.plugin.settings.snapshots ?? [];
	// Remove oldest auto-snapshots if at limit
	const autoSnaps = snapshots.filter((s) => s.name.startsWith(AUTO_SNAP_PREFIX));
	while (autoSnaps.length >= AUTO_SNAP_MAX) {
		const oldest = autoSnaps.shift()!;
		const idx = snapshots.indexOf(oldest);
		if (idx >= 0) snapshots.splice(idx, 1);
	}
	// Capture
	const data = host.getGraphData();
	const name = AUTO_SNAP_PREFIX + new Date().toISOString().replace("T", " ").slice(0, 16);
	const snap = captureSnapshot(data, name, {
		layout: host.currentLayout ?? "force",
		searchQuery: host.panel.searchQuery ?? "",
		groupBy: host.panel.clusterGroupRules?.[0]?.groupBy ?? "",
	});
	snapshots.push(snap);
	host.plugin.settings.snapshots = snapshots;
	host.plugin.saveSettings();
}
