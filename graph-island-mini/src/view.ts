import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { buildGraph } from "./parser";
import {
	layout,
	type LaidOut,
	type PositionedNode,
	type SizedNode,
	type ClusterRect,
} from "./layout";
import type { MiniSettings, GraphNode } from "./types";
import { NONE_BUCKET } from "./types";
import {
	CARD_TITLE_FONT_PX,
	CARD_BODY_FONT_PX,
	CARD_LINE_HEIGHT_PX,
	CARD_BODY_LINE_HEIGHT_PX,
	CARD_PAD_X,
	CARD_PAD_Y,
	CARD_TITLE_BODY_GAP,
	CARD_MIN_W,
	CARD_MAX_W,
	CARD_CELL_W,
	CARD_CELL_H,
	CARD_RADIUS_PX,
} from "./types";
import { type LimitRule, applyLimitRules } from "./limit";
import { filterMemberships, filterLabels } from "./query-filters";
import {
	parseLimitRules as parseLimitRulesFn,
	getSortKey as getSortKeyFn,
	computeDroppedClusters as computeDroppedClustersFn,
} from "./query-pipeline";
import {
	colLetters,
	clusterHue,
	roundedRectPath,
	wrapText,
	truncateToWidth,
} from "./canvas-utils";
import { runAggregateSnap } from "./aggregate-snap";
import {
	drawCardGrid as drawCardGridFn,
	drawGridHeaders as drawGridHeadersFn,
	drawClusterLabels as drawClusterLabelsFn,
	drawAggregateStack as drawAggregateStackFn,
} from "./draw-helpers";
import {
	computeMemberSets,
	computeStrictSupersets,
} from "./cluster-relations";
import {
	resolveNodeDisplay as resolveNodeDisplayFn,
	resolveFromCluster as resolveFromClusterFn,
	visualScale,
	type NodeDisplay,
	type NodeDisplayDeps,
} from "./node-display";

export const VIEW_TYPE_MINI = "graph-island-mini";

const HOVER_DELAY_MS = 350;
const TOOLTIP_OFFSET_X = 14;
const TOOLTIP_OFFSET_Y = -8;

// Internal cache: maps file path → pre-processed body preview (post-frontmatter,
// trimmed). Persists across rebuilds so we don't re-read 2k+ files every time
// metadataCache fires "resolved".
type CardContent = { title: string; body: string; bodyLines: string[]; width: number; height: number };

type HoverTarget =
	| { kind: "node"; nodeId: string }
	| { kind: "cluster"; group: string }
	| null;

export class MiniGraphView extends ItemView {
	private canvas!: HTMLCanvasElement;
	private ctx!: CanvasRenderingContext2D;
	private root!: HTMLElement;
	private laid: LaidOut = {
		nodes: [],
		edges: [],
		clusters: [],
		trunks: [],
		slotW: 0,
		slotH: 0,
		channelW: 0,
		channelH: 0,
	};
	private panX = 0;
	private panY = 0;
	private zoom = 1;
	private dragging = false;
	private lastX = 0;
	private lastY = 0;
	private rafId = 0;
	private resizeObs?: ResizeObserver;
	private hoverTimer = 0;
	private hoverTarget: HoverTarget = null;
	private tipEl: HTMLDivElement | null = null;
	private hoverGen = 0;
	private marqueeEl: HTMLDivElement | null = null;
	private marqueeStart: { sx: number; sy: number } | null = null;
	private marqueeArmed = false;
	private highlightedNodes: Set<string> = new Set();
	private highlightedEdgeIdx: Set<number> = new Set();
	// Clusters to render with accent stroke on hover. Populated from the
	// hovered node's memberships PLUS every connected node's memberships,
	// so aggregate stacks for connected-but-collapsed cards light up too.
	private highlightedClusters: Set<string> = new Set();
	// The primary hovered node id (NOT the set of connected ones). Used to
	// pick outgoing vs incoming edge colours: edge.source === hoveredNodeId
	// is an OUTGOING link (out from this node), edge.target === hoveredNodeId
	// is an INCOMING backlink (into this node).
	private hoveredNodeId: string | null = null;
	private adjacency: Map<string, number[]> = new Map();
	// Drag-to-move (nodes/clusters) was removed; pan/marquee/click-to-open
	// are the only pointer interactions now.
	private bodyCache: Map<string, string> = new Map();
	private cardCache: Map<string, CardContent> = new Map();
	private rebuildGen = 0;
	private clusterLabels: Map<string, string> = new Map();
	private whereError = "";
	private groupByError = "";
	private havingError = "";
	private limitError = "";
	private displayMode: Map<string, "full" | "brief"> = new Map();
	private degreeMap: Map<string, number> = new Map();
	// Per-direction degree counters used by nodeSizeMode = indegree / outdegree.
	// Refreshed every rebuild from data.edges.
	private inDegreeMap: Map<string, number> = new Map();
	private outDegreeMap: Map<string, number> = new Map();
	// trulyAgg from the rebuild's aggregate processing. The draw layer reads
	// this — NOT a recomputed "every membership in aggSet" — so that a node
	// the rebuild considers "effectively aggregated" (e.g. via the parent-
	// cluster skip rule) is also the same set the draw layer hides. Without
	// this single source of truth, draw would still render a node whose
	// footprint the rebuild marked as free, and the aggregate badge would
	// happily land inside it.
	private trulyAggSet: Set<string> = new Set();
	// Cluster-relations cache populated post-layout: each cluster's member
	// id set, plus the list of clusters that are STRICT supersets of it.
	// Used by the per-cluster NODE_DISPLAY resolver to walk the fallback
	// chain (own → inheritFrom → superset → global).
	private clusterMemberSets: Map<string, Set<string>> = new Map();
	private clusterSupersets: Map<string, string[]> = new Map();
	// Per-node resolved NODE_DISPLAY snapshot. Filled once per rebuild from
	// the override chain so cardFor / drawCard don't re-walk it per call.
	private nodeDisplayCache: Map<string, NodeDisplay> = new Map();
	private panelEl: HTMLDivElement | null = null;
	// Current tab in the settings panel. "__all__" = 全体. Otherwise = a
	// cluster groupKey produced by WHERE → GROUP_BY → HAVING.
	private activeTab: string = "__all__";
	// Per-cluster "truly-aggregated" member count. Populated during
	// rebuild() for clusters in aggregatedLayers — the count excludes
	// members that also belong to a non-aggregated cluster (since those
	// stay visible as individual cards). 0 / missing ⇒ no stack drawn.
	private aggregateCount: Map<string, number> = new Map();
	// Substring filter applied to the layer tabs (case-insensitive). Empty
	// string = no filter. Filtering is done via CSS display toggles so the
	// search input never loses focus.
	private tabFilter: string = "";

	constructor(
		leaf: WorkspaceLeaf,
		private settings: MiniSettings,
		private save: () => Promise<void>,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_MINI;
	}
	getDisplayText(): string {
		return "Graph Island Mini";
	}
	getIcon(): string {
		return "git-fork";
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.style.padding = "0";
		root.style.overflow = "hidden";
		root.style.position = "relative";
		this.root = root;

		this.canvas = root.createEl("canvas");
		this.canvas.style.width = "100%";
		this.canvas.style.height = "100%";
		this.canvas.style.display = "block";
		this.canvas.style.cursor = "grab";
		this.ctx = this.canvas.getContext("2d")!;

		this.addAction("square-dashed-mouse-pointer", "Marquee zoom (or Shift+drag)", () => this.armMarquee());
		this.addAction("zoom-in", "Zoom in", () => this.zoomBy(1.4));
		this.addAction("zoom-out", "Zoom out", () => this.zoomBy(1 / 1.4));
		this.addAction("maximize", "Fit to view", () => this.fitToView());

		this.attachInputs();
		this.resizeObs = new ResizeObserver(() => this.resize());
		this.resizeObs.observe(root);

		this.registerEvent(this.app.metadataCache.on("resolved", () => this.rebuild()));
		this.registerEvent(
			this.app.vault.on("create", (f) => {
				if (!(f instanceof TFile)) return;
				this.rebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (f) => {
				if (!(f instanceof TFile)) return;
				this.bodyCache.delete(f.path);
				this.cardCache.delete(f.path);
				this.rebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (f, oldPath) => {
				if (!(f instanceof TFile)) return;
				this.bodyCache.delete(oldPath);
				this.cardCache.delete(oldPath);
				this.rebuild();
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (f) => {
				if (!(f instanceof TFile)) return;
				this.bodyCache.delete(f.path);
				this.cardCache.delete(f.path);
				this.rebuild();
			}),
		);

		this.addAction("sliders-horizontal", "Toggle graph settings", () => this.togglePanel());

		void this.rebuild();
		this.resize();
		if (this.settings.panelVisible) this.renderPanel();
	}

	private togglePanel(): void {
		this.settings.panelVisible = !this.settings.panelVisible;
		void this.save();
		if (this.settings.panelVisible) this.renderPanel();
		else this.tearDownPanel();
	}

	async onClose(): Promise<void> {
		this.resizeObs?.disconnect();
		cancelAnimationFrame(this.rafId);
		this.cancelHover();
		this.tearDownPanel();
	}

	// ---- Settings panel (in-view, Obsidian-core-graph-style) ----

	private tearDownPanel(): void {
		this.panelEl?.remove();
		this.panelEl = null;
	}

	private renderPanel(): void {
		if (!this.settings.panelVisible) {
			this.tearDownPanel();
			return;
		}
		if (!this.panelEl) {
			this.panelEl = this.root.createDiv({ cls: "gim-panel" });
		}
		const el = this.panelEl;
		el.empty();

		const header = el.createDiv({ cls: "gim-panel-header" });
		header.createEl("h3", { text: "Graph settings" });
		const closeBtn = header.createEl("button", { cls: "gim-panel-close", text: "×" });
		closeBtn.setAttr("aria-label", "Close settings");
		closeBtn.addEventListener("click", () => this.togglePanel());

		// Tab bar: 全体 + one tab per cluster produced by WHERE → GROUP_BY →
		// HAVING. If the previously active tab has been filtered out (e.g.
		// the user tightened HAVING and its cluster disappeared), fall back
		// to 全体 silently.
		const validTabs = new Set<string>(["__all__"]);
		for (const c of this.laid.clusters) validTabs.add(c.groupKey);
		if (!validTabs.has(this.activeTab)) this.activeTab = "__all__";

		const tabBar = el.createDiv({ cls: "gim-panel-tabs" });

		// Search filter for layer tabs — only needed when there is at least
		// one cluster tab to filter against. The 全体 tab is always pinned
		// and never hidden by the filter.
		if (this.laid.clusters.length > 0) {
			const filterInput = tabBar.createEl("input", {
				cls: "gim-panel-tab-filter",
				type: "search",
			}) as HTMLInputElement;
			filterInput.setAttribute("placeholder", "Filter layers… (type to search)");
			filterInput.value = this.tabFilter;
			filterInput.addEventListener("input", () => {
				this.tabFilter = filterInput.value;
				this.applyTabFilter();
			});
			// Esc clears the filter without exiting the input.
			filterInput.addEventListener("keydown", (e) => {
				if (e.key === "Escape" && this.tabFilter !== "") {
					e.preventDefault();
					this.tabFilter = "";
					filterInput.value = "";
					this.applyTabFilter();
				}
			});
		}

		const chipsEl = tabBar.createDiv({ cls: "gim-panel-tabs-chips" });
		this.renderTabButton(chipsEl, "__all__", "全体", null, null);
		for (const c of this.laid.clusters) {
			const labelText = `${c.label} (${c.memberCount})`;
			this.renderTabButton(chipsEl, c.groupKey, labelText, clusterHue(c.groupKey), c.label);
		}
		this.applyTabFilter();

		const content = el.createDiv({ cls: "gim-panel-content" });
		if (this.activeTab === "__all__") {
			this.renderAllTab(content);
		} else {
			this.renderLayerTab(content, this.activeTab);
		}
	}

	private renderTabButton(
		bar: HTMLElement,
		key: string,
		label: string,
		hue: number | null,
		filterText: string | null,
	): void {
		const btn = bar.createEl("button", { cls: "gim-panel-tab" });
		if (this.activeTab === key) btn.addClass("active");
		if (hue !== null) {
			const sw = btn.createSpan({ cls: "gim-panel-tab-swatch" });
			sw.style.background = `hsl(${hue}, 70%, 62%)`;
		}
		btn.createSpan({ text: label });
		// filterText = null ⇒ pinned (never filtered, e.g. the 全体 tab).
		if (filterText === null) {
			btn.dataset.alwaysVisible = "1";
		} else {
			btn.dataset.filterText = filterText.toLowerCase();
		}
		btn.addEventListener("click", () => {
			this.activeTab = key;
			this.renderPanel();
		});
	}

	// Hide / show chip buttons via CSS display so the focused filter input
	// stays focused. Substring match (case-insensitive) against the cluster
	// label. The 全体 tab carries data-always-visible=1 and is never hidden.
	// Also reveals the currently-active tab even if it doesn't match the
	// filter, so the user can always see "where they are".
	private applyTabFilter(): void {
		if (!this.panelEl) return;
		const q = this.tabFilter.trim().toLowerCase();
		const chips = this.panelEl.querySelectorAll<HTMLElement>(".gim-panel-tab");
		chips.forEach((btn) => {
			if (btn.dataset.alwaysVisible === "1" || btn.classList.contains("active")) {
				btn.style.display = "";
				return;
			}
			const text = btn.dataset.filterText ?? "";
			btn.style.display = q === "" || text.includes(q) ? "" : "none";
		});
	}

	private renderAllTab(el: HTMLElement): void {
		this.renderExprSection(el, "WHERE", this.settings.where, this.whereError, {
			autoKey: "whereAuto",
		});
		this.renderExprSection(el, "GROUP_BY", this.settings.groupBy, this.groupByError, {
			autoKey: "groupByAuto",
		});
		this.renderExprSection(el, "HAVING", this.settings.having, this.havingError, {
			placeholder: "e.g. count >= 3",
			autoKey: "havingAuto",
		});
		this.renderOrderBySection(el);
		this.renderExprSection(el, "LIMIT", this.settings.limit, this.limitError, {
			placeholder: "limit 10 / brief 30",
			autoKey: "limitAuto",
		});
		this.renderNodeDisplaySection(el);
		this.renderToggleSection(el, "Graph display", [
			{ key: "showEnclosures", label: "Show enclosures" },
			{ key: "showEdges", label: "Show edges" },
			{ key: "showGrid", label: "Show grid" },
		]);
	}

	private renderLayerTab(el: HTMLElement, groupKey: string): void {
		const cluster = this.laid.clusters.find((c) => c.groupKey === groupKey);
		if (!cluster) {
			const hint = el.createDiv({ cls: "gim-panel-hint" });
			hint.setText("This layer no longer exists.");
			return;
		}

		// Header — name, colour, count.
		const head = el.createDiv({ cls: "gim-panel-section" });
		head.createEl("h4", { text: cluster.label });
		const meta = head.createDiv({ cls: "gim-layer-meta" });
		const swatch = meta.createSpan({ cls: "gim-layer-swatch" });
		const hue = clusterHue(cluster.groupKey);
		swatch.style.background = `hsl(${hue}, 70%, 62%)`;
		meta.createSpan({ text: cluster.label });
		meta.createSpan({
			cls: "gim-layer-count",
			text: `${cluster.memberCount} nodes`,
		});

		// Layer-level toggles: aggregate display + inheritance.
		const togs = el.createDiv({ cls: "gim-panel-section" });
		togs.createEl("h4", { text: "Display" });
		this.renderLayerToggle(
			togs,
			"aggregatedLayers",
			groupKey,
			"Aggregate (3-card stack)",
			() => {
				// Aggregation shrinks the cluster bbox down to the stack and
				// reroutes edges/trunks into the stack centre, so a rebuild
				// pass is needed to keep enclosures and wiring in sync.
				void this.rebuild();
			},
		);
		// Inheritance source picker — choose another cluster as the parent.
		// The child cluster's bbox will grow to engulf the parent's bbox so
		// the two visually merge into one nested region.
		const inhRow = togs.createDiv({ cls: "gim-order-row" });
		inhRow.createSpan({ text: "Inherit from", cls: "gim-order-field" });
		const inhSel = inhRow.createEl("select", { cls: "gim-order-dir" }) as HTMLSelectElement;
		const noneOpt = inhSel.createEl("option", { value: "", text: "(none)" });
		const current = this.settings.inheritFrom[groupKey] ?? "";
		if (current === "") noneOpt.selected = true;
		for (const other of this.laid.clusters) {
			if (other.groupKey === groupKey) continue;
			const opt = inhSel.createEl("option", {
				value: other.groupKey,
				text: other.label,
			});
			if (other.groupKey === current) opt.selected = true;
		}
		inhSel.addEventListener("change", () => {
			if (inhSel.value === "") {
				delete this.settings.inheritFrom[groupKey];
			} else {
				this.settings.inheritFrom[groupKey] = inhSel.value;
			}
			void this.save();
			void this.rebuild();
		});

		// Per-cluster NODE_DISPLAY override. Falls back to inheritFrom →
		// strict superset → global when fields are left empty.
		this.renderNodeDisplaySection(el, { groupKey });

		// Per-card visibility list. The user toggles each card individually;
		// bulk Show/Hide buttons at the top operate on the whole layer.
		const cardsSec = el.createDiv({ cls: "gim-panel-section" });
		cardsSec.createEl("h4", { text: "Cards" });

		const layerNodes = this.laid.nodes
			.filter((n) => n.memberships.includes(groupKey))
			.sort((a, b) => a.label.localeCompare(b.label));

		const controls = cardsSec.createDiv({ cls: "gim-layer-cards-controls" });
		const showAllBtn = controls.createEl("button", { text: "Show all" });
		showAllBtn.addEventListener("click", () => {
			for (const n of layerNodes) {
				const i = this.settings.hiddenNodes.indexOf(n.id);
				if (i >= 0) this.settings.hiddenNodes.splice(i, 1);
			}
			void this.save();
			this.renderPanel();
			this.requestDraw();
		});
		const hideAllBtn = controls.createEl("button", { text: "Hide all" });
		hideAllBtn.addEventListener("click", () => {
			for (const n of layerNodes) {
				if (!this.settings.hiddenNodes.includes(n.id)) {
					this.settings.hiddenNodes.push(n.id);
				}
			}
			void this.save();
			this.renderPanel();
			this.requestDraw();
		});

		const list = cardsSec.createDiv({ cls: "gim-layer-cards" });
		for (const n of layerNodes) {
			const row = list.createEl("label", { cls: "gim-toggle-row" });
			const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
			cb.checked = !this.settings.hiddenNodes.includes(n.id);
			cb.addEventListener("change", () => {
				this.toggleArrayMember("hiddenNodes", n.id, !cb.checked);
				void this.save();
				this.requestDraw();
			});
			row.createSpan({ text: n.label });
		}
	}

	// Helper: a labelled checkbox bound to an array-typed MiniSettings field.
	private renderLayerToggle(
		parent: HTMLElement,
		field: "aggregatedLayers",
		groupKey: string,
		label: string,
		onChange: () => void,
	): void {
		const row = parent.createEl("label", { cls: "gim-toggle-row" });
		const cb = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
		cb.checked = this.settings[field].includes(groupKey);
		cb.addEventListener("change", () => {
			this.toggleArrayMember(field, groupKey, cb.checked);
			void this.save();
			onChange();
		});
		row.createSpan({ text: label });
	}

	private toggleArrayMember(
		field: "hiddenNodes" | "aggregatedLayers",
		value: string,
		present: boolean,
	): void {
		const arr = this.settings[field];
		const i = arr.indexOf(value);
		if (present && i === -1) arr.push(value);
		if (!present && i >= 0) arr.splice(i, 1);
	}

	// LAYOUT section: per-cluster anchor placement strategy (concentric ring
	// around the focus cluster vs. flow direction from focus to the right).
	// "Node display" section: body preview toggle + base card size + the
	// size-by-link mode. Changing any size knob triggers a full rebuild
	// because the cell pitch is derived from the base size and the layout
	// has to redo cell snap.
	// Render NODE_DISPLAY controls. With no scope it edits the GLOBAL
	// settings (used in the 全体 tab). With `scope = { groupKey }` it edits
	// `nodeDisplayOverrides[groupKey]` instead, and unset fields fall back
	// through `inheritFrom` source → strict supersets → global, in that
	// priority order.
	private renderNodeDisplaySection(
		parent: HTMLElement,
		scope?: { groupKey: string },
	): void {
		const section = parent.createDiv({ cls: "gim-panel-section" });
		section.createEl("h4", { text: "Node display" });

		const overrideFor = (): {
			nodeRows?: number;
			nodeCols?: number;
			nodeSizeMode?: "fixed" | "indegree" | "outdegree";
		} => {
			if (!scope) return {};
			let ov = this.settings.nodeDisplayOverrides[scope.groupKey];
			if (!ov) {
				ov = {};
				this.settings.nodeDisplayOverrides[scope.groupKey] = ov;
			}
			return ov;
		};
		// In layer scope, look up resolved value (= what the renderer uses)
		// to display as placeholder so the user can see what they'll override.
		const resolvedFor = scope
			? this.resolveFromCluster(scope.groupKey)
			: {
					nodeRows: this.settings.nodeRows,
					nodeCols: this.settings.nodeCols,
					nodeSizeMode: this.settings.nodeSizeMode,
				};

		// "Size (m × n)". For layer scope, empty value means "use inherited".
		const sizeRow = section.createDiv({ cls: "gim-order-row" });
		sizeRow.createSpan({ text: "Size (m × n)", cls: "gim-order-field" });
		const mIn = sizeRow.createEl("input", { type: "number" }) as HTMLInputElement;
		const nIn = (() => {
			sizeRow.createSpan({ text: "×" });
			return sizeRow.createEl("input", { type: "number" }) as HTMLInputElement;
		})();
		mIn.min = nIn.min = "1";
		mIn.max = nIn.max = "8";
		mIn.step = nIn.step = "1";
		mIn.style.width = nIn.style.width = "50px";
		if (scope) {
			const ov = this.settings.nodeDisplayOverrides[scope.groupKey];
			mIn.value = ov?.nodeRows !== undefined ? String(ov.nodeRows) : "";
			nIn.value = ov?.nodeCols !== undefined ? String(ov.nodeCols) : "";
			mIn.placeholder = String(resolvedFor.nodeRows);
			nIn.placeholder = String(resolvedFor.nodeCols);
		} else {
			mIn.value = String(this.settings.nodeRows);
			nIn.value = String(this.settings.nodeCols);
		}
		const applySize = (): void => {
			const m = parseInt(mIn.value, 10);
			const n = parseInt(nIn.value, 10);
			if (scope) {
				const ov = overrideFor();
				if (Number.isFinite(m) && m >= 1 && m <= 8) ov.nodeRows = m;
				else delete ov.nodeRows;
				if (Number.isFinite(n) && n >= 1 && n <= 8) ov.nodeCols = n;
				else delete ov.nodeCols;
				if (
					ov.nodeRows === undefined &&
					ov.nodeCols === undefined &&
					ov.nodeSizeMode === undefined
				) {
					delete this.settings.nodeDisplayOverrides[scope.groupKey];
				}
			} else {
				if (Number.isFinite(m) && m >= 1 && m <= 12) this.settings.nodeRows = m;
				if (Number.isFinite(n) && n >= 1 && n <= 12) this.settings.nodeCols = n;
			}
			this.cardCache.clear();
			void this.save();
			void this.rebuild();
		};
		mIn.addEventListener("change", applySize);
		nIn.addEventListener("change", applySize);

		const modeRow = section.createDiv({ cls: "gim-order-row" });
		modeRow.createSpan({ text: "Size by", cls: "gim-order-field" });
		const sel = modeRow.createEl("select", { cls: "gim-order-dir" }) as HTMLSelectElement;
		if (scope) {
			sel.createEl("option", {
				value: "",
				text: `Inherited (${this.formatSizeMode(resolvedFor.nodeSizeMode)})`,
			});
		}
		for (const opt of [
			{ v: "fixed", t: "Fixed" },
			{ v: "indegree", t: "Incoming links" },
			{ v: "outdegree", t: "Outgoing links" },
		]) {
			sel.createEl("option", { value: opt.v, text: opt.t });
		}
		if (scope) {
			const ov = this.settings.nodeDisplayOverrides[scope.groupKey];
			sel.value = ov?.nodeSizeMode ?? "";
		} else {
			sel.value = this.settings.nodeSizeMode;
		}
		sel.addEventListener("change", () => {
			if (scope) {
				const ov = overrideFor();
				if (sel.value === "") delete ov.nodeSizeMode;
				else
					ov.nodeSizeMode = sel.value as
						| "fixed"
						| "indegree"
						| "outdegree";
				if (
					ov.nodeRows === undefined &&
					ov.nodeCols === undefined &&
					ov.nodeSizeMode === undefined
				) {
					delete this.settings.nodeDisplayOverrides[scope.groupKey];
				}
			} else {
				this.settings.nodeSizeMode = sel.value as MiniSettings["nodeSizeMode"];
			}
			this.cardCache.clear();
			void this.save();
			void this.rebuild();
		});
	}

	private formatSizeMode(m: "fixed" | "indegree" | "outdegree"): string {
		return m === "fixed" ? "Fixed" : m === "indegree" ? "Incoming" : "Outgoing";
	}

	// Resolve a cluster's "rendered" NODE_DISPLAY (= what the inheritance
	// chain produces when this cluster has no override) so the per-layer
	// panel can show it as placeholder text and the user can tell what
	// they're overriding.
	private resolveFromCluster(groupKey: string): NodeDisplay {
		return resolveFromClusterFn(groupKey, this.nodeDisplayDeps());
	}

	// ORDER_BY is a scalar (single field + direction) rather than an array of
	// rows, so it gets a dedicated UI: two selects plus an optional text input
	// that appears only when the user picks "custom..." for an arbitrary
	// frontmatter field.
	private renderOrderBySection(parent: HTMLElement): void {
		const section = parent.createDiv({ cls: "gim-panel-section" });
		const header = section.createDiv({ cls: "gim-panel-section-header" });
		header.createEl("h4", { text: "ORDER_BY" });

		const row = section.createDiv({ cls: "gim-order-row" });
		// Built-in fields grouped by source so the dropdown reads like a menu.
		const GROUPS: { label: string; opts: { value: string; text: string }[] }[] = [
			{
				label: "File",
				opts: [
					{ value: "name", text: "name" },
					{ value: "path", text: "path" },
					{ value: "extension", text: "extension" },
					{ value: "mtime", text: "modified" },
					{ value: "ctime", text: "created" },
					{ value: "size", text: "size" },
				],
			},
			{
				label: "Graph",
				opts: [
					{ value: "degree", text: "degree (links)" },
					{ value: "memberships", text: "memberships (cluster count)" },
				],
			},
			{
				label: "Frontmatter",
				opts: [{ value: "title", text: "title" }],
			},
			{
				label: "Other",
				opts: [{ value: "random", text: "random" }],
			},
		];
		const KNOWN = new Set<string>();
		for (const g of GROUPS) for (const o of g.opts) KNOWN.add(o.value);
		const isCustom = !KNOWN.has(this.settings.orderField);

		const fieldSel = row.createEl("select", { cls: "gim-order-field" });
		for (const g of GROUPS) {
			const grp = fieldSel.createEl("optgroup");
			grp.setAttr("label", g.label);
			for (const o of g.opts) {
				const opt = grp.createEl("option", { value: o.value, text: o.text });
				if (!isCustom && this.settings.orderField === o.value) opt.selected = true;
			}
		}
		const customOpt = fieldSel.createEl("option", { value: "__custom__", text: "custom frontmatter…" });
		if (isCustom) customOpt.selected = true;

		const customInput = row.createEl("input", { type: "text", cls: "gim-order-custom" });
		customInput.value = isCustom ? this.settings.orderField : "";
		customInput.placeholder = "frontmatter field";
		customInput.style.display = isCustom ? "" : "none";

		fieldSel.addEventListener("change", () => {
			if (fieldSel.value === "__custom__") {
				customInput.style.display = "";
				customInput.focus();
				this.settings.orderField = customInput.value.trim() || "name";
			} else {
				customInput.style.display = "none";
				this.settings.orderField = fieldSel.value;
			}
			void this.save();
		});
		customInput.addEventListener("change", () => {
			const v = customInput.value.trim();
			this.settings.orderField = v || "name";
			void this.save();
		});

		const dirSel = row.createEl("select", { cls: "gim-order-dir" });
		for (const d of ["asc", "desc"] as const) {
			const opt = dirSel.createEl("option", { value: d, text: d });
			if (this.settings.orderDir === d) opt.selected = true;
		}
		dirSel.addEventListener("change", () => {
			this.settings.orderDir = dirSel.value as "asc" | "desc";
			void this.save();
		});
	}

	private renderToggleSection(
		parent: HTMLElement,
		heading: string,
		toggles: {
			key: "showBody" | "showEnclosures" | "showEdges" | "showGrid";
			label: string;
		}[],
	): void {
		const section = parent.createDiv({ cls: "gim-panel-section" });
		section.createEl("h4", { text: heading });
		for (const t of toggles) {
			const row = section.createEl("label", { cls: "gim-toggle-row" });
			const cb = row.createEl("input", { type: "checkbox" });
			cb.checked = this.settings[t.key];
			cb.addEventListener("change", () => {
				this.settings[t.key] = cb.checked;
				void this.save();
			});
			row.createSpan({ text: t.label });
		}
	}

	private renderExprSection(
		parent: HTMLElement,
		label: string,
		rows: string[],
		error: string,
		opts: {
			placeholder?: string;
			autoKey?: "whereAuto" | "groupByAuto" | "havingAuto" | "limitAuto";
		} = {},
	): void {
		const section = parent.createDiv({ cls: "gim-panel-section" });
		const header = section.createDiv({ cls: "gim-panel-section-header" });
		header.createEl("h4", { text: label });
		if (opts.autoKey) {
			const autoLabel = header.createEl("label", { cls: "gim-auto-toggle" });
			const cb = autoLabel.createEl("input", { type: "checkbox" });
			const key = opts.autoKey;
			cb.checked = this.settings[key];
			cb.addEventListener("change", () => {
				this.settings[key] = cb.checked;
				void this.save();
			});
			autoLabel.createSpan({ text: "auto" });
		}

		// Ensure at least one editable row is shown so users can type into it.
		const displayRows = rows.length > 0 ? rows : [""];
		const placeholder = opts.placeholder ?? "e.g. tag:#wip AND status:draft";

		displayRows.forEach((value, idx) => {
			const row = section.createDiv({ cls: "gim-expr-row" });
			const input = row.createEl("input", { type: "text", cls: "gim-expr" });
			input.value = value;
			input.placeholder = placeholder;
			input.spellcheck = false;
			input.addEventListener("change", () => {
				this.updateRow(rows, idx, input.value.trim());
			});
			const del = row.createEl("button", { cls: "gim-expr-del", text: "×" });
			del.setAttr("aria-label", "Remove row");
			del.disabled = rows.length === 0;
			del.addEventListener("click", () => this.removeRow(rows, idx));
		});

		const addBtn = section.createEl("button", { cls: "gim-expr-add", text: "+ Add row" });
		addBtn.addEventListener("click", () => this.addRow(rows));

		if (error) section.createDiv({ cls: "gim-expr-msg", text: error });
	}

	private updateRow(rows: string[], idx: number, value: string): void {
		// Re-materialize: a blank value should disappear so empty rows don't
		// silently pile up in the saved settings.
		if (rows.length === 0) {
			if (value) rows.push(value);
		} else {
			if (value) rows[idx] = value;
			else rows.splice(idx, 1);
		}
		void this.save();
	}

	private addRow(rows: string[]): void {
		rows.push("");
		this.renderPanel();
	}

	private removeRow(rows: string[], idx: number): void {
		if (rows.length === 0) return;
		rows.splice(idx, 1);
		void this.save();
	}

	updateSettings(s: MiniSettings): void {
		const sizingChanged =
			s.cardMaxChars !== this.settings.cardMaxChars ||
			s.showBody !== this.settings.showBody;
		this.settings = s;
		if (sizingChanged) this.cardCache.clear();
		void this.rebuild();
	}

	private async rebuild(): Promise<void> {
		const gen = ++this.rebuildGen;
		// AUTO augmentation: manual rows are absolute (always kept). When the
		// matching auto flag is on, append computed rows that AND-combine with
		// the manual ones. The user can disable auto per section.
		let effGroupBy = [...this.settings.groupBy];
		if (
			this.settings.groupByAuto &&
			!effGroupBy.some((r) => r.trim().length > 0)
		) {
			effGroupBy = ["tag:*"];
		}
		let effWhere = [...this.settings.where];
		if (this.settings.whereAuto) {
			for (const r of effGroupBy) {
				if (r.trim().length > 0) effWhere.push(r);
			}
		}
		const { result, errors } = buildGraph(this.app, effWhere, effGroupBy);
		this.whereError = errors.where ?? "";
		this.groupByError = errors.groupBy ?? "";
		let { data, clusterLabels } = result;

		// Compute the effective HAVING after WHERE/GROUP_BY have produced
		// node counts so auto thresholds can scale with data size.
		let effHaving = [...this.settings.having];
		if (this.settings.havingAuto) {
			const n = data.nodes.length;
			if (n > 10) {
				const floor = Math.max(2, Math.floor(Math.sqrt(n) / 3));
				effHaving.push(`count >= ${floor}`);
			}
			if (n > 30) {
				// Tighter ceiling so single mega-clusters can't dominate the view.
				const ceiling = Math.floor(n * 0.2);
				effHaving.push(`count <= ${ceiling}`);
			}
		}

		// Apply HAVING BEFORE layout so dropped clusters are removed from each
		// node's memberships and the layout repositions nodes around only the
		// surviving clusters. Files whose ONLY membership was dropped fall back
		// to the NONE_BUCKET cluster.
		const dropped = this.computeDroppedClusters(data.nodes, effHaving);
		if (dropped.size > 0) {
			data = filterMemberships(data, dropped);
			clusterLabels = filterLabels(clusterLabels, dropped);
		}
		this.clusterLabels = clusterLabels;

		// Pre-compute degree (number of incident edges) per node so the
		// "degree" sort field can be resolved in O(1) during ORDER_BY. Also
		// compute directional in/out degree counters used by nodeSizeMode.
		this.degreeMap.clear();
		this.inDegreeMap.clear();
		this.outDegreeMap.clear();
		for (const e of data.edges) {
			this.degreeMap.set(e.source, (this.degreeMap.get(e.source) ?? 0) + 1);
			this.degreeMap.set(e.target, (this.degreeMap.get(e.target) ?? 0) + 1);
			this.outDegreeMap.set(e.source, (this.outDegreeMap.get(e.source) ?? 0) + 1);
			this.inDegreeMap.set(e.target, (this.inDegreeMap.get(e.target) ?? 0) + 1);
		}
		// LIMIT: filter visible nodes per cluster + assign display modes,
		// using the standalone ORDER_BY field/direction as sort criterion.
		const limitTiers = this.parseLimitRules();
		const { visibleNodes, modes } = applyLimitRules(
			data.nodes,
			limitTiers,
			this.settings.orderField,
			this.settings.orderDir,
			(id, field) => this.getSortKey(id, field),
		);
		this.displayMode = modes;
		data = {
			nodes: visibleNodes,
			edges: data.edges.filter(
				(e) =>
					modes.has(e.source) &&
					modes.has(e.target),
			),
		};

		await this.ensureBodies(data.nodes);
		if (gen !== this.rebuildGen) return;

		// Card sizes are determined by the user-configured base node size
		// (m × n in settings) plus an optional scale factor when sizeMode
		// varies by link count. The lattice pitch is the BASE size, so
		// fixed-mode cards fit exactly while link-scaled cards may stick
		// out beyond their cell.
		// Cluster relations needed by the per-cluster NODE_DISPLAY resolver:
		// build each cluster's member id set + each cluster's strict-superset
		// list against the *current* (post-LIMIT) data so cardFor can walk
		// the override chain.
		this.recomputeClusterRelations(data.nodes);
		this.recomputeNodeDisplayCache(data.nodes);

		// Card sizes derive from the user-configured row × column span
		// times the canonical CARD_CELL_W × CARD_CELL_H lattice step, with
		// an optional degree-driven scale that preserves the m : n aspect.
		const sized = data.nodes.map((n) => this.cardFor(n));
		const wasEmpty = this.laid.clusters.length === 0;
		this.laid = layout(data, sized, {
			clusterSpacing: this.settings.clusterSpacing,
			nodeSpacing: this.settings.nodeSpacing,
			cellW: CARD_CELL_W,
			cellH: CARD_CELL_H,
			clusterLabels,
			anchorPlacement: this.settings.anchorPlacement,
		});
		this.adjacency = new Map();
		this.laid.edges.forEach((e, i) => {
			// Every edge (bundled or not) carries the underlying source/target
			// node IDs now, so the adjacency map can be built uniformly.
			const sa = this.adjacency.get(e.source);
			if (sa) sa.push(i); else this.adjacency.set(e.source, [i]);
			const ta = this.adjacency.get(e.target);
			if (ta) ta.push(i); else this.adjacency.set(e.target, [i]);
		});
		// Aggregate-snap: trulyAgg detection, badge cell selection, edge
		// re-routing through stack centres. Mutates this.laid.clusters
		// (sets each aggregated cluster's bbox to its 1-slot badge box)
		// and this.laid.edges (rewrites paths through aggregate centres).
		const aggResult = runAggregateSnap(this.laid, {
			aggregatedLayers: this.settings.aggregatedLayers,
			hiddenNodes: this.settings.hiddenNodes,
			inheritFrom: this.settings.inheritFrom ?? {},
		});
		this.trulyAggSet = aggResult.trulyAgg;
		this.aggregateCount = aggResult.aggregateCount;

		// Inheritance: each child cluster picks a parent (継承元) explicitly
		// via the panel. The child's bbox grows to engulf the parent's bbox
		// so the parent visually "joins" the child territory. Pre-snapshot
		// the original bboxes so a chain (A → B → C) all references its
		// pre-merge sibling, never the already-expanded version.
		const inhMap = this.settings.inheritFrom ?? {};
		const inhKeys = Object.keys(inhMap);
		if (inhKeys.length > 0) {
			const original = new Map<string, { x: number; y: number; w: number; h: number }>();
			for (const c of this.laid.clusters) {
				original.set(c.groupKey, { x: c.x, y: c.y, w: c.width, h: c.height });
			}
			for (const child of this.laid.clusters) {
				const parentKey = inhMap[child.groupKey];
				if (!parentKey || parentKey === child.groupKey) continue;
				const p = original.get(parentKey);
				if (!p) continue;
				const minX = Math.min(child.x, p.x);
				const minY = Math.min(child.y, p.y);
				const maxX = Math.max(child.x + child.width, p.x + p.w);
				const maxY = Math.max(child.y + child.height, p.y + p.h);
				child.x = minX;
				child.y = minY;
				child.width = maxX - minX;
				child.height = maxY - minY;
			}
		}
		this.highlightedNodes.clear();
		this.highlightedEdgeIdx.clear();
		if (wasEmpty) this.fitToView();
		this.requestDraw();
		if (this.settings.panelVisible) this.renderPanel();
	}

	// Build the effective LIMIT rule list by parsing manual rows + filling in
	// missing slots with auto defaults when `limitAuto` is on. Manual rows are
	// always respected; auto only adds rules of kinds the user didn't specify.
	private parseLimitRules(): LimitRule[] {
		const { tiers, errors } = parseLimitRulesFn(this.settings);
		this.limitError = errors.length > 0 ? errors.join("; ") : "";
		return tiers;
	}

	private getSortKey(id: string, field: string): string | number {
		return getSortKeyFn(id, field, {
			app: this.app,
			degreeMap: this.degreeMap,
			membershipsOf: (id) =>
				this.laid.nodes.find((n) => n.id === id)?.memberships,
		});
	}

	private computeDroppedClusters(
		nodes: GraphNode[],
		rawRows: string[],
	): Set<string> {
		const { dropped, errors } = computeDroppedClustersFn(
			nodes,
			rawRows,
			this.settings.havingAuto,
		);
		this.havingError = errors.length > 0 ? errors.join("; ") : "";
		return dropped;
	}

	private async ensureBodies(nodes: GraphNode[]): Promise<void> {
		const missing = nodes.filter((n) => !this.bodyCache.has(n.id));
		if (missing.length === 0) return;
		await Promise.all(
			missing.map(async (n) => {
				const f = this.app.vault.getAbstractFileByPath(n.id);
				if (!(f instanceof TFile)) {
					this.bodyCache.set(n.id, "");
					return;
				}
				try {
					const raw = await this.app.vault.cachedRead(f);
					const stripped = raw.replace(/^---[\s\S]*?---\n?/, "").trim();
					this.bodyCache.set(n.id, stripped);
				} catch {
					this.bodyCache.set(n.id, "");
				}
			}),
		);
	}

	// Shared visual scale factor. ALL per-card metrics — pixel size,
	// font size, padding, stroke, text wrap width, body line count —
	// derive from this single value so cluster overrides change them
	// together instead of size scaling while font stays at 12 px.
	private getCardScale(nodeId: string): number {
		const display = this.getNodeDisplay(nodeId);
		const scaleFactor = this.computeSizeScale(nodeId, display.nodeSizeMode);
		return visualScale(display, scaleFactor, {
			nodeRows: this.settings.nodeRows,
			nodeCols: this.settings.nodeCols,
			nodeSizeMode: this.settings.nodeSizeMode,
		});
	}

	private cardFor(n: GraphNode): SizedNode {
		const display = this.getNodeDisplay(n.id);
		const scaleFactor = this.computeSizeScale(n.id, display.nodeSizeMode);
		const rows = Math.max(1, display.nodeRows);
		const cols = Math.max(1, display.nodeCols);
		const channelW = Math.max(8, this.settings.nodeSpacing);
		const channelH = Math.max(1, (channelW * CARD_CELL_H) / CARD_CELL_W);
		const slotW = CARD_CELL_W + channelW;
		const slotH = CARD_CELL_H + channelH;
		const effC = cols * scaleFactor;
		const effR = rows * scaleFactor;
		const width = effC * slotW - channelW;
		const height = effR * slotH - channelH;
		const scale = this.getCardScale(n.id);
		const mode = this.displayMode.get(n.id) ?? "full";
		const cacheKey = `${n.id}:${mode}:${scale.toFixed(4)}`;
		const cached = this.cardCache.get(cacheKey);
		if (!cached || cached.title !== n.label) {
			const body = (this.bodyCache.get(n.id) ?? "").slice(
				0,
				this.settings.cardMaxChars,
			);
			this.cardCache.set(
				cacheKey,
				this.measureCard(n.label, body, mode, width, height, scale),
			);
		}
		return { ...n, width, height };
	}

	private computeSizeScale(
		nodeId: string,
		mode?: "fixed" | "indegree" | "outdegree",
	): number {
		const m = mode ?? this.settings.nodeSizeMode;
		if (m === "fixed") return 1;
		const map = m === "indegree" ? this.inDegreeMap : this.outDegreeMap;
		const deg = map.get(nodeId) ?? 0;
		// (linkCount + 1) × base. 0 links ⇒ initial size; each additional
		// link adds another full multiple. Aspect ratio is preserved
		// because both axes multiply by the same scale. Cap at 4× because
		// (a) larger caps blow up the cell-snap spiral on huge vaults and
		// (b) the bigger a hub card grows the wider its sub-group becomes,
		// which inflates the global stride and forces every other cluster
		// further apart, leaving large empty regions inside multi-membership
		// cluster bboxes.
		return Math.min(4, deg + 1);
	}

	// Build cluster_key → member_id_set and cluster_key → strict_superset
	// keys. Called once per rebuild so the override resolver can walk the
	// "own → inheritFrom → superset → global" chain in O(1) lookups.
	private recomputeClusterRelations(nodes: GraphNode[]): void {
		this.clusterMemberSets = computeMemberSets(nodes);
		this.clusterSupersets = computeStrictSupersets(this.clusterMemberSets);
	}

	private nodeDisplayDeps(): NodeDisplayDeps {
		return {
			overrides: this.settings.nodeDisplayOverrides,
			inheritFrom: this.settings.inheritFrom,
			supersetsOf: this.clusterSupersets,
			defaults: {
				nodeRows: this.settings.nodeRows,
				nodeCols: this.settings.nodeCols,
				nodeSizeMode: this.settings.nodeSizeMode,
			},
		};
	}

	private resolveNodeDisplay(n: GraphNode): NodeDisplay {
		return resolveNodeDisplayFn(n, this.nodeDisplayDeps());
	}

	private recomputeNodeDisplayCache(nodes: GraphNode[]): void {
		this.nodeDisplayCache.clear();
		const deps = this.nodeDisplayDeps();
		for (const n of nodes) {
			this.nodeDisplayCache.set(n.id, resolveNodeDisplayFn(n, deps));
		}
	}

	private getNodeDisplay(nodeId: string): NodeDisplay {
		return (
			this.nodeDisplayCache.get(nodeId) ?? {
				nodeRows: this.settings.nodeRows,
				nodeCols: this.settings.nodeCols,
				nodeSizeMode: this.settings.nodeSizeMode,
			}
		);
	}

	private measureCard(
		title: string,
		body: string,
		mode: "full" | "brief" = "full",
		cardW: number = CARD_CELL_W,
		cardH: number = CARD_CELL_H,
		scale: number = 1,
	): CardContent {
		const ctx = this.ctx;
		// Wrap text at the BASE font (= 10 px). At render time everything
		// scales by `scale`, so wrap_width × scale must fit card_inner_w
		// (= cardW − 2·padX·scale). Solve for wrap_width:
		//   wrap_width = cardW/scale − 2·padX
		// Same idea for the vertical body budget — convert the card's
		// scaled space back into base-font units before counting lines.
		const wrapWidth = Math.max(8, cardW / scale - 2 * CARD_PAD_X);
		const innerHBase = cardH / scale - 2 * CARD_PAD_Y;
		const availBodyBase = innerHBase - CARD_LINE_HEIGHT_PX - CARD_TITLE_BODY_GAP;
		const maxLines = Math.max(
			0,
			Math.floor(availBodyBase / CARD_BODY_LINE_HEIGHT_PX),
		);
		const effectiveBody = mode === "brief" || !this.settings.showBody ? "" : body;
		ctx.font = `${CARD_BODY_FONT_PX}px sans-serif`;
		const allLines = effectiveBody ? wrapText(ctx, effectiveBody, wrapWidth) : [];
		const bodyLines = allLines.slice(0, maxLines);
		return {
			title,
			body,
			bodyLines,
			width: cardW,
			height: cardH,
		};
	}

	private resize(): void {
		const dpr = window.devicePixelRatio || 1;
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		this.canvas.width = Math.max(1, Math.floor(w * dpr));
		this.canvas.height = Math.max(1, Math.floor(h * dpr));
		this.requestDraw();
	}

	private zoomBy(factor: number): void {
		const rect = this.canvas.getBoundingClientRect();
		const sx = rect.width / 2;
		const sy = rect.height / 2;
		const next = Math.max(0.005, Math.min(8, this.zoom * factor));
		const wx = (sx - this.panX) / this.zoom;
		const wy = (sy - this.panY) / this.zoom;
		this.zoom = next;
		this.panX = sx - wx * next;
		this.panY = sy - wy * next;
		this.cancelHover();
		this.requestDraw();
	}

	private fitToRect(world: { minX: number; minY: number; maxX: number; maxY: number }): void {
		const w = this.canvas.clientWidth;
		const h = this.canvas.clientHeight;
		const pad = 24;
		const dw = Math.max(1, world.maxX - world.minX);
		const dh = Math.max(1, world.maxY - world.minY);
		const z = Math.min((w - 2 * pad) / dw, (h - 2 * pad) / dh);
		this.zoom = Math.min(8, Math.max(0.005, z));
		this.panX = w / 2 - ((world.minX + world.maxX) / 2) * this.zoom;
		this.panY = h / 2 - ((world.minY + world.maxY) / 2) * this.zoom;
		this.cancelHover();
		this.requestDraw();
	}

	private fitToView(): void {
		if (this.laid.clusters.length === 0) return;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const c of this.laid.clusters) {
			minX = Math.min(minX, c.x);
			minY = Math.min(minY, c.y);
			maxX = Math.max(maxX, c.x + c.width);
			maxY = Math.max(maxY, c.y + c.height);
		}
		// Cards stay visible even when no enclosure surrounds them (e.g. files
		// that landed in NONE_BUCKET after HAVING dropped their only cluster).
		for (const n of this.laid.nodes) {
			minX = Math.min(minX, n.x - n.width / 2);
			minY = Math.min(minY, n.y - n.height / 2);
			maxX = Math.max(maxX, n.x + n.width / 2);
			maxY = Math.max(maxY, n.y + n.height / 2);
		}
		if (!isFinite(minX)) return;
		// The settings panel overlays the right side of the canvas without
		// pushing it, so subtract its width from the effective fit area and
		// centre against the visible half.
		const panelW = this.settings.panelVisible && this.panelEl ? this.panelEl.offsetWidth : 0;
		const visW = Math.max(1, this.canvas.clientWidth - panelW);
		const visH = this.canvas.clientHeight;
		// Reserve canvas-pixel padding (zoom-independent). Top gets extra room
		// for cluster labels which sit ~20 canvas px above each enclosure.
		const padX = 20;
		const padTop = 36;
		const padBottom = 20;
		const fitW = Math.max(1, visW - 2 * padX);
		const fitH = Math.max(1, visH - padTop - padBottom);
		const zx = fitW / Math.max(1, maxX - minX);
		const zy = fitH / Math.max(1, maxY - minY);
		// Min floor is intentionally very low so huge vaults still fit on
		// screen; the user can zoom in interactively as needed.
		this.zoom = Math.min(2, Math.max(0.005, Math.min(zx, zy)));
		const worldCenterX = (minX + maxX) / 2;
		const worldCenterY = (minY + maxY) / 2;
		this.panX = padX + fitW / 2 - worldCenterX * this.zoom;
		this.panY = padTop + fitH / 2 - worldCenterY * this.zoom;
		this.requestDraw();
	}

	// Clamp panX/panY so the area to the LEFT of column A or ABOVE row 1 can
	// never be revealed. The header band occupies the first headerW × headerH
	// screen pixels; the body must start at exactly worldX = minCol*W (the
	// left edge of column A) at screen x = headerW. That gives the upper-
	// bound constraint panX ≤ headerW − minCol*W*zoom. Same logic for Y.
	private clampPan(): void {
		if (!this.settings.showGrid) return;
		if (this.laid.nodes.length === 0) return;
		const W = this.laid.slotW;
		const H = this.laid.slotH;
		if (W <= 0 || H <= 0) return;

		let cardMinCol = Infinity;
		let cardMinRow = Infinity;
		for (const n of this.laid.nodes) {
			// Use card FOOTPRINT (multi-cell for scaled cards), not just the
			// centre cell, so the pan clamp accounts for the full extent.
			const colSpan = Math.max(1, Math.ceil(n.width / W));
			const rowSpan = Math.max(1, Math.ceil(n.height / H));
			const col = Math.round(n.x / W - colSpan / 2);
			const row = Math.round(n.y / H - rowSpan / 2);
			if (col < cardMinCol) cardMinCol = col;
			if (row < cardMinRow) cardMinRow = row;
		}
		// Grid origin sits ONE cell to the left/above the leftmost / topmost
		// card so column A and row 1 stay reserved-empty.
		const minColIdx = cardMinCol - 1;
		const minRowIdx = cardMinRow - 1;

		const cellScreenW = W * this.zoom;
		const cellScreenH = H * this.zoom;
		const headerH = Math.max(22, Math.min(36, cellScreenH * 0.9));
		const headerW = Math.max(32, Math.min(56, cellScreenW * 0.7));

		const maxPanX = headerW - minColIdx * W * this.zoom;
		const maxPanY = headerH - minRowIdx * H * this.zoom;
		if (this.panX > maxPanX) this.panX = maxPanX;
		if (this.panY > maxPanY) this.panY = maxPanY;
	}

	private requestDraw(): void {
		this.clampPan();
		cancelAnimationFrame(this.rafId);
		this.rafId = requestAnimationFrame(() => this.draw());
	}

	private draw(): void {
		const ctx = this.ctx;
		const dpr = window.devicePixelRatio || 1;
		const cw = this.canvas.width;
		const ch = this.canvas.height;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = "#0f1116";
		ctx.fillRect(0, 0, cw, ch);
		// If the filter pipeline (WHERE / HAVING / LIMIT) eliminated every
		// node, draw a hint instead of an empty canvas. This makes the cause
		// of the blank view discoverable instead of mysterious.
		if (this.laid.nodes.length === 0) {
			ctx.fillStyle = "#7a8aa0";
			ctx.font = `${14 * dpr}px sans-serif`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(
				"No nodes match current filters — relax WHERE / HAVING / LIMIT or check the GROUP_BY expression.",
				cw / 2,
				ch / 2,
			);
			return;
		}
		ctx.setTransform(dpr * this.zoom, 0, 0, dpr * this.zoom, dpr * this.panX, dpr * this.panY);

		// Excel-style row/column underlay. Drawn first so enclosures, edges,
		// trunks, and cards all sit on top. Cells follow card geometry and
		// ignore the cluster bounding boxes by design.
		if (this.settings.showGrid) {
			this.drawCardGrid(ctx);
		}

		// Outline-only enclosures: stroke colours are hue-distinct so the
		// boundaries stay readable when clusters overlap or nest. ONE
		// rectangle per cluster (= no splitting into per-cell outlines)
		// because users expect a single contiguous enclosure.
		if (this.settings.showEnclosures) {
			const sortedClusters = [...this.laid.clusters].sort(
				(a, b) => b.width * b.height - a.width * a.height,
			);
			const strokeW = 1.6 / this.zoom;
			const accentStrokeW = 3.2 / this.zoom;
			for (const c of sortedClusters) {
				const hue = clusterHue(c.groupKey);
				const isHigh = this.highlightedClusters.has(c.groupKey);
				ctx.strokeStyle = isHigh
					? "#ff9d3f"
					: `hsla(${hue}, 70%, 62%, 0.9)`;
				ctx.lineWidth = isHigh ? accentStrokeW : strokeW;
				ctx.strokeRect(c.x, c.y, c.width, c.height);
			}
		}

		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		const hasHighlight = this.highlightedEdgeIdx.size > 0;
		const dim = "rgba(180,200,220,0.10)";
		const line = "rgba(180,200,220,0.55)";
		// Forward (outgoing link) = warm orange. Backlink (incoming) = cool
		// cyan-blue. Same node connected by both gets coloured per edge,
		// not per pair, so the user can tell which direction is which.
		const accentOut = "#ff9d3f";
		const glowOut = "rgba(255,157,63,0.35)";
		const accentIn = "#3fbfff";
		const glowIn = "rgba(63,191,255,0.35)";

		// Per-layer card visibility / aggregation. Hidden node IDs come from
		// the layer tabs' card-list checkboxes. Aggregated clusters replace
		// their member cards with a single 3-card diagonal stack at the
		// cluster centre. A node only becomes "aggregated-hidden" when ALL
		// of its memberships are aggregated layers — otherwise it still
		// belongs to a non-aggregated cluster and must remain visible there.
		const hiddenSet = new Set(this.settings.hiddenNodes);
		// Reuse the trulyAgg set computed during rebuild — the same set the
		// aggregate-snap loop uses for reserving footprints. Recomputing a
		// looser "every membership in aggSet" check here would create an
		// inconsistency: a node the rebuild treats as aggregated (= no
		// footprint in occupied) might still be drawn here, and the
		// aggregate badge would land inside it.
		const skipNode = (id: string): boolean =>
			hiddenSet.has(id) || this.trulyAggSet.has(id);

		// Layer 1: all edges as thin LINEs. Every node-touching connection
		// uses this uniform single-line style regardless of bundling.
		if (this.settings.showEdges) {
			const lineW = 0.7 / this.zoom;
			ctx.lineWidth = lineW;
			this.laid.edges.forEach((e, i) => {
				if (hasHighlight && this.highlightedEdgeIdx.has(i)) return;
				if (skipNode(e.source) || skipNode(e.target)) return;
				const path = e.path;
				if (!path || path.length < 2) return;
				ctx.strokeStyle = hasHighlight ? dim : line;
				ctx.beginPath();
				ctx.moveTo(path[0].x, path[0].y);
				for (let i2 = 1; i2 < path.length; i2++) ctx.lineTo(path[i2].x, path[i2].y);
				ctx.stroke();
			});
			// Trunks retired — every wire is now a single LINE drawn by the
			// loop above.
		}

		// Layer 2: base cards (covers the "stub" segment from edge port → card center)
		for (const n of this.laid.nodes) {
			if (this.highlightedNodes.has(n.id)) continue;
			if (skipNode(n.id)) continue;
			this.drawCard(ctx, n, false);
		}

		// Aggregated cluster stacks. Only clusters with a truly-aggregated
		// subset (= count > 0 in aggregateCount) render a stack — others
		// keep their normal cluster appearance because none of their
		// members were actually folded in.
		if (this.aggregateCount.size > 0 && this.laid.nodes.length > 0) {
			const cardW = this.laid.nodes[0].width;
			const cardH = this.laid.nodes[0].height;
			for (const cluster of this.laid.clusters) {
				const count = this.aggregateCount.get(cluster.groupKey);
				if (!count) continue;
				const isHigh = this.highlightedClusters.has(cluster.groupKey);
				this.drawAggregateStack(ctx, cluster, cardW, cardH, count, isHigh);
			}
		}

		// Layer 3: accent edges. Always drawn at LINE thickness (not TRUNK)
		// because hover should highlight individual connections, not paint over
		// the bundled cable.
		if (hasHighlight && this.settings.showEdges) {
			const accentSolidW = 1.8 / this.zoom;
			const accentGlowW = 5 / this.zoom;
			this.laid.edges.forEach((e, i) => {
				if (!this.highlightedEdgeIdx.has(i)) return;
				if (skipNode(e.source) || skipNode(e.target)) return;
				const path = e.path;
				if (!path || path.length < 2) return;
				// Direction-aware colouring. source === hoveredNode → outgoing
				// (this node links out to the target). target === hoveredNode
				// → incoming backlink (something else links into this node).
				// If hoveredNodeId is null (e.g. cluster hover), fall back to
				// outgoing colour.
				const isOutgoing =
					this.hoveredNodeId !== null
						? e.source === this.hoveredNodeId
						: true;
				const accent = isOutgoing ? accentOut : accentIn;
				const glow = isOutgoing ? glowOut : glowIn;
				ctx.strokeStyle = glow;
				ctx.lineWidth = accentGlowW;
				ctx.beginPath();
				ctx.moveTo(path[0].x, path[0].y);
				for (let i2 = 1; i2 < path.length; i2++) ctx.lineTo(path[i2].x, path[i2].y);
				ctx.stroke();
				ctx.strokeStyle = accent;
				ctx.lineWidth = accentSolidW;
				ctx.beginPath();
				ctx.moveTo(path[0].x, path[0].y);
				for (let i2 = 1; i2 < path.length; i2++) ctx.lineTo(path[i2].x, path[i2].y);
				ctx.stroke();
			});
		}

		// Layer 4: accent cards on top
		for (const n of this.laid.nodes) {
			if (!this.highlightedNodes.has(n.id)) continue;
			if (skipNode(n.id)) continue;
			this.drawCard(ctx, n, true);
		}

		// Cluster labels with collision-aware placement: larger clusters keep
		// their natural position above the enclosure; smaller ones whose label
		// would collide are pushed up by full line-heights, and labels pushed
		// 2+ levels gain a thin leader line back to the enclosure top.
		if (this.settings.showEnclosures) {
			this.drawClusterLabels(ctx);
		}

		// Frozen-pane headers: drawn LAST in screen space so they overlay
		// everything and stick to the viewport edges regardless of pan/zoom.
		if (this.settings.showGrid) {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			this.drawGridHeaders(ctx);
		}
	}

	// Slot lattice with VISIBLE channels (= the user's 隘路). Each card cell
	// is bordered by 4 line segments hugging the card area itself; between
	// neighbouring cells the lines break, leaving channelW × channelH wide
	// strips of blank space. Cluster enclosures, trunks and single wires
	// all route through those visible channels.
	private drawCardGrid(ctx: CanvasRenderingContext2D): void {
		drawCardGridFn(ctx, this.laid, this.zoom);
	}

	// Frozen-pane row/column headers. Drawn in SCREEN space (identity
	// transform with DPR applied) so they stay glued to the canvas edges
	// regardless of pan/zoom — like Excel's frozen header rows/columns.
	// Cells inside each band still align horizontally / vertically with the
	// world-space body cells via worldX * zoom + panX.
	private drawGridHeaders(ctx: CanvasRenderingContext2D): void {
		drawGridHeadersFn(ctx, this.laid, this.canvas, this.zoom, this.panX, this.panY);
	}

	private drawClusterLabels(ctx: CanvasRenderingContext2D): void {
		drawClusterLabelsFn(ctx, this.laid, this.zoom);
	}

	private drawAggregateStack(
		ctx: CanvasRenderingContext2D,
		cluster: ClusterRect,
		cardW: number,
		cardH: number,
		count: number,
		highlighted = false,
	): void {
		drawAggregateStackFn(ctx, cluster, cardW, cardH, count, this.zoom, highlighted);
	}

	private drawCard(
		ctx: CanvasRenderingContext2D,
		n: PositionedNode,
		highlighted: boolean,
	): void {
		const x = n.x - n.width / 2;
		const y = n.y - n.height / 2;
		const w = n.width;
		const h = n.height;
		// Card-internal scale drives padding, font sizes, line heights and
		// gaps only — the corner radius and border stroke stay FIXED so
		// the outline geometry reads identically regardless of card size.
		// `scale` here is the SAME visualScale that cardFor and measureCard
		// use, so per-cluster overrides (and degree-driven size factors)
		// change pixel size + font + line count together instead of size
		// alone.
		const scale = this.getCardScale(n.id);
		const r = Math.min(CARD_RADIUS_PX, w / 2, h / 2);

		ctx.beginPath();
		roundedRectPath(ctx, x, y, w, h, r);
		ctx.fillStyle = highlighted ? "#ffe7a8" : "#1d2230";
		ctx.fill();

		ctx.lineWidth = (highlighted ? 1.8 : 1) / this.zoom;
		ctx.strokeStyle = highlighted ? "#ff9d3f" : "#5a7ba8";
		ctx.beginPath();
		roundedRectPath(ctx, x, y, w, h, r);
		ctx.stroke();

		const padX = CARD_PAD_X * scale;
		const padY = CARD_PAD_Y * scale;
		const titleFontPx = CARD_TITLE_FONT_PX * scale;
		const bodyFontPx = CARD_BODY_FONT_PX * scale;
		const titleLineH = CARD_LINE_HEIGHT_PX * scale;
		const bodyLineH = CARD_BODY_LINE_HEIGHT_PX * scale;
		const titleBodyGap = CARD_TITLE_BODY_GAP * scale;

		const mode = this.displayMode.get(n.id) ?? "full";
		const card = this.cardCache.get(`${n.id}:${mode}:${scale.toFixed(4)}`);
		const bodyLines = card?.bodyLines ?? [];
		const innerLeft = x + padX;
		const innerTop = y + padY;
		const innerRight = x + w - padX;

		ctx.textAlign = "start";
		ctx.textBaseline = "top";

		ctx.font = `600 ${titleFontPx}px sans-serif`;
		ctx.fillStyle = highlighted ? "#1d1100" : "#e6edf3";
		const titleFitted = truncateToWidth(ctx, n.label, innerRight - innerLeft);
		ctx.fillText(titleFitted, innerLeft, innerTop);

		if (bodyLines.length > 0 && this.settings.showBody) {
			ctx.font = `${bodyFontPx}px sans-serif`;
			ctx.fillStyle = highlighted ? "#3a2400" : "#9eb0c4";
			let ly = innerTop + titleLineH + titleBodyGap;
			for (const line of bodyLines) {
				ctx.fillText(line, innerLeft, ly);
				ly += bodyLineH;
			}
		}
	}

	private screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
	}

	private hitTest(wx: number, wy: number): HoverTarget {
		// Cards are rectangles; pick the smallest-distance card hit so adjacent cards
		// don't beat each other when the cursor sits on the gap.
		let bestId: string | null = null;
		let bestDist2 = Infinity;
		const slackPx = 1 / this.zoom;
		for (const n of this.laid.nodes) {
			const left = n.x - n.width / 2 - slackPx;
			const right = n.x + n.width / 2 + slackPx;
			const top = n.y - n.height / 2 - slackPx;
			const bottom = n.y + n.height / 2 + slackPx;
			if (wx < left || wx > right || wy < top || wy > bottom) continue;
			const dx = wx - n.x;
			const dy = wy - n.y;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestDist2) {
				bestDist2 = d2;
				bestId = n.id;
			}
		}
		if (bestId) return { kind: "node", nodeId: bestId };
		for (const c of this.laid.clusters) {
			if (wx >= c.x && wx <= c.x + c.width && wy >= c.y && wy <= c.y + c.height) {
				return { kind: "cluster", group: c.groupKey };
			}
		}
		return null;
	}

	private openFile(id: string): void {
		this.app.workspace.openLinkText(id, "", false);
	}

	private onPointerMove(e: MouseEvent): void {
		if (this.dragging) {
			this.cancelHover();
			return;
		}
		const rect = this.canvas.getBoundingClientRect();
		const w = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
		const hit = this.hitTest(w.x, w.y);
		if (!sameTarget(this.hoverTarget, hit)) {
			this.cancelHover();
			this.hoverTarget = hit;
			this.applyHighlight(hit);
			if (hit) this.scheduleHover(hit, e.clientX - rect.left, e.clientY - rect.top);
		} else if (this.tipEl) {
			this.positionTip(e.clientX - rect.left, e.clientY - rect.top, this.tipEl);
		}
	}

	private applyHighlight(target: HoverTarget): void {
		this.highlightedEdgeIdx.clear();
		this.highlightedNodes.clear();
		this.highlightedClusters.clear();
		this.hoveredNodeId = null;
		if (!target || target.kind !== "node") {
			this.requestDraw();
			return;
		}
		const id = target.nodeId;
		this.hoveredNodeId = id;
		this.highlightedNodes.add(id);
		const idIndex = new Map<string, PositionedNode>();
		for (const n of this.laid.nodes) idIndex.set(n.id, n);
		const targetNode = idIndex.get(id);
		if (targetNode) {
			for (const m of targetNode.memberships) {
				this.highlightedClusters.add(m);
			}
		}
		const adj = this.adjacency.get(id);
		if (adj) {
			for (const i of adj) {
				this.highlightedEdgeIdx.add(i);
				const edge = this.laid.edges[i];
				if (!edge) continue;
				const otherId = edge.source === id ? edge.target : edge.source;
				this.highlightedNodes.add(otherId);
				const otherNode = idIndex.get(otherId);
				if (!otherNode) continue;
				for (const m of otherNode.memberships) {
					this.highlightedClusters.add(m);
				}
			}
		}
		this.requestDraw();
	}

	private scheduleHover(target: NonNullable<HoverTarget>, sx: number, sy: number): void {
		const gen = ++this.hoverGen;
		this.hoverTimer = window.setTimeout(() => {
			if (gen !== this.hoverGen) return;
			void this.showHover(target, sx, sy);
		}, HOVER_DELAY_MS);
	}

	private cancelHover(): void {
		this.hoverGen++;
		if (this.hoverTimer) {
			window.clearTimeout(this.hoverTimer);
			this.hoverTimer = 0;
		}
		if (this.tipEl) {
			this.tipEl.remove();
			this.tipEl = null;
		}
		this.hoverTarget = null;
		if (
			this.highlightedEdgeIdx.size > 0 ||
			this.highlightedNodes.size > 0 ||
			this.highlightedClusters.size > 0 ||
			this.hoveredNodeId !== null
		) {
			this.highlightedEdgeIdx.clear();
			this.highlightedNodes.clear();
			this.highlightedClusters.clear();
			this.hoveredNodeId = null;
			this.requestDraw();
		}
	}

	private async showHover(target: NonNullable<HoverTarget>, sx: number, sy: number): Promise<void> {
		const gen = this.hoverGen;
		const tip = document.createElement("div");
		tip.className = "gim-hover-tip gim-tip-" + target.kind;
		tip.setAttr("data-kind", target.kind);

		if (target.kind === "node") {
			const file = this.app.vault.getAbstractFileByPath(target.nodeId);
			if (!(file instanceof TFile)) return;
			tip.createSpan({ cls: "gim-tip-title", text: file.basename });
			tip.createSpan({ cls: "gim-tip-sub", text: file.parent?.path ?? "" });
			// Use the already-loaded body cache; show a richer preview than the
			// card itself (2× the card body limit, capped).
			const cached = this.bodyCache.get(target.nodeId) ?? "";
			const tipCap = Math.min(400, Math.max(200, this.settings.cardMaxChars * 2));
			if (gen !== this.hoverGen) return;
			if (cached) {
				const trimmed = cached.length > tipCap ? cached.slice(0, tipCap) + "…" : cached;
				tip.createDiv({ cls: "gim-tip-body", text: trimmed });
			}
		} else {
			const cl = this.laid.clusters.find((c) => c.groupKey === target.group);
			if (!cl) return;
			tip.createSpan({ cls: "gim-tip-title", text: cl.label });
			tip.createSpan({ cls: "gim-tip-sub", text: cl.memberCount + " items" });
		}

		this.root.appendChild(tip);
		this.tipEl = tip;
		this.positionTip(sx, sy, tip);
	}

	private armMarquee(): void {
		this.marqueeArmed = true;
		this.canvas.style.cursor = "crosshair";
		this.cancelHover();
	}

	private startMarquee(sx: number, sy: number): void {
		this.cancelHover();
		this.marqueeStart = { sx, sy };
		const el = document.createElement("div");
		el.className = "gim-marquee";
		el.style.left = sx + "px";
		el.style.top = sy + "px";
		el.style.width = "0px";
		el.style.height = "0px";
		this.root.appendChild(el);
		this.marqueeEl = el;
	}

	private updateMarquee(clientX: number, clientY: number): void {
		if (!this.marqueeStart || !this.marqueeEl) return;
		const rect = this.canvas.getBoundingClientRect();
		const sx = Math.max(0, Math.min(rect.width, clientX - rect.left));
		const sy = Math.max(0, Math.min(rect.height, clientY - rect.top));
		const x = Math.min(this.marqueeStart.sx, sx);
		const y = Math.min(this.marqueeStart.sy, sy);
		const w = Math.abs(sx - this.marqueeStart.sx);
		const h = Math.abs(sy - this.marqueeStart.sy);
		this.marqueeEl.style.left = x + "px";
		this.marqueeEl.style.top = y + "px";
		this.marqueeEl.style.width = w + "px";
		this.marqueeEl.style.height = h + "px";
	}

	private finishMarquee(clientX: number, clientY: number): void {
		if (!this.marqueeStart) return;
		const rect = this.canvas.getBoundingClientRect();
		const sx = clientX - rect.left;
		const sy = clientY - rect.top;
		const x0 = Math.min(this.marqueeStart.sx, sx);
		const y0 = Math.min(this.marqueeStart.sy, sy);
		const x1 = Math.max(this.marqueeStart.sx, sx);
		const y1 = Math.max(this.marqueeStart.sy, sy);
		this.cancelMarquee();
		if (x1 - x0 < 6 || y1 - y0 < 6) return;
		const a = this.screenToWorld(x0, y0);
		const b = this.screenToWorld(x1, y1);
		this.fitToRect({ minX: a.x, minY: a.y, maxX: b.x, maxY: b.y });
	}

	private cancelMarquee(): void {
		this.marqueeStart = null;
		this.marqueeArmed = false;
		this.canvas.style.cursor = "grab";
		if (this.marqueeEl) {
			this.marqueeEl.remove();
			this.marqueeEl = null;
		}
	}

	private positionTip(sx: number, sy: number, tip: HTMLElement): void {
		const rect = this.canvas.getBoundingClientRect();
		const tipW = tip.offsetWidth || 240;
		const tipH = tip.offsetHeight || 60;
		let x = sx + TOOLTIP_OFFSET_X;
		let y = sy + TOOLTIP_OFFSET_Y;
		if (x + tipW > rect.width) x = sx - tipW - TOOLTIP_OFFSET_X;
		if (y + tipH > rect.height) y = rect.height - tipH - 4;
		if (y < 4) y = 4;
		tip.style.left = x + "px";
		tip.style.top = y + "px";
	}

	private attachInputs(): void {
		const c = this.canvas;
		c.addEventListener("mousedown", (e) => {
			if (e.button !== 0) return;
			const rect = c.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			if (e.shiftKey || this.marqueeArmed) {
				this.startMarquee(sx, sy);
				e.preventDefault();
				return;
			}
			// Empty drag = pan. Nodes/clusters can no longer be dragged.
			this.dragging = true;
			this.lastX = e.clientX;
			this.lastY = e.clientY;
			c.style.cursor = "grabbing";
			this.cancelHover();
		});
		window.addEventListener("mousemove", (e) => {
			if (this.marqueeStart) {
				this.updateMarquee(e.clientX, e.clientY);
				return;
			}
			if (!this.dragging) return;
			this.panX += e.clientX - this.lastX;
			this.panY += e.clientY - this.lastY;
			this.lastX = e.clientX;
			this.lastY = e.clientY;
			this.requestDraw();
		});
		window.addEventListener("mouseup", (e) => {
			if (this.marqueeStart) {
				this.finishMarquee(e.clientX, e.clientY);
				return;
			}
			this.dragging = false;
			c.style.cursor = "grab";
		});
		window.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && this.marqueeStart) this.cancelMarquee();
		});
		c.addEventListener("contextmenu", (e) => {
			if (this.marqueeStart) {
				e.preventDefault();
				this.cancelMarquee();
			}
		});
		c.addEventListener("click", (e) => {
			if (e.shiftKey || this.marqueeStart || this.marqueeEl) return;
			const rect = c.getBoundingClientRect();
			const w = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
			const hit = this.hitTest(w.x, w.y);
			if (hit?.kind === "node") this.openFile(hit.nodeId);
		});
		c.addEventListener("mousemove", (e) => this.onPointerMove(e));
		c.addEventListener("mouseleave", () => this.cancelHover());
		c.addEventListener("wheel", (e) => {
			e.preventDefault();
			this.cancelHover();
			const rect = c.getBoundingClientRect();
			const sx = e.clientX - rect.left;
			const sy = e.clientY - rect.top;
			const factor = Math.exp(-e.deltaY * 0.0015);
			const next = Math.max(0.005, Math.min(8, this.zoom * factor));
			const wx = (sx - this.panX) / this.zoom;
			const wy = (sy - this.panY) / this.zoom;
			this.zoom = next;
			this.panX = sx - wx * next;
			this.panY = sy - wy * next;
			this.requestDraw();
		}, { passive: false });
		c.addEventListener("dblclick", () => this.fitToView());
	}
}

function sameTarget(a: HoverTarget, b: HoverTarget): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind !== b.kind) return false;
	if (a.kind === "cluster" && b.kind === "cluster") return a.group === b.group;
	if (a.kind === "node" && b.kind === "node") return a.nodeId === b.nodeId;
	return false;
}

