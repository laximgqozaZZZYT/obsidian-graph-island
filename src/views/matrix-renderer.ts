/**
 * Matrix ViewMode rendering — extracted from GraphViewContainer to reduce god-object size.
 *
 * All functions are standalone and receive their dependencies as parameters.
 */

import type { GraphData, GraphNode } from "../types";
import { edgeSourceId, edgeTargetId, incCounter } from "../utils/graph-helpers";
import { t } from "../i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MATRIX_MAX_NODES = 50;
const MATRIX_CELL_SIZE_DIVISOR = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatrixSortMode = "degree" | "alpha" | "category";

interface MatrixRenderParams {
	/** Container DOM element (e.g. canvasWrap) for creating child divs */
	containerEl: HTMLElement;
	/** Full-screen width */
	W: number;
	/** Full-screen height */
	H: number;
	/** Graph data (nodes + edges) */
	gd: GraphData;
	/** Current sort mode */
	sortMode: MatrixSortMode;
	/** Whether the theme is dark */
	isDark: boolean;
	/** Callback when sort mode changes — caller should re-render */
	onSortChange: (mode: MatrixSortMode) => void;
	/** Callback when a cell/label is clicked — switch to graph and focus */
	onCellClick: (nodeId: string, secondId?: string) => void;
	/** Status setter callback */
	setStatus: (text: string) => void;
}

// ---------------------------------------------------------------------------
// Data preparation (pure, testable)
// ---------------------------------------------------------------------------

interface MatrixData {
	nodeIds: string[];
	degrees: Map<string, number>;
	matrix: Map<string, Map<string, number>>;
	matrixTypes: Map<string, Map<string, Map<string, number>>>;
	maxCount: number;
}

/** Build adjacency matrix data from graph edges + sorting config. */
export function buildMatrixData(
	gd: GraphData,
	sortMode: MatrixSortMode,
	maxNodes: number,
): MatrixData {
	// Compute degree per node
	const degrees = new Map<string, number>();
	for (const e of gd.edges) {
		const s = edgeSourceId(e);
		const tgt = edgeTargetId(e);
		incCounter(degrees, s);
		incCounter(degrees, tgt);
	}

	// Sort + slice to top N
	let sorted: [string, number][];
	if (sortMode === "alpha") {
		sorted = [...degrees.entries()]
			.sort((a, b) => {
				const la = (gd.nodes.find((n: GraphNode) => n.id === a[0])?.label ?? a[0]).toLowerCase();
				const lb = (gd.nodes.find((n: GraphNode) => n.id === b[0])?.label ?? b[0]).toLowerCase();
				return la.localeCompare(lb);
			})
			.slice(0, maxNodes);
	} else if (sortMode === "category") {
		sorted = [...degrees.entries()]
			.sort((a, b) => {
				const ca = gd.nodes.find((n: GraphNode) => n.id === a[0])?.category ?? "";
				const cb = gd.nodes.find((n: GraphNode) => n.id === b[0])?.category ?? "";
				if (ca !== cb) return ca.localeCompare(cb);
				return b[1] - a[1];
			})
			.slice(0, maxNodes);
	} else {
		sorted = [...degrees.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxNodes);
	}
	const nodeIds = sorted.map(([id]) => id);
	const nodeIdSet = new Set(nodeIds);

	// Build adjacency matrix (count + edge type breakdown)
	const matrix = new Map<string, Map<string, number>>();
	const matrixTypes = new Map<string, Map<string, Map<string, number>>>();
	for (const id of nodeIds) {
		matrix.set(id, new Map());
		matrixTypes.set(id, new Map());
	}
	for (const e of gd.edges) {
		const s = edgeSourceId(e);
		const tgt = edgeTargetId(e);
		if (nodeIdSet.has(s) && nodeIdSet.has(tgt)) {
			incCounter(matrix.get(s)!, tgt);
			const eType = e.type ?? "link";
			if (!matrixTypes.get(s)!.has(tgt)) matrixTypes.get(s)!.set(tgt, new Map());
			incCounter(matrixTypes.get(s)!.get(tgt)!, eType);
		}
	}

	// Max count for color scaling
	let maxCount = 1;
	for (const row of matrix.values()) {
		for (const count of row.values()) {
			if (count > maxCount) maxCount = count;
		}
	}

	return { nodeIds, degrees, matrix, matrixTypes, maxCount };
}

/** Get display label for a node ID. */
export function matrixNodeLabel(gd: GraphData, id: string): string {
	const node = gd.nodes.find((n: GraphNode) => n.id === id);
	return node?.label ?? id.replace(/\.md$/, "").split("/").pop() ?? id;
}

// ---------------------------------------------------------------------------
// Matrix rendering
// ---------------------------------------------------------------------------

/**
 * Render matrix viewMode: full-screen adjacency table, no Canvas.
 * Extracted from GraphViewContainer._renderMatrixViewMode.
 *
 * Returns the matrix container element for further manipulation.
 */
function _buildMatrixTable(
	matrixEl: HTMLElement,
	data: MatrixData,
	gd: GraphData,
	isDark: boolean,
	onCellClick: (nodeId: string, secondId?: string) => void,
): HTMLTableElement {
	const { nodeIds, degrees, matrix, matrixTypes, maxCount } = data;
	const getLabel = (id: string) => matrixNodeLabel(gd, id);

	const tableWrap = matrixEl.createDiv({ cls: "gi-matrix-scroll" });
	tableWrap.style.cssText = "overflow:auto;max-height:calc(100% - 30px);position:relative;";
	const table = tableWrap.createEl("table", { cls: "gi-matrix-table" });
	table.style.borderCollapse = "separate";
	table.style.borderSpacing = "0";

	// Header row (sticky top)
	const headerRow = table.createEl("tr");
	const cornerTh = headerRow.createEl("th");
	cornerTh.style.cssText = "position:sticky;top:0;left:0;z-index:3;background:var(--background-primary);";
	for (const id of nodeIds) {
		const label = getLabel(id);
		const deg = degrees.get(id) ?? 0;
		const th = headerRow.createEl("th", {
			text: label.slice(0, 4),
			attr: { title: `${label} (${deg} connections)` },
		});
		th.style.cssText = "position:sticky;top:0;z-index:2;background:var(--background-primary);";
	}

	// Data rows
	for (let rowIdx = 0; rowIdx < nodeIds.length; rowIdx++) {
		const rowId = nodeIds[rowIdx];
		const tr = table.createEl("tr");
		const label = getLabel(rowId);
		const deg = degrees.get(rowId) ?? 0;
		const td = tr.createEl("td", {
			text: label.slice(0, 8),
			cls: "gi-matrix-label",
			attr: { title: `${label} (${deg} connections)` },
		});
		td.style.cssText = "position:sticky;left:0;z-index:1;background:var(--background-primary);";
		td.addEventListener("click", () => onCellClick(rowId));

		for (let colIdx = 0; colIdx < nodeIds.length; colIdx++) {
			const colId = nodeIds[colIdx];
			const count = matrix.get(rowId)?.get(colId) ?? 0;
			const isDiag = rowIdx === colIdx;
			const cell = tr.createEl("td", {
				cls: `gi-matrix-cell${isDiag ? " gi-matrix-diag" : ""}`,
				attr: { "data-col": String(colIdx) },
			});
			if (count > 0) {
				cell.textContent = String(count);
				const intensity = Math.min(1, count / maxCount);
				cell.style.backgroundColor = isDark
					? `rgba(99,102,241,${intensity * 0.6})`
					: `rgba(79,70,229,${intensity * 0.4})`;
				const types = matrixTypes.get(rowId)?.get(colId);
				if (types && types.size > 0) {
					const parts = [...types.entries()].map(([tp, c]) => `${tp}: ${c}`);
					cell.title = `${getLabel(rowId)} → ${getLabel(colId)}\n${parts.join(", ")}`;
				}
			}
			cell.addEventListener("click", () => {
				if (count > 0) onCellClick(rowId, colId);
			});
		}
	}

	return table;
}

function _attachMatrixHoverHandlers(table: HTMLTableElement) {
	const allRows = table.querySelectorAll("tr");
	table.addEventListener("mouseover", (ev) => {
		const target = (ev.target as HTMLElement).closest("td, th") as HTMLElement | null;
		if (!target) return;
		const row = target.closest("tr");
		if (row) row.classList.add("gi-matrix-row-hover");
		const colAttr = target.dataset.col ?? (target as HTMLTableCellElement).cellIndex?.toString();
		if (colAttr != null) {
			const ci = parseInt(colAttr, 10);
			if (!isNaN(ci)) {
				allRows.forEach((r) => {
					const c = r.children[ci + 1] as HTMLElement | undefined;
					if (c) c.classList.add("gi-matrix-col-hover");
				});
			}
		}
	});
	table.addEventListener("mouseout", (ev) => {
		const target = (ev.target as HTMLElement).closest("td, th") as HTMLElement | null;
		if (!target) return;
		const row = target.closest("tr");
		if (row) row.classList.remove("gi-matrix-row-hover");
		const colAttr = target.dataset.col ?? (target as HTMLTableCellElement).cellIndex?.toString();
		if (colAttr != null) {
			const ci = parseInt(colAttr, 10);
			if (!isNaN(ci)) {
				allRows.forEach((r) => {
					const c = r.children[ci + 1] as HTMLElement | undefined;
					if (c) c.classList.remove("gi-matrix-col-hover");
				});
			}
		}
	});
}

export function renderMatrixViewMode(params: MatrixRenderParams): HTMLElement {
	const { containerEl, W, H, gd, sortMode, isDark, onSortChange, onCellClick, setStatus } = params;

	let matrixEl = containerEl.querySelector<HTMLElement>(".gi-matrix-fullscreen");
	if (!matrixEl) {
		matrixEl = containerEl.createDiv({ cls: "gi-matrix-fullscreen" });
	}
	matrixEl.empty();
	matrixEl.style.display = "";
	matrixEl.style.width = W + "px";
	matrixEl.style.height = H + "px";

	const maxNodes = Math.min(MATRIX_MAX_NODES, Math.floor(Math.min(W, H) / MATRIX_CELL_SIZE_DIVISOR));
	const data = buildMatrixData(gd, sortMode, maxNodes);

	// Title + sort selector
	const titleRow = matrixEl.createDiv({ cls: "gi-matrix-title-row" });
	titleRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;";
	titleRow.createSpan({ text: `${t("display.relationMatrix")} (${data.nodeIds.length} / ${gd.nodes.length})` });
	const sortSelect = titleRow.createEl("select", { cls: "gi-matrix-sort" });
	sortSelect.style.cssText = "font-size:11px;padding:2px 4px;border-radius:3px;";
	for (const opt of [
		{ value: "degree", label: "Degree" },
		{ value: "alpha", label: "A-Z" },
		{ value: "category", label: "Category" },
	]) {
		const el = sortSelect.createEl("option", { text: opt.label, attr: { value: opt.value } });
		if (opt.value === sortMode) el.selected = true;
	}
	sortSelect.addEventListener("change", () => {
		onSortChange(sortSelect.value as MatrixSortMode);
	});

	const table = _buildMatrixTable(matrixEl, data, gd, isDark, onCellClick);
	_attachMatrixHoverHandlers(table);

	setStatus(`${data.nodeIds.length} × ${data.nodeIds.length} matrix, ${gd.edges.length} edges`);

	return matrixEl;
}
