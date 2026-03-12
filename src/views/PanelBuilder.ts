import type { LayoutType, GraphNode, ShellInfo, DirectionalGravityRule, ClusterArrangement, ClusterGroupBy, ClusterGroupRule, GroupRule, SortRule, SortKey, SortOrder, NodeRule, GraphViewsSettings, OntologyRule, OntologyRelation, CoordinateLayout, CoordinateSystem, AxisSource, AxisConfig } from "../types";
import { ontologyToRules, rulesToOntologyFields } from "../types";
import { DEFAULT_COLORS } from "../types";
import { repositionShell } from "../layouts/concentric";
import type { QueryExpression, BoolOp } from "../utils/query-expr";
import { parseQueryExpr, serializeExpr } from "../utils/query-expr";
import { setIcon } from "obsidian";
import { t, tHelp } from "../i18n";
import type { ShapeRule, NodeShape } from "../utils/node-shapes";
import { ALL_SHAPES } from "../utils/node-shapes";
import { exportPreset, importPreset, applyPreset } from "../utils/presets";
import { ARRANGEMENT_PRESETS } from "../layouts/coordinate-presets";

// ---------------------------------------------------------------------------
// Panel state (shared with GraphViewContainer)
// ---------------------------------------------------------------------------
export interface GroupByRule { field: string; op?: string; indent?: number; }

export interface PanelState {
  showTags: boolean;
  showAttachments: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
  showArrows: boolean;
  textFadeThreshold: number;
  nodeSize: number;
  scaleByDegree: boolean;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  concentricMinRadius: number;
  concentricRadiusStep: number;
  showOrbitRings: boolean;
  orbitAutoRotate: boolean;
  groups: GroupRule[];
  searchQuery: string;
  colorEdgesByRelation: boolean;
  colorNodesByCategory: boolean;
  showInheritance: boolean;
  showAggregation: boolean;
  showTagNodes: boolean;
  tagDisplay: "node" | "enclosure";
  showSimilar: boolean;
  showSibling: boolean;
  showSequence: boolean;
  showLinks: boolean;
  showTagEdges: boolean;
  showCategoryEdges: boolean;
  showSemanticEdges: boolean;
  enclosureSpacing: number;
  directionalGravityRules: DirectionalGravityRule[];
  hoverHops: number;
  commonQueries: { query: string; recursive: boolean }[];
  clusterGroupRules: ClusterGroupRule[];
  clusterArrangement: ClusterArrangement;
  clusterNodeSpacing: number;
  clusterGroupScale: number;
  clusterGroupSpacing: number;
  fadeEdgesByDegree: boolean;
  edgeBundleStrength: number;
  sortRules: SortRule[];
  nodeRules: NodeRule[];
  nodeShapeRules: ShapeRule[];
  dataviewQuery: string;
  timelineKey: string;
  showEdgeLabels: boolean;
  showMinimap: boolean;
  groupBy: string;
  /** Editable rules array for the groupBy multi-rule editor.
   *  Stored directly so that pending (empty-field) rules survive panel rebuilds.
   *  When null/undefined, rules are parsed from the groupBy string on first render. */
  groupByRules: GroupByRule[] | null;
  groupMinSize: number;
  groupFilter: string;
  collapsedGroups: Set<string>;
  activeTab: "filter" | "display" | "layout" | "settings";
  /** Auto-fit spacing: automatically compute nodeSpacing, groupScale, groupSpacing */
  autoFit: boolean;
  /** Show duration bars on timeline arrangement */
  showDurationBars: boolean;
  /** Frontmatter field for timeline end date */
  timelineEndKey: string;
  /** Show arrangement guide lines */
  showGuideLines: boolean;
  /** Guide line mode: "shared" merges all timeline T-axes into one; "per-group" draws per group */
  guideLineMode: "shared" | "per-group";
  /** Show a grid/boundary overlay per cluster group */
  showGroupGrid: boolean;
  /** Comma-separated fields for link-based ordering (next,prev,parent_id,story_order) */
  timelineOrderFields: string;
  /** Coordinate layout override — when set, takes precedence over clusterArrangement */
  coordinateLayout: CoordinateLayout | null;
}

export const DEFAULT_PANEL: PanelState = {
  showTags: true,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  showArrows: false,
  textFadeThreshold: 0.5,
  nodeSize: 8,
  scaleByDegree: true,
  centerForce: 0.03,
  repelForce: 200,
  linkForce: 0.01,
  linkDistance: 100,
  concentricMinRadius: 50,
  concentricRadiusStep: 60,
  showOrbitRings: true,
  orbitAutoRotate: true,
  groups: [],
  searchQuery: "",
  colorEdgesByRelation: true,
  colorNodesByCategory: true,
  showInheritance: true,
  showAggregation: true,
  showTagNodes: true,
  tagDisplay: "enclosure" as const,
  showSimilar: false,
  showSibling: true,
  showSequence: true,
  showLinks: true,
  showTagEdges: true,
  showCategoryEdges: true,
  showSemanticEdges: true,
  enclosureSpacing: 1.5,
  directionalGravityRules: [],
  hoverHops: 1,
  commonQueries: [],
  clusterGroupRules: [],
  clusterArrangement: "spiral" as ClusterArrangement,
  clusterNodeSpacing: 3.0,
  clusterGroupScale: 3.0,
  clusterGroupSpacing: 2.0,
  fadeEdgesByDegree: false,
  edgeBundleStrength: 0.65,
  sortRules: [{ key: "degree" as SortKey, order: "desc" as SortOrder }],
  nodeRules: [],
  nodeShapeRules: [
    { match: "isTag", shape: "triangle" },
    { match: "default", shape: "circle" },
  ],
  dataviewQuery: "",
  timelineKey: "date",
  showEdgeLabels: false,
  showMinimap: true,
  groupBy: "none" as const,
  groupByRules: null,
  groupMinSize: 2,
  groupFilter: "",
  collapsedGroups: new Set<string>(),
  activeTab: "filter" as const,
  autoFit: false,
  showDurationBars: true,
  timelineEndKey: "end-date",
  showGuideLines: true,
  guideLineMode: "per-group" as const,
  showGroupGrid: true,
  timelineOrderFields: "next,prev,parent_id,story_order",
  coordinateLayout: null,
};

// ---------------------------------------------------------------------------
// Callbacks — operations the panel requests from the main view
// ---------------------------------------------------------------------------
export interface PanelCallbacks {
  doRender(): void;
  /** Like doRender but does NOT rebuild the panel DOM (keeps editors open) */
  doRenderKeepPanel(): void;
  markDirty(): void;
  updateForces(): void;
  applySearch(): void;
  applyTextFade(): void;
  applyDirectionalGravityForce(): void;
  applyNodeRules(): void;
  startOrbitAnimation(): void;
  stopOrbitAnimation(): void;
  wakeRenderLoop(): void;
  rebuildPanel(): void;
  invalidateData(): void;       // sets rawData = null then doRender
  /** Like invalidateData but keeps the panel DOM intact (for search filtering) */
  invalidateDataKeepPanel(): void;
  restartSimulation(alpha: number): void;
  applyClusterForce(): void;
  collectFieldSuggestions(): string[];
  collectValueSuggestions(field: string): string[];
  saveGroupPreset(): void;
  resetPanel(): void;
  applyPreset(preset: "simple" | "analysis" | "creative"): void;
  jumpToNode(nodeId: string): void;
  getNodeIds(): string[];
  /** Recolor existing nodes without full graph rebuild (keeps panel DOM intact) */
  recolorNodes(): void;
}

// ---------------------------------------------------------------------------
// Read-only context the panel needs from the view
// ---------------------------------------------------------------------------
export interface PanelContext {
  currentLayout: LayoutType;
  setLayout(layout: LayoutType): void;
  shells: ShellInfo[];
  pixiNodes: Map<string, { data: GraphNode }>;
  relationColors: Map<string, string>;
  simulation: unknown | null;  // only used for null-check
  settings: GraphViewsSettings;
  saveSettings(): void;
  nodeCount: number;
  edgeCount: number;
  app: unknown;
  /** All frontmatter keys discovered in the vault */
  frontmatterKeys: string[];
  /** Available group names for current groupBy mode (e.g. tag names, category values, folder paths) */
  availableGroups: string[];
  /** All tag names found across nodes in the graph */
  availableTags: string[];
}

// ---------------------------------------------------------------------------
// PanelBuilder
// ---------------------------------------------------------------------------
export function buildPanel(
  panelEl: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
): void {
  panelEl.empty();

  // =========================================================================
  // Top bar: Search (always visible, outside sections)
  // =========================================================================
  const topBar = panelEl.createDiv({ cls: "gi-top-bar" });

  // --- Search bar with help icon ---
  const searchRow = topBar.createDiv({ cls: "gi-search-row" });
  const searchBar = searchRow.createEl("input", {
    cls: "gi-search gi-top-search",
    type: "text",
    placeholder: t("search.placeholder"),
  });
  searchBar.value = panel.searchQuery;
  {
    let searchDebounce: ReturnType<typeof setTimeout> | null = null;
    searchBar.addEventListener("input", () => {
      panel.searchQuery = searchBar.value;
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        cb.invalidateDataKeepPanel();
      }, 400);
    });
  }
  attachQueryHint(searchBar, (field) => cb.collectValueSuggestions(field));
  attachSearchJump(searchBar, cb);

  const searchHelpBtn = searchRow.createEl("span", {
    cls: "clickable-icon gi-search-help",
    attr: { "aria-label": t("help.ariaLabel") },
  });
  setIcon(searchHelpBtn, "help-circle");
  searchHelpBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const existing = topBar.querySelector(".gi-help-popup");
    if (existing) { existing.remove(); return; }
    const popup = topBar.createDiv({ cls: "gi-help-popup gi-search-help-popup" });
    popup.style.whiteSpace = "pre-wrap";
    popup.textContent = t("search.filterHelp");
  });

  // =========================================================================
  // P2: Empty state — shown when no nodes are in the graph
  // =========================================================================
  if (ctx.nodeCount === 0) {
    const empty = panelEl.createDiv({ cls: "gi-empty-state" });
    empty.createEl("div", { cls: "gi-empty-title", text: t("empty.title") });
    empty.createEl("p", { cls: "gi-empty-hint", text: t("empty.hint") });
    const steps = empty.createEl("ol", { cls: "gi-empty-steps" });
    steps.createEl("li", { text: t("empty.step1") });
    steps.createEl("li", { text: t("empty.step2") });
    steps.createEl("li", { text: t("empty.step3") });
  }

  // =========================================================================
  // Tab bar + tab containers
  // =========================================================================
  const tabContainers = new Map<TabId, HTMLElement>();

  buildTabBar(panelEl, panel.activeTab, tabContainers, (tab) => {
    panel.activeTab = tab;
  });

  for (const def of TAB_DEFS) {
    const container = panelEl.createDiv({ cls: "gi-tab-content" });
    if (def.id === panel.activeTab) container.addClass("is-active");
    tabContainers.set(def.id, container);
  }

  const filterTab = tabContainers.get("filter")!;
  const displayTab = tabContainers.get("display")!;
  const layoutTab = tabContainers.get("layout")!;
  const settingsTab = tabContainers.get("settings")!;

  // =============================================
  // FILTER TAB
  // =============================================
  buildSection(filterTab, t("section.filter"), (body) => {
    addToggle(body, t("filter.attachments"), panel.showAttachments, (v) => { panel.showAttachments = v; cb.invalidateData(); });
    addToggle(body, t("filter.existingOnly"), panel.existingOnly, (v) => { panel.existingOnly = v; cb.invalidateData(); });
    addToggle(body, t("filter.orphans"), panel.showOrphans, (v) => { panel.showOrphans = v; cb.invalidateData(); });
    addSelect(body, t("filter.tagDisplay"), [
      { value: "off", label: t("filter.tagDisplay.off") },
      { value: "node", label: t("filter.tagDisplay.node") },
      { value: "enclosure", label: t("filter.tagDisplay.enclosure") },
    ], !panel.showTagNodes ? "off" : panel.tagDisplay, (v) => {
      panel.showTagNodes = v !== "off";
      panel.tagDisplay = v === "enclosure" ? "enclosure" : "node";
      cb.invalidateData();
    });
  }, tHelp("help.filter"));

  buildSection(filterTab, t("section.groups"), (body) => {
    const list = body.createDiv();
    renderGroupList(list, panel, ctx, cb);
    const addBtn = body.createEl("button", { cls: "gi-add-group", text: t("groups.addGroup") });
    addBtn.addEventListener("click", () => {
      const idx = panel.groups.length;
      panel.groups.push({ expression: null, color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });
      renderGroupList(list, panel, ctx, cb);
    });
  }, tHelp("help.groups"));

  // =============================================
  // DISPLAY TAB
  // =============================================
  // --- Nodes sub-section ---
  buildSection(displayTab, t("section.displayNodes"), (body) => {
    addToggle(body, t("display.nodeColor"), panel.colorNodesByCategory, (v) => { panel.colorNodesByCategory = v; cb.doRender(); });
    addSlider(body, t("display.nodeSize"), 2, 20, 1, panel.nodeSize, (v) => { panel.nodeSize = v; cb.doRender(); });
    addToggle(body, t("display.scaleByDegree"), panel.scaleByDegree, (v) => { panel.scaleByDegree = v; cb.doRender(); });
    addSlider(body, t("display.textFade"), 0, 1, 0.05, panel.textFadeThreshold, (v) => { panel.textFadeThreshold = v; cb.applyTextFade(); });
    addSlider(body, t("display.hoverHops"), 1, 5, 1, panel.hoverHops, (v) => { panel.hoverHops = v; });
    // --- ノード形状 ---
    const shapeOptions = ALL_SHAPES.map(s => ({ value: s, label: t(`shape.${s}`) }));
    const tagRule = panel.nodeShapeRules.find(r => r.match === "isTag");
    const defaultRule = panel.nodeShapeRules.find(r => r.match === "default");
    addSelect(body, t("display.tagNodeShape"), shapeOptions, tagRule?.shape ?? "triangle", (v) => {
      const rule = panel.nodeShapeRules.find(r => r.match === "isTag");
      if (rule) rule.shape = v as NodeShape;
      else panel.nodeShapeRules.unshift({ match: "isTag", shape: v as NodeShape });
      cb.doRender();
    });
    addSelect(body, t("display.defaultNodeShape"), shapeOptions, defaultRule?.shape ?? "circle", (v) => {
      const rule = panel.nodeShapeRules.find(r => r.match === "default");
      if (rule) rule.shape = v as NodeShape;
      else panel.nodeShapeRules.push({ match: "default", shape: v as NodeShape });
      cb.doRender();
    });
  });

  // --- Edges sub-section ---
  buildSection(displayTab, t("section.displayEdges"), (body) => {
    addToggle(body, t("display.arrows"), panel.showArrows, (v) => { panel.showArrows = v; cb.doRender(); });
    addToggle(body, t("display.edgeColor"), panel.colorEdgesByRelation, (v) => { panel.colorEdgesByRelation = v; cb.markDirty(); });
    addToggle(body, t("display.fadeEdges"), panel.fadeEdgesByDegree, (v) => { panel.fadeEdgesByDegree = v; cb.markDirty(); });
    addToggle(body, t("display.edgeLabels"), panel.showEdgeLabels, (v) => { panel.showEdgeLabels = v; cb.markDirty(); });
    addToggle(body, t("display.links"), panel.showLinks, (v) => { panel.showLinks = v; cb.markDirty(); });
    addToggle(body, t("display.sharedTags"), panel.showTagEdges, (v) => { panel.showTagEdges = v; cb.markDirty(); });
    addToggle(body, t("display.sharedCategory"), panel.showCategoryEdges, (v) => { panel.showCategoryEdges = v; cb.markDirty(); });
    addToggle(body, t("display.semantic"), panel.showSemanticEdges, (v) => { panel.showSemanticEdges = v; cb.markDirty(); });
    addToggle(body, t("display.inheritance"), panel.showInheritance, (v) => { panel.showInheritance = v; cb.markDirty(); });
    addToggle(body, t("display.aggregation"), panel.showAggregation, (v) => { panel.showAggregation = v; cb.markDirty(); });
    addToggle(body, t("display.similar"), panel.showSimilar, (v) => { panel.showSimilar = v; cb.invalidateData(); });
    addToggle(body, t("display.sibling"), panel.showSibling, (v) => { panel.showSibling = v; cb.markDirty(); });
    addToggle(body, t("display.sequence"), panel.showSequence, (v) => { panel.showSequence = v; cb.markDirty(); });
  });

  // --- Minimap (stays in Display) ---
  buildSection(displayTab, t("section.displayOther"), (body) => {
    addToggle(body, t("display.minimap"), panel.showMinimap, (v) => { panel.showMinimap = v; cb.wakeRenderLoop(); });
  });

  if (panel.colorEdgesByRelation && ctx.relationColors.size > 0) {
    buildSection(displayTab, t("section.relationColors"), (body) => {
      const container = body.createDiv({ cls: "graph-color-groups-container" });
      for (const [rel, color] of ctx.relationColors) {
        const group = container.createDiv({ cls: "graph-color-group" });
        const label = group.createEl("span", { text: rel, cls: "graph-color-group-label gi-color-group-label" });
        const picker = group.createEl("input", { type: "color" });
        picker.setAttribute("aria-label", t("relationColors.changeColor"));
        picker.value = color;
        picker.addEventListener("input", () => {
          ctx.relationColors.set(rel, picker.value);
          cb.markDirty();
        });
      }
    });
  }

  // =============================================
  // LAYOUT TAB
  // =============================================
  // --- Grouping (in Layout tab) ---
  buildSection(layoutTab, t("section.displayGrouping"), (body) => {
    {
      const groupByLabel = body.createDiv({ cls: "setting-item-name", text: t("display.groupBy") });
      const groupByListEl = body.createDiv({ cls: "gi-multirule-list" });
      renderGroupByRules(groupByListEl, panel, ctx, cb);
    }
    if (panel.groupBy && panel.groupBy !== "none") {
      addSlider(body, t("display.groupMinSize"), 1, 20, 1, panel.groupMinSize, (v) => {
        panel.groupMinSize = v;
        panel.collapsedGroups.clear();
        cb.doRender();
      });
      if (ctx.availableGroups.length > 0) {
        const currentFilter = panel.groupFilter
          ? new Set(panel.groupFilter.split(",").map(s => s.trim()).filter(Boolean))
          : new Set(ctx.availableGroups);
        addCheckboxGroup(body, t("display.groupFilter"), ctx.availableGroups, currentFilter, (sel) => {
          panel.groupFilter = sel.size === ctx.availableGroups.length ? "" : [...sel].join(", ");
          panel.collapsedGroups.clear();
          cb.doRender();
        });
      }
    }
  });

  // Cluster arrangement
  buildSection(layoutTab, t("section.clusterArrangement"), (body) => {
    addSelect(body, t("cluster.pattern"), [
      { value: "spiral", label: t("cluster.spiral") },
      { value: "concentric", label: t("cluster.concentric") },
      { value: "tree", label: t("cluster.tree") },
      { value: "grid", label: t("cluster.grid") },
      { value: "triangle", label: t("cluster.triangle") },
      { value: "random", label: t("cluster.random") },
      { value: "mountain", label: t("cluster.mountain") },
      { value: "sunburst", label: t("cluster.sunburst") },
      { value: "timeline", label: t("cluster.timeline") },
      { value: "custom", label: t("cluster.custom") },
    ], panel.clusterArrangement, (v) => {
      panel.clusterArrangement = v as ClusterArrangement;
      // "custom" always sets coordinateLayout explicitly so the generic engine is used.
      // Other presets reset to null to use hardcoded functions.
      panel.coordinateLayout = v === "custom"
        ? { ...ARRANGEMENT_PRESETS.custom }
        : null;
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);
    });

    // --- Coordinate Layout Controls ---
    const coordLayout = panel.coordinateLayout
      ?? ARRANGEMENT_PRESETS[panel.clusterArrangement];

    addSelect(body, t("coord.system"), [
      { value: "cartesian", label: t("coord.cartesian") },
      { value: "polar", label: t("coord.polar") },
    ], coordLayout.system, (v) => {
      const base = panel.coordinateLayout
        ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
      panel.coordinateLayout = { ...base, system: v as CoordinateSystem };
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);
    });

    const axis1Label = coordLayout.system === "polar" ? "r" : "X";
    const axis2Label = coordLayout.system === "polar" ? "θ" : "Y";

    const axisSuggestions = getAxisSourceSuggestions(ctx);

    buildAxisTextInput(body, `${axis1Label}:`, coordLayout.axis1, 1, panel, cb, ctx, axisSuggestions);
    buildAxisTextInput(body, `${axis2Label}:`, coordLayout.axis2, 2, panel, cb, ctx, axisSuggestions);

    addToggle(body, t("coord.perGroup"), coordLayout.perGroup, (v) => {
      const base = panel.coordinateLayout
        ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
      panel.coordinateLayout = { ...base, perGroup: v };
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    if (coordLayout.system === "polar" && coordLayout.axis2.transform.kind === "even-divide") {
      addSlider(body, `${axis2Label} ${t("coord.range")} (°)`, 30, 360, 10,
        coordLayout.axis2.transform.totalRange, (v) => {
        const base = panel.coordinateLayout
          ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
        panel.coordinateLayout = {
          ...base,
          axis2: {
            ...base.axis2,
            transform: { kind: "even-divide", totalRange: v },
          },
        };
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
    }

    // Timeline-specific: time key input
    const effectiveLayout = panel.coordinateLayout ?? ARRANGEMENT_PRESETS[panel.clusterArrangement];
    const hasPropertyAxis = effectiveLayout.axis1.source.kind === "property"
      || effectiveLayout.axis2.source.kind === "property";
    if (panel.clusterArrangement === "timeline" || hasPropertyAxis) {
      const row = body.createDiv({ cls: "gi-setting-row" });
      row.createEl("span", { cls: "gi-setting-label", text: t("timeline.timeKey") });
      const input = row.createEl("input", { cls: "gi-setting-input", type: "text" });
      input.value = panel.timelineKey;
      input.placeholder = "date";
      input.setAttribute("aria-label", t("timeline.timeKeyHint"));
      attachDatalist(input, ctx.frontmatterKeys);
      input.addEventListener("change", () => {
        panel.timelineKey = input.value.trim() || "date";
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
      body.createEl("p", { cls: "gi-hint", text: t("timeline.timeKeyHint") });

      // Timeline end key input (for duration bars)
      const endRow = body.createDiv({ cls: "gi-setting-row" });
      endRow.createEl("span", { cls: "gi-setting-label", text: t("timeline.endKey") });
      const endInput = endRow.createEl("input", { cls: "gi-setting-input", type: "text" });
      endInput.value = panel.timelineEndKey;
      endInput.placeholder = "end-date";
      endInput.setAttribute("aria-label", t("timeline.endKeyHint"));
      attachDatalist(endInput, ctx.frontmatterKeys);
      endInput.addEventListener("change", () => {
        panel.timelineEndKey = endInput.value.trim() || "end-date";
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });

      // Duration bars toggle
      addToggle(body, t("timeline.showDurationBars"), panel.showDurationBars, (v) => {
        panel.showDurationBars = v;
        cb.markDirty();
      });

      // Timeline order fields
      const orderRow = body.createDiv({ cls: "gi-setting-row" });
      orderRow.createEl("span", { cls: "gi-setting-label", text: t("timeline.orderFields") });
      const orderInput = orderRow.createEl("input", { cls: "gi-setting-input", type: "text" });
      orderInput.value = panel.timelineOrderFields;
      orderInput.placeholder = "next,prev,parent_id,story_order";
      orderInput.setAttribute("aria-label", t("timeline.orderFieldsHint"));
      orderInput.addEventListener("change", () => {
        panel.timelineOrderFields = orderInput.value.trim() || "next,prev,parent_id,story_order";
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
      body.createEl("p", { cls: "gi-hint", text: t("timeline.orderFieldsHint") });
    }

    // Auto-fit toggle — disables manual spacing sliders when ON
    const spacingSliders: HTMLElement[] = [];
    const setSliderDisabled = (disabled: boolean) => {
      for (const el of spacingSliders) {
        el.style.opacity = disabled ? "0.5" : "";
        el.style.pointerEvents = disabled ? "none" : "";
      }
    };
    addToggle(body, t("cluster.autoFit"), panel.autoFit, (v) => {
      panel.autoFit = v;
      setSliderDisabled(v);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
      cb.doRenderKeepPanel();
    });

    // Guide lines toggle
    addToggle(body, t("cluster.showGuideLines"), panel.showGuideLines, (v) => {
      panel.showGuideLines = v;
      cb.markDirty();
    });

    // Guide line mode (only for timeline)
    if (panel.clusterArrangement === "timeline") {
      addSelect(body, t("cluster.guideLineMode"), [
        { value: "shared", label: t("cluster.guideLineMode.shared") },
        { value: "per-group", label: t("cluster.guideLineMode.perGroup") },
      ], panel.guideLineMode, (v) => {
        panel.guideLineMode = v as "shared" | "per-group";
        cb.markDirty();
      });
    }

    // Group grid toggle
    addToggle(body, t("cluster.showGroupGrid"), panel.showGroupGrid, (v) => {
      panel.showGroupGrid = v;
      cb.markDirty();
    });

    spacingSliders.push(addSlider(body, t("cluster.nodeSpacing"), 1, 10, 0.5, panel.clusterNodeSpacing, (v) => {
      panel.clusterNodeSpacing = v;
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    }));
    spacingSliders.push(addSlider(body, t("cluster.groupSize"), 0.5, 5, 0.25, panel.clusterGroupScale, (v) => {
      panel.clusterGroupScale = v;
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    }));
    spacingSliders.push(addSlider(body, t("cluster.groupSpacing"), 0.5, 5, 0.25, panel.clusterGroupSpacing, (v) => {
      panel.clusterGroupSpacing = v;
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    }));
    // Apply initial disabled state
    setSliderDisabled(panel.autoFit);
    addSlider(body, t("cluster.edgeBundleStrength"), 0, 1, 0.05, panel.edgeBundleStrength, (v) => {
      panel.edgeBundleStrength = v;
      cb.markDirty();
    });
    // --- Cluster group rules sub-section ---
    const clusterHeader = body.createDiv({ cls: "setting-item" });
    clusterHeader.createDiv({ cls: "setting-item-name", text: t("cluster.groupRulesHeading") });
    const clusterListEl = body.createDiv({ cls: "gi-multirule-list" });
    renderClusterRuleList(clusterListEl, panel, ctx, cb);

    const addClusterBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addGroupRule") });
    addClusterBtn.addEventListener("click", () => {
      panel.clusterGroupRules.push({ groupBy: "tag:?", recursive: false });
      renderClusterRuleList(clusterListEl, panel, ctx, cb);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    // --- Directional gravity rules sub-section ---
    const gravHeader = body.createDiv({ cls: "setting-item" });
    gravHeader.createDiv({ cls: "setting-item-name", text: t("cluster.gravityRulesHeading") });
    const gravListEl = body.createDiv({ cls: "gi-gravity-rule-list" });
    renderDirectionalGravityList(gravListEl, panel, ctx, cb);

    const addGravBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addGravityRule") });
    addGravBtn.addEventListener("click", () => {
      panel.directionalGravityRules.push({ filter: "*", direction: "top", strength: 0.1 });
      renderDirectionalGravityList(gravListEl, panel, ctx, cb);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    // --- Sort rules sub-section ---
    const sortHeader = body.createDiv({ cls: "setting-item" });
    sortHeader.createDiv({ cls: "setting-item-name", text: t("cluster.sortHeading") });
    const sortListEl = body.createDiv({ cls: "gi-sort-list" });
    renderSortRuleList(sortListEl, panel, cb);

    const addSortBtn = body.createEl("button", { cls: "gi-add-group", text: t("cluster.addSortRule") });
    addSortBtn.addEventListener("click", () => {
      panel.sortRules.push({ key: "label", order: "asc" });
      renderSortRuleList(sortListEl, panel, cb);
      cb.applyClusterForce();
      cb.doRender();
    });
  }, tHelp("help.clusterArrangement"), true);

  // Node rules
  buildSection(layoutTab, t("section.nodeRules"), (body) => {
    const ruleListEl = body.createDiv({ cls: "gi-noderule-list" });
    renderNodeRuleList(ruleListEl, panel, ctx, cb);

    const addBtn = body.createEl("button", { cls: "gi-add-group", text: t("nodeRules.addRule") });
    addBtn.addEventListener("click", () => {
      panel.nodeRules.push({ query: "*", spacingMultiplier: 1.0, gravityAngle: -1, gravityStrength: 0.1 });
      renderNodeRuleList(ruleListEl, panel, ctx, cb);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
  }, tHelp("help.nodeRules"), true);

  // =============================================
  // SETTINGS TAB
  // =============================================
  // --- Basic plugin settings ---
  buildSection(settingsTab, t("section.pluginSettings"), (body) => {
    const s = ctx.settings;

    addMultiValueInput(body, t("settings.metadataFields"), [...s.metadataFields], "tags, category...", getUnifiedFieldSuggestions(ctx), (v) => {
      s.metadataFields = v;
      ctx.saveSettings();
      cb.invalidateData();
    });

    addSlider(body, t("settings.enclosureMinRatio"), 0, 0.3, 0.02, s.enclosureMinRatio, (v) => {
      s.enclosureMinRatio = v;
      ctx.saveSettings();
      cb.doRender();
    });
  }, tHelp("help.pluginSettings"));

  // --- Ontology section (rule-based UI) ---
  buildSection(settingsTab, t("section.ontology"), (body) => {
    const s = ctx.settings;
    // Initialize rules from legacy fields if not present
    if (!s.ontology.rules || s.ontology.rules.length === 0) {
      s.ontology.rules = ontologyToRules(s.ontology);
    }
    const rules = s.ontology.rules;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      rulesToOntologyFields(rules, s.ontology);
      s.ontology.rules = rules;
      ctx.saveSettings();
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => cb.invalidateData(), 2000);
    };

    const listEl = body.createDiv({ cls: "gi-ont-rules" });

    function renderRules() {
      listEl.empty();
      for (let i = 0; i < rules.length; i++) {
        renderOntologyRule(listEl, rules, i, cb, save, () => renderRules());
      }
      // Add button
      const addBtn = listEl.createEl("button", { cls: "gi-ont-add-btn", text: `+ ${t("settings.ontAddRule")}` });
      addBtn.addEventListener("click", () => {
        rules.push({ forward: "", relation: "is-a", reverse: "" });
        save();
        renderRules();
      });
    }
    renderRules();

    addToggle(body, t("settings.tagHierarchy"), s.ontology.useTagHierarchy, (v) => {
      s.ontology.useTagHierarchy = v;
      ctx.saveSettings(); cb.invalidateData();
    });
  }, tHelp("help.ontology"));

  // --- Custom Mappings ---
  buildSection(settingsTab, t("section.customMappings"), (body) => {
    const mappingsListEl = body.createDiv({ cls: "gi-mappings-list" });
    renderCustomMappings(mappingsListEl, ctx.settings, ctx, cb);
  }, tHelp("help.customMappings"), true);

  // --- Tag Relations ---
  buildSection(settingsTab, t("section.tagRelations"), (body) => {
    const tagRelListEl = body.createDiv({ cls: "gi-tag-relations-list" });
    renderTagRelations(tagRelListEl, ctx.settings, ctx, cb);
  }, tHelp("help.tagRelations"), true);

  // --- Action buttons ---
  const actionRow = settingsTab.createDiv({ cls: "gi-panel-actions gi-action-row" });

  const saveBtn = actionRow.createEl("button", { cls: "mod-cta", text: t("action.save") });
  saveBtn.addEventListener("click", () => cb.saveGroupPreset());

  const resetBtn = actionRow.createEl("button", { text: t("action.reset") });
  resetBtn.addEventListener("click", () => cb.resetPanel());

  // --- Export / Import preset buttons ---
  const presetRow = settingsTab.createDiv({ cls: "ngp-panel-actions ngp-action-row" });

  const exportBtn = presetRow.createEl("button", { text: t("preset.export") });
  exportBtn.addEventListener("click", async () => {
    const json = exportPreset(panel);
    try {
      await navigator.clipboard.writeText(json);
      exportBtn.textContent = t("preset.exported");
      setTimeout(() => { exportBtn.textContent = t("preset.export"); }, 2000);
    } catch { /* clipboard not available */ }
  });

  const importBtn = presetRow.createEl("button", { text: t("preset.import") });
  importBtn.addEventListener("click", () => {
    const modal = settingsTab.createDiv({ cls: "ngp-import-modal" });
    modal.createEl("div", { text: t("preset.importPrompt"), cls: "ngp-import-label" });
    const textarea = modal.createEl("textarea", { cls: "ngp-import-textarea" });
    textarea.rows = 8;
    textarea.placeholder = "{ ... }";

    const btnRow = modal.createDiv({ cls: "ngp-import-btn-row" });
    const applyBtn = btnRow.createEl("button", { cls: "mod-cta", text: t("preset.import") });
    const cancelBtn = btnRow.createEl("button", { text: t("action.reset") });

    cancelBtn.addEventListener("click", () => modal.remove());

    applyBtn.addEventListener("click", () => {
      try {
        const preset = importPreset(textarea.value);
        const merged = applyPreset(panel, preset);
        Object.assign(panel, merged);
        modal.remove();
        cb.invalidateData();
        cb.rebuildPanel();
      } catch {
        textarea.addClass("ngp-import-error");
        modal.querySelector(".ngp-import-label")!.textContent = t("preset.importError");
      }
    });
  });
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function buildSection(container: HTMLElement, title: string, build: (body: HTMLElement) => void, helpText?: string, collapsed = false) {
  const section = container.createDiv({ cls: "graph-control-section tree-item" });
  if (collapsed) section.addClass("is-collapsed");
  const header = section.createDiv({ cls: "tree-item-self graph-control-section-header is-clickable" });
  const collapseIcon = header.createDiv({ cls: "tree-item-icon collapse-icon" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("svg-icon", "right-triangle");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3 8L12 17L21 8");
  svg.appendChild(path);
  collapseIcon.appendChild(svg);
  header.createEl("span", { cls: "tree-item-inner", text: title });

  if (helpText) {
    const helpBtn = header.createEl("span", { cls: "clickable-icon gi-section-help", attr: { "aria-label": t("help.ariaLabel") } });
    helpBtn.addClass("gi-help-btn");
    setIcon(helpBtn, "help-circle");
    helpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const existing = section.querySelector(".gi-help-popup");
      if (existing) { existing.remove(); return; }
      const popup = section.createDiv({ cls: "gi-help-popup" });
      popup.textContent = helpText;
    });
  }

  const body = section.createDiv({ cls: "tree-item-children" });
  build(body);
  header.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".gi-section-help")) return;
    const collapsed = section.hasClass("is-collapsed");
    section.toggleClass("is-collapsed", !collapsed);
  });
}

type TabId = "filter" | "display" | "layout" | "settings";

const TAB_DEFS: { id: TabId; labelKey: string; icon: string }[] = [
  { id: "filter",   labelKey: "tab.filter",   icon: "filter" },
  { id: "display",  labelKey: "tab.display",  icon: "eye" },
  { id: "layout",   labelKey: "tab.layout",   icon: "layout-grid" },
  { id: "settings", labelKey: "tab.settings", icon: "settings" },
];

function buildTabBar(
  container: HTMLElement,
  activeTab: TabId,
  tabContainers: Map<TabId, HTMLElement>,
  onSwitch: (tab: TabId) => void,
) {
  const bar = container.createDiv({ cls: "gi-tab-bar" });
  for (const def of TAB_DEFS) {
    const label = t(def.labelKey);
    const btn = bar.createEl("button", { cls: "gi-tab-btn", attr: { "aria-label": label, title: label } });
    setIcon(btn, def.icon);
    if (def.id === activeTab) btn.addClass("is-active");
    btn.addEventListener("click", () => {
      bar.querySelectorAll(".gi-tab-btn").forEach(b => b.removeClass("is-active"));
      btn.addClass("is-active");
      for (const [id, el] of tabContainers) {
        el.toggleClass("is-active", id === def.id);
      }
      onSwitch(def.id);
    });
  }
}

function buildPresetBar(container: HTMLElement, cb: PanelCallbacks) {
  const presets: { key: "simple" | "analysis" | "creative"; labelKey: string; descKey: string }[] = [
    { key: "simple", labelKey: "preset.simple", descKey: "preset.simpleDesc" },
    { key: "analysis", labelKey: "preset.analysis", descKey: "preset.analysisDesc" },
    { key: "creative", labelKey: "preset.creative", descKey: "preset.creativeDesc" },
  ];
  const bar = container.createDiv({ cls: "gi-preset-bar" });
  for (const p of presets) {
    const btn = bar.createEl("button", { cls: "gi-preset-btn", text: t(p.labelKey) });
    btn.setAttribute("aria-label", t(p.descKey));
    btn.title = t(p.descKey);
    btn.addEventListener("click", () => cb.applyPreset(p.key));
  }
}

/** Unified axis source text input with autocomplete.
 *  Users type a source descriptor string (e.g. "folder", "degree", "hop:name:5")
 *  which is parsed into an AxisSource on change. */
function buildAxisTextInput(
  body: HTMLElement,
  axisLabel: string,
  axisCfg: AxisConfig,
  axisNum: 1 | 2,
  panel: PanelState,
  cb: PanelCallbacks,
  _ctx: PanelContext,
  suggestions: string[],
) {
  const axisKey = axisNum === 1 ? "axis1" : "axis2";
  const row = body.createDiv({ cls: "gi-setting-row" });
  row.createEl("span", { cls: "gi-setting-label", text: axisLabel });
  const input = row.createEl("input", { cls: "gi-setting-input", type: "text" });
  input.value = axisSourceToString(axisCfg.source);
  input.placeholder = t("coord.axisSourceHint");
  attachDatalist(input, suggestions);
  input.addEventListener("change", () => {
    const parsed = parseAxisSourceString(input.value);
    if (!parsed) return;
    const base = panel.coordinateLayout
      ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
    panel.coordinateLayout = {
      ...base,
      [axisKey]: { ...base[axisKey], source: parsed },
    };
    cb.applyClusterForce();
    cb.rebuildPanel();
    cb.restartSimulation(0.5);
  });
}

/** Generate autocomplete suggestions for axis source input */
function getAxisSourceSuggestions(ctx: PanelContext): string[] {
  const keywords = ["index", "degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank", "random", "const"];
  const fields = getUnifiedFieldSuggestions(ctx);
  return [...keywords, ...fields, "hop:"];
}

function buildAxisSource(value: string, current: AxisConfig): AxisSource {
  return parseAxisSourceString(value) ?? current.source;
}

function getSourceValue(src: AxisSource): string {
  return axisSourceToString(src);
}

// ---------------------------------------------------------------------------
// Axis source string ↔ AxisSource conversion
// ---------------------------------------------------------------------------
// Supported syntax:
//   index                       → { kind: "index" }
//   random                      → { kind: "random", seed: 42 }
//   random:123                  → { kind: "random", seed: 123 }
//   const:5                     → { kind: "const", value: 5 }
//   degree / in-degree / out-degree / bfs-depth / sibling-rank
//                               → { kind: "metric", metric: "..." }
//   hop:nodeName                → { kind: "hop", from: "nodeName" }
//   hop:nodeName:5              → { kind: "hop", from: "nodeName", maxDepth: 5 }
//   path / file / folder / tag / category / id / isTag
//                               → { kind: "field", field: "..." }
//   [anyFrontmatterKey]         → { kind: "field", field: "..." }
// ---------------------------------------------------------------------------

const METRIC_NAMES = new Set(["degree", "in-degree", "out-degree", "bfs-depth", "sibling-rank"]);
const BUILT_IN_FIELDS = new Set(["path", "file", "folder", "tag", "category", "id", "isTag"]);

export function parseAxisSourceString(s: string): AxisSource | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  // Exact matches for keywords
  if (trimmed === "index") return { kind: "index" };
  if (METRIC_NAMES.has(trimmed)) return { kind: "metric", metric: trimmed as import("../types").MetricKind };

  // random / random:seed
  if (trimmed === "random") return { kind: "random", seed: 42 };
  if (trimmed.startsWith("random:")) {
    const seed = parseInt(trimmed.slice(7), 10);
    return { kind: "random", seed: isNaN(seed) ? 42 : seed };
  }

  // const:value
  if (trimmed.startsWith("const")) {
    if (trimmed === "const") return { kind: "const", value: 1 };
    if (trimmed.startsWith("const:")) {
      const v = parseFloat(trimmed.slice(6));
      return { kind: "const", value: isNaN(v) ? 1 : v };
    }
  }

  // hop:from or hop:from:maxDepth
  if (trimmed.startsWith("hop:")) {
    const parts = trimmed.slice(4).split(":");
    const from = parts[0] || "";
    const maxDepth = parts[1] ? parseInt(parts[1], 10) : undefined;
    return { kind: "hop", from, ...(maxDepth != null && !isNaN(maxDepth) ? { maxDepth } : {}) };
  }
  if (trimmed === "hop") return { kind: "hop", from: "" };

  // Built-in fields (path, file, folder, tag, category, id, isTag)
  if (BUILT_IN_FIELDS.has(trimmed)) return { kind: "field", field: trimmed };

  // Anything else with ":" suffix pattern like "tag:?" → treat as field name before ":"
  // But "tag:?" is just "tag" effectively, so strip trailing ":?" or ":*"
  const fieldMatch = trimmed.replace(/:[\?\*]?$/, "");
  if (fieldMatch && fieldMatch !== trimmed) {
    return { kind: "field", field: fieldMatch };
  }

  // Fallback: treat as a frontmatter field name
  return { kind: "field", field: trimmed };
}

export function axisSourceToString(src: AxisSource): string {
  switch (src.kind) {
    case "index": return "index";
    case "metric": return src.metric;
    case "random": return src.seed === 42 ? "random" : `random:${src.seed}`;
    case "const": return src.value === 1 ? "const" : `const:${src.value}`;
    case "hop": {
      let s = `hop:${src.from}`;
      if (src.maxDepth != null) s += `:${src.maxDepth}`;
      return s;
    }
    case "field": return src.field;
    case "property": return src.key; // legacy — display as field name
    default: return "index";
  }
}

function addSlider(container: HTMLElement, label: string, min: number, max: number, step: number, initial: number, onChange: (v: number) => void): HTMLElement {
  const row = container.createDiv({ cls: "setting-item mod-slider" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const input = control.createEl("input", { type: "range" });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.addEventListener("input", () => onChange(parseFloat(input.value)));
  return row;
}

function addToggle(container: HTMLElement, label: string, initial: boolean, onChange: (v: boolean) => void) {
  const row = container.createDiv({ cls: "setting-item mod-toggle" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const toggle = control.createDiv({ cls: "checkbox-container" + (initial ? " is-enabled" : "") });
  toggle.addEventListener("click", () => {
    const on = toggle.hasClass("is-enabled");
    toggle.toggleClass("is-enabled", !on);
    onChange(!on);
  });
}

function addTextInput(container: HTMLElement, label: string, initial: string, placeholder: string, onChange: (v: string) => void) {
  const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const input = control.createEl("input", { type: "text", placeholder });
  input.value = initial;
  input.addEventListener("change", () => onChange(input.value));
}

/** Text input with datalist suggestions (autocomplete from known values) */
function addSuggestInput(container: HTMLElement, label: string, initial: string, placeholder: string, suggestions: string[], onChange: (v: string) => void) {
  const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const listId = `gi-suggest-${label.replace(/\s+/g, "-")}-${Date.now()}`;
  const input = control.createEl("input", { type: "text", placeholder });
  input.value = initial;
  input.setAttribute("list", listId);
  const datalist = control.createEl("datalist");
  datalist.id = listId;
  for (const s of suggestions) {
    datalist.createEl("option", { value: s });
  }
  input.addEventListener("change", () => onChange(input.value));
}

/** Custom filtered autocomplete popup (replaces native datalist) */
function attachAutocomplete(input: HTMLInputElement, suggestions: string[]) {
  const popup = document.createElement("div");
  popup.className = "gi-ac-popup";
  popup.style.display = "none";
  // Append to the flow/pair container (has position:relative)
  const anchor = input.closest(".gi-ont-flow") ?? input.closest(".gi-ont-pair") ?? input.parentElement!;
  anchor.appendChild(popup);

  let selected = -1;

  function show() {
    const q = input.value.toLowerCase();
    const filtered = suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 12);
    popup.empty();
    if (filtered.length === 0) { popup.style.display = "none"; return; }
    for (let i = 0; i < filtered.length; i++) {
      const item = popup.createDiv({ cls: "gi-ac-item", text: filtered[i] });
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = filtered[i];
        input.dispatchEvent(new Event("change"));
        popup.style.display = "none";
      });
    }
    // Position below the input
    const anchorRect = anchor.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    popup.style.left = (inputRect.left - anchorRect.left) + "px";
    popup.style.top = (inputRect.bottom - anchorRect.top + 2) + "px";
    popup.style.display = "";
    selected = -1;
  }

  input.addEventListener("focus", show);
  input.addEventListener("input", show);
  input.addEventListener("blur", () => { setTimeout(() => popup.style.display = "none", 150); });
  input.addEventListener("keydown", (e) => {
    const items = popup.querySelectorAll(".gi-ac-item");
    if (!items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); selected = Math.min(selected + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selected = Math.max(selected - 1, 0); }
    else if (e.key === "Enter" && selected >= 0) {
      e.preventDefault();
      input.value = (items[selected] as HTMLElement).textContent ?? "";
      input.dispatchEvent(new Event("change"));
      popup.style.display = "none";
      return;
    } else return;
    items.forEach((it, i) => it.toggleClass("is-selected", i === selected));
  });
}

/** Legacy alias — other inputs still call this */
function attachDatalist(input: HTMLInputElement, suggestions: string[]) {
  attachAutocomplete(input, suggestions);
}

/** Unified field suggestion list: built-in fields + all frontmatter keys (including nested) */
function getUnifiedFieldSuggestions(ctx: PanelContext): string[] {
  const builtIn = ["path", "file", "tag", "category", "folder", "id", "isTag"];
  return [...new Set([...builtIn, ...ctx.frontmatterKeys])];
}

/** GroupBy suggestion list: returns {value, label} options in "field:?" format */
function getGroupByOptions(ctx: PanelContext): { value: string; label: string }[] {
  const builtIn = ["tag", "category", "folder", "path", "file", "id", "isTag"];
  const allFields = [...new Set([...builtIn, ...ctx.frontmatterKeys])];
  return allFields.map(f => ({ value: `${f}:?`, label: `${f}:?` }));
}

// ---------------------------------------------------------------------------
// Ontology rule row: [input] [▼ relation] [input] [×]
// ---------------------------------------------------------------------------

const RELATION_OPTIONS: { value: OntologyRelation; label: string }[] = [
  { value: "is-a", label: "is-a" },
  { value: "has-a", label: "has-a" },
  { value: "is-from", label: "is-from" },
  { value: "is-alike", label: "is-alike" },
  { value: "sibling", label: "sibling" },
];

function renderOntologyRule(
  container: HTMLElement,
  rules: OntologyRule[],
  idx: number,
  cb: PanelCallbacks,
  save: () => void,
  rerender: () => void,
) {
  const rule = rules[idx];
  const row = container.createDiv({ cls: "gi-ont-rule" });

  // Forward input
  const fwdInput = row.createEl("input", {
    cls: "gi-search gi-ont-input",
    type: "text",
    placeholder: "parent, extends...",
  });
  fwdInput.value = rule.forward;
  fwdInput.addEventListener("change", () => { rule.forward = fwdInput.value; save(); });
  attachQueryHint(fwdInput, (field) => cb.collectValueSuggestions(field));

  // Relation dropdown
  const relBtn = row.createEl("button", { cls: "gi-ont-rel-btn" });
  relBtn.textContent = rule.relation;
  relBtn.addEventListener("click", () => {
    // Cycle through options or show popup
    const popup = row.querySelector(".gi-ont-rel-popup");
    if (popup) { popup.remove(); return; }
    const menu = row.createDiv({ cls: "gi-ont-rel-popup" });
    for (const opt of RELATION_OPTIONS) {
      const item = menu.createDiv({
        cls: `gi-ont-rel-item${opt.value === rule.relation ? " is-active" : ""}`,
        text: opt.label,
      });
      item.addEventListener("click", () => {
        rule.relation = opt.value;
        relBtn.textContent = opt.label;
        menu.remove();
        save();
      });
    }
  });

  // Reverse input (hidden for bidirectional relations)
  const isBidir = rule.relation === "is-alike" || rule.relation === "sibling";
  const revInput = row.createEl("input", {
    cls: "gi-search gi-ont-input",
    type: "text",
    placeholder: isBidir ? "(双方向)" : "child, down...",
  });
  revInput.value = rule.reverse;
  revInput.disabled = isBidir;
  if (isBidir) revInput.classList.add("is-disabled");
  revInput.addEventListener("change", () => { rule.reverse = revInput.value; save(); });
  attachQueryHint(revInput, (field) => cb.collectValueSuggestions(field));

  // Delete button
  const delBtn = row.createEl("button", { cls: "gi-ont-del-btn", attr: { "aria-label": "Delete" } });
  setIcon(delBtn, "x");
  delBtn.addEventListener("click", () => {
    rules.splice(idx, 1);
    save();
    rerender();
  });
}

/**
 * Multi-value input: renders a list of values as individual rows with add/delete buttons
 * and autocomplete suggestions. Replaces comma-separated text inputs for list-type fields.
 */
function addMultiValueInput(
  container: HTMLElement,
  label: string,
  values: string[],
  placeholder: string,
  suggestions: string[],
  onChange: (values: string[]) => void,
) {
  const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control gi-multivalue-control" });

  const listEl = control.createDiv({ cls: "gi-multivalue-list" });

  function rebuild() {
    listEl.empty();
    values.forEach((val, i) => {
      const itemRow = listEl.createDiv({ cls: "gi-multivalue-row" });
      const input = itemRow.createEl("input", { type: "text", placeholder, cls: "gi-multivalue-field" });
      input.value = val;
      attachDatalist(input, suggestions);
      input.addEventListener("change", () => {
        values[i] = input.value.trim();
        onChange(values.filter(Boolean));
      });
      const rmBtn = itemRow.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00d7" });
      rmBtn.addEventListener("click", () => {
        values.splice(i, 1);
        onChange(values.filter(Boolean));
        rebuild();
      });
    });

    const addBtn = listEl.createEl("button", { cls: "gi-add-group gi-multivalue-add", text: "+" });
    addBtn.addEventListener("click", () => {
      values.push("");
      rebuild();
      // Focus the newly added input
      const inputs = listEl.querySelectorAll<HTMLInputElement>(".gi-multivalue-field");
      inputs[inputs.length - 1]?.focus();
    });
  }

  rebuild();
}

// ---------------------------------------------------------------------------
// GroupBy multi-rule editor
// ---------------------------------------------------------------------------

/** Parse groupBy string into individual rules: "tag AND category" → [{field:"tag",op:"AND"},{field:"category"}] */
function parseGroupByRules(groupBy: string): GroupByRule[] {
  if (!groupBy || groupBy === "none") return [];
  // Split by known operators while preserving them
  const parts = groupBy.split(/\s+(AND|OR|XOR|NOR|NAND|NOT)\s+/i);
  const rules: GroupByRule[] = [];
  for (let i = 0; i < parts.length; i++) {
    const trimmed = parts[i].trim();
    if (!trimmed) continue;
    if (["AND", "OR", "XOR", "NOR", "NAND", "NOT"].includes(trimmed.toUpperCase())) {
      // Attach operator to previous rule
      if (rules.length > 0) rules[rules.length - 1].op = trimmed.toUpperCase();
    } else {
      // Could be comma-separated
      for (const field of trimmed.split(",")) {
        const f = field.trim();
        if (f) rules.push({ field: f, indent: 0 });
      }
    }
  }
  return rules.length > 0 ? rules : [];
}

function serializeGroupByRules(rules: GroupByRule[]): string {
  if (rules.length === 0) return "none";
  return rules.map((r, i) => {
    const op = i < rules.length - 1 ? ` ${r.op || "AND"} ` : "";
    return r.field + op;
  }).join("");
}

function renderGroupByRules(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();

  // Use panel.groupByRules as the authoritative source.
  // Initialize from the groupBy string only on first render.
  if (!panel.groupByRules) {
    panel.groupByRules = parseGroupByRules(panel.groupBy);
  }
  const rules = panel.groupByRules;
  const groupByOpts = getGroupByOptions(ctx);

  /** Sync panel.groupBy from rules (only filled fields) and re-render graph. */
  function syncAndRender() {
    const filled = rules.filter(r => r.field.trim() !== "");
    panel.groupBy = filled.length > 0 ? serializeGroupByRules(filled) : "none";
    panel.collapsedGroups.clear();
    cb.doRenderKeepPanel();
  }

  /** Re-render the rows UI from the rules array. */
  function rebuildUI() {
    container.empty();
    renderRows();
  }

  /** Full rebuild: update UI + sync to graph. */
  function rebuild() {
    rebuildUI();
    syncAndRender();
  }

  function renderRows() {
    rules.forEach((rule, i) => {
      // Operator dropdown between rows
      if (i > 0) {
        const opRow = container.createDiv({ cls: "gi-expr-op-row" });
        opRow.style.paddingLeft = `${(rule.indent ?? 0) * 20}px`;
        const opSel = opRow.createEl("select", { cls: "dropdown gi-expr-op" });
        for (const op of ["AND", "OR", "XOR", "NOR", "NAND", "NOT"]) {
          const el = opSel.createEl("option", { text: op, value: op });
          if (op === (rules[i - 1].op ?? "AND")) el.selected = true;
        }
        opSel.addEventListener("change", () => { rules[i - 1].op = opSel.value; rebuild(); });
      }

      const rowEl = container.createDiv({ cls: "gi-expr-row" });
      rowEl.style.paddingLeft = `${(rule.indent ?? 0) * 20}px`;

      // Field input with field:? suggestions (similar to search query UI)
      const fieldInput = rowEl.createEl("input", { cls: "gi-expr-field", type: "text", placeholder: "tag:?, category:?, folder:?..." });
      fieldInput.value = rule.field;
      attachFixedHint(fieldInput, groupByOpts, (val) => {
        rule.field = val;
        rebuild();
      });
      fieldInput.addEventListener("change", () => {
        rule.field = fieldInput.value.trim();
        rebuild();
      });

      // Indent/dedent
      const indentBtn = rowEl.createEl("span", { cls: "gi-expr-btn gi-indent-btn", text: "\u2192" });
      indentBtn.addEventListener("click", () => { rule.indent = (rule.indent ?? 0) + 1; rebuild(); });
      const dedentBtn = rowEl.createEl("span", { cls: "gi-expr-btn gi-indent-btn", text: "\u2190" });
      dedentBtn.addEventListener("click", () => { rule.indent = Math.max(0, (rule.indent ?? 0) - 1); rebuild(); });

      // Delete
      const rmBtn = rowEl.createEl("span", { cls: "gi-group-remove", text: "\u00d7" });
      rmBtn.addEventListener("click", () => {
        rules.splice(i, 1);
        rebuild();
      });
    });

    // Add rule button
    const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("expr.addCondition") });
    addBtn.addEventListener("click", () => {
      rules.push({ field: "", indent: 0 });
      // Only rebuild UI — don't sync to graph or trigger doRenderKeepPanel.
      // The empty rule lives in panel.groupByRules and survives buildPanel() calls.
      rebuildUI();
    });
  }

  renderRows();
}

/** Checkbox group — shows items as individually toggleable checkboxes */
function addCheckboxGroup(
  container: HTMLElement,
  label: string,
  items: string[],
  selected: Set<string>,
  onChange: (selected: Set<string>) => void,
) {
  const row = container.createDiv({ cls: "setting-item gi-full-width-row" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control gi-checkbox-group" });
  if (items.length === 0) {
    control.createEl("span", { cls: "gi-checkbox-empty", text: "—" });
    return;
  }
  for (const item of items) {
    const lbl = control.createEl("label", { cls: "gi-checkbox-item" });
    const cb = lbl.createEl("input", { type: "checkbox" });
    cb.checked = selected.has(item);
    lbl.createEl("span", { text: item });
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(item);
      else selected.delete(item);
      onChange(selected);
    });
  }
}

// ---------------------------------------------------------------------------
// Custom Mappings UI (ExcaliBrain compat)
// ---------------------------------------------------------------------------
function renderCustomMappings(
  container: HTMLElement,
  s: GraphViewsSettings,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  if (!s.ontology.customMappings) s.ontology.customMappings = {};
  const entries = Object.entries(s.ontology.customMappings);

  for (const [field, type] of entries) {
    const row = container.createDiv({ cls: "gi-mapping-row" });

    const fieldInput = row.createEl("input", { type: "text", cls: "gi-mapping-field", placeholder: t("settings.mappingFieldPlaceholder") });
    fieldInput.value = field;
    attachDatalist(fieldInput, ctx.frontmatterKeys);

    const typeSelect = row.createEl("select", { cls: "gi-mapping-type dropdown" });
    for (const opt of ["inheritance", "aggregation", "similar", "sibling", "sequence"] as const) {
      const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.mappingType.${opt}`) });
      if (opt === type) optEl.selected = true;
    }

    const removeBtn = row.createEl("button", { cls: "gi-mapping-remove clickable-icon", text: "\u00d7" });

    const update = () => {
      const oldField = field;
      const newField = fieldInput.value.trim();
      const newType = typeSelect.value as "inheritance" | "aggregation" | "similar";
      if (oldField !== newField) delete s.ontology.customMappings[oldField];
      if (newField) s.ontology.customMappings[newField] = newType;
      ctx.saveSettings();
      cb.invalidateData();
    };
    fieldInput.addEventListener("change", update);
    typeSelect.addEventListener("change", update);
    removeBtn.addEventListener("click", () => {
      delete s.ontology.customMappings[field];
      ctx.saveSettings();
      cb.invalidateData();
      renderCustomMappings(container, s, ctx, cb);
    });
  }

  const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addMapping") });
  addBtn.addEventListener("click", () => {
    s.ontology.customMappings[""] = "inheritance";
    renderCustomMappings(container, s, ctx, cb);
  });
}

// ---------------------------------------------------------------------------
// Tag Relations UI (explicit tag-to-tag relationships)
// ---------------------------------------------------------------------------
function renderTagRelations(
  container: HTMLElement,
  s: GraphViewsSettings,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  if (!s.ontology.tagRelations) s.ontology.tagRelations = [];

  for (let i = 0; i < s.ontology.tagRelations.length; i++) {
    const rel = s.ontology.tagRelations[i];
    const row = container.createDiv({ cls: "gi-tag-rel-row" });

    const srcInput = row.createEl("input", { type: "text", cls: "gi-tag-rel-src", placeholder: t("settings.tagRelSourcePlaceholder") });
    srcInput.value = rel.source;
    attachDatalist(srcInput, ctx.availableTags);

    const typeSelect = row.createEl("select", { cls: "gi-tag-rel-type dropdown" });
    for (const opt of ["inheritance", "aggregation"] as const) {
      const optEl = typeSelect.createEl("option", { value: opt, text: t(`settings.tagRelType.${opt}`) });
      if (opt === rel.type) optEl.selected = true;
    }

    const tgtInput = row.createEl("input", { type: "text", cls: "gi-tag-rel-tgt", placeholder: t("settings.tagRelTargetPlaceholder") });
    tgtInput.value = rel.target;
    attachDatalist(tgtInput, ctx.availableTags);

    const removeBtn = row.createEl("button", { cls: "gi-tag-rel-remove clickable-icon", text: "\u00d7" });

    const update = () => {
      rel.source = srcInput.value.trim().replace(/^#/, "");
      rel.target = tgtInput.value.trim().replace(/^#/, "");
      rel.type = typeSelect.value as "inheritance" | "aggregation";
      ctx.saveSettings();
      cb.invalidateData();
    };
    srcInput.addEventListener("change", update);
    tgtInput.addEventListener("change", update);
    typeSelect.addEventListener("change", update);
    removeBtn.addEventListener("click", () => {
      s.ontology.tagRelations.splice(i, 1);
      ctx.saveSettings();
      cb.invalidateData();
      renderTagRelations(container, s, ctx, cb);
    });
  }

  const addBtn = container.createEl("button", { cls: "gi-add-group", text: t("settings.addTagRelation") });
  addBtn.addEventListener("click", () => {
    s.ontology.tagRelations.push({ source: "", target: "", type: "inheritance" });
    renderTagRelations(container, s, ctx, cb);
  });
}

// ---------------------------------------------------------------------------
// Search options hint — shown below query inputs on focus, like core graph view
// ---------------------------------------------------------------------------
function getQueryOptions(): { prefix: string; desc: string }[] {
  return [
    { prefix: "path:", desc: t("query.pathMatch") },
    { prefix: "file:", desc: t("query.fileMatch") },
    { prefix: "tag:", desc: t("query.tagSearch") },
    { prefix: "category:", desc: t("query.categoryMatch") },
    { prefix: "id:", desc: t("query.idMatch") },
    { prefix: "isTag", desc: t("query.isTag") },
    { prefix: "hop:name:N", desc: t("query.hop") },
    { prefix: "[property]:", desc: t("query.property") },
    { prefix: "AND / OR", desc: t("query.boolOps") },
    { prefix: "*", desc: t("query.all") },
  ];
}

/** Maps a search prefix to the field name used by collectValueSuggestions.
 *  Known prefixes are listed here; any unknown `xxx:` prefix is also accepted
 *  dynamically (forwarded as-is to getSuggestions). */
const KNOWN_PREFIXES: Record<string, string> = {
  "path:": "path",
  "file:": "file",
  "tag:": "tag",
  "category:": "category",
  "id:": "id",
};

/** Resolve a prefix like "status:" to a field name. Known prefixes are mapped
 *  explicitly; any other "xxx:" prefix returns the xxx portion, enabling
 *  frontmatter property value suggestions. */
function resolvePrefix(prefix: string): string {
  if (prefix in KNOWN_PREFIXES) return KNOWN_PREFIXES[prefix];
  // Accept any "field:" pattern — strip trailing colon to get field name
  if (prefix.endsWith(":") && prefix.length > 1) return prefix.slice(0, -1);
  return "";
}

/**
 * Parse the current input to detect if cursor is inside a `prefix:value` token.
 * Returns { prefix, partial } if found, null otherwise.
 */
function parseActiveToken(value: string, cursorPos: number): { prefix: string; partial: string; tokenStart: number } | null {
  // Walk backwards from cursor to find the token start
  const before = value.slice(0, cursorPos);
  // Find the last space before cursor (or start of string)
  const lastSpace = before.lastIndexOf(" ");
  const token = before.slice(lastSpace + 1);
  const colonIdx = token.indexOf(":");
  if (colonIdx < 0) return null;
  const prefix = token.slice(0, colonIdx + 1); // e.g. "path:"
  if (!resolvePrefix(prefix)) return null;
  const partial = token.slice(colonIdx + 1); // e.g. "bibl"
  return { prefix, partial, tokenStart: lastSpace + 1 + colonIdx + 1 };
}

function attachQueryHint(input: HTMLInputElement, getSuggestions: (field: string) => string[]) {
  let hintEl: HTMLElement | null = null;
  let selectedIdx = -1;
  let currentItems: { text: string; onSelect: () => void }[] = [];

  // Create anchor wrapper immediately (not during focus, which would steal focus)
  const anchor = document.createElement("div");
  anchor.className = "gi-suggest-anchor";
  input.parentNode!.insertBefore(anchor, input);
  anchor.appendChild(input);

  const insertText = (text: string) => {
    const cur = input.value;
    const pos = input.selectionStart ?? cur.length;
    const before = cur.slice(0, pos);
    const after = cur.slice(pos);
    const needSpace = before.length > 0 && !before.endsWith(" ") ? " " : "";
    input.value = before + needSpace + text + after;
    input.focus();
    const newPos = (before + needSpace + text).length;
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const replaceTokenValue = (tokenStart: number, value: string) => {
    const cur = input.value;
    // Find end of current token (next space or end)
    let end = cur.indexOf(" ", tokenStart);
    if (end < 0) end = cur.length;
    input.value = cur.slice(0, tokenStart) + value + cur.slice(end);
    input.focus();
    const newPos = tokenStart + value.length;
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const updateSelection = (container: HTMLElement) => {
    const rows = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    rows.forEach((r, i) => {
      r.classList.toggle("is-selected", i === selectedIdx);
    });
  };

  const buildOptionsList = () => {
    currentItems = getQueryOptions().map(opt => ({
      text: opt.prefix,
      onSelect: () => {
        insertText(opt.prefix.endsWith(":") ? opt.prefix : opt.prefix + " ");
        // After inserting prefix, rebuild to show value suggestions
        rebuildHint();
      },
    }));
  };

  const buildValueList = (prefix: string, partial: string, tokenStart: number) => {
    const field = resolvePrefix(prefix);
    if (!field) return false;
    const allValues = getSuggestions(field);
    const lowerPartial = partial.toLowerCase();
    const filtered = partial
      ? allValues.filter(v => v.toLowerCase().includes(lowerPartial))
      : allValues;
    if (filtered.length === 0) return false;
    currentItems = filtered.slice(0, 30).map(v => ({
      text: v,
      onSelect: () => {
        replaceTokenValue(tokenStart, v);
        dismissHint();
      },
    }));
    return true;
  };

  const renderHint = (headerText: string) => {
    if (hintEl) hintEl.remove();
    hintEl = document.createElement("div");
    hintEl.className = "suggestion-container mod-search-suggestion";

    // Header
    const headerItem = hintEl.createDiv({ cls: "suggestion-item mod-complex search-suggest-item mod-group" });
    const headerContent = headerItem.createDiv({ cls: "suggestion-content" });
    const headerTitle = headerContent.createDiv({ cls: "suggestion-title list-item-part mod-extended" });
    headerTitle.createEl("span", { text: headerText });
    const headerAux = headerItem.createDiv({ cls: "suggestion-aux" });
    const infoBtn = headerAux.createDiv({ cls: "list-item-part search-suggest-icon clickable-icon" });
    infoBtn.setAttribute("aria-label", t("query.viewDetails"));
    setIcon(infoBtn, "info");

    // Items
    for (let i = 0; i < currentItems.length; i++) {
      const ci = currentItems[i];
      const item = hintEl.createDiv({ cls: "suggestion-item mod-complex search-suggest-item" });
      const content = item.createDiv({ cls: "suggestion-content" });
      const title = content.createDiv({ cls: "suggestion-title" });
      // For options list, show description; for value list, just the value
      const opt = getQueryOptions().find(o => o.prefix === ci.text);
      if (opt) {
        title.createEl("span", { text: opt.prefix });
        title.createEl("span", { cls: "search-suggest-info-text", text: opt.desc });
      } else {
        title.createEl("span", { text: ci.text });
      }
      item.addEventListener("click", () => ci.onSelect());
      item.addEventListener("mouseenter", () => {
        selectedIdx = i;
        updateSelection(hintEl!);
      });
    }

    selectedIdx = 0;
    updateSelection(hintEl);
    anchor.appendChild(hintEl);
  };

  const rebuildHint = () => {
    const pos = input.selectionStart ?? input.value.length;
    const token = parseActiveToken(input.value, pos);
    if (token && buildValueList(token.prefix, token.partial, token.tokenStart)) {
      renderHint(token.prefix.slice(0, -1) + " " + t("query.candidates"));
    } else {
      buildOptionsList();
      renderHint(t("query.searchOptions"));
    }
  };

  const dismissHint = () => {
    hintEl?.remove();
    hintEl = null;
    selectedIdx = -1;
    currentItems = [];
  };

  const show = () => rebuildHint();

  const hide = () => {
    if (!hintEl) return;
    setTimeout(() => {
      if (input === document.activeElement) return;
      dismissHint();
    }, 150);
  };

  input.addEventListener("focus", show);
  input.addEventListener("blur", hide);
  // Rebuild on input to switch between options/values as user types
  input.addEventListener("input", () => {
    if (input === document.activeElement) rebuildHint();
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!hintEl || currentItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % currentItems.length;
      updateSelection(hintEl);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + currentItems.length) % currentItems.length;
      updateSelection(hintEl);
    } else if (e.key === "Enter" && selectedIdx >= 0 && selectedIdx < currentItems.length) {
      e.preventDefault();
      currentItems[selectedIdx].onSelect();
    } else if (e.key === "Escape") {
      dismissHint();
    }
  });
}

// ---------------------------------------------------------------------------
// Fixed-option hint (lightweight autocomplete for a small set of choices)
// ---------------------------------------------------------------------------
function attachFixedHint(
  input: HTMLInputElement,
  options: { value: string; label: string }[],
  onSelect: (value: string) => void,
) {
  let hintEl: HTMLElement | null = null;
  let selectedIdx = -1;
  let filteredOpts = options;

  const anchor = document.createElement("div");
  anchor.className = "gi-suggest-anchor";
  input.parentNode!.insertBefore(anchor, input);
  anchor.appendChild(input);

  const updateSelection = (container: HTMLElement) => {
    const rows = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    rows.forEach((r, idx) => r.classList.toggle("is-selected", idx === selectedIdx));
  };

  const renderHint = () => {
    if (hintEl) hintEl.remove();
    if (filteredOpts.length === 0) { hintEl = null; return; }
    hintEl = document.createElement("div");
    hintEl.className = "suggestion-container mod-search-suggestion";
    for (let i = 0; i < filteredOpts.length; i++) {
      const opt = filteredOpts[i];
      const item = hintEl.createDiv({ cls: "suggestion-item mod-complex search-suggest-item" });
      const content = item.createDiv({ cls: "suggestion-content" });
      const title = content.createDiv({ cls: "suggestion-title" });
      title.createEl("span", { text: opt.label });
      if (opt.value !== opt.label) {
        title.createEl("span", { cls: "search-suggest-info-text", text: opt.value });
      }
      item.addEventListener("click", () => {
        input.value = opt.label;
        onSelect(opt.value);
        dismissHint();
      });
      item.addEventListener("mouseenter", () => {
        selectedIdx = i;
        updateSelection(hintEl!);
      });
    }
    selectedIdx = 0;
    updateSelection(hintEl);
    anchor.appendChild(hintEl);
  };

  const dismissHint = () => {
    hintEl?.remove();
    hintEl = null;
    selectedIdx = -1;
  };

  const rebuild = () => {
    const q = input.value.toLowerCase().trim();
    filteredOpts = q ? options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;
    renderHint();
  };

  input.addEventListener("focus", rebuild);
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (input === document.activeElement) return;
      dismissHint();
    }, 150);
  });
  input.addEventListener("input", () => {
    if (input === document.activeElement) rebuild();
  });
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!hintEl || filteredOpts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIdx = (selectedIdx + 1) % filteredOpts.length;
      updateSelection(hintEl);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIdx = (selectedIdx - 1 + filteredOpts.length) % filteredOpts.length;
      updateSelection(hintEl);
    } else if (e.key === "Enter" && selectedIdx >= 0 && selectedIdx < filteredOpts.length) {
      e.preventDefault();
      const opt = filteredOpts[selectedIdx];
      input.value = opt.label;
      onSelect(opt.value);
      dismissHint();
    } else if (e.key === "Escape") {
      dismissHint();
    }
  });
}

// ---------------------------------------------------------------------------
// Search-jump dropdown: shows matching node IDs and jumps to selected node
// ---------------------------------------------------------------------------
function attachSearchJump(input: HTMLInputElement, cb: PanelCallbacks) {
  let dropdownEl: HTMLElement | null = null;
  let selectedIdx = 0;
  let filteredIds: string[] = [];

  // The input is already inside an ngp-suggest-anchor wrapper (from attachQueryHint).
  // We attach our dropdown to the same anchor so it stacks correctly.
  const getAnchor = (): HTMLElement => input.closest(".ngp-suggest-anchor") ?? input.parentElement!;

  const dismiss = () => {
    dropdownEl?.remove();
    dropdownEl = null;
    filteredIds = [];
    selectedIdx = 0;
  };

  const updateSelection = () => {
    if (!dropdownEl) return;
    const items = dropdownEl.querySelectorAll(".gi-search-result-item");
    items.forEach((el, i) => el.classList.toggle("is-selected", i === selectedIdx));
  };

  const jumpToSelected = () => {
    if (filteredIds.length > 0 && selectedIdx >= 0 && selectedIdx < filteredIds.length) {
      cb.jumpToNode(filteredIds[selectedIdx]);
      dismiss();
    }
  };

  const rebuild = () => {
    const query = input.value.trim().toLowerCase();
    // Don't show the jump dropdown for structured queries (field:value, hop:, etc.)
    if (!query || /^[a-z]+:/i.test(query)) {
      dismiss();
      return;
    }

    const allIds = cb.getNodeIds();
    filteredIds = allIds.filter(id => id.toLowerCase().includes(query)).slice(0, 10);

    if (filteredIds.length === 0) {
      dismiss();
      return;
    }

    if (!dropdownEl) {
      dropdownEl = document.createElement("div");
      dropdownEl.className = "gi-search-results";
      getAnchor().appendChild(dropdownEl);
    }

    // Clear and rebuild items
    dropdownEl.empty();

    // Hint header
    const hint = dropdownEl.createDiv({ cls: "gi-search-result-hint" });
    hint.textContent = t("search.jumpHint");

    for (let i = 0; i < filteredIds.length; i++) {
      const id = filteredIds[i];
      const item = dropdownEl.createDiv({ cls: "gi-search-result-item" });
      item.textContent = id;
      item.addEventListener("click", () => {
        cb.jumpToNode(id);
        dismiss();
      });
      item.addEventListener("mouseenter", () => {
        selectedIdx = i;
        updateSelection();
      });
    }

    selectedIdx = 0;
    updateSelection();
  };

  input.addEventListener("input", () => {
    // Defer slightly so attachQueryHint processes first
    setTimeout(rebuild, 50);
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!dropdownEl || filteredIds.length === 0) return;
    if (e.key === "Enter") {
      // Only handle Enter for jump when the query hint dropdown is NOT visible.
      const anchor = getAnchor();
      const queryHint = anchor.querySelector(".suggestion-container.mod-search-suggestion");
      if (queryHint) return; // let attachQueryHint handle it
      e.preventDefault();
      jumpToSelected();
    } else if (e.key === "Escape") {
      dismiss();
    } else if (e.key === "ArrowDown") {
      if (!getAnchor().querySelector(".suggestion-container.mod-search-suggestion")) {
        e.preventDefault();
        selectedIdx = (selectedIdx + 1) % filteredIds.length;
        updateSelection();
      }
    } else if (e.key === "ArrowUp") {
      if (!getAnchor().querySelector(".suggestion-container.mod-search-suggestion")) {
        e.preventDefault();
        selectedIdx = (selectedIdx - 1 + filteredIds.length) % filteredIds.length;
        updateSelection();
      }
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(dismiss, 200);
  });
}

function addSelect(container: HTMLElement, label: string, options: { value: string; label: string }[], initial: string, onChange: (v: string) => void) {
  const row = container.createDiv({ cls: "setting-item" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const sel = control.createEl("select", { cls: "dropdown" });
  for (const opt of options) {
    const el = sel.createEl("option", { text: opt.label, value: opt.value });
    if (opt.value === initial) el.selected = true;
  }
  sel.addEventListener("change", () => onChange(sel.value));
}

function addDirectionToggle(container: HTMLElement, label: string, initial: 1 | -1, onChange: (v: 1 | -1) => void) {
  const row = container.createDiv({ cls: "setting-item" });
  const info = row.createDiv({ cls: "setting-item-info" });
  info.createDiv({ cls: "setting-item-name", text: label });
  const control = row.createDiv({ cls: "setting-item-control" });
  const btn = control.createEl("button", { cls: "gi-direction-btn", text: initial === 1 ? t("direction.clockwise") : t("direction.counterClockwise") });
  btn.dataset.dir = initial === 1 ? "cw" : "ccw";
  btn.addEventListener("click", () => {
    const next: 1 | -1 = btn.dataset.dir === "cw" ? -1 : 1;
    btn.textContent = next === 1 ? t("direction.clockwise") : t("direction.counterClockwise");
    btn.dataset.dir = next === 1 ? "cw" : "ccw";
    onChange(next);
  });
}

function renderGroupList(container: HTMLElement, panel: PanelState, ctx: PanelContext, cb: PanelCallbacks) {
  container.empty();
  panel.groups.forEach((g, i) => {
    const row = container.createDiv({ cls: "gi-group-rule-row" });

    // Color dot (click to cycle)
    const colorDot = row.createDiv({ cls: "gi-group-color gi-color-dot" });
    colorDot.style.background = g.color;
    colorDot.addEventListener("click", () => {
      const next = DEFAULT_COLORS[(DEFAULT_COLORS.indexOf(g.color as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length];
      g.color = next;
      colorDot.style.background = next;
      cb.recolorNodes();
    });

    // Search-bar style input (same as top search)
    const input = row.createEl("input", {
      cls: "gi-search gi-group-search",
      type: "text",
      placeholder: t("search.placeholder"),
    });
    input.value = g.expression ? serializeExpr(g.expression) : "";
    input.addEventListener("input", () => {
      g.expression = parseQueryExpr(input.value);
      cb.recolorNodes();
    });
    attachQueryHint(input, (field) => cb.collectValueSuggestions(field));

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "×" });
    rm.addEventListener("click", () => {
      panel.groups.splice(i, 1);
      renderGroupList(container, panel, ctx, cb);
      cb.recolorNodes();
    });
  });
}

function getSortKeyOptions(): { value: SortKey; label: string }[] {
  return [
    { value: "degree", label: t("sort.degree") },
    { value: "in-degree", label: t("sort.inDegree") },
    { value: "tag", label: t("sort.tag") },
    { value: "category", label: t("sort.category") },
    { value: "label", label: t("sort.label") },
    { value: "importance", label: t("sort.importance") },
  ];
}

function renderSortRuleList(
  container: HTMLElement,
  panel: PanelState,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.sortRules;
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "gi-group-item" });

    // Sort key dropdown
    const keySel = row.createEl("select", { cls: "dropdown" });
    keySel.addClass("gi-flex-fill");
    for (const opt of getSortKeyOptions()) {
      const el = keySel.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === rule.key) el.selected = true;
    }
    keySel.addEventListener("change", () => {
      rule.key = keySel.value as SortKey;
      cb.applyClusterForce();
      cb.doRender();
    });

    // Order toggle button
    const orderBtn = row.createEl("button", {
      cls: "gi-direction-btn",
      text: rule.order === "asc" ? t("sort.asc") : t("sort.desc"),
    });
    orderBtn.addClass("gi-order-btn");
    orderBtn.addEventListener("click", () => {
      rule.order = rule.order === "asc" ? "desc" : "asc";
      orderBtn.textContent = rule.order === "asc" ? t("sort.asc") : t("sort.desc");
      cb.applyClusterForce();
      cb.doRender();
    });

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove gi-ml-4", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderSortRuleList(container, panel, cb);
      cb.applyClusterForce();
      cb.doRender();
    });
  });
}

// ---------------------------------------------------------------------------
// Cluster group rule list
// ---------------------------------------------------------------------------

function getClusterGroupOptions(): { value: ClusterGroupBy; label: string }[] {
  return [
    { value: "tag", label: t("clusterGroup.tag") },
    { value: "backlinks", label: t("clusterGroup.backlinks") },
    { value: "node_type", label: t("clusterGroup.nodeType") },
  ];
}

function renderClusterRuleList(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.clusterGroupRules;
  const groupByOpts = getGroupByOptions(ctx);
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "gi-expr-row" });

    // Field input with field:? suggestions (same UI as グルーピング)
    const input = row.createEl("input", {
      cls: "gi-expr-field",
      type: "text",
      placeholder: "tag:?, category:?, folder:?...",
    });
    input.value = rule.groupBy;
    attachFixedHint(input, groupByOpts, (val) => {
      rule.groupBy = val;
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });
    input.addEventListener("change", () => {
      rule.groupBy = input.value.trim();
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    // Recursive toggle (compact checkbox + label)
    const recWrap = row.createEl("label");
    recWrap.addClass("gi-rec-wrap");
    const recToggle = recWrap.createDiv({
      cls: "checkbox-container" + (rule.recursive ? " is-enabled" : ""),
    });
    recWrap.createEl("span", { text: t("clusterGroup.recursive"), cls: "gi-hint" });
    recToggle.addEventListener("click", () => {
      rule.recursive = !rule.recursive;
      recToggle.toggleClass("is-enabled", rule.recursive);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderClusterRuleList(container, panel, ctx, cb);
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });
  });
}

// ---------------------------------------------------------------------------
// Directional gravity rule list
// ---------------------------------------------------------------------------

function renderDirectionalGravityList(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.directionalGravityRules;
  const dirOptions: { value: string; label: string }[] = [
    { value: "top", label: t("gravDir.top") },
    { value: "bottom", label: t("gravDir.bottom") },
    { value: "left", label: t("gravDir.left") },
    { value: "right", label: t("gravDir.right") },
    { value: "custom", label: t("gravDir.custom") },
  ];
  rules.forEach((rule, i) => {
    const row = container.createDiv({ cls: "gi-group-rule-row gi-gravity-row" });

    // Filter search-bar input (with query hint)
    const filterInput = row.createEl("input", {
      cls: "gi-search",
      type: "text",
      placeholder: "tag:character, category:*, *",
    });
    filterInput.value = rule.filter;
    filterInput.addEventListener("input", () => {
      rule.filter = filterInput.value;
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });
    attachQueryHint(filterInput, (field) => cb.collectValueSuggestions(field));

    // Direction search-bar input (with fixed-option hint)
    const isCustom = typeof rule.direction === "number";
    const dirInput = row.createEl("input", {
      cls: "gi-search gi-dir-input",
      type: "text",
      placeholder: t("gravDir.top"),
    });
    if (isCustom) {
      dirInput.value = t("gravDir.custom");
    } else {
      const curDir = dirOptions.find(o => o.value === rule.direction);
      dirInput.value = curDir ? curDir.label : String(rule.direction);
    }

    // Custom radian input (shown only in custom mode)
    const radInput = row.createEl("input", { cls: "gi-search gi-rad-input", type: "number" });
    radInput.step = "0.1";
    radInput.placeholder = "rad";
    radInput.value = isCustom ? String(rule.direction) : "0";
    radInput.style.display = isCustom ? "" : "none";

    attachFixedHint(dirInput, dirOptions, (val) => {
      if (val === "custom") {
        rule.direction = parseFloat(radInput.value) || 0;
        radInput.style.display = "";
      } else {
        rule.direction = val as "top" | "bottom" | "left" | "right";
        radInput.style.display = "none";
      }
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    radInput.addEventListener("input", () => {
      rule.direction = parseFloat(radInput.value) || 0;
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    // Strength slider
    const strSlider = row.createEl("input", { type: "range" });
    strSlider.min = "0.01";
    strSlider.max = "1";
    strSlider.step = "0.01";
    strSlider.value = String(rule.strength);
    strSlider.addClass("gi-str-slider");
    strSlider.addEventListener("input", () => {
      rule.strength = parseFloat(strSlider.value);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });

    // Remove button
    const rm = row.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderDirectionalGravityList(container, panel, ctx, cb);
      cb.applyDirectionalGravityForce();
      cb.restartSimulation(0.3);
    });
  });
}

// ---------------------------------------------------------------------------
// Node Rule list (unified spacing + gravity per query)
// ---------------------------------------------------------------------------

/** Direction presets for gravity dropdown. Angle in degrees. */
function getGravityDirOptions(): { value: string; label: string; angle: number }[] {
  return [
    { value: "none", label: t("gravDir.none"), angle: -1 },
    { value: "up", label: t("gravDir.up"), angle: 270 },
    { value: "down", label: t("gravDir.down"), angle: 90 },
    { value: "left", label: t("gravDir.left"), angle: 180 },
    { value: "right", label: t("gravDir.right"), angle: 0 },
    { value: "custom", label: t("gravDir.custom"), angle: -1 },
  ];
}

function angleToPreset(angle: number): string {
  if (angle < 0) return "none";
  if (angle === 270) return "up";
  if (angle === 90) return "down";
  if (angle === 180) return "left";
  if (angle === 0) return "right";
  return "custom";
}

function renderNodeRuleList(
  container: HTMLElement,
  panel: PanelState,
  ctx: PanelContext,
  cb: PanelCallbacks,
) {
  container.empty();
  const rules = panel.nodeRules;
  rules.forEach((rule, i) => {
    const wrapper = container.createDiv({ cls: "gi-noderule-item" });

    // Row 1: Query input + delete button
    const row1 = wrapper.createDiv({ cls: "gi-group-item" });
    row1.addClass("gi-noderule-row");

    const queryInput = row1.createEl("input", { cls: "gi-search", type: "text", placeholder: "tag:character, *, degree>5" });
    queryInput.addClass("gi-query-input");
    queryInput.value = rule.query;
    queryInput.addEventListener("input", () => {
      rule.query = queryInput.value;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
    attachQueryHint(queryInput, (field) => cb.collectValueSuggestions(field));

    const rm = row1.createEl("span", { cls: "gi-group-remove gi-remove-btn", text: "\u00D7" });
    rm.addEventListener("click", () => {
      rules.splice(i, 1);
      renderNodeRuleList(container, panel, ctx, cb);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Row 2: spacing slider + gravity controls (indented)
    const row2 = wrapper.createDiv();
    row2.addClass("gi-noderule-detail");

    // Spacing slider
    const spacingRow = row2.createDiv({ cls: "setting-item mod-slider" });
    spacingRow.addClass("gi-spacing-row");
    const spacingInfo = spacingRow.createDiv({ cls: "setting-item-info" });
    spacingInfo.createDiv({ cls: "setting-item-name", text: t("nodeRules.spacing") });
    const spacingControl = spacingRow.createDiv({ cls: "setting-item-control" });
    const spacingSlider = spacingControl.createEl("input", { type: "range" });
    spacingSlider.min = "0.1";
    spacingSlider.max = "5.0";
    spacingSlider.step = "0.1";
    spacingSlider.value = String(rule.spacingMultiplier);
    const spacingLabel = spacingControl.createEl("span", { text: String(rule.spacingMultiplier) });
    spacingLabel.addClass("gi-slider-label");
    spacingSlider.addEventListener("input", () => {
      rule.spacingMultiplier = parseFloat(spacingSlider.value);
      spacingLabel.textContent = spacingSlider.value;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    // Gravity direction dropdown
    const gravRow = row2.createDiv({ cls: "gi-group-item" });
    gravRow.addClass("gi-gravity-row");

    const gravLabel = gravRow.createEl("span", { cls: "setting-item-name", text: t("nodeRules.gravity") });
    gravLabel.addClass("gi-gravity-label");

    const dirSelect = gravRow.createEl("select", { cls: "dropdown" });
    dirSelect.addClass("gi-gravity-dir-select");
    const currentPreset = angleToPreset(rule.gravityAngle);
    for (const opt of getGravityDirOptions()) {
      const el = dirSelect.createEl("option", { text: opt.label, value: opt.value });
      if (opt.value === currentPreset) el.selected = true;
    }

    // Custom angle input (hidden unless custom)
    const angleInput = gravRow.createEl("input", { cls: "gi-search", type: "number" });
    angleInput.addClass("gi-angle-input");
    angleInput.step = "1";
    angleInput.min = "0";
    angleInput.max = "360";
    angleInput.placeholder = "°";
    angleInput.value = currentPreset === "custom" ? String(rule.gravityAngle) : "0";
    angleInput.style.display = currentPreset === "custom" ? "" : "none";

    // Strength slider (hidden if direction=none)
    const strSlider = gravRow.createEl("input", { type: "range" });
    strSlider.min = "0.01";
    strSlider.max = "1";
    strSlider.step = "0.01";
    strSlider.value = String(rule.gravityStrength);
    strSlider.addClass("gi-str-slider");
    strSlider.style.display = currentPreset === "none" ? "none" : "";

    dirSelect.addEventListener("change", () => {
      const val = dirSelect.value;
      if (val === "none") {
        rule.gravityAngle = -1;
        angleInput.style.display = "none";
        strSlider.style.display = "none";
      } else if (val === "custom") {
        rule.gravityAngle = parseFloat(angleInput.value) || 0;
        angleInput.style.display = "";
        strSlider.style.display = "";
      } else {
        const preset = getGravityDirOptions().find(o => o.value === val);
        rule.gravityAngle = preset?.angle ?? -1;
        angleInput.style.display = "none";
        strSlider.style.display = "";
      }
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    angleInput.addEventListener("input", () => {
      rule.gravityAngle = parseFloat(angleInput.value) || 0;
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });

    strSlider.addEventListener("input", () => {
      rule.gravityStrength = parseFloat(strSlider.value);
      cb.applyNodeRules();
      cb.restartSimulation(0.3);
    });
  });
}
