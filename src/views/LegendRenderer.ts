/**
 * LegendRenderer — extracted from GraphViewContainer (Phase 2).
 * Renders the interactive legend overlay (node colors, edge relations, shapes).
 */
import { invalidateBundleCache } from "./EdgeRenderer";
import { t } from "../i18n";
import { incCounter } from "../utils/graph-helpers";

/** Minimal host interface for legend rendering */
export interface LegendHost {
	/** Node color map (label → CSS color) */
	getNodeColorMap(): Map<string, string>;
	/** Edge relation color map (relation → CSS color) */
	getRelationColors(): Map<string, string>;
	/** Count nodes per category for legend display */
	getCategoryCounts(): Map<string, number>;
	/** Max degree (for heatmap legend) */
	getMaxDegree(): number;
	/** Get community map for community color mode */
	getCommunityMap(): Map<string, number>;
	/** Invalidate data and re-render (for filter clicks) */
	invalidateAndRebuild(): void;
	/** Mark render dirty + rebuild legend */
	markDirtyAndRebuildLegend(): void;
	/** Save panel state */
	requestSave(): void;
}

/** Minimal panel slice for legend rendering */
export interface LegendPanel {
	showLegend: boolean;
	nodeColorMode: string;
	nodeColorField: string;
	colorEdgesByRelation: boolean;
	nodeShapeRules?: Array<{ shape: string; match: string }>;
	searchQuery: string;
	// Dynamic edge toggle keys accessed via panel[key]
	[key: string]: unknown;
}

/**
 * Render the legend overlay into the given container.
 */
export function renderLegend(el: HTMLElement, panel: LegendPanel, host: LegendHost): void {
	if (!panel.showLegend) {
		el.style.display = "none";
		return;
	}
	const colorMap = host.getNodeColorMap();
	const relColors = host.getRelationColors();
	if (colorMap.size === 0 && relColors.size === 0) {
		el.style.display = "none";
		return;
	}
	el.empty();
	el.style.display = "";

	// Header with close button
	const header = el.createDiv({ cls: "gi-legend-header" });
	header.createEl("span", { text: `${colorMap.size + relColors.size} items` });
	const closeBtn = header.createEl("button", {
		cls: "gi-legend-close",
		text: "\u00d7",
		attr: { "aria-label": "Close legend", tabindex: "0" },
	});
	closeBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		panel.showLegend = false;
		el.style.display = "none";
		host.requestSave();
	});

	const body = el.createDiv({ cls: "gi-legend-body" });
	if (colorMap.size + relColors.size > 10) body.style.display = "none";
	header.addEventListener("click", () => {
		body.style.display = body.style.display === "none" ? "" : "none";
	});

	const categoryCounts = host.getCategoryCounts();
	const legendColorMode = panel.nodeColorMode ?? "category";

	renderCategorySection(body, colorMap, categoryCounts, legendColorMode, panel, host);
	renderHeatmapSection(body, legendColorMode, host);
	renderCommunitySection(body, legendColorMode, host);
	renderFieldSection(body, colorMap, legendColorMode, panel);
	renderEdgeRelationSection(body, relColors, panel, host);
	renderShapeSection(body, panel);
}

/** Category color legend section */
function renderCategorySection(
	body: HTMLElement,
	colorMap: Map<string, string>,
	categoryCounts: Map<string, number>,
	legendColorMode: string,
	panel: LegendPanel,
	host: LegendHost,
): void {
	if (colorMap.size === 0 || legendColorMode !== "category") return;

	const nodeSection = body.createDiv({ cls: "gi-legend-section" });
	nodeSection.createEl("div", { cls: "gi-legend-section-title", text: t("legend.nodeColors") });
	for (const [label, cssColor] of colorMap) {
		const row = nodeSection.createDiv({
			cls: "gi-legend-item gi-legend-item-clickable",
			attr: { role: "button", tabindex: "0", "aria-label": `Filter: ${label.replace(/^tag:/, "#")}` },
		});
		const dot = row.createDiv({ cls: "gi-legend-color-dot" });
		dot.style.background = cssColor;
		const count = categoryCounts.get(label) ?? 0;
		const displayLabel = label.replace(/^tag:/, "#") + (count > 0 ? ` (${count})` : "");
		row.createEl("span", { cls: "gi-legend-label", text: displayLabel });
		const toggleFilter = () => {
			const field = label.startsWith("tag:") ? label : `category:${label}`;
			panel.searchQuery = panel.searchQuery === field ? "" : field;
			host.invalidateAndRebuild();
			host.requestSave();
		};
		row.addEventListener("click", toggleFilter);
		row.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				toggleFilter();
			}
		});
	}
}

/** Heatmap gradient legend section */
function renderHeatmapSection(body: HTMLElement, legendColorMode: string, host: LegendHost): void {
	if (legendColorMode !== "heatmap") return;

	const hmSection = body.createDiv({ cls: "gi-legend-section" });
	hmSection.createEl("div", { cls: "gi-legend-section-title", text: t("legend.nodeColors") });
	const maxDeg = host.getMaxDegree();
	const stops = [0, 0.25, 0.5, 0.75, 1.0];
	const gradBar = hmSection.createDiv({ cls: "gi-legend-item" });
	gradBar.style.display = "flex";
	gradBar.style.alignItems = "center";
	gradBar.style.gap = "4px";
	gradBar.createEl("span", { cls: "gi-legend-label", text: "0" });
	const bar = gradBar.createDiv();
	bar.style.flex = "1";
	bar.style.height = "10px";
	bar.style.borderRadius = "3px";
	bar.style.background = `linear-gradient(to right, ${stops
		.map((s) => {
			const r = Math.round(59 + s * (239 - 59));
			const g = Math.round(130 - s * (130 - 68));
			const b = Math.round(246 - s * (246 - 68));
			return `rgb(${r},${g},${b})`;
		})
		.join(", ")})`;
	gradBar.createEl("span", { cls: "gi-legend-label", text: String(maxDeg) });
}

/** Community color legend section */
function renderCommunitySection(body: HTMLElement, legendColorMode: string, host: LegendHost): void {
	if (legendColorMode !== "community") return;

	const PALETTE = [
		"#1f77b4",
		"#ff7f0e",
		"#2ca02c",
		"#d62728",
		"#9467bd",
		"#8c564b",
		"#e377c2",
		"#7f7f7f",
		"#bcbd22",
		"#17becf",
		"#aec7e8",
		"#ffbb78",
		"#98df8a",
		"#ff9896",
		"#c5b0d5",
		"#c49c94",
		"#f7b6d2",
		"#c7c7c7",
		"#dbdb8d",
		"#9edae5",
	];
	const legendCommunities = host.getCommunityMap();
	const commCounts = new Map<number, number>();
	for (const cid of legendCommunities.values()) {
		incCounter(commCounts, cid);
	}
	const sortedComms = [...commCounts.entries()].sort((a, b) => b[1] - a[1]);
	if (sortedComms.length > 0) {
		const commSection = body.createDiv({ cls: "gi-legend-section" });
		commSection.createEl("div", {
			cls: "gi-legend-section-title",
			text: `${t("display.nodeColor.community")} (${sortedComms.length})`,
		});
		for (const [cid, count] of sortedComms) {
			const row = commSection.createDiv({ cls: "gi-legend-item" });
			const dot = row.createDiv({ cls: "gi-legend-color-dot" });
			dot.style.background = PALETTE[cid % PALETTE.length];
			row.createEl("span", { cls: "gi-legend-label", text: `Community ${cid + 1} (${count})` });
		}
	}
}

/** Field color legend section */
function renderFieldSection(
	body: HTMLElement,
	colorMap: Map<string, string>,
	legendColorMode: string,
	panel: LegendPanel,
): void {
	if (legendColorMode !== "field" || colorMap.size === 0) return;

	const fieldSection = body.createDiv({ cls: "gi-legend-section" });
	fieldSection.createEl("div", {
		cls: "gi-legend-section-title",
		text: `${panel.nodeColorField || "Field"} (${colorMap.size})`,
	});
	for (const [val, cssColor] of colorMap) {
		const row = fieldSection.createDiv({ cls: "gi-legend-item" });
		const dot = row.createDiv({ cls: "gi-legend-color-dot" });
		dot.style.background = cssColor;
		row.createEl("span", { cls: "gi-legend-label", text: val });
	}
}

/** Edge relation colors legend section */
function renderEdgeRelationSection(
	body: HTMLElement,
	relColors: Map<string, string>,
	panel: LegendPanel,
	host: LegendHost,
): void {
	if (relColors.size === 0 || !panel.colorEdgesByRelation) return;

	const edgeSection = body.createDiv({ cls: "gi-legend-section" });
	edgeSection.createEl("div", { cls: "gi-legend-section-title", text: t("legend.edgeRelations") });
	const edgeTypeToggles: Record<string, { key: string; label: string }> = {
		link: { key: "showLinks", label: "Links" },
		tag: { key: "showTagEdges", label: "Tags" },
		category: { key: "showCategoryEdges", label: "Category" },
		semantic: { key: "showSemanticEdges", label: "Semantic" },
		inheritance: { key: "showInheritance", label: "Inheritance" },
		aggregation: { key: "showAggregation", label: "Aggregation" },
		similar: { key: "showSimilar", label: "Similar" },
		sibling: { key: "showSibling", label: "Sibling" },
		sequence: { key: "showSequence", label: "Sequence" },
	};
	const edgeDashMap: Record<string, string> = {
		semantic: "dotted",
		tag: "dashed",
		"has-tag": "dashed",
		similar: "dotted",
		sequence: "dash-dot",
		sibling: "dotted",
	};
	for (const [rel, cssColor] of relColors) {
		const row = edgeSection.createDiv({
			cls: "gi-legend-item gi-legend-item-clickable",
			attr: { role: "button", tabindex: "0", "aria-label": `Toggle: ${rel}` },
		});
		const dashType = edgeDashMap[rel.toLowerCase()];
		const line = row.createDiv({ cls: "gi-legend-edge-line" });
		line.style.borderTopColor = cssColor;
		if (dashType) line.dataset.dash = dashType;
		const labelEl = row.createEl("span", { cls: "gi-legend-label", text: rel });
		const toggle = edgeTypeToggles[rel.toLowerCase()];
		if (toggle) {
			const isVisible = panel[toggle.key] as boolean;
			if (!isVisible) {
				row.addClass("gi-legend-item-disabled");
				labelEl.textContent = `${rel} ${t("legend.hidden")}`;
			}
			const toggleEdge = () => {
				panel[toggle.key] = !(panel[toggle.key] as boolean);
				invalidateBundleCache();
				host.markDirtyAndRebuildLegend();
				host.requestSave();
			};
			row.addEventListener("click", toggleEdge);
			row.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					toggleEdge();
				}
			});
		}
	}
}

/** Node shapes legend section */
function renderShapeSection(body: HTMLElement, panel: LegendPanel): void {
	if (!panel.nodeShapeRules || panel.nodeShapeRules.length === 0) return;

	const shapeSection = body.createDiv({ cls: "gi-legend-section" });
	shapeSection.createEl("div", { cls: "gi-legend-section-title", text: t("legend.nodeShapes") });
	const shapeLabels: Record<string, string> = {
		circle: "●",
		triangle: "▲",
		square: "■",
		diamond: "◆",
		pentagon: "⬠",
		hexagon: "⬡",
		star: "★",
		cross: "✚",
	};
	for (const rule of panel.nodeShapeRules) {
		const row = shapeSection.createDiv({ cls: "gi-legend-item" });
		const icon = shapeLabels[rule.shape] ?? "●";
		row.createEl("span", { cls: "gi-legend-shape-icon", text: icon });
		const label =
			rule.match === "default"
				? t("legend.shapeDefault")
				: rule.match === "isTag"
					? t("legend.shapeTag")
					: rule.match;
		row.createEl("span", { cls: "gi-legend-label", text: `${icon} ${label}` });
	}
}
