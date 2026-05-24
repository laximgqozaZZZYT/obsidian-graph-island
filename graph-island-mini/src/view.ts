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
import { CARD_MIN_W, CARD_MAX_W, CARD_CELL_W, CARD_CELL_H } from "./types";
import { type LimitRule, applyLimitRules } from "./limit";
import { filterMemberships, filterLabels } from "./query-filters";
import {
	parseLimitRules as parseLimitRulesFn,
	getSortKey as getSortKeyFn,
	computeDroppedClusters as computeDroppedClustersFn,
} from "./query-pipeline";
import { colLetters, clusterHue } from "./canvas-utils";
import { expandClustersByInheritance } from "./cluster-bbox";
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
import { drawEnclosures } from "./draw-enclosures";
import { drawBaseEdges, drawAccentEdges } from "./draw-edges";
import { drawCard as drawCardFn } from "./draw-card";
import {
	hitTest as hitTestFn,
	screenToWorld as screenToWorldFn,
	type HoverTarget,
} from "./hit-test";
import {
	resolveEffectiveQuery,
	resolveEffectiveHaving,
	computeDegreeMaps,
	filterEdgesByAlive,
	filterLayoutData,
	buildAdjacency,
} from "./rebuild-pipeline";
import {
	type CardContent,
	computeCardSize,
	computeChannelDims,
	computeSizeScale as computeSizeScaleFn,
	measureCard as measureCardFn,
} from "./card-sizing";
import {
	renderExprSection as renderExprSectionFn,
	renderToggleSection as renderToggleSectionFn,
	renderOrderBySection as renderOrderBySectionFn,
	toggleArrayMember as toggleArrayMemberFn,
} from "./panel-sections";
import {
	HOVER_DELAY_MS,
	sameTarget,
	computeHighlight,
	positionTip as positionTipFn,
} from "./highlight";
import { MarqueeController } from "./marquee-controller";

export const VIEW_TYPE_MINI = "graph-island-mini";


// Internal cache: maps file path → pre-processed body preview (post-frontmatter,
// trimmed). Persists across rebuilds so we don't re-read 2k+ files every time
// metadataCache fires "resolved".

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
	// Marquee state machine lives in its own controller — the view
	// just queries it (isArmed / isActive) and pumps pointer events.
	private marquee!: MarqueeController;
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

		// Marquee controller wires canvas + root + the view's coordinate /
		// fitToRect / hover-cancel callbacks so the controller has zero
		// view-state references beyond what's passed at construction.
		this.marquee = new MarqueeController({
			canvas: this.canvas,
			root: this.root,
			screenToWorld: (sx, sy) => this.screenToWorld(sx, sy),
			fitToRect: (w) => this.fitToRect(w),
			onActivate: () => this.cancelHover(),
		});

		this.addAction("square-dashed-mouse-pointer", "Marquee zoom (or Shift+drag)", () => this.marquee.arm());
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
		toggleArrayMemberFn(this.settings, field, value, present);
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

	private renderOrderBySection(parent: HTMLElement): void {
		renderOrderBySectionFn(parent, {
			settings: this.settings,
			save: () => void this.save(),
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
		renderToggleSectionFn(
			parent,
			{ settings: this.settings, save: () => void this.save() },
			heading,
			toggles,
		);
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
		renderExprSectionFn(
			parent,
			label,
			rows,
			error,
			{
				settings: this.settings,
				save: () => void this.save(),
				rerender: () => this.renderPanel(),
			},
			opts,
		);
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

		// Stage 1: AUTO-augment GROUP_BY / WHERE, then run the vault → graph
		// builder. Errors from the query parsers are surfaced into panel
		// state so the user sees them inline.
		const { effGroupBy, effWhere } = resolveEffectiveQuery(this.settings);
		const { result, errors } = buildGraph(this.app, effWhere, effGroupBy);
		this.whereError = errors.where ?? "";
		this.groupByError = errors.groupBy ?? "";
		let { data, clusterLabels } = result;

		// Stage 1b: HAVING runs AFTER buildGraph so auto thresholds can scale
		// with the produced node count, then drops the resulting clusters
		// from each node's memberships + the cluster-label map.
		const effHaving = resolveEffectiveHaving(
			this.settings.having,
			this.settings.havingAuto,
			data.nodes.length,
		);
		const dropped = this.computeDroppedClusters(data.nodes, effHaving);
		if (dropped.size > 0) {
			data = filterMemberships(data, dropped);
			clusterLabels = filterLabels(clusterLabels, dropped);
		}
		this.clusterLabels = clusterLabels;

		// Stage 2: degree maps (total / in / out). Used by ORDER_BY + size-
		// mode resolvers. Cleared in place so view-state references stay
		// valid for callers holding the same Map instance.
		const degrees = computeDegreeMaps(data.edges);
		this.degreeMap = degrees.degreeMap;
		this.inDegreeMap = degrees.inDegreeMap;
		this.outDegreeMap = degrees.outDegreeMap;

		// Stage 3: LIMIT. Per-tier visible-node selection + display-mode
		// assignment. Edges are re-filtered against the surviving id set.
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
			edges: filterEdgesByAlive(data.edges, (id) => modes.has(id)),
		};

		await this.ensureBodies(data.nodes);
		if (gen !== this.rebuildGen) return;

		// Recompute the cluster member sets + strict supersets against the
		// CURRENT (post-LIMIT) graph so the NODE_DISPLAY override chain
		// (own cluster → inheritFrom → strict superset → global) reflects
		// what's actually on screen.
		this.recomputeClusterRelations(data.nodes);
		this.recomputeNodeDisplayCache(data.nodes);

		// Stage 4: drop aggregated + hidden cards from the layout input.
		// They are folded back in by aggregate-snap BELOW; here we just
		// ensure they don't reserve grid cells the visible cards could
		// otherwise occupy.
		const { layoutData, preTrulyAgg } = filterLayoutData(data, this.settings);

		// Card sizes derive from the user-configured row × column span
		// times the canonical CARD_CELL_W × CARD_CELL_H lattice step, with
		// an optional degree-driven scale that preserves the m : n aspect.
		const sized = layoutData.nodes.map((n) => this.cardFor(n));
		const wasEmpty = this.laid.clusters.length === 0;
		this.laid = layout(layoutData, sized, {
			clusterSpacing: this.settings.clusterSpacing,
			nodeSpacing: this.settings.nodeSpacing,
			cellW: CARD_CELL_W,
			cellH: CARD_CELL_H,
			clusterLabels,
			anchorPlacement: this.settings.anchorPlacement,
		});
		// Stage 5: id → incident-edge-index adjacency for hover lookups.
		this.adjacency = buildAdjacency(this.laid.edges);
		// Aggregate-snap: badge cell selection + edge stitching back into
		// the aggregate stack. trulyAgg + hidden were already excluded
		// from the layout pass, so the layout above ran on visible nodes
		// only and the surrounding cards have already taken their space.
		// Here we just drop the badges in free cells and add the
		// previously-omitted edges back as routes through the badges.
		const aggResult = runAggregateSnap(this.laid, {
			aggregatedLayers: this.settings.aggregatedLayers,
			hiddenNodes: this.settings.hiddenNodes,
			inheritFrom: this.settings.inheritFrom ?? {},
			trulyAgg: preTrulyAgg,
			allNodes: data.nodes,
			allEdges: data.edges,
			clusterLabels: this.clusterLabels,
		});
		this.trulyAggSet = aggResult.trulyAgg;
		this.aggregateCount = aggResult.aggregateCount;

		expandClustersByInheritance(
			this.laid.clusters,
			this.settings.inheritFrom ?? {},
		);
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
		const { channelW, channelH } = computeChannelDims(this.settings.nodeSpacing);
		const { width, height } = computeCardSize({
			rows: Math.max(1, display.nodeRows),
			cols: Math.max(1, display.nodeCols),
			channelW,
			channelH,
			scaleFactor: this.computeSizeScale(n.id, display.nodeSizeMode),
		});
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
		// Pick the directional degree map matching the chosen size mode.
		// "fixed" ignores the degree entirely (computeSizeScaleFn returns 1).
		const map = m === "indegree" ? this.inDegreeMap : this.outDegreeMap;
		const deg = map.get(nodeId) ?? 0;
		return computeSizeScaleFn(m, deg);
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
		return measureCardFn(this.ctx, {
			title,
			body,
			mode,
			cardW,
			cardH,
			scale,
			showBody: this.settings.showBody,
		});
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

		if (this.settings.showEnclosures) {
			drawEnclosures(
				ctx,
				this.laid.clusters,
				this.highlightedClusters,
				this.zoom,
			);
		}

		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		const hasHighlight = this.highlightedEdgeIdx.size > 0;

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

		if (this.settings.showEdges) {
			drawBaseEdges(
				ctx,
				this.laid,
				this.zoom,
				this.highlightedEdgeIdx,
				skipNode,
			);
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

		if (hasHighlight && this.settings.showEdges) {
			drawAccentEdges(
				ctx,
				this.laid,
				this.zoom,
				this.highlightedEdgeIdx,
				this.hoveredNodeId,
				skipNode,
			);
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
		drawCardGridFn(ctx, this.laid, this.canvas, this.zoom, this.panX, this.panY);
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
		// Pre-resolve everything that's view-state-dependent so the
		// renderer in draw-card.ts can stay pure: cache lookup via the
		// `${id}:${mode}:${scale.toFixed(4)}` composite key (= same key
		// `cardFor()` writes with).
		const scale = this.getCardScale(n.id);
		const mode = this.displayMode.get(n.id) ?? "full";
		const card = this.cardCache.get(`${n.id}:${mode}:${scale.toFixed(4)}`);
		drawCardFn(ctx, n, {
			scale,
			bodyLines: card?.bodyLines ?? [],
			showBody: this.settings.showBody,
			highlighted,
			zoom: this.zoom,
		});
	}

	private screenToWorld(sx: number, sy: number): { x: number; y: number } {
		return screenToWorldFn(sx, sy, this.panX, this.panY, this.zoom);
	}

	private hitTest(wx: number, wy: number): HoverTarget {
		return hitTestFn(wx, wy, this.laid.nodes, this.laid.clusters, this.zoom);
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
		// The pure computeHighlight() returns 4 fresh sets; assign them
		// wholesale to the view fields so the renderer sees a consistent
		// snapshot. Renderer reads these sets directly (no .clear() races).
		const next = computeHighlight(
			target,
			this.laid.nodes,
			this.laid.edges,
			this.adjacency,
		);
		this.highlightedNodes = next.highlightedNodes;
		this.highlightedClusters = next.highlightedClusters;
		this.highlightedEdgeIdx = next.highlightedEdgeIdx;
		this.hoveredNodeId = next.hoveredNodeId;
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

	private positionTip(sx: number, sy: number, tip: HTMLElement): void {
		const rect = this.canvas.getBoundingClientRect();
		const { x, y } = positionTipFn(
			sx,
			sy,
			tip.offsetWidth || 240,
			tip.offsetHeight || 60,
			rect.width,
			rect.height,
		);
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
			if (e.shiftKey || this.marquee.isArmed()) {
				this.marquee.begin(sx, sy);
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
			if (this.marquee.isActive()) {
				this.marquee.update(e.clientX, e.clientY);
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
			if (this.marquee.isActive()) {
				this.marquee.finish(e.clientX, e.clientY);
				return;
			}
			this.dragging = false;
			c.style.cursor = "grab";
		});
		window.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && this.marquee.isActive()) this.marquee.cancel();
		});
		c.addEventListener("contextmenu", (e) => {
			if (this.marquee.isActive()) {
				e.preventDefault();
				this.marquee.cancel();
			}
		});
		c.addEventListener("click", (e) => {
			if (e.shiftKey || this.marquee.isActive()) return;
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

