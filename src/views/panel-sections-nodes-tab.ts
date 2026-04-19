/**
 * panel-sections-nodes-tab.ts
 *
 * Extracted Nodes-tab section builders from PanelBuilder.ts to satisfy the
 * GOD OBJECT Policy (src/views/PanelBuilder.ts Max Allowed = 2216 lines).
 *
 * Each exported `buildNodes*Section` function constructs one subsection of the
 * Nodes tab UI and is kept under 40 lines. Larger rendering logic (recursive
 * directory tree walker) lives in module-level private helpers.
 */
import { Menu } from "obsidian";
import { t } from "../i18n";
import { asObsidianWindow } from "../obsidian-internals";
import {
	_getNodeDirStates,
	_saveNodeDirStates,
	type PanelState,
	type PanelCallbacks,
	type PanelContext,
	type NodeTreeEntry,
} from "./PanelBuilder";

// ---------------------------------------------------------------------------
// Internal types & helpers (not exported)
// ---------------------------------------------------------------------------
interface DirNode {
	children: Map<string, DirNode>;
	files: NodeTreeEntry[];
}

interface TreeCtx {
	panel: PanelState;
	cb: PanelCallbacks;
	excludeSet: Set<string>;
	hoveredId: string | null;
	fwdLinks: Set<string>;
	bkLinks: Set<string>;
}

function buildDirTree(entries: NodeTreeEntry[]): DirNode {
	const root: DirNode = { children: new Map(), files: [] };
	for (const entry of entries) {
		const parts = entry.path.split("/");
		parts.pop();
		let cur = root;
		for (const dir of parts) {
			if (!cur.children.has(dir)) cur.children.set(dir, { children: new Map(), files: [] });
			cur = cur.children.get(dir)!;
		}
		cur.files.push(entry);
	}
	return root;
}

function countFiles(dir: DirNode): number {
	let count = dir.files.length;
	for (const child of dir.children.values()) count += countFiles(child);
	return count;
}

function collectDirIds(dir: DirNode): string[] {
	const ids: string[] = dir.files.map((f) => f.id);
	for (const child of dir.children.values()) ids.push(...collectDirIds(child));
	return ids;
}

function renderFileRow(parent: HTMLElement, entry: NodeTreeEntry, depth: number, tctx: TreeCtx): void {
	const { panel, cb, excludeSet, hoveredId, fwdLinks, bkLinks } = tctx;
	const row = parent.createDiv({ cls: "gi-node-row" });
	row.style.cssText = `padding:1px 4px 1px ${depth * 12}px;display:flex;align-items:center;gap:4px;cursor:pointer;border-radius:3px;`;
	row.dataset.nodeId = entry.id;

	const cb2 = row.createEl("input", { type: "checkbox" });
	cb2.checked = !excludeSet.has(entry.id);
	cb2.style.cssText = "width:12px;height:12px;margin:0;cursor:pointer;";
	cb2.addEventListener("change", (e) => {
		e.stopPropagation();
		cb.toggleNodeVisibility(entry.id);
	});

	const label = row.createEl("span", { text: entry.label, cls: "gi-node-label" });
	label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

	if (!entry.isVisible) row.style.opacity = "0.4";
	if (entry.id === hoveredId) {
		row.style.background = "var(--interactive-accent)";
		row.style.color = "var(--text-on-accent)";
	} else if (fwdLinks.has(entry.id)) {
		row.style.background = "rgba(34, 197, 94, 0.15)";
		label.style.fontWeight = "600";
	} else if (bkLinks.has(entry.id)) {
		row.style.background = "rgba(59, 130, 246, 0.15)";
		label.style.fontWeight = "600";
	}

	row.addEventListener("click", (e) => {
		if (e.ctrlKey || e.metaKey) {
			const idx = panel.multiSelectNodeIds.indexOf(entry.id);
			if (idx >= 0) panel.multiSelectNodeIds.splice(idx, 1);
			else panel.multiSelectNodeIds.push(entry.id);
			row.classList.toggle("gi-node-selected");
		} else {
			cb.jumpToNode(entry.id);
		}
	});
	row.addEventListener("contextmenu", (e) => openFileContextMenu(e, entry, panel, cb, excludeSet));
}

function openFileContextMenu(
	e: MouseEvent,
	entry: NodeTreeEntry,
	panel: PanelState,
	cb: PanelCallbacks,
	excludeSet: Set<string>,
): void {
	e.preventDefault();
	e.stopPropagation();
	const menu = new Menu();
	menu.addItem((item) =>
		item
			.setTitle(t("context.jumpToNode"))
			.setIcon("locate")
			.onClick(() => cb.jumpToNode(entry.id)),
	);
	menu.addItem((item) =>
		item
			.setTitle(excludeSet.has(entry.id) ? "Show" : "Hide")
			.setIcon("eye-off")
			.onClick(() => cb.toggleNodeVisibility(entry.id)),
	);
	const isBm = (panel.bookmarkedNodes ?? []).includes(entry.id);
	menu.addItem((item) =>
		item
			.setTitle(isBm ? "Remove Bookmark" : "Bookmark")
			.setIcon("bookmark")
			.onClick(() => {
				if (isBm) panel.bookmarkedNodes = panel.bookmarkedNodes.filter((id) => id !== entry.id);
				else {
					if (!panel.bookmarkedNodes) panel.bookmarkedNodes = [];
					panel.bookmarkedNodes.push(entry.id);
				}
				cb.invalidateDataKeepPanel();
			}),
	);
	menu.addItem((item) =>
		item
			.setTitle(t("context.openFile"))
			.setIcon("file-text")
			.onClick(() => {
				const file = asObsidianWindow().app?.vault?.getAbstractFileByPath(entry.id);
				if (file)
					asObsidianWindow()
						.app?.workspace?.getLeaf(false)
						?.openFile(file as import("obsidian").TFile);
			}),
	);
	menu.showAtPosition({ x: e.clientX, y: e.clientY });
}

function renderDirEntry(
	parent: HTMLElement,
	name: string,
	child: DirNode,
	path: string,
	depth: number,
	tctx: TreeCtx,
): void {
	const { panel, cb, excludeSet } = tctx;
	const dirEl = parent.createDiv({ cls: "gi-node-dir" });
	const header = dirEl.createDiv({ cls: "gi-node-dir-header" });
	header.style.cssText = `padding:2px 0 2px ${depth * 12}px;cursor:pointer;display:flex;align-items:center;gap:4px;color:var(--text-muted);`;

	const dirIds = collectDirIds(child);
	const allExcluded = dirIds.length > 0 && dirIds.every((id) => excludeSet.has(id));
	const dirCb = header.createEl("input", { type: "checkbox" });
	dirCb.checked = !allExcluded;
	dirCb.style.cssText = "width:11px;height:11px;margin:0;cursor:pointer;";
	dirCb.addEventListener("click", (e) => {
		e.stopPropagation();
		const ids = collectDirIds(child);
		if (dirCb.checked) {
			panel.excludeNodes = (panel.excludeNodes ?? []).filter((id) => !ids.includes(id));
		} else {
			const excl = new Set(panel.excludeNodes ?? []);
			for (const id of ids) excl.add(id);
			panel.excludeNodes = [...excl];
		}
		cb.invalidateDataKeepPanel();
	});

	const arrow = header.createEl("span", { text: ">" });
	arrow.style.cssText = "font-size:9px;transition:transform 0.15s;";
	header.createEl("span", { text: name });
	const fileCount = countFiles(child);
	const countEl = header.createEl("span", { text: `(${fileCount})`, cls: "gi-node-count" });
	countEl.setAttribute("style", "font-size:9px;color:var(--text-faint);");

	const body = dirEl.createDiv({ cls: "gi-node-dir-body" });
	const dirPath = path + name;
	const savedOpen = _getNodeDirStates()[dirPath];
	body.style.display = savedOpen ? "" : "none";
	if (savedOpen) arrow.style.transform = "rotate(90deg)";

	header.addEventListener("click", (e) => {
		if (e.target instanceof HTMLElement && e.target.tagName === "INPUT") return;
		const open = body.style.display !== "none";
		body.style.display = open ? "none" : "";
		arrow.style.transform = open ? "" : "rotate(90deg)";
		const states = _getNodeDirStates();
		if (open) delete states[dirPath];
		else states[dirPath] = true;
		_saveNodeDirStates(states);
	});

	renderDir(body, child, path + name + "/", depth + 1, tctx);
}

function renderDir(parent: HTMLElement, dir: DirNode, path: string, depth: number, tctx: TreeCtx): void {
	const sortedDirs = [...dir.children.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	const sortedFiles = [...dir.files].sort((a, b) => a.label.localeCompare(b.label));
	for (const [name, child] of sortedDirs) renderDirEntry(parent, name, child, path, depth, tctx);
	for (const entry of sortedFiles) renderFileRow(parent, entry, depth, tctx);
}

// ---------------------------------------------------------------------------
// Exported section builders (each < 40 lines)
// ---------------------------------------------------------------------------

/** Stats bar — total / visible / hidden counts. */
export function buildNodesStatsSection(
	tabEl: HTMLElement,
	total: number,
	visible: number,
	hidden: number,
): void {
	const statsBar = tabEl.createDiv({ cls: "gi-node-stats" });
	statsBar.style.cssText = "padding:4px 8px;font-size:10px;color:var(--text-muted);display:flex;gap:8px;";
	statsBar.createEl("span", { text: `${total} total` });
	statsBar.createEl("span", { text: `${visible} visible` });
	if (hidden > 0) {
		const hidSpan = statsBar.createEl("span", { text: `${hidden} hidden` });
		hidSpan.style.color = "var(--text-error)";
	}
}

/** Filter + sort bar. Returns filterInput and sortSelect so tree section can wire handlers. */
export function buildNodesFilterSection(
	tabEl: HTMLElement,
	degreeLookup: Map<string, number>,
	excludeSet: Set<string>,
): { filterInput: HTMLInputElement; sortSelect: HTMLSelectElement; degreeLookup: Map<string, number>; excludeSet: Set<string> } {
	const filterWrap = tabEl.createDiv({ cls: "gi-node-tree-filter" });
	filterWrap.style.cssText = "padding:4px 8px;display:flex;gap:4px;align-items:center;";
	const filterInput = filterWrap.createEl("input", {
		type: "text",
		placeholder: t("nodes.filterPlaceholder") ?? "Filter nodes...",
		cls: "gi-node-filter-input",
	});
	filterInput.style.cssText =
		"flex:1;padding:4px 6px;font-size:11px;border:1px solid var(--background-modifier-border);border-radius:4px;background:var(--background-primary);";
	const sortSelect = filterWrap.createEl("select", { cls: "gi-node-sort" });
	sortSelect.style.cssText =
		"font-size:10px;padding:2px;border-radius:3px;background:var(--background-primary);border:1px solid var(--background-modifier-border);";
	for (const [val, label] of [
		["name", "A-Z"],
		["path", "Path"],
		["visible", "Visible"],
		["degree", "Degree"],
	]) {
		sortSelect.createEl("option", { value: val, text: label });
	}
	return { filterInput, sortSelect, degreeLookup, excludeSet };
}

/** Tree container + directory/file rendering. Also wires filter+sort handlers. */
export function buildNodesTreeSection(
	tabEl: HTMLElement,
	entries: NodeTreeEntry[],
	panel: PanelState,
	cb: PanelCallbacks,
	filterInput: HTMLInputElement,
	sortSelect: HTMLSelectElement,
	degreeLookup: Map<string, number>,
	excludeSet: Set<string>,
): HTMLElement {
	const hoveredId = cb.getHoveredNodeId();
	const fwdLinks = hoveredId ? new Set(cb.getForwardLinks(hoveredId)) : new Set<string>();
	const bkLinks = hoveredId ? new Set(cb.getBacklinks(hoveredId)) : new Set<string>();
	const root = buildDirTree(entries);
	const treeContainer = tabEl.createDiv({ cls: "gi-node-tree" });
	treeContainer.style.cssText = "overflow-y:auto;max-height:400px;font-size:11px;padding:0 4px;";
	renderDir(treeContainer, root, "", 0, { panel, cb, excludeSet, hoveredId, fwdLinks, bkLinks });
	wireSortHandler(sortSelect, treeContainer, degreeLookup, excludeSet);
	wireFilterHandler(filterInput, treeContainer);
	return treeContainer;
}

function wireSortHandler(
	sortSelect: HTMLSelectElement,
	treeContainer: HTMLElement,
	degreeLookup: Map<string, number>,
	excludeSet: Set<string>,
): void {
	sortSelect.addEventListener("change", () => {
		const mode = sortSelect.value;
		const rows = [...treeContainer.querySelectorAll<HTMLElement>(".gi-node-row")];
		rows.sort((a, b) => {
			const aId = a.dataset.nodeId ?? "";
			const bId = b.dataset.nodeId ?? "";
			if (mode === "visible") {
				const aVis = !excludeSet.has(aId) ? 0 : 1;
				const bVis = !excludeSet.has(bId) ? 0 : 1;
				return aVis - bVis || aId.localeCompare(bId);
			}
			if (mode === "degree") return (degreeLookup.get(bId) ?? 0) - (degreeLookup.get(aId) ?? 0);
			if (mode === "path") return aId.localeCompare(bId);
			return (a.textContent ?? "").localeCompare(b.textContent ?? "");
		});
		for (const row of rows) treeContainer.appendChild(row);
	});
}

function wireFilterHandler(filterInput: HTMLInputElement, treeContainer: HTMLElement): void {
	filterInput.addEventListener("input", () => {
		const q = filterInput.value.toLowerCase().trim();
		const rows = treeContainer.querySelectorAll<HTMLElement>(".gi-node-row");
		for (const el of Array.from(rows)) {
			const id = el.dataset.nodeId ?? "";
			const text = el.textContent?.toLowerCase() ?? "";
			el.style.display = q && !text.includes(q) && !id.toLowerCase().includes(q) ? "none" : "";
		}
		if (q) {
			const dirs = treeContainer.querySelectorAll(".gi-node-dir");
			for (const dir of Array.from(dirs)) {
				const body = dir.querySelector<HTMLElement>(".gi-node-dir-body");
				const arrow = dir.querySelector<HTMLElement>(".gi-node-dir-header span");
				if (body) body.style.display = "";
				if (arrow) arrow.style.transform = "rotate(90deg)";
			}
		}
	});
}

/** Legend row + CSV export button + hover-sync CSS injection. */
export function buildNodesLegendSection(tabEl: HTMLElement, entries: NodeTreeEntry[]): void {
	const legend = tabEl.createDiv({ cls: "gi-node-legend" });
	legend.style.cssText =
		"padding:4px 8px;font-size:10px;color:var(--text-muted);display:flex;gap:8px;flex-wrap:wrap;";
	const addLegendItem = (color: string, text: string) => {
		const item = legend.createEl("span");
		item.style.cssText = `display:inline-flex;align-items:center;gap:2px;`;
		const dot = item.createEl("span");
		dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;`;
		item.createEl("span", { text });
	};
	addLegendItem("var(--interactive-accent)", t("nodes.hovered") ?? "Hovered");
	addLegendItem("rgba(34,197,94,0.6)", t("nodes.forwardLink") ?? "Link");
	addLegendItem("rgba(59,130,246,0.6)", t("nodes.backlink") ?? "Backlink");

	const exportBtn = legend.createEl("button", { text: t("export.csvBtn"), cls: "gi-node-export-btn" });
	exportBtn.style.cssText = "font-size:9px;padding:1px 6px;cursor:pointer;margin-left:auto;border-radius:3px;";
	exportBtn.addEventListener("click", () => exportNodesCsv(entries));

	if (!tabEl.querySelector("style.gi-node-hover-css")) {
		const styleEl = tabEl.createEl("style", { cls: "gi-node-hover-css" });
		styleEl.textContent = `.gi-node-hovered{background:var(--interactive-accent)!important;color:var(--text-on-accent)!important;}.gi-node-linked{background:rgba(34,197,94,0.15)!important;font-weight:600;}.gi-node-selected{background:rgba(139,92,246,0.2)!important;border-left:2px solid var(--interactive-accent);}`;
	}
}

function exportNodesCsv(entries: NodeTreeEntry[]): void {
	const rows = ["id,label,path,visible"];
	for (const e of entries) {
		rows.push(`"${e.id}","${e.label}","${e.path}",${e.isVisible}`);
	}
	const csv = rows.join("\n");
	const blob = new Blob([csv], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = `graph-island-nodes-${new Date().toISOString().slice(0, 10)}.csv`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/** Orchestrator — builds the full Nodes tab by delegating to section builders. */
export function buildNodesTab(
	tabEl: HTMLElement,
	panel: PanelState,
	_ctx: PanelContext,
	cb: PanelCallbacks,
): void {
	const entries = cb.getNodeTreeData();
	const excludeSet = new Set(panel.excludeNodes ?? []);
	const visibleCount = entries.filter((e) => e.isVisible).length;

	const degreeLookup = new Map<string, number>();
	for (const e of entries) {
		degreeLookup.set(e.id, cb.getForwardLinks(e.id).length + cb.getBacklinks(e.id).length);
	}

	buildNodesStatsSection(tabEl, entries.length, visibleCount, excludeSet.size);
	const { filterInput, sortSelect } = buildNodesFilterSection(tabEl, degreeLookup, excludeSet);
	buildNodesTreeSection(tabEl, entries, panel, cb, filterInput, sortSelect, degreeLookup, excludeSet);
	buildNodesLegendSection(tabEl, entries);
}
