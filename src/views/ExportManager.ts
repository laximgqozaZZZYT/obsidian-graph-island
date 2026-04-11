/**
 * ExportManager — extracted from GraphViewContainer.
 * Handles graph export (PNG, JSON, CSV, Mermaid) and clipboard/embed operations.
 */

import { Notice, MarkdownView } from "obsidian";
import type { App } from "obsidian";
import type { GraphNode, GraphEdge } from "../types";
import {
	collectSubgraph,
	exportSubgraphJSON,
	exportFullGraphJSON,
	exportGraphCSV,
	exportGraphMermaid,
} from "../utils/graph-helpers";
import { showToast } from "../utils/toast";
import { t } from "../i18n";
import type { IApp } from "./canvas2d/interfaces";

// ---------------------------------------------------------------------------
// Named constants (CLAUDE.md: no hardcoded magic numbers)
// ---------------------------------------------------------------------------
const TOAST_SHORT_MS = 2000;
const TOAST_MEDIUM_MS = 3000;
const MERMAID_NODE_CAP = 200;

// ---------------------------------------------------------------------------
// Host interface — minimal surface required from GVC
// ---------------------------------------------------------------------------
export interface ExportHost {
	readonly app: App;
	readonly pixiApp: IApp | null;
	readonly pixiNodes: Map<string, { data: { id: string; label?: string } }>;
	readonly adj: Map<string, Set<string>> | null;
	readonly graphEdges: GraphEdge[] | null;
	readonly panel: { hoverHops?: number };
	getGraphData(): { nodes: GraphNode[]; edges: GraphEdge[] };
}

// ---------------------------------------------------------------------------
// downloadFile — helper to trigger a browser file download
// ---------------------------------------------------------------------------
export function downloadFile(content: string, type: string, filename: string): void {
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Export functions
// ---------------------------------------------------------------------------

/** Export an N-hop subgraph around a node as a JSON download. */
export function exportSubgraph(host: ExportHost, nodeId: string): void {
	if (!host.adj || !host.graphEdges) return;
	const nodes = [...host.pixiNodes.values()].map((pn) => pn.data);
	const edges = host.graphEdges;
	const hops = host.panel.hoverHops || 2;
	const sub = collectSubgraph(host.adj, nodeId, hops, nodes as GraphNode[], edges);
	const json = exportSubgraphJSON(sub);

	// Download as file
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	const pn = host.pixiNodes.get(nodeId);
	const label = pn?.data?.label ?? nodeId;
	a.download = `subgraph-${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);

	// Toast notification
	const msg = t("toast.subgraphExported")
		.replace("{nodes}", String(sub.nodes.length))
		.replace("{edges}", String(sub.edges.length));
	new Notice(msg, TOAST_MEDIUM_MS);
}

/** Export graph canvas as PNG (download). */
export function exportPng(host: ExportHost): void {
	const canvas = host.pixiApp?.view;
	if (!canvas) return;
	canvas.toBlob((blob: Blob | null) => {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `graph-island-${new Date().toISOString().slice(0, 10)}.png`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		new Notice(t("export.pngDone"), TOAST_SHORT_MS);
	}, "image/png");
}

/** Export full graph data as JSON download. */
export function exportFullGraph(host: ExportHost): void {
	const gd = host.getGraphData();
	const json = exportFullGraphJSON(gd.nodes, gd.edges);
	downloadFile(json, "application/json", `graph-island-export-${new Date().toISOString().slice(0, 10)}.json`);
	new Notice(t("export.graphDone").replace("{nodes}", String(gd.nodes.length)).replace("{edges}", String(gd.edges.length)), TOAST_MEDIUM_MS);
}

/** Export graph as CSV download. */
export function exportGraphAsCSV(host: ExportHost): void {
	const gd = host.getGraphData();
	const csv = exportGraphCSV(gd.nodes, gd.edges);
	downloadFile(csv, "text/csv", `graph-island-${new Date().toISOString().slice(0, 10)}.csv`);
	new Notice(t("export.csvDone").replace("{nodes}", String(gd.nodes.length)).replace("{edges}", String(gd.edges.length)), TOAST_MEDIUM_MS);
}

/** Export graph as Mermaid diagram (clipboard or download fallback). */
export function exportGraphAsMermaid(host: ExportHost): void {
	const gd = host.getGraphData();
	const mmd = exportGraphMermaid(gd.nodes, gd.edges);
	navigator.clipboard
		.writeText(mmd)
		.then(() => {
			new Notice(t("export.mermaidDone").replace("{nodes}", String(Math.min(MERMAID_NODE_CAP, gd.nodes.length))), TOAST_MEDIUM_MS);
		})
		.catch(() => {
			downloadFile(mmd, "text/plain", `graph-island-${new Date().toISOString().slice(0, 10)}.mmd`);
		});
}

/** Copy the current graph view as PNG to clipboard. */
export async function copyGraphToClipboard(host: ExportHost): Promise<void> {
	if (!host.pixiApp) return;
	try {
		const { exportGraphAsPng } = await import("../utils/export-png");
		const blob = await exportGraphAsPng(host.pixiApp);
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
		showToast(t("toast.copiedToClipboard"));
	} catch (_e) {
		showToast(t("toast.clipboardFailed"), 5000);
	}
}

/**
 * Capture the current graph as PNG and embed it in the active note.
 */
export async function embedGraphInNote(host: ExportHost): Promise<void> {
	const mdView = host.app.workspace.getActiveViewOfType(MarkdownView);
	if (!mdView || !mdView.editor) {
		showToast(t("toast.embedNoEditor"), 5000);
		return;
	}
	if (!host.pixiApp) {
		showToast(t("toast.embedNoGraph"), 5000);
		return;
	}

	try {
		const { exportGraphAsPng } = await import("../utils/export-png");
		const blob = await exportGraphAsPng(host.pixiApp);

		// Generate timestamped filename
		const now = new Date();
		const ts = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, "0"),
			String(now.getDate()).padStart(2, "0"),
			String(now.getHours()).padStart(2, "0"),
			String(now.getMinutes()).padStart(2, "0"),
			String(now.getSeconds()).padStart(2, "0"),
		].join("");
		const filename = `graph-island-${ts}.png`;

		// Respect Obsidian's attachment folder setting (internal Vault API not in public types)
		const vault = host.app.vault as unknown as {
			getAvailablePath?: (base: string, ext: string) => string;
			config?: { attachmentFolderPath?: string };
		};
		const attachPath = vault.getAvailablePath
			? vault.getAvailablePath(
					(vault.config?.attachmentFolderPath || "") + "/" + filename.replace(".png", ""),
					"png",
				)
			: filename;

		// Save binary data to vault
		const buffer = await blob.arrayBuffer();
		await host.app.vault.createBinary(attachPath, buffer);

		// Insert wikilink image at cursor
		const editor = mdView.editor;
		const basename = attachPath.replace(/^.*\//, "");
		editor.replaceSelection(`![[${basename}]]\n`);

		showToast(t("toast.embedSuccess"));
	} catch (_e) {
		showToast(t("toast.embedFailed"), 5000);
	}
}

/** Export canvas as PNG Blob (for command palette). */
export async function exportCanvasAsBlob(host: ExportHost): Promise<Blob | null> {
	if (!host.pixiApp) return null;
	const { exportGraphAsPng } = await import("../utils/export-png");
	return exportGraphAsPng(host.pixiApp);
}
