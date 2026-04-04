/**
 * StatsRenderer — extracted from GraphViewContainer (Phase 1+3).
 * Renders the floating graph statistics panel, quality dashboard,
 * and hierarchy breadcrumb bar.
 * Communicates with GVC via StatsHost interface to avoid tight coupling.
 */
import type { GraphData } from "../types";
import { computeGraphStats, generateStructureQuestions } from "../analysis/graph-analysis";
import { t } from "../i18n";
import { Notice } from "obsidian";

/** Chrome-only Performance.memory API (non-standard). */
interface PerformanceMemory {
	usedJSHeapSize: number;
	totalJSHeapSize: number;
	jsHeapSizeLimit: number;
}
interface PerformanceWithMemory extends Performance {
	memory?: PerformanceMemory;
}
import type { StatsHost } from "./GraphViewContainer";
import { incCounter } from "../utils/graph-helpers";

/** Minimal panel state needed for stats rendering */
export interface StatsPanel {
	showGraphStats: boolean;
	showStructureQuestions: boolean;
	renderThresholds?: { labelOverlapMargin?: number };
	minDegreeFilter: number;
	maxDegreeFilter: number;
}

/**
 * Render the graph statistics panel into the given container element.
 *
 * @param el - The container element (graphStatsEl)
 * @param gd - Current graph data (nodes + edges)
 * @param panel - Minimal panel state slice
 * @param host - StatsHost interface for GVC communication
 */
export function renderGraphStats(el: HTMLElement, gd: GraphData, panel: StatsPanel, host: StatsHost): void {
	if (!panel.showGraphStats) {
		el.style.display = "none";
		return;
	}
	el.style.display = "";
	el.empty();

	const degrees = host.getDegrees();
	const stats = computeGraphStats(gd.nodes, gd.edges, degrees);

	// --- Title row with Markdown copy button ---
	const titleRow = el.createDiv({ cls: "gi-stats-title-row" });
	titleRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;";
	const title = titleRow.createEl("div", { cls: "gi-stats-title", text: t("stats.title") });
	title.style.fontWeight = "600";

	const copyBtn = titleRow.createEl("button", { text: "MD", cls: "gi-stats-copy" });
	copyBtn.style.cssText = "font-size:9px;padding:1px 5px;cursor:pointer;border-radius:3px;opacity:0.6;";
	copyBtn.title = "Copy as Markdown";
	copyBtn.addEventListener("click", () => {
		const lines = [`# ${t("stats.title")}`, ""];
		lines.push(`| Metric | Value |`, `|---|---|`);
		lines.push(`| ${t("stats.nodes")} | ${stats.nodeCount} |`);
		lines.push(`| ${t("stats.edges")} | ${stats.edgeCount} |`);
		lines.push(`| ${t("stats.avgDegree")} | ${stats.avgDegree.toFixed(2)} |`);
		lines.push(`| ${t("stats.density")} | ${stats.density.toFixed(4)} |`);
		lines.push(`| ${t("stats.components")} | ${stats.componentCount} |`);
		if (stats.hubs.length > 0) {
			lines.push("", "## Top Hubs", "");
			for (const [id, deg] of stats.hubs) {
				lines.push(`- ${host.getNodeLabel(id)} (${deg})`);
			}
		}
		navigator.clipboard.writeText(lines.join("\n"));
		new Notice("Stats copied as Markdown", 2000);
	});

	// --- Stats table ---
	const table = el.createEl("table", { cls: "gi-stats-table" });
	const addRow = (label: string, value: string): HTMLElement => {
		const tr = table.createEl("tr");
		tr.createEl("td", { cls: "gi-stats-label", text: label });
		tr.createEl("td", { cls: "gi-stats-value", text: value });
		return tr;
	};
	addRow(t("stats.nodes"), String(stats.nodeCount));
	addRow(t("stats.edges"), String(stats.edgeCount));
	addRow(t("stats.avgDegree"), stats.avgDegree.toFixed(2));
	addRow(t("stats.density"), stats.density.toFixed(4));
	addRow(t("stats.components"), String(stats.componentCount));
	addRow(t("stats.orphanRate"), (stats.orphanRate * 100).toFixed(1) + "%");
	addRow(t("stats.tagCoverage"), (stats.tagCoverage * 100).toFixed(1) + "%");

	// Node overlap ratio
	const overlapRatio = host.getNodeOverlapRatio();
	const overlapPct = (overlapRatio * 100).toFixed(1) + "%";
	const overlapRow = addRow(t("stats.overlap") ?? "Overlap", overlapPct);
	if (overlapRatio > 0.1) {
		overlapRow.style.color = "var(--text-warning, #d4a017)";
		overlapRow.title = "High overlap — try increasing node spacing or enabling auto-optimize";
	}

	// HI: Edge density warning
	if (stats.edgeCount > 5000) {
		const warn = el.createEl("div", { cls: "gi-stats-warn", attr: { role: "alert" } });
		warn.textContent = `⚠ ${stats.edgeCount} edges — consider enabling edge fade or reducing hops`;
		warn.style.cssText =
			"color:var(--text-warning,#d4a017);font-size:10px;margin:4px 0;padding:2px 4px;border-radius:3px;background:var(--background-modifier-warning,rgba(212,160,23,0.1))";
	}

	// Edge type distribution
	if (stats.edgeTypeCounts.size > 0) {
		const etTitle = el.createEl("div", { cls: "gi-stats-hub-title", text: t("stats.edgeTypes") });
		etTitle.style.fontWeight = "600";
		etTitle.style.marginTop = "6px";
		etTitle.style.marginBottom = "2px";
		const etTable = el.createEl("table", { cls: "gi-stats-table" });
		for (const [etype, count] of [...stats.edgeTypeCounts.entries()].sort((a, b) => b[1] - a[1])) {
			const tr = etTable.createEl("tr");
			tr.createEl("td", { cls: "gi-stats-label", text: etype });
			tr.createEl("td", { cls: "gi-stats-value", text: String(count) });
		}
	}

	renderDegreeChart(el, degrees, panel, host);
	renderComplexityAndLabels(el, addRow, stats, panel, host);
	renderQualityDashboard(el, host);
	renderTopHubs(el, stats, host);
	renderStructureQuestions(el, gd, degrees, panel, host);
}

/** Degree distribution mini-chart */
function renderDegreeChart(el: HTMLElement, degrees: Map<string, number>, panel: StatsPanel, host: StatsHost): void {
	if (degrees.size === 0) return;

	const degTitle = el.createEl("div", {
		cls: "gi-stats-hub-title",
		text: t("stats.degreeDistribution") ?? "Degree Distribution",
	});
	degTitle.style.fontWeight = "600";
	degTitle.style.marginTop = "6px";
	degTitle.style.marginBottom = "2px";

	const buckets = new Map<number, number>();
	for (const deg of degrees.values()) {
		const b = Math.min(deg, 20);
		incCounter(buckets, b);
	}
	const maxBucket = Math.max(1, ...buckets.values());
	const chartEl = el.createDiv({ cls: "gi-degree-chart" });
	chartEl.style.cssText = "display:flex;align-items:flex-end;gap:1px;height:30px;margin-bottom:4px;";
	for (let d = 0; d <= 20; d++) {
		const count = buckets.get(d) ?? 0;
		if (count === 0 && d > 10) continue;
		const bar = chartEl.createDiv();
		const h = Math.max(1, (count / maxBucket) * 28);
		bar.style.cssText = `width:6px;height:${h}px;background:var(--interactive-accent);opacity:0.7;border-radius:1px 1px 0 0;cursor:pointer;`;
		bar.title = `degree ${d}${d === 20 ? "+" : ""}: ${count} nodes — click to filter`;
		const deg = d;
		bar.setAttribute("role", "button");
		bar.setAttribute("tabindex", "0");
		bar.addEventListener("click", () => {
			panel.minDegreeFilter = deg;
			panel.maxDegreeFilter = deg === 20 ? 0 : deg;
			host.invalidateAndRebuild();
			host.announceA11y(`Degree filter: ${deg}${deg === 20 ? "+" : ""}`);
		});
		bar.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				bar.click();
			}
		});
	}
}

/** Graph complexity score + label visibility stats */
function renderComplexityAndLabels(
	el: HTMLElement,
	addRow: (label: string, value: string) => HTMLElement,
	stats: ReturnType<typeof computeGraphStats>,
	panel: StatsPanel,
	host: StatsHost,
): void {
	const logN = Math.max(1, Math.log2(stats.nodeCount));
	const complexity = logN * (stats.density * 1000) * stats.avgDegree * Math.sqrt(stats.componentCount);
	const score = Math.min(100, Math.round(complexity * 10) / 10);
	addRow(t("stats.complexity") ?? "Complexity", String(score));

	const cullStats = host.getLabelCullStats();
	if (cullStats.totalLabels > 0) {
		addRow("Labels", `${cullStats.visibleLabels}/${cullStats.totalLabels}`);
		const pct = (cullStats.collisionRate * 100).toFixed(1);
		addRow("Cull Rate", `${pct}%`);
	}
	const margin = panel.renderThresholds?.labelOverlapMargin ?? 12;
	if (margin !== 12) addRow("Margin", `${margin}px`);
}

/** Quality dashboard (collapsible) */
function renderQualityDashboard(el: HTMLElement, host: StatsHost): void {
	const qs = host.getLabelQualityScore();
	const fps = host.getCurrentFps();
	const mem = (performance as PerformanceWithMemory).memory?.usedJSHeapSize;
	const memMB = mem ? Math.round(mem / (1024 * 1024)) : null;

	const dashTitle = el.createEl("div", { cls: "gi-stats-hub-title", text: "Quality Dashboard" });
	dashTitle.style.cssText = "font-weight:600;margin-top:6px;cursor:pointer;user-select:none;";
	const dashBody = el.createDiv({ cls: "gi-quality-dashboard" });
	dashBody.style.display = "none";
	dashTitle.addEventListener("click", () => {
		dashBody.style.display = dashBody.style.display === "none" ? "" : "none";
	});

	const badge = (label: string, value: string, pass: boolean) => {
		const row = dashBody.createDiv({ cls: "gi-stats-row" });
		row.style.cssText = "display:flex;justify-content:space-between;padding:1px 0;font-size:11px;";
		row.createEl("span", { text: label });
		const val = row.createEl("span", { text: `${value} ${pass ? "✓" : "✗"}` });
		val.style.color = pass ? "var(--text-success, #38a169)" : "var(--text-error, #e53e3e)";
	};

	badge("Score", `${qs.score}/100`, qs.score >= 70);
	badge("Collision", `${qs.collision}/40`, qs.collision >= 28);
	badge("Visibility", `${qs.visibility}/30`, qs.visibility >= 15);
	badge("Priority", `${qs.priority}/30`, qs.priority >= 15);
	badge("FPS", fps > 0 ? `${fps}` : "idle", fps >= 30 || fps === 0);
	if (memMB !== null) badge("Memory", `${memMB}MB`, memMB < 300);
	const renderMs = host.getLastRenderTime();
	if (renderMs > 0) badge("Frame", `${renderMs.toFixed(1)}ms`, renderMs < 16.7);
}

/** Top hubs list (clickable) */
function renderTopHubs(el: HTMLElement, stats: ReturnType<typeof computeGraphStats>, host: StatsHost): void {
	if (stats.hubs.length === 0) return;

	const hubTitle = el.createEl("div", { cls: "gi-stats-hub-title", text: t("stats.topHubs") });
	hubTitle.style.fontWeight = "600";
	hubTitle.style.marginTop = "6px";
	hubTitle.style.marginBottom = "2px";

	const hubList = el.createEl("ul", { cls: "gi-stats-hub-list" });
	for (const [id, deg] of stats.hubs) {
		const label = host.getNodeLabel(id);
		const li = hubList.createEl("li", {
			cls: "gi-stats-hub-item gi-stats-hub-clickable",
			text: `${label} (${deg})`,
			attr: { role: "button", tabindex: "0", "aria-label": `${label}, ${deg} connections — click to focus` },
		});
		const nodeId = id;
		li.addEventListener("click", () => {
			host.panToNode(nodeId);
			host.setHighlightedNodeId(nodeId);
			host.applyHover();
		});
		li.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				host.panToNode(nodeId);
				host.setHighlightedNodeId(nodeId);
				host.applyHover();
			}
		});
	}
}

/** Structure questions section */
function renderStructureQuestions(
	el: HTMLElement,
	gd: GraphData,
	degrees: Map<string, number>,
	panel: StatsPanel,
	host: StatsHost,
): void {
	if (!panel.showStructureQuestions) return;

	const betweenness = host.getBetweennessCache();
	const questions = generateStructureQuestions(gd.nodes, gd.edges, degrees, betweenness);
	if (questions.length === 0) return;

	const qTitle = el.createEl("div", {
		cls: "gi-stats-hub-title",
		text: "💡 " + t("display.showStructureQuestions"),
	});
	qTitle.style.fontWeight = "600";
	qTitle.style.marginTop = "8px";
	qTitle.style.marginBottom = "2px";
	const qList = el.createEl("ul", {
		cls: "gi-stats-hub-list",
		attr: { role: "log", "aria-label": t("display.showStructureQuestions") ?? "Structure Questions" },
	});
	for (const q of questions) {
		qList.createEl("li", { cls: "gi-stats-hub-item", text: q });
	}
}

// ---------------------------------------------------------------------------
// Hierarchy Breadcrumb (Phase 3 — extracted from GVC updateHierarchyBreadcrumb)
// ---------------------------------------------------------------------------

/** Minimal host for breadcrumb rendering */
export interface BreadcrumbHost {
	getNodeLabel(id: string): string;
	/** Trigger full re-render (for breadcrumb click navigation) */
	invalidateAndRebuild(): void;
}

/**
 * Render the hierarchy breadcrumb bar showing the inheritance path
 * from root to the current localGraphCenter node.
 */
export function renderBreadcrumb(
	el: HTMLElement,
	showBreadcrumb: boolean,
	localGraphCenter: string | null,
	edges: readonly { source: string; target: string; type?: string; relation?: string }[],
	panel: { localGraphCenter: string | null },
	host: BreadcrumbHost,
): void {
	if (!showBreadcrumb || !localGraphCenter) {
		el.style.display = "none";
		return;
	}
	el.style.display = "";
	el.empty();

	// Walk hierarchy edges upward from localGraphCenter to root
	// Match same edge types as getOntologyBackbone: inheritance type OR is-a/parent relation
	const isHierarchyEdge = (e: { type?: string; relation?: string }) => {
		const t = e.type ?? "";
		const r = e.relation ?? "";
		return t === "inheritance" || r === "is-a" || r === "parent";
	};
	const chain: string[] = [localGraphCenter];
	const visited = new Set<string>([localGraphCenter]);
	let cur = localGraphCenter;
	for (let depth = 0; depth < 20; depth++) {
		let parentId: string | null = null;
		for (const e of edges) {
			if (isHierarchyEdge(e) && e.source === cur && !visited.has(e.target)) {
				parentId = e.target;
				break;
			}
			if (isHierarchyEdge(e) && e.target === cur && !visited.has(e.source)) {
				parentId = e.source;
				break;
			}
		}
		if (!parentId) break;
		chain.unshift(parentId);
		visited.add(parentId);
		cur = parentId;
	}

	for (let i = 0; i < chain.length; i++) {
		if (i > 0) {
			el.createSpan({ cls: "gi-breadcrumb-sep", text: " › " });
		}
		const nodeId = chain[i];
		const label = host.getNodeLabel(nodeId);
		const span = el.createSpan({
			cls: i === chain.length - 1 ? "gi-breadcrumb-current" : "gi-breadcrumb-item",
			text: label,
		});
		if (i < chain.length - 1) {
			span.style.cursor = "pointer";
			span.addEventListener("click", () => {
				panel.localGraphCenter = nodeId;
				host.invalidateAndRebuild();
			});
		}
	}
}

// ---------------------------------------------------------------------------
// Relation Matrix (Phase 4 — extracted from GVC updateRelationMatrix)
// ---------------------------------------------------------------------------

/**
 * Render the relation matrix showing adjacency between top-degree nodes.
 */
export function renderRelationMatrix(
	el: HTMLElement,
	showMatrix: boolean,
	edges: readonly { source: string | { id: string }; target: string | { id: string }; type?: string }[],
	host: Pick<StatsHost, "getDegrees" | "getNodeLabel">,
	onCellClick: (nodeIds: Set<string>) => void,
): void {
	if (!showMatrix) {
		el.style.display = "none";
		return;
	}
	el.style.display = "";
	el.empty();

	el.createEl("div", { cls: "gi-matrix-title", text: "Relation Matrix" });

	const degrees = host.getDegrees();
	const sorted = [...degrees.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
	if (sorted.length === 0) return;

	const nodeIds = sorted.map(([id]) => id);
	const idSet = new Set(nodeIds);

	// Build adjacency count matrix
	const matrix = new Map<string, Map<string, number>>();
	for (const id of nodeIds) matrix.set(id, new Map());

	for (const e of edges) {
		const src = typeof e.source === "object" ? e.source.id : e.source;
		const tgt = typeof e.target === "object" ? e.target.id : e.target;
		if (idSet.has(src) && idSet.has(tgt)) {
			const row = matrix.get(src)!;
			incCounter(row, tgt);
		}
	}

	let maxCount = 1;
	for (const row of matrix.values()) {
		for (const v of row.values()) {
			if (v > maxCount) maxCount = v;
		}
	}

	const table = el.createEl("table", { cls: "gi-matrix-table" });
	const headerRow = table.createEl("tr");
	headerRow.createEl("th");
	for (const id of nodeIds) {
		const label = host.getNodeLabel(id);
		const th = headerRow.createEl("th", { text: label.slice(0, 3), attr: { title: label } });
		th.style.fontSize = "9px";
	}

	for (const rowId of nodeIds) {
		const tr = table.createEl("tr");
		const label = host.getNodeLabel(rowId);
		tr.createEl("td", { text: label.slice(0, 6), cls: "gi-matrix-label", attr: { title: label } });

		for (const colId of nodeIds) {
			const count = matrix.get(rowId)?.get(colId) ?? 0;
			const td = tr.createEl("td", { cls: "gi-matrix-cell" });
			if (count > 0) {
				td.textContent = String(count);
				const intensity = Math.min(1, count / maxCount);
				td.style.backgroundColor = `rgba(var(--interactive-accent-rgb, 99,102,241), ${intensity * 0.6})`;
			}
			td.addEventListener("click", () => onCellClick(new Set([rowId, colId])));
		}
	}
}
