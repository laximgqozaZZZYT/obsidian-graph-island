import { ItemView, WorkspaceLeaf, Platform, TFile, setIcon } from "obsidian";
import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { Simulation } from "d3-force";
import type GraphViewsPlugin from "../main";
import type { GraphData, GraphNode, GraphEdge, LayoutType, ShellInfo, DirectionalGravityRule, GroupPreset, ClusterGroupRule, NodeRule, NodeDisplayMode, CardDisplayConfig, DonutDisplayConfig } from "../types";
import { DEFAULT_COLORS, DEFAULT_RENDER_THRESHOLDS, DEFAULT_CARD_RENDER_CONFIG } from "../types";
import { evaluateExpr, parseQueryExpr, serializeExpr } from "../utils/query-expr";
import { buildGraphFromVault, assignNodeColors, buildRelationColorMap, buildSunburstData } from "../parsers/metadata-parser";
import { applyConcentricLayout, repositionShell } from "../layouts/concentric";
import { applyTreeLayout } from "../layouts/tree";
import { applyArcLayout } from "../layouts/arc";
import { applySunburstLayout, type SunburstArc as LayoutSunburstArc } from "../layouts/sunburst";
import { applyTimelineLayout } from "../layouts/timeline";
import { computeNodeDegrees } from "../analysis/graph-analysis";
import { yieldFrame, buildAdj, cssColorToHex } from "../utils/graph-helpers";
import { buildPanel as buildPanelUI, type PanelState, type PanelCallbacks, type PanelContext, DEFAULT_PANEL } from "./PanelBuilder";
import { drawEdges as drawEdgesImpl, drawEdgeLabels as drawEdgeLabelsImpl, invalidateBundleCache, type EdgeDrawConfig } from "./EdgeRenderer";
import { t } from "../i18n";
import { showToast } from "../utils/toast";
import { drawEnclosures as drawEnclosuresImpl, type OverlapCache, type EnclosureConfig } from "./EnclosureRenderer";
import type { ClusterMetadata, GuideLineData, TimelineBarInfo, ArrangementGuide } from "../layouts/cluster-force";
import { analyzeOverlap, computeAutoOptimize } from "../layouts/cluster-force";
import type { ResolvedGridInfo, ResolvedGridLine } from "../layouts/coordinate-engine";
import { InteractionManager, type PixiNode, type InteractionHost } from "./InteractionManager";
import { RenderPipeline, darkenColor, type RenderHost } from "./RenderPipeline";
import { LayoutController, type LayoutHost } from "./LayoutController";
import { Minimap, type MinimapHost } from "./Minimap";
import { LayoutTransition } from "./LayoutTransition";
import { groupNodesByField, getNodeFieldValues, collapseGroup, type GroupSpec, type GroupOptions } from "../utils/node-grouping";
import { queryDataviewPages, filterNodesByDataview } from "../utils/dataview-source";
import { getNodeShape, drawShape, drawShapeAt } from "../utils/node-shapes";

/** Find the cell index for a value given sorted boundary positions */
function findCellIndex(value: number, positions: number[]): number {
  for (let i = 0; i < positions.length - 1; i++) {
    if (value >= positions[i] && value < positions[i + 1]) return i;
  }
  // Check last cell (inclusive upper bound)
  if (positions.length >= 2 && value >= positions[positions.length - 2]) {
    return positions.length - 2;
  }
  return -1;
}

/**
 * Derive a single ClusterGroupRule from a query string + recursive flag.
 * Supports wildcard patterns like "tag:*" → groupBy: "tag".
 */
function deriveOneRule(queryText: string, recursive: boolean): ClusterGroupRule | null {
  if (!queryText.trim()) return null;
  const expr = parseQueryExpr(queryText.trim());
  if (!expr) return null;
  if (expr.type === "leaf" && expr.value === "*") {
    // Use field:? format (e.g. "tag:?", "category:?")
    return { groupBy: `${expr.field}:?`, recursive };
  }
  return { groupBy: "tag:?", recursive };
}

/** Derive ClusterGroupRule[] from multiple common queries (pipeline). */
function deriveClusterRulesFromQueries(queries: { query: string; recursive: boolean }[]): ClusterGroupRule[] {
  const rules: ClusterGroupRule[] = [];
  for (const q of queries) {
    const rule = deriveOneRule(q.query, q.recursive);
    if (rule) rules.push(rule);
  }
  return rules;
}

function deriveClusterRules(preset: GroupPreset): ClusterGroupRule[] {
  if (preset.commonQueries?.length) {
    return deriveClusterRulesFromQueries(preset.commonQueries);
  }
  // Legacy: single commonQuery field
  const cq = preset.commonQuery;
  if (!cq?.expression) return [];
  const queryText = serializeExpr(cq.expression);
  const rule = deriveOneRule(queryText, preset.recursive ?? false);
  return rule ? [rule] : [];
}

export const VIEW_TYPE_GRAPH = "graph-view";

const TICK_SKIP = 4;

// Re-export PixiNode so other modules can import from either location
export type { PixiNode } from "./InteractionManager";

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------
export class GraphViewContainer extends ItemView implements InteractionHost, RenderHost, LayoutHost {
  plugin: GraphViewsPlugin;
  private currentLayout: LayoutType;
  private rawData: GraphData | null = null;
  /** Original (pre-grouping) graph data, used for expand operations */
  private originalGraphData: GraphData | null = null;
  private ac: AbortController | null = null;
  private statusEl: HTMLElement | null = null;
  private zoomIndicatorEl: HTMLElement | null = null;
  private panel: PanelState = { ...JSON.parse(JSON.stringify(DEFAULT_PANEL)), collapsedGroups: new Set<string>() };
  private panelEl: HTMLElement | null = null;
  private simulation: Simulation<GraphNode, GraphEdge> | null = null;
  private highlightedNodeId: string | null = null;

  // Canvas 2D
  private pixiApp: CanvasApp | null = null;
  private worldContainer: CanvasContainer | null = null;
  private edgeGraphics: CanvasGraphics | null = null;
  private orbitGraphics: CanvasGraphics | null = null;
  private enclosureGraphics: CanvasGraphics | null = null;
  private enclosureLabelContainer: CanvasContainer | null = null;
  private sunburstGraphics: CanvasGraphics | null = null;
  private edgeLabelContainer: CanvasContainer | null = null;
  private nodeCircleBatch: CanvasGraphics | null = null;
  private arrowGraphics: CanvasGraphics | null = null;
  private guideLineGraphics: CanvasGraphics | null = null;
  private groupGridGraphics: CanvasGraphics | null = null;
  private barGraphics: CanvasGraphics | null = null;
  private barLabelContainer: CanvasContainer | null = null;
  private pixiNodes: Map<string, PixiNode> = new Map();
  private canvasWrap: HTMLElement | null = null;
  private graphEdges: GraphEdge[] = [];
  private degrees: Map<string, number> = new Map();
  private adj: Map<string, Set<string>> = new Map();
  private relationColors: Map<string, string> = new Map();
  private nodeColorMap: Map<string, string> = new Map();
  /** Counter: when > 0, doRender() skips the final buildPanel() call.
   *  Uses a counter instead of a boolean to avoid race conditions when
   *  multiple doRenderKeepPanel() calls overlap (previous .finally()
   *  callbacks would reset a boolean prematurely). */
  private skipPanelRebuildCount = 0;
  /** tag name → set of file node IDs that have this tag */
  private tagMembership: Map<string, Set<string>> = new Map();
  private enclosureLabels: Map<string, CanvasText> = new Map();
  private overlapCache: OverlapCache = { frame: 0, counts: new Map() };
  /** Cluster metadata for edge bundling (updated when cluster force is applied) */
  private clusterMeta: ClusterMetadata | null = null;
  /** Cached tag relationship pairs for fast lookup */
  private tagRelPairsCache: Set<string> = new Set();
  /** Currently hovered enclosure tag (for label highlight) */
  private hoveredTag: string | null = null;

  // Interaction manager (owns pointer events, drag, pan, hover, marquee, shell rotation)
  private interactionManager: InteractionManager | null = null;

  // Render pipeline (owns render loop, Canvas 2D node creation, batch drawing)
  private renderPipeline: RenderPipeline | null = null;

  // Minimap overlay
  private minimap: Minimap | null = null;

  // Layout controller (owns force simulation setup, force management, cluster arrangement)
  private layoutController: LayoutController = new LayoutController(this);

  // Layout transition animation
  private layoutTransition = new LayoutTransition();
  /** Saved node positions from before a layout switch (id → {x, y}) */
  private savedPositions: Map<string, { x: number; y: number }> = new Map();

  // Theme caches
  private cachedBgColor: number | null = null;
  private _centroidCache: Map<string, { x: number; y: number }> | null = null;
  private _centroidCacheFrame = -1;
  private _nodeRadiiCache: Map<string, number> | null = null;
  private _nodeRadiiCacheFrame = -1;
  private _frameCounter = 0;
  private cachedLabelColor: number | null = null;
  private cachedIsDark: boolean | null = null;
  /** Ephemeral highlight set from side-panel hover (null = not active) */
  private ephemeralHighlight: Set<string> | null = null;

  // Pathfinder state
  private pathfinderStartId: string | null = null;
  private pathfinderEndId: string | null = null;
  /** Set of node IDs on the shortest path (null = no path) */
  private pathfinderPath: string[] | null = null;
  /** Cached Set of node IDs on the path (avoid per-frame allocation) */
  private pathfinderNodeSet: Set<string> | null = null;
  /** Set of edge keys on the shortest path for highlight */
  private pathfinderEdgeSet: Set<string> | null = null;

  // Reusable EdgeDrawConfig — mutated in-place each frame to avoid per-frame allocation
  private _edgeDrawCfg: EdgeDrawConfig | null = null;

  // Resize observer
  private resizeObserver: ResizeObserver | null = null;

  // Concentric shells (for rotation & radius adjustment)
  private shells: ShellInfo[] = [];
  private nodeShellIndex: Map<string, number> = new Map();

  // Orbit auto-rotation animation
  private orbitAnimId: number | null = null;
  private orbitLastTime = 0;

  // Hover diff tracking
  private prevHighlightSet: Set<string> = new Set();

  // Spatial hash for hit testing
  private spatialGrid: Map<string, PixiNode[]> = new Map();
  private spatialCellSize = 50;

  // Node info panel (hover details)
  private nodeInfoEl: HTMLElement | null = null;
  private legendEl: HTMLElement | null = null;

  // Marquee button reference (for toolbar toggle styling)
  private marqueeBtnEl: HTMLElement | null = null;

  // Sunburst layout arc data for Canvas 2D rendering
  private sunburstLayoutArcs: LayoutSunburstArc[] = [];
  private sunburstCenter = { x: 0, y: 0 };

  constructor(leaf: WorkspaceLeaf, plugin: GraphViewsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentLayout = "force"; // Always use force layout; arrangement patterns handle visual layout
    this.panel.nodeSize = plugin.settings.nodeSize;
    this.panel.showSimilar = plugin.settings.showSimilar ?? false;
    this.panel.sortRules = [...(plugin.settings.defaultSortRules ?? [{ key: "degree", order: "desc" }])].map(r => ({ ...r }));
    this.panel.nodeRules = [...(plugin.settings.defaultNodeRules ?? [])].map(r => ({ ...r }));
    this.applyGroupPresets();
    // Apply AFTER presets so user's explicit rules take priority over preset-derived ones
    this.panel.clusterGroupRules = [...(plugin.settings.defaultClusterGroupRules ?? [])].map(r => ({ ...r }));
    this.panel.directionalGravityRules = [...(plugin.settings.directionalGravityRules ?? [])].map(r => ({ ...r }));
    // Cluster arrangement/spacing from settings (optional — falls back to DEFAULT_PANEL)
    if (plugin.settings.defaultClusterArrangement) this.panel.clusterArrangement = plugin.settings.defaultClusterArrangement;
    if (plugin.settings.defaultClusterNodeSpacing != null) this.panel.clusterNodeSpacing = plugin.settings.defaultClusterNodeSpacing;
    if (plugin.settings.defaultClusterGroupScale != null) this.panel.clusterGroupScale = plugin.settings.defaultClusterGroupScale;
    if (plugin.settings.defaultClusterGroupSpacing != null) this.panel.clusterGroupSpacing = plugin.settings.defaultClusterGroupSpacing;
    if (plugin.settings.defaultEdgeBundleStrength != null) this.panel.edgeBundleStrength = plugin.settings.defaultEdgeBundleStrength;
  }

  private applyGroupPresets() {
    const presets = this.plugin.settings.groupPresets ?? [];
    let applied = false;
    for (const preset of presets) {
      const cond = preset.condition;
      if (cond.layout && cond.layout !== this.currentLayout) continue;
      if (cond.tagDisplay && cond.tagDisplay !== this.panel.tagDisplay) continue;
      // Match found — apply preset
      this.panel.groups = preset.groups.map(g => ({
        ...g,
        expression: g.expression ? { ...g.expression } : null,
      }));
      // Restore commonQueries from preset
      if (preset.commonQueries?.length) {
        this.panel.commonQueries = preset.commonQueries.map(q => ({ ...q }));
      } else if (preset.commonQuery?.expression) {
        // Legacy single commonQuery → convert to array
        this.panel.commonQueries = [{
          query: serializeExpr(preset.commonQuery.expression),
          recursive: preset.recursive ?? false,
        }];
      }
      this.panel.clusterGroupRules = deriveClusterRules(preset);
      applied = true;
      break;
    }
    // Fallback: enclosure mode should always have a commonQuery
    if (this.panel.tagDisplay === "enclosure" && this.panel.commonQueries.length === 0) {
      this.panel.commonQueries = [{ query: "tag:*", recursive: false }];
      this.panel.clusterGroupRules = deriveClusterRulesFromQueries(this.panel.commonQueries);
    }
  }

  getViewType() { return VIEW_TYPE_GRAPH; }
  getDisplayText() { return "Graph Island"; }
  getIcon() { return "git-fork"; }

  // -------------------------------------------------------------------------
  // State persistence — Obsidian calls these to save/restore workspace.json
  // -------------------------------------------------------------------------
  private _saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounced workspace save — call after any panel state mutation */
  private requestSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.app.workspace.requestSaveLayout();
      this._saveTimer = null;
    }, 500);
  }

  getState() {
    const sup = super.getState();
    // Serialize panel with special handling for Set (collapsedGroups) and transient fields
    const panelClone: any = {};
    for (const [k, v] of Object.entries(this.panel)) {
      if (k === "collapsedGroups") {
        panelClone[k] = Array.from(v as Set<string>);
      } else if (k === "groupByRules") {
        // Transient editing state — don't persist empty-field rules
        panelClone[k] = null;
      } else {
        panelClone[k] = JSON.parse(JSON.stringify(v));
      }
    }
    return {
      ...sup,
      layout: this.currentLayout,
      panel: panelClone,
    };
  }

  async setState(state: any, result: any): Promise<void> {
    await super.setState(state, result);
    // Layout is always "force"; legacy state values are migrated to cluster arrangement
    if (state.layout && typeof state.layout === "string" && state.layout !== "force") {
      // Migrate legacy layout type to cluster arrangement pattern where applicable
      const legacyMap: Record<string, string> = {
        "tree": "tree", "concentric": "concentric", "sunburst": "sunburst",
        "timeline": "timeline", "arc": "concentric",
      };
      const mapped = legacyMap[state.layout];
      if (mapped && state.panel) {
        state.panel.clusterArrangement = mapped;
      }
    }
    this.currentLayout = "force";
    if (state.panel && typeof state.panel === "object") {
      const saved = JSON.parse(JSON.stringify(state.panel)) as any;
      for (const key of Object.keys(DEFAULT_PANEL) as (keyof PanelState)[]) {
        if (!(key in saved) || saved[key] === undefined) continue;
        if (key === "collapsedGroups") {
          // Restore Set from serialized array
          const arr = Array.isArray(saved[key]) ? saved[key] : [];
          this.panel.collapsedGroups = new Set<string>(arr);
        } else if (key === "groupByRules") {
          // Transient — always re-parse from groupBy string
          this.panel.groupByRules = null;
        } else {
          (this.panel as any)[key] = saved[key];
        }
      }
    }
    // If already rendered (onOpen completed), rebuild with restored state
    if (this.panelEl) {
      this.buildPanel();
      this.applyClusterForce();
      this.doRender();
    }
  }

  async onOpen() {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("graph-container");
    if (Platform.isMobile) root.addClass("is-mobile");

    // --- Toolbar ---
    const toolbar = root.createDiv({ cls: "graph-toolbar" });
    this.statusEl = toolbar.createEl("span", { cls: "graph-status" });

    // --- Zoom / Fit buttons ---
    const zoomGroup = toolbar.createDiv({ cls: "graph-toolbar-zoom" });

    const fitBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(fitBtn, "maximize");
    fitBtn.setAttribute("aria-label", t("toolbar.fitAll"));
    fitBtn.title = t("toolbar.fitAll");
    fitBtn.addEventListener("click", () => {
      if (!this.canvasWrap) return;
      const W = this.canvasWrap.clientWidth;
      const H = this.canvasWrap.clientHeight;
      this.autoFitView(W, H);
      this.markDirty();
    });

    const zoomInBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(zoomInBtn, "zoom-in");
    zoomInBtn.setAttribute("aria-label", t("toolbar.zoomIn"));
    zoomInBtn.title = t("toolbar.zoomIn");
    zoomInBtn.addEventListener("click", () => {
      this.zoomBy(1.3);
    });

    const zoomOutBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(zoomOutBtn, "zoom-out");
    zoomOutBtn.setAttribute("aria-label", t("toolbar.zoomOut"));
    zoomOutBtn.title = t("toolbar.zoomOut");
    zoomOutBtn.addEventListener("click", () => {
      this.zoomBy(1 / 1.3);
    });

    // Zoom percentage indicator
    this.zoomIndicatorEl = zoomGroup.createEl("span", { cls: "gi-zoom-indicator", text: "100%" });
    this.zoomIndicatorEl.title = "Zoom level";

    const marqueeBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(marqueeBtn, "box-select");
    marqueeBtn.setAttribute("aria-label", t("toolbar.marquee"));
    marqueeBtn.title = t("toolbar.marquee");
    marqueeBtn.addEventListener("click", () => {
      if (this.interactionManager) {
        this.interactionManager.marqueeMode = !this.interactionManager.marqueeMode;
        marqueeBtn.toggleClass("is-active", this.interactionManager.marqueeMode);
      }
    });
    this.marqueeBtnEl = marqueeBtn;

    const exportBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(exportBtn, "camera");
    exportBtn.setAttribute("aria-label", t("toolbar.exportPng"));
    exportBtn.title = t("toolbar.exportPng");
    exportBtn.addEventListener("click", async () => {
      if (!this.pixiApp || !this.worldContainer) return;
      exportBtn.disabled = true;
      const origLabel = exportBtn.getAttribute("aria-label") ?? "";
      exportBtn.setAttribute("aria-label", t("toolbar.exporting"));
      try {
        const { exportGraphAsPng, downloadBlob, makeExportFilename } = await import("../utils/export-png");
        const blob = await exportGraphAsPng(this.pixiApp);
        downloadBlob(blob, makeExportFilename());
        showToast(t("toast.pngExported"));
      } catch (e) {
        console.error("Graph Island: PNG export failed", e);
        showToast(t("toast.pngFailed"), 5000);
      } finally {
        exportBtn.disabled = false;
        exportBtn.setAttribute("aria-label", origLabel);
      }
    });

    // Local graph toggle button
    const localGraphBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(localGraphBtn, "locate-fixed");
    localGraphBtn.setAttribute("aria-label", t("toolbar.localGraph"));
    localGraphBtn.title = t("toolbar.localGraph");
    localGraphBtn.addEventListener("click", () => {
      if (this.panel.localGraphCenter) {
        // Turn off local graph
        this.panel.localGraphCenter = null;
        localGraphBtn.classList.remove("is-active");
        showToast(t("toast.localGraphOff"));
      } else {
        // Turn on: use active editor file
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile) {
          this.panel.localGraphCenter = activeFile.path;
          localGraphBtn.classList.add("is-active");
          const name = activeFile.basename;
          showToast(t("toast.localGraphOn").replace("{name}", name).replace("{hops}", String(this.panel.localGraphHops)));
        }
      }
      this.doRender();
    });

    // Clipboard copy button (next to camera/export)
    const clipboardBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(clipboardBtn, "clipboard-copy");
    clipboardBtn.setAttribute("aria-label", t("toolbar.copyClipboard"));
    clipboardBtn.title = t("toolbar.copyClipboard");
    clipboardBtn.addEventListener("click", async () => {
      clipboardBtn.disabled = true;
      await this.copyGraphToClipboard();
      clipboardBtn.disabled = false;
    });

    // Fullscreen toggle
    const fullscreenBtn = toolbar.createEl("button", { cls: "graph-toolbar-btn gi-fullscreen-btn" });
    setIcon(fullscreenBtn, "expand");
    fullscreenBtn.setAttribute("aria-label", "Fullscreen");
    fullscreenBtn.title = "Fullscreen";
    fullscreenBtn.addEventListener("click", () => {
      const container = this.containerEl.querySelector<HTMLElement>(".graph-container");
      if (!container) return;
      const isFs = container.classList.toggle("gi-fullscreen");
      setIcon(fullscreenBtn, isFs ? "shrink" : "expand");
    });

    const panelToggle = toolbar.createEl("button", { cls: "graph-settings-btn" });
    setIcon(panelToggle, "settings");
    panelToggle.setAttribute("aria-label", t("toolbar.graphSettings"));
    panelToggle.title = t("toolbar.graphSettings");
    panelToggle.addEventListener("click", () => {
      const hidden = this.panelEl?.hasClass("is-hidden");
      this.panelEl?.toggleClass("is-hidden", !hidden);
      if (Platform.isMobile) {
        this.panelEl?.toggleClass("is-overlay", !!hidden);
      }
      panelToggle.toggleClass("is-active", !!hidden);
    });

    // --- Main area ---
    const main = root.createDiv({ cls: "graph-main" });
    // canvasWrap is emptied by initPixi, so nodeInfoEl
    // lives in a sibling wrapper that won't be cleared.
    const canvasArea = main.createDiv({ cls: "gi-canvas-area" });
    this.canvasWrap = canvasArea.createDiv({ cls: "graph-svg-wrap" });

    // --- Node Info Overlay (floating, survives canvas rebuilds) ---
    this.nodeInfoEl = canvasArea.createDiv({ cls: "gi-node-info" });
    this.nodeInfoEl.style.display = "none";

    // Keyboard shortcuts
    this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
      // Only handle if our view is active
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf?.view !== this) return;

      // Escape: close overlays
      if (e.key === "Escape") {
        if (this.nodeInfoEl && this.nodeInfoEl.style.display !== "none") {
          this.nodeInfoEl.style.display = "none";
          this.nodeInfoEl.classList.remove("is-visible");
        }
        if (this.legendEl && this.legendEl.style.display !== "none") {
          this.legendEl.style.display = "none";
        }
        return;
      }

      // Don't handle shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Ctrl/Cmd+F: focus search input
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        const search = this.panelEl?.querySelector<HTMLInputElement>(".gi-settings-filter");
        if (search) {
          // Ensure panel is visible
          this.panelEl?.classList.remove("is-hidden");
          search.focus();
        }
        return;
      }

      // Space: auto-fit view
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const wrap = this.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
        if (wrap) this.autoFitView(wrap.clientWidth, wrap.clientHeight);
        return;
      }

      // 1-4: switch panel tabs
      if (e.key >= "1" && e.key <= "4" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const idx = parseInt(e.key) - 1;
        const tabs = this.panelEl?.querySelectorAll<HTMLButtonElement>(".gi-tab-btn");
        if (tabs && tabs[idx]) {
          tabs[idx].click();
        }
        return;
      }

      // P: toggle panel visibility
      if (e.key === "p" && !e.ctrlKey && !e.metaKey) {
        this.panelEl?.classList.toggle("is-hidden");
        return;
      }

      // +/=: zoom in
      if ((e.key === "+" || e.key === "=") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.zoomBy(1.2);
        return;
      }
      // -: zoom out
      if (e.key === "-" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.zoomBy(1 / 1.2);
        return;
      }
      // 0: zoom reset (100%)
      if (e.key === "0" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.setZoom(1.0);
        return;
      }
      // F: fit view (same as Space)
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const wrap = this.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
        if (wrap) this.autoFitView(wrap.clientWidth, wrap.clientHeight);
        return;
      }
      // L: toggle legend
      if (e.key === "l" && !e.ctrlKey && !e.metaKey) {
        if (this.legendEl) {
          this.legendEl.style.display = this.legendEl.style.display === "none" ? "" : "none";
        }
        return;
      }
      // M: toggle minimap
      if (e.key === "m" && !e.ctrlKey && !e.metaKey) {
        this.panel.showMinimap = !this.panel.showMinimap;
        this.markDirty(true);
        return;
      }
      // G: toggle grid
      if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
        this.panel.showDotGrid = !this.panel.showDotGrid;
        this.markDirty(true);
        return;
      }
      // [: decrease hoverHops
      if (e.key === "[" && !e.ctrlKey && !e.metaKey) {
        this.panel.hoverHops = Math.max(0, this.panel.hoverHops - 1);
        this.applyHover();
        this.markDirty(true);
        return;
      }
      // ]: increase hoverHops
      if (e.key === "]" && !e.ctrlKey && !e.metaKey) {
        this.panel.hoverHops = Math.min(10, this.panel.hoverHops + 1);
        this.applyHover();
        this.markDirty(true);
        return;
      }
      // Ctrl/Cmd+Shift+C: copy graph to clipboard as PNG
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") {
        e.preventDefault();
        this.copyGraphToClipboard();
        return;
      }
      // Tab / Shift+Tab: cycle focus through nodes
      if (e.key === "Tab") {
        e.preventDefault();
        this.cycleFocusNode(e.shiftKey ? -1 : 1);
        return;
      }
    });

    // --- Legend Overlay ---
    this.legendEl = canvasArea.createDiv({ cls: "gi-legend" });
    this.legendEl.style.display = "none";

    // --- Panel resize handle (sibling of panelEl so panelEl.empty() won't destroy it) ---
    const resizeHandle = main.createDiv({ cls: "gi-panel-resize-handle" });
    let startX = 0, startW = 0;
    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      const newW = Math.max(180, Math.min(500, startW + delta));
      this.panelEl!.style.width = `${newW}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      resizeHandle.removeClass("is-dragging");
    };
    resizeHandle.addEventListener("pointerdown", (ev: PointerEvent) => {
      ev.preventDefault();
      startX = ev.clientX;
      startW = this.panelEl!.offsetWidth;
      resizeHandle.addClass("is-dragging");
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    // --- Control Panel ---
    this.panelEl = main.createDiv({ cls: "graph-panel is-hidden" });
    this.buildPanel();

    // --- Resize observer for Canvas 2D ---
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvasArea);

    // Wake render loop when this leaf becomes active again (e.g. tab switch)
    // Also sync graph highlight with active editor file (A-2 editor↔graph sync)
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view === this) {
          // Our leaf became active — just wake render loop
          if (this.pixiApp) this.markDirty();
          return;
        }
        // Another leaf is active — sync if enabled
        if (!this.panel.syncWithEditor) return;
        const file = (leaf?.view as any)?.file as TFile | undefined;
        if (!file || !this.pixiNodes.size) return;
        const nodeId = this.findNodeIdByPath(file.path);
        if (!nodeId) return;
        this.setHighlightedNodeId(nodeId);
        this.applyHover();
        this.panToNode(nodeId);
        // If local graph mode is on, update the center
        if (this.panel.localGraphCenter !== null) {
          this.panel.localGraphCenter = file.path;
          this.doRender();
        }
      })
    );

    // Theme / CSS snippet change — invalidate color caches and update canvas background
    this.registerEvent(
      this.app.workspace.on("css-change" as any, () => {
        this.invalidateThemeCache();
      })
    );

    // Ephemeral highlight from side-panel (property value hover, backlink hover)
    this.registerEvent(
      this.app.workspace.on("graph-island:highlight-nodes" as any, (nodeIds: Set<string> | null) => {
        this.applyEphemeralHighlight(nodeIds);
      })
    );

    this.doRender();
  }

  async onClose() {
    this.stopOrbitAnimation();
    this.stopSim();
    this.ac?.abort();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.interactionManager?.detach();
    this.interactionManager = null;
    this.destroyPixi();
    this.statusEl = null;
    this.panelEl = null;
    this.nodeInfoEl = null;
    this.canvasWrap = null;
  }

  // =========================================================================
  // Orbit auto-rotation animation
  // =========================================================================
  private startOrbitAnimation() {
    if (this.orbitAnimId !== null) return;
    this.orbitLastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - this.orbitLastTime) / 1000; // seconds
      this.orbitLastTime = now;
      if (this.shells.length > 0 && this.panel.orbitAutoRotate) {
        const nodeMap = new Map<string, GraphNode>();
        for (const pn of this.pixiNodes.values()) nodeMap.set(pn.data.id, pn.data);
        for (const shell of this.shells) {
          if (shell.radius <= 0 || shell.rotationSpeed === 0) continue;
          shell.angleOffset += shell.rotationDirection * shell.rotationSpeed * dt;
          repositionShell(shell, nodeMap);
        }
        this.markDirty();
      }
      this.orbitAnimId = requestAnimationFrame(tick);
    };
    this.orbitAnimId = requestAnimationFrame(tick);
  }

  private stopOrbitAnimation() {
    if (this.orbitAnimId !== null) {
      cancelAnimationFrame(this.orbitAnimId);
      this.orbitAnimId = null;
    }
  }

  // =========================================================================
  // Canvas 2D lifecycle
  // =========================================================================
  private destroyPixi() {
    if (this.renderPipeline) {
      this.renderPipeline.onPostRender = null;
      this.renderPipeline.detach();
    }
    if (this.minimap) {
      this.minimap.destroy();
      this.minimap = null;
    }
    // Clean up enclosure labels before canvas destroy
    for (const lbl of this.enclosureLabels.values()) {
      try { lbl.destroy(); } catch { /* already destroyed */ }
    }
    this.enclosureLabels.clear();
    // Clean up group grid labels
    for (const lbl of this.groupGridLabels.values()) {
      try { lbl.destroy(); } catch { /* already destroyed */ }
    }
    this.groupGridLabels.clear();
    // Clean up sunburst labels
    for (const lbl of this.sunburstLabels.values()) {
      try { lbl.destroy(); } catch { /* already destroyed */ }
    }
    this.sunburstLabels.clear();
    for (const lbl of this.clusterSunburstLabels.values()) {
      try { lbl.destroy(); } catch { /* already destroyed */ }
    }
    this.clusterSunburstLabels.clear();
    this.clusterSunburstLabelContainer = null;
    this.sunburstLayoutArcs = [];
    this.clearCustomGridLabels();
    this.clearTimelineAxisLabels();
    this.customGridLabelContainer = null;
    this.pixiNodes.clear();
    this.worldContainer = null;
    this.edgeGraphics = null;
    this.orbitGraphics = null;
    this.enclosureGraphics = null;
    this.enclosureLabelContainer = null;
    this.sunburstGraphics = null;
    this.sunburstLabelContainer = null;
    this.edgeLabelContainer = null;
    this.nodeCircleBatch = null;
    this.arrowGraphics = null;
    this.guideLineGraphics = null;
    this.groupGridGraphics = null;
    this.groupGridLabelContainer = null;
    this.barGraphics = null;
    this.barLabelContainer = null;
    this.spatialGrid.clear();
    if (this.pixiApp) {
      try {
        this.pixiApp.destroy();
      } catch {
        // Canvas app state may already be partially torn down
      }
      this.pixiApp = null;
    }
  }

  private handleResize() {
    if (!this.pixiApp || !this.canvasWrap) return;
    const rect = this.canvasWrap.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 400;
    this.pixiApp.resize(w, h);
    this.markDirty();
  }

  private initPixi(width: number, height: number): CanvasApp | null {
    try {
      this.destroyPixi();
      if (this.canvasWrap) this.canvasWrap.empty();
      this.svgEl = null;

      // Read CSS background
      let bgColor = 0x1e1e1e;
      const style = getComputedStyle(this.canvasWrap!);
      const bgStr = style.getPropertyValue("--graph-background").trim()
        || style.getPropertyValue("--background-primary").trim();
      if (bgStr) { try { bgColor = cssColorToHex(bgStr); } catch { /* keep default */ } }

      const app = new CanvasApp({
        width,
        height,
        backgroundColor: bgColor,
        resolution: window.devicePixelRatio || 1,
      });

      this.canvasWrap!.appendChild(app.view);
      const canvas = app.view;
      canvas.style.width = "100%";
      canvas.style.height = "100%";

      this.pixiApp = app;

      // World container (for zoom/pan)
      const world = new CanvasContainer();
      app.stage.addChild(world);
      this.worldContainer = world;

      // Orbit ring layer (drawn behind edges)
      const orbitGfx = new CanvasGraphics();
      world.addChild(orbitGfx);
      this.orbitGraphics = orbitGfx;

      // Sunburst arc guide lines (drawn behind enclosures)
      const sunburstGfx = new CanvasGraphics();
      world.addChild(sunburstGfx);
      this.sunburstGraphics = sunburstGfx;

      // Guide line layer (arrangement guides — timeline axis, spiral curve, grid lines, etc.)
      const guideGfx = new CanvasGraphics();
      world.addChild(guideGfx);
      this.guideLineGraphics = guideGfx;

      // Group grid overlay (bounding circle + cross-hair per cluster group)
      const groupGridGfx = new CanvasGraphics();
      world.addChild(groupGridGfx);
      this.groupGridGraphics = groupGridGfx;

      // Enclosure layer (tag enclosures, drawn behind edges)
      const enclosureGfx = new CanvasGraphics();
      world.addChild(enclosureGfx);
      this.enclosureGraphics = enclosureGfx;

      // Edge layer (single Graphics object — batch drawn)
      const edgeGfx = new CanvasGraphics();
      world.addChild(edgeGfx);
      this.edgeGraphics = edgeGfx;

      // Edge label layer (CanvasText objects — on top of edges, below nodes)
      const edgeLabelCont = new CanvasContainer();
      world.addChild(edgeLabelCont);
      this.edgeLabelContainer = edgeLabelCont;

      // Timeline duration bar layer (drawn behind node circles)
      const barGfx = new CanvasGraphics();
      world.addChild(barGfx);
      this.barGraphics = barGfx;

      // Batch node circle layer — draws all non-highlighted circles in one draw call
      const batchGfx = new CanvasGraphics();
      world.addChild(batchGfx);
      this.nodeCircleBatch = batchGfx;

      // Arrow layer — drawn ON TOP of nodes so directional arrows are visible
      const arrowGfx = new CanvasGraphics();
      world.addChild(arrowGfx);
      this.arrowGraphics = arrowGfx;

      // Bar label container — ON TOP of nodes/arrows so bar text is always readable
      const barLabelCont = new CanvasContainer();
      world.addChild(barLabelCont);
      this.barLabelContainer = barLabelCont;

      // Enclosure label container — on top of nodes so labels are visible & hoverable
      const labelContainer = new CanvasContainer();
      world.addChild(labelContainer);
      this.enclosureLabelContainer = labelContainer;

    // Set up interaction handling (pointer events, drag, pan, hover, marquee)
    this.interactionManager?.detach();
    this.interactionManager = new InteractionManager(this, canvas, world);

    // Set up render pipeline (render loop, Canvas 2D node creation, batch drawing)
    this.renderPipeline = new RenderPipeline(this);

    // Set up minimap overlay
    this.minimap?.destroy();
    const minimapHost: MinimapHost = {
      getNodePositions: () => {
        const positions: { x: number; y: number; id: string }[] = [];
        for (const pn of this.pixiNodes.values()) {
          positions.push({ x: pn.data.x, y: pn.data.y, id: pn.data.id });
        }
        return positions;
      },
      getWorldTransform: () => ({
        x: world.x,
        y: world.y,
        scaleX: world.scale.x,
        scaleY: world.scale.y,
      }),
      getViewportSize: () => ({
        width: this.canvasWrap?.clientWidth ?? 600,
        height: this.canvasWrap?.clientHeight ?? 400,
      }),
      setWorldPosition: (x: number, y: number) => {
        world.x = x;
        world.y = y;
      },
      wakeRenderLoop: () => this.wakeRenderLoop(),
    };
    this.minimap = new Minimap(minimapHost, this.canvasWrap!);
    this.minimap.setVisible(this.panel.showMinimap);
    this.renderPipeline.onPostRender = () => {
      if (this.pixiApp) {
        this.pixiApp.showDotGrid = this.panel.showDotGrid;
      }
      if (this.minimap) {
        this.minimap.setRenderThresholds(this.panel.renderThresholds ?? {});
        this.minimap.setVisible(this.panel.showMinimap);
        this.minimap.draw();
      }
    };

      return app;
    } catch (err) {
      console.error("[Graph Island] Failed to initialize Canvas 2D renderer:", err);
      if (this.canvasWrap) {
        this.canvasWrap.empty();
        this.canvasWrap.createEl("div", {
          cls: "gi-error-fallback",
          text: t("error.pixiInitFailed"),
        });
      }
      return null;
    }
  }

  // =========================================================================
  // InteractionHost + RenderHost implementation
  // =========================================================================
  getHighlightedNodeId(): string | null { return this.highlightedNodeId; }
  setHighlightedNodeId(id: string | null) { this.highlightedNodeId = id; }
  getCurrentLayout(): LayoutType { return this.currentLayout; }
  getShells(): ShellInfo[] { return this.shells; }
  getNodeShellIndex(): Map<string, number> { return this.nodeShellIndex; }
  getPixiNodes(): Map<string, PixiNode> { return this.pixiNodes; }
  getSimulation(): Simulation<GraphNode, GraphEdge> | null { return this.simulation; }
  getPixiApp(): CanvasApp | null { return this.pixiApp; }
  openFile(filePath: string) { this.app.workspace.openLinkText(filePath, "", false); }
  handleSuperNodeDblClick(pn: import("./InteractionManager").PixiNode): boolean {
    // Expand collapsed super node
    if (pn.data.collapsedMembers && pn.data.id.startsWith("__super__")) {
      const groupKey = pn.data.id.replace("__super__", "");
      this.panel.collapsedGroups.delete(groupKey);
      this.rawData = null;
      this.doRender();
      return true;
    }
    // Collapse node back into its group
    if (this.panel.groupBy && this.panel.groupBy !== "none" && this.originalGraphData) {
      const groupOpts: GroupOptions = { minSize: this.panel.groupMinSize, filter: this.panel.groupFilter };
      const groups = this.resolveGroupByField(this.originalGraphData.nodes, groupOpts);
      const parentGroup = groups.find(g => g.memberIds.includes(pn.data.id));
      if (parentGroup && !this.panel.collapsedGroups.has(parentGroup.key)) {
        this.panel.collapsedGroups.add(parentGroup.key);
        this.rawData = null;
        this.doRender();
        return true;
      }
    }
    return false;
  }
  /** Resolve groupBy string to GroupSpec[] using the generic field grouping.
   *  Supports both legacy format ("tag, category") and new format ("tag:? AND category:?").
   *  Operators (AND/OR/XOR/...) are stripped; each field is grouped independently. */
  private resolveGroupByField(nodes: GraphNode[], opts: GroupOptions): GroupSpec[] {
    const groupBy = this.panel.groupBy;
    if (!groupBy || groupBy === "none") return [];
    // Strip operators (AND, OR, XOR, NOR, NAND, NOT) to extract bare field tokens
    const withoutOps = groupBy.replace(/\b(AND|OR|XOR|NOR|NAND|NOT)\b/gi, ",");
    const fields = withoutOps.split(",").map(s => s.trim()).filter(Boolean);
    const allGroups: GroupSpec[] = [];
    for (let raw of fields) {
      // Strip ":?" suffix from new format (e.g. "tag:?" → "tag")
      if (raw.endsWith(":?")) raw = raw.slice(0, -2);
      if (!raw) continue;
      allGroups.push(...groupNodesByField(nodes, raw, opts));
    }
    return allGroups;
  }

  getWorldContainer(): CanvasContainer | null { return this.worldContainer; }
  getNodeCircleBatch(): CanvasGraphics | null { return this.nodeCircleBatch; }
  getDegrees(): Map<string, number> { return this.degrees; }
  getPrevHighlightSet(): Set<string> { return this.prevHighlightSet; }
  getEphemeralHighlight(): Set<string> | null { return this.ephemeralHighlight; }
  getPanel(): PanelState { return this.panel; }
  setSimulation(sim: Simulation<GraphNode, GraphEdge> | null) { this.simulation = sim; }
  getGraphEdges(): GraphEdge[] { return this.graphEdges; }
  getTagMembership(): Map<string, Set<string>> { return this.tagMembership; }
  getTagRelPairsCache(): Set<string> { return this.tagRelPairsCache; }
  getCanvasSize(): { width: number; height: number } {
    const rect = this.canvasWrap?.getBoundingClientRect();
    return { width: rect?.width || 600, height: rect?.height || 400 };
  }
  getSettingsDirectionalGravityRules(): DirectionalGravityRule[] {
    return this.plugin.settings.directionalGravityRules ?? [];
  }
  setClusterMeta(meta: ClusterMetadata | null) {
    this.clusterMeta = meta;
    // Merge/remove synthetic sequence edges from graphEdges
    // First remove any existing synthetic sequence edges
    this.graphEdges = this.graphEdges.filter(e => !e.id.startsWith("__seq__"));
    // Then add new ones from the cluster metadata
    if (meta?.sequenceEdges && meta.sequenceEdges.length > 0) {
      this.graphEdges = [...this.graphEdges, ...meta.sequenceEdges];
    }
    invalidateBundleCache();
  }
  getNodeProperty(nodeId: string, key: string): string | undefined {
    const pn = this.pixiNodes.get(nodeId);
    const fp = pn?.data.filePath;
    if (!fp) return undefined;
    const tf = this.app.vault.getAbstractFileByPath(fp);
    if (!(tf instanceof TFile)) return undefined;
    const cache = this.app.metadataCache.getFileCache(tf);
    const val = cache?.frontmatter?.[key];
    return val !== undefined && val !== null ? String(val) : undefined;
  }
  getNodeShapeRules() { return this.panel.nodeShapeRules; }
  getSearchHiddenNodes() { return new Set<string>(); }
  getCanvasDimensions() {
    return {
      width: this.canvasWrap?.clientWidth ?? 600,
      height: this.canvasWrap?.clientHeight ?? 400,
    };
  }

  isRingChartMode(): boolean {
    return this.panel.ringChartMode && this.panel.clusterArrangement === "sunburst";
  }

  getNodeDisplayMode() { return this.panel.nodeDisplayMode ?? "node"; }
  getCardDisplayConfig() { return this.panel.cardDisplayConfig ?? { fields: [], maxWidth: 120, showIcon: false }; }
  getDonutDisplayConfig() { return this.panel.donutDisplayConfig ?? { innerRadius: 0.6 }; }
  getRenderThresholds() { return this.panel.renderThresholds ?? {}; }

  // =========================================================================
  // Zoom & Hit testing
  // =========================================================================

  /** Rebuild the spatial hash grid from current node positions.
   *  Reuses existing cell arrays to reduce GC pressure. */
  rebuildSpatialGrid() {
    // Clear cell arrays without deallocating them
    for (const cell of this.spatialGrid.values()) cell.length = 0;
    const cs = this.spatialCellSize;
    for (const pn of this.pixiNodes.values()) {
      const key = `${Math.floor(pn.data.x / cs)},${Math.floor(pn.data.y / cs)}`;
      let cell = this.spatialGrid.get(key);
      if (!cell) { cell = []; this.spatialGrid.set(key, cell); }
      cell.push(pn);
    }
  }

  hitTestNode(wx: number, wy: number): PixiNode | null {
    const cs = this.spatialCellSize;
    const cx = Math.floor(wx / cs);
    const cy = Math.floor(wy / cs);

    let closest: PixiNode | null = null;
    let closestDist = Infinity;

    // Check 3x3 neighborhood of grid cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = this.spatialGrid.get(`${cx + dx},${cy + dy}`);
        if (!cell) continue;
        for (const pn of cell) {
          const ddx = pn.data.x - wx;
          const ddy = pn.data.y - wy;
          const dist = ddx * ddx + ddy * ddy;
          const r = pn.radius + 4;
          if (dist < r * r && dist < closestDist) {
            closestDist = dist;
            closest = pn;
          }
        }
      }
    }

    // If no circle hit, check timeline duration bars (rectangles)
    if (!closest) {
      const bars = this.clusterMeta?.timelineBars;
      if (bars && bars.length > 0) {
        for (const bar of bars) {
          const halfH = bar.barHeight / 2;
          if (wx >= bar.xStart && wx <= bar.xEnd &&
              wy >= bar.yCenter - halfH && wy <= bar.yCenter + halfH) {
            const pn = this.pixiNodes.get(bar.nodeId);
            if (pn) { closest = pn; break; }
          }
        }
      }
    }

    return closest;
  }

  /** Toggle hold (pin) state for a node */
  toggleHold(pn: PixiNode) {
    pn.held = !pn.held;
    if (pn.held) {
      pn.data.fx = pn.data.x;
      pn.data.fy = pn.data.y;
    } else {
      pn.data.fx = null;
      pn.data.fy = null;
    }
  }

  /** Clear all held nodes */
  clearAllHolds() {
    for (const pn of this.pixiNodes.values()) {
      if (pn.held) {
        pn.held = false;
        pn.data.fx = null;
        pn.data.fy = null;
      }
    }
  }

  // =========================================================================
  // Pathfinder (shortest path between two nodes)
  // =========================================================================
  setPathfinderNode(nodeId: string, role: "start" | "end") {
    if (role === "start") this.pathfinderStartId = nodeId;
    else this.pathfinderEndId = nodeId;
    this.computePathfinderPath();
    this.markDirty(true);
  }

  clearPathfinder() {
    this.pathfinderStartId = null;
    this.pathfinderEndId = null;
    this.pathfinderPath = null;
    this.pathfinderNodeSet = null;
    this.pathfinderEdgeSet = null;
    this.markDirty(true);
  }

  getPathfinderState() {
    return { startId: this.pathfinderStartId, endId: this.pathfinderEndId };
  }

  // -- InteractionHost: Obsidian App access (for hover-link preview) --
  getApp() { return this.app; }
  getContainerEl(): HTMLElement { return this.containerEl; }

  /** BFS shortest path using adj map */
  private computePathfinderPath() {
    this.pathfinderPath = null;
    this.pathfinderEdgeSet = null;
    if (!this.pathfinderStartId || !this.pathfinderEndId) return;
    if (this.pathfinderStartId === this.pathfinderEndId) return;
    if (!this.adj.size) return;

    const start = this.pathfinderStartId;
    const end = this.pathfinderEndId;
    const visited = new Set<string>([start]);
    const parent = new Map<string, string>();
    const queue: string[] = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === end) break;
      const neighbors = this.adj.get(current);
      if (!neighbors) continue;
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          parent.set(n, current);
          queue.push(n);
        }
      }
    }

    if (!parent.has(end)) return; // no path found

    // Reconstruct path
    const path: string[] = [];
    let cur = end;
    while (cur !== start) {
      path.unshift(cur);
      cur = parent.get(cur)!;
    }
    path.unshift(start);
    this.pathfinderPath = path;
    this.pathfinderNodeSet = new Set(path);

    // Build edge set for highlighting
    const edgeSet = new Set<string>();
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      edgeSet.add(`${a}→${b}`);
      edgeSet.add(`${b}→${a}`);
    }
    this.pathfinderEdgeSet = edgeSet;

    showToast(`Path: ${path.length} nodes, ${path.length - 1} hops`);
  }

  /** Get the pathfinder node set (for render pipeline highlight) */
  getPathfinderNodeSet(): Set<string> | null {
    return this.pathfinderNodeSet;
  }

  /** Get the pathfinder edge set (for edge highlight) */
  getPathfinderEdgeSet(): Set<string> | null {
    return this.pathfinderEdgeSet;
  }

  /** Get timeline range filter state for RenderPipeline */
  getTimelineRange(): { min: number; max: number; active: boolean } {
    const min = this.panel.timelineRangeMin;
    const max = this.panel.timelineRangeMax;
    const active = (min > 0.001 || max < 0.999) && this.panel.clusterArrangement === "timeline";
    return { min, max, active };
  }



  // =========================================================================
  // Hover highlight (Canvas 2D)
  // =========================================================================
  applyHover() {
    const hId = this.highlightedNodeId;

    // Build current highlight set via BFS up to hoverHops
    const curSet = new Set<string>();
    if (hId) {
      curSet.add(hId);
      let frontier = [hId];
      for (let hop = 0; hop < this.panel.hoverHops && frontier.length > 0; hop++) {
        const next: string[] = [];
        for (const id of frontier) {
          const nb = this.adj.get(id);
          if (nb) for (const n of nb) {
            if (!curSet.has(n)) { curSet.add(n); next.push(n); }
          }
        }
        frontier = next;
      }
    }

    // Determine which nodes actually changed state
    const prev = this.prevHighlightSet;
    const changed = new Set<string>();
    // Nodes entering or leaving the highlight set
    for (const id of curSet) { if (!prev.has(id)) changed.add(id); }
    for (const id of prev) { if (!curSet.has(id)) changed.add(id); }
    // If transitioning from "no highlight" to "has highlight" (or vice-versa),
    // all non-highlighted nodes need alpha update too
    const wasEmpty = prev.size === 0;
    const isNowEmpty = curSet.size === 0;
    const fullSweepNeeded = wasEmpty !== isNowEmpty;

    const nodesToUpdate = fullSweepNeeded
      ? this.pixiNodes.values()
      : (function*(pnMap: Map<string, PixiNode>, ids: Set<string>) {
          for (const id of ids) {
            const pn = pnMap.get(id);
            if (pn) yield pn;
          }
        })(this.pixiNodes, changed);

    const isCardMode = (this.panel.nodeDisplayMode ?? "node") === "card";
    const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };

    for (const pn of nodesToUpdate) {
      if (!hId) {
        pn.gfx.alpha = 1;
        if (isCardMode) pn.gfx.scale.set(1);
        this.drawNodeCircle(pn, false);
        if (pn.hoverLabel) { pn.gfx.removeChild(pn.hoverLabel); pn.hoverLabel.destroy(); pn.hoverLabel = null; }
      } else if (curSet.has(pn.data.id)) {
        pn.gfx.alpha = 1;
        if (isCardMode && pn.data.id === hId) {
          pn.gfx.scale.set(crc.cardHoverScale);
        } else if (isCardMode) {
          pn.gfx.scale.set(1);
        }
        this.drawNodeCircle(pn, true);
        if (!pn.label && !pn.hoverLabel) {
          const hl = new CanvasText(pn.data.label, {
            fontSize: 11, fill: this.getLabelColor(),
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          });
          hl.x = pn.radius + 2;
          hl.y = -(pn.radius * 0.4 + 2);
          hl.resolution = 2;
          pn.gfx.addChild(hl);
          pn.hoverLabel = hl;
        }
      } else {
        pn.gfx.alpha = 0.12;
        if (isCardMode) pn.gfx.scale.set(1);
        if (pn.hoverLabel) { pn.gfx.removeChild(pn.hoverLabel); pn.hoverLabel.destroy(); pn.hoverLabel = null; }
      }
    }

    this.prevHighlightSet = curSet;
    this.redrawNodeBatch();
    this.drawEdges();   // Redraw edges with hover dimming
    this.drawTimelineBars();  // Redraw bars with hover highlight
    this.updateNodeInfo();
  }

  /**
   * Apply ephemeral (temporary) highlight from the side-panel.
   * When nodeIds is null, the ephemeral highlight is cleared.
   */
  private applyEphemeralHighlight(nodeIds: Set<string> | null) {
    const prev = this.ephemeralHighlight;
    this.ephemeralHighlight = nodeIds;

    // If there's a normal hover active, ephemeral highlight overlays on top
    // If no hover and no ephemeral, reset all nodes
    const activeSet = nodeIds ?? this.prevHighlightSet;
    const hasAny = activeSet.size > 0;

    for (const pn of this.pixiNodes.values()) {
      if (!hasAny) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, false);
      } else if (nodeIds && nodeIds.has(pn.data.id)) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, true);
      } else if (!nodeIds && this.prevHighlightSet.has(pn.data.id)) {
        // Restore normal hover highlight
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, true);
      } else {
        pn.gfx.alpha = 0.12;
      }
    }
    this.redrawNodeBatch();
    this.drawEdges();
    this.markDirty();
  }

  /**
   * Notify the dedicated NodeDetailView side-pane about the hovered node.
   */
  private notifyDetailPane(node: GraphNode | null) {
    // Emit a custom event that NodeDetailView listens for
    this.app.workspace.trigger("graph-island:hover-node", node, this.adj, this.pixiNodes, this.degrees);
  }

  /**
   * Update the floating node-info overlay with hovered node details + linked nodes.
   */
  private updateNodeInfo() {
    // Hide the floating overlay — all detail is shown in the NodeDetailView side pane
    if (this.nodeInfoEl) this.nodeInfoEl.style.display = "none";

    const hId = this.highlightedNodeId;
    const pn = hId ? this.pixiNodes.get(hId) : undefined;
    this.notifyDetailPane(pn?.data ?? null);
  }

  isDarkTheme(): boolean {
    if (this.cachedIsDark === null) {
      this.cachedIsDark = document.body.classList.contains("theme-dark");
    }
    return this.cachedIsDark;
  }

  private cachedAccentColor: number | null = null;

  getAccentColor(): number {
    if (this.cachedAccentColor === null) {
      const el = this.canvasWrap ?? this.containerEl;
      const css = getComputedStyle(el).getPropertyValue("--interactive-accent").trim();
      this.cachedAccentColor = css ? cssColorToHex(css) : 0x6366f1;
    }
    return this.cachedAccentColor;
  }

  /** Called on css-change event (theme switch, snippet toggle) */
  private invalidateThemeCache() {
    this.cachedBgColor = null;
    this.cachedLabelColor = null;
    this.cachedIsDark = null;
    this.cachedAccentColor = null;

    // Update canvas background color
    if (this.pixiApp) {
      const el = this.canvasWrap ?? this.containerEl;
      const bgStr = getComputedStyle(el).getPropertyValue("--graph-background").trim()
        || getComputedStyle(el).getPropertyValue("--background-primary").trim();
      if (bgStr) {
        try { this.pixiApp.setBackgroundColor(cssColorToHex(bgStr)); } catch { /* ignore */ }
      }
    }

    this.markDirty();
  }

  // =========================================================================
  // Draw orbit rings (concentric circles)
  // =========================================================================
  drawOrbitRings() {
    const g = this.orbitGraphics;
    if (!g) return;
    g.clear();
    if (!this.panel.showOrbitRings || this.currentLayout !== "concentric" || this.shells.length === 0) return;

    const ringColor = this.isDarkTheme() ? 0x888888 : 0xaaaaaa;
    const n = this.shells.length;

    for (let i = 0; i < n; i++) {
      const shell = this.shells[i];
      if (shell.radius <= 0) continue;
      // Inner rings slightly more visible, outer rings fade
      const t = n > 1 ? i / (n - 1) : 0;
      const ringAlpha = 0.3 - t * 0.15;  // 0.30 → 0.15
      const lineWidth = 1.5 - t * 0.5;    // 1.5 → 1.0
      g.lineStyle(lineWidth, ringColor, ringAlpha);
      g.drawCircle(shell.centerX, shell.centerY, shell.radius);
    }
  }

  getLabelColor(): number {
    if (this.cachedLabelColor === null) {
      const el = this.canvasWrap ?? this.containerEl;
      const css = getComputedStyle(el).getPropertyValue("--text-muted").trim();
      this.cachedLabelColor = css ? cssColorToHex(css) : 0x999999;
    }
    return this.cachedLabelColor;
  }

  // =========================================================================
  // Draw edges (delegated to EdgeRenderer)
  // =========================================================================
  /** Resolve an edge source/target reference to a position object.
   *  Bound method — avoids per-frame closure allocation. */
  private _resolveEdgePos = (ref: string | object) =>
    typeof ref === "object" ? (ref as any) : this.pixiNodes.get(ref as string)?.data;

  /** Resolve an enclosure member node ID to position + radius.
   *  Bound method — avoids per-frame closure allocation. */
  private _resolveEnclosurePos = (id: string) => {
    const pn = this.pixiNodes.get(id);
    return pn ? { x: pn.data.x, y: pn.data.y, radius: pn.radius } : undefined;
  };

  drawEdges() {
    if (!this.edgeGraphics) return;
    // Ring chart mode: hide all edges
    if (this.panel.ringChartMode && this.panel.clusterArrangement === "sunburst") {
      this.edgeGraphics.clear();
      return;
    }
    this._frameCounter++;
    // Cache background color to avoid getComputedStyle on every frame
    if (this.cachedBgColor === null) {
      const el = this.canvasWrap ?? this.containerEl;
      const bg = getComputedStyle(el).getPropertyValue("--background-primary").trim();
      this.cachedBgColor = bg ? cssColorToHex(bg) : 0x1e1e2e;
    }
    // Pre-compute max degree for fade normalization
    let maxDeg = 0;
    if (this.panel.fadeEdgesByDegree) {
      for (const d of this.degrees.values()) { if (d > maxDeg) maxDeg = d; }
    }
    // Ephemeral highlight (from side panel hover) overrides normal hover for edge drawing
    const ephActive = this.ephemeralHighlight && this.ephemeralHighlight.size > 0;
    const effectiveHighlightId = ephActive ? "__ephemeral__" : this.highlightedNodeId;
    const effectiveHighlightSet = ephActive ? this.ephemeralHighlight! : this.prevHighlightSet;

    // Reuse EdgeDrawConfig object — mutate in place to avoid per-frame allocation
    let cfg = this._edgeDrawCfg;
    if (!cfg) {
      cfg = {
        showLinks: false, showTagEdges: false, showCategoryEdges: false,
        showSemanticEdges: false, showInheritance: false, showAggregation: false,
        showTagNodes: false, showSimilar: false, showSibling: false, showSequence: false,
        colorEdgesByRelation: false, isArcLayout: false,
        highlightedNodeId: null, highlightSet: new Set(),
        bgColor: 0, relationColors: new Map(), fadeByDegree: false,
        degrees: new Map(), maxDegree: 0,
        nodeClusterMap: null, clusterCentroids: null, clusterRadii: null,
        bundleStrength: 0, isDark: false, showEdgeLabels: false, showArrows: false,
        nodeRadii: null,
      } as EdgeDrawConfig;
      this._edgeDrawCfg = cfg;
    }
    cfg.showLinks = this.panel.showLinks;
    cfg.showTagEdges = this.panel.showTagEdges;
    cfg.showCategoryEdges = this.panel.showCategoryEdges;
    cfg.showSemanticEdges = this.panel.showSemanticEdges;
    cfg.showInheritance = this.panel.showInheritance;
    cfg.showAggregation = this.panel.showAggregation;
    cfg.showTagNodes = this.panel.showTagNodes;
    cfg.showSimilar = this.panel.showSimilar;
    cfg.showSibling = this.panel.showSibling;
    cfg.showSequence = this.panel.showSequence;
    cfg.colorEdgesByRelation = this.panel.colorEdgesByRelation;
    cfg.isArcLayout = this.currentLayout === "arc";
    cfg.highlightedNodeId = effectiveHighlightId;
    cfg.highlightSet = effectiveHighlightSet;
    cfg.bgColor = this.cachedBgColor;
    cfg.relationColors = this.relationColors;
    cfg.fadeByDegree = this.panel.fadeEdgesByDegree;
    cfg.degrees = this.degrees;
    cfg.maxDegree = maxDeg;
    cfg.totalEdgeCount = this.graphEdges.length;
    cfg.nodeClusterMap = this.clusterMeta?.nodeClusterMap ?? null;
    cfg.clusterCentroids = this.getCachedCentroids();
    cfg.clusterRadii = this.clusterMeta?.clusterRadii ?? null;
    cfg.bundleStrength = this.panel.edgeBundleStrength;
    cfg.cableBundleMode = this.panel.cableBundleMode;
    cfg.cableTrunkWidth = this.panel.cableTrunkWidth;
    cfg.cableTrunkAlpha = this.panel.cableTrunkAlpha;
    cfg.cableSpacing = this.panel.cableSpacing;
    cfg.cableFanWidth = this.panel.cableFanWidth;
    cfg.cableFanAlpha = this.panel.cableFanAlpha;
    cfg.edgeDensityFloor = (this.panel.renderThresholds ?? {}).edgeDensityFloor;
    cfg.isDark = this.isDarkTheme();
    cfg.showEdgeLabels = this.panel.showEdgeLabels;
    cfg.showArrows = this.panel.showArrows;
    cfg.nodeRadii = (this.panel.showArrows || this.panel.edgeCardinalityMode !== "none") ? this.getCachedNodeRadii() : null;
    cfg.worldScale = this.worldContainer?.scale?.x ?? 1;
    cfg.edgeCardinalityMode = this.panel.edgeCardinalityMode;
    cfg.cardinalityRules = this.panel.cardinalityRules;
    cfg.cardinalityRenderConfig = this.panel.cardinalityRenderConfig;
    cfg.edgeWeightThickness = this.panel.edgeWeightThickness;

    drawEdgesImpl(
      this.edgeGraphics,
      this.graphEdges,
      this._resolveEdgePos,
      cfg,
      this.arrowGraphics,
    );
    // Draw edge labels into dedicated container (on top of edges, below nodes)
    if (this.edgeLabelContainer) {
      drawEdgeLabelsImpl(
        this.edgeLabelContainer,
        this.graphEdges,
        this._resolveEdgePos,
        cfg,
      );
    }
    // Draw pathfinder path overlay
    if (this.pathfinderPath && this.pathfinderPath.length > 1) {
      const g = this.edgeGraphics;
      const pathColor = 0x22d3ee; // cyan
      g.lineStyle(3, pathColor, 0.9);
      for (let i = 0; i < this.pathfinderPath.length - 1; i++) {
        const a = this.pixiNodes.get(this.pathfinderPath[i]);
        const b = this.pixiNodes.get(this.pathfinderPath[i + 1]);
        if (a && b) {
          g.moveTo(a.data.x, a.data.y);
          g.lineTo(b.data.x, b.data.y);
        }
      }
    }

    // Ensure arrow layer stays on top of all node containers
    if (this.arrowGraphics && this.worldContainer) {
      this.worldContainer.addChild(this.arrowGraphics);
    }
  }

  // =========================================================================
  // Tag enclosures (delegated to EnclosureRenderer)
  // =========================================================================
  drawEnclosures() {
    if (!this.enclosureGraphics) return;
    // Ring chart mode: hide enclosures
    if (this.isRingChartMode()) { this.enclosureGraphics.clear(); return; }
    const cfg: EnclosureConfig = {
      tagDisplay: this.panel.tagDisplay,
      tagMembership: this.tagMembership,
      nodeColorMap: this.nodeColorMap,
      tagRelPairsCache: this.tagRelPairsCache,
      resolvePos: this._resolveEnclosurePos,
      worldScale: this.worldContainer?.scale.x ?? 1,
      totalNodeCount: this.pixiNodes.size,
      enclosureMinRatio: this.plugin.settings.enclosureMinRatio,
      onTagHover: (tag) => {
        this.hoveredTag = tag;
        if (tag) {
          const members = this.tagMembership.get(tag);
          if (members) this.applyEphemeralHighlight(new Set(members));
        } else {
          this.applyEphemeralHighlight(null);
        }
      },
      hoveredTag: this.hoveredTag,
      labelContainer: this.enclosureLabelContainer ?? undefined,
    };
    drawEnclosuresImpl(this.enclosureGraphics, this.enclosureLabels, this.overlapCache, cfg);
  }

  drawSunburstArcs() {
    const gfx = this.sunburstGraphics;
    if (!gfx) return;
    gfx.clear();

    const sunburstArcs = this.clusterMeta?.sunburstArcs;
    if (!sunburstArcs || sunburstArcs.length === 0) return;

    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    const depthLighten = rt.sunburstDepthLighten ?? 0.18;
    const borderWidth = rt.sunburstBorderWidth ?? 1.0;
    const borderAlpha = rt.sunburstBorderAlpha ?? 0.3;

    // Build root-level group → color index map
    // depth=0 arcs are root level; deeper arcs inherit via parentKey
    const rootColorIdx = new Map<string, number>();
    let colorIdx = 0;
    for (const arc of sunburstArcs) {
      if (arc.depth === 0 && !rootColorIdx.has(arc.groupKey)) {
        rootColorIdx.set(arc.groupKey, colorIdx++);
      }
    }
    // Resolve color index for any arc (via parentKey for deeper arcs)
    const getColorIdx = (arc: typeof sunburstArcs[0]) => {
      if (arc.depth === 0) return rootColorIdx.get(arc.groupKey) ?? 0;
      if (arc.parentKey) return rootColorIdx.get(arc.parentKey) ?? 0;
      // Fallback: strip "::" and look up
      const parent = arc.groupKey.replace(/::.*$/, "");
      return rootColorIdx.get(parent) ?? 0;
    };

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const lineW = Math.max(0.8, 1.5 / worldScale);
    const thinW = Math.max(0.4, 0.8 / worldScale);
    const bdrW = Math.max(0.5, borderWidth / worldScale);

    const isRingChart = this.panel.ringChartMode;

    if (isRingChart) {
      // === Ring Chart Mode: opaque filled sectors with depth gradient ===
      for (const arc of sunburstArcs) {
        const { cx, cy, rInner, rOuter, startAngle, endAngle, depth } = arc;
        if (rOuter <= 0 || endAngle - startAngle < 0.001) continue;

        const ci = getColorIdx(arc);
        const css = DEFAULT_COLORS[ci % DEFAULT_COLORS.length];
        const baseColor = cssColorToHex(css);
        const color = this.lightenHexColor(baseColor, depth * depthLighten);
        const fillAlpha = Math.max(0.3, 0.7 - depth * 0.08);

        gfx.lineStyle(bdrW, 0xffffff, borderAlpha);
        gfx.beginFill(color, fillAlpha);
        this.drawArcPath(gfx, cx, cy, rInner, rOuter, startAngle, endAngle);
        gfx.endFill();
      }
    } else {
      // === Normal Mode: light fill + outlines with depth gradient ===
      for (const arc of sunburstArcs) {
        const { cx, cy, rInner, rOuter, startAngle, endAngle, depth } = arc;
        if (rOuter <= 0 || endAngle - startAngle < 0.001) continue;

        const ci = getColorIdx(arc);
        const css = DEFAULT_COLORS[ci % DEFAULT_COLORS.length];
        const baseColor = cssColorToHex(css);
        const color = this.lightenHexColor(baseColor, depth * depthLighten);
        const fillAlpha = Math.max(0.02, 0.1 - depth * 0.015);
        const strokeAlpha = Math.max(0.15, 0.4 - depth * 0.05);

        // Light fill
        gfx.beginFill(color, fillAlpha);
        this.drawArcPath(gfx, cx, cy, rInner, rOuter, startAngle, endAngle);
        gfx.endFill();

        // Outlines
        const w = depth > 0 ? thinW : lineW;
        gfx.lineStyle(w, color, strokeAlpha);
        this.drawArcLine(gfx, cx, cy, rOuter, startAngle, endAngle);
        this.drawArcLine(gfx, cx, cy, rInner, startAngle, endAngle);

        // Radial separators
        gfx.lineStyle(w, color, strokeAlpha * 0.7);
        gfx.moveTo(cx + rInner * Math.cos(startAngle), cy + rInner * Math.sin(startAngle));
        gfx.lineTo(cx + rOuter * Math.cos(startAngle), cy + rOuter * Math.sin(startAngle));
        gfx.moveTo(cx + rInner * Math.cos(endAngle), cy + rInner * Math.sin(endAngle));
        gfx.lineTo(cx + rOuter * Math.cos(endAngle), cy + rOuter * Math.sin(endAngle));
      }
    }
  }

  /** Lighten a hex color by a factor (0-1). factor=0.2 means 20% lighter. */
  private lightenHexColor(hex: number, factor: number): number {
    const r = Math.min(255, ((hex >> 16) & 0xff) + Math.round(255 * factor));
    const g = Math.min(255, ((hex >> 8) & 0xff) + Math.round(255 * factor));
    const b = Math.min(255, (hex & 0xff) + Math.round(255 * factor));
    return (r << 16) | (g << 8) | b;
  }

  /** Draw labels on cluster sunburst arcs (depth ≤ 1 only, wide arcs) */
  private drawClusterSunburstLabels() {
    const sunburstArcs = this.clusterMeta?.sunburstArcs;
    if (!sunburstArcs || sunburstArcs.length === 0) {
      // Clear existing labels
      for (const lbl of this.clusterSunburstLabels.values()) {
        lbl.parent?.removeChild(lbl);
        lbl.destroy();
      }
      this.clusterSunburstLabels.clear();
      return;
    }

    if (!this.clusterSunburstLabelContainer && this.worldContainer) {
      this.clusterSunburstLabelContainer = new CanvasContainer();
      this.worldContainer.addChild(this.clusterSunburstLabelContainer);
    }
    const container = this.clusterSunburstLabelContainer;
    if (!container) return;

    // Clear old labels
    for (const lbl of this.clusterSunburstLabels.values()) {
      lbl.parent?.removeChild(lbl);
      lbl.destroy();
    }
    this.clusterSunburstLabels.clear();

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const fontSize = Math.max(8, 12 / worldScale);
    const isDark = this.cachedIsDark ?? true;
    const textColor = isDark ? 0xdddddd : 0x333333;

    const minSweep = 0.15; // minimum arc sweep to draw label (radians)

    for (const arc of sunburstArcs) {
      // Only label depth 0-1 arcs with sufficient width
      if (arc.depth > 1) continue;
      const sweep = arc.endAngle - arc.startAngle;
      if (sweep < minSweep) continue;

      const midAngle = (arc.startAngle + arc.endAngle) / 2;
      const midR = (arc.rInner + arc.rOuter) / 2;
      const lx = arc.cx + midR * Math.cos(midAngle);
      const ly = arc.cy + midR * Math.sin(midAngle);

      // Display name: strip "::" suffixes
      const displayName = arc.groupKey.replace(/::.*$/, "").split("/").pop() || arc.groupKey;

      const text = new CanvasText(displayName, {
        fontSize: arc.depth === 0 ? fontSize * 1.1 : fontSize,
        fill: textColor,
        fontWeight: arc.depth === 0 ? "bold" : "normal",
        align: "center",
      });
      text.anchor.set(0.5, 0.5);
      text.x = lx;
      text.y = ly;

      // Rotate text along arc direction
      let rotation = midAngle + Math.PI / 2;
      if (rotation > Math.PI / 2 && rotation < 3 * Math.PI / 2) {
        rotation += Math.PI;
      }
      text.rotation = rotation;

      container.addChild(text);
      this.clusterSunburstLabels.set(`${arc.groupKey}:${arc.depth}`, text);
    }

    // --- Label collision avoidance for rotated labels ---
    this.cullOverlappingRotatedLabels(this.clusterSunburstLabels);
  }

  /** Draw an arc line (stroke only, no fill) */
  private drawArcLine(
    gfx: CanvasGraphics,
    cx: number, cy: number,
    r: number,
    startAngle: number, endAngle: number,
  ) {
    const steps = Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 20));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startAngle + t * (endAngle - startAngle);
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }
  }

  /** Draw a baumkuchen-shaped arc path (annular sector) for fills */
  private drawArcPath(
    gfx: CanvasGraphics,
    cx: number, cy: number,
    rInner: number, rOuter: number,
    startAngle: number, endAngle: number,
  ) {
    const steps = Math.max(16, Math.ceil(Math.abs(endAngle - startAngle) * 20));

    // Outer arc (clockwise)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startAngle + t * (endAngle - startAngle);
      const x = cx + rOuter * Math.cos(a);
      const y = cy + rOuter * Math.sin(a);
      if (i === 0) gfx.moveTo(x, y);
      else gfx.lineTo(x, y);
    }

    // Inner arc (counter-clockwise)
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const a = startAngle + t * (endAngle - startAngle);
      const x = cx + rInner * Math.cos(a);
      const y = cy + rInner * Math.sin(a);
      gfx.lineTo(x, y);
    }

    gfx.closePath();
  }

  // =========================================================================
  // Timeline duration bars
  // =========================================================================
  drawTimelineBars() {
    const g = this.barGraphics;
    if (!g) return;
    g.clear();

    // Clear previous bar labels
    if (this.barLabelContainer) {
      for (const child of [...this.barLabelContainer.children]) {
        this.barLabelContainer.removeChild(child);
        child.destroy();
      }
    }

    if (!this.panel.showDurationBars) return;
    const bars = this.clusterMeta?.timelineBars;
    if (!bars || bars.length === 0) return;

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const lineW = Math.max(0.5, 1.0 / worldScale);

    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    const fillAlpha = rt.timelineBarFillAlpha;
    const strokeAlpha = rt.timelineBarStrokeAlpha;
    const hoverAlpha = rt.timelineBarHoverAlpha;
    const barCornerRBase = rt.timelineBarCornerRadius;
    const hoveredId = this.highlightedNodeId;
    const showBarLabel = rt.timelineBarShowLabel;
    const barLabelMinW = rt.timelineBarLabelMinWidth;
    const barLabelFontSize = rt.timelineBarLabelFontSize;

    for (const bar of bars) {
      const pn = this.pixiNodes.get(bar.nodeId);
      const color = pn ? pn.color : 0x888888;
      const w = bar.xEnd - bar.xStart;
      const h = bar.barHeight;
      const x = bar.xStart;
      const y = bar.yCenter - h / 2;
      const cornerR = Math.min(h / 2, barCornerRBase);
      const isHovered = hoveredId === bar.nodeId;
      const barFillAlpha = isHovered ? hoverAlpha : fillAlpha;

      // Fill
      g.beginFill(color, barFillAlpha);
      g.drawRoundedRect(x, y, w, h, cornerR);
      g.endFill();

      // Stroke
      g.lineStyle(lineW, color, strokeAlpha);
      g.drawRoundedRect(x, y, w, h, cornerR);
      g.lineStyle(0);

      // Bar label — displayed above the bar's left edge with pill background
      // Skip label when bar is too narrow to be readable (DQ-01)
      if (showBarLabel && this.barLabelContainer && pn && w * worldScale >= barLabelMinW) {
        const fontSize = Math.max(7, barLabelFontSize / worldScale);
        const label = new CanvasText(pn.data.label, {
          fontSize,
          fontWeight: "bold",
          fill: this.isDarkTheme() ? 0xffffff : 0x111111,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        });
        label.bgColor = color;
        label.bgAlpha = 0.7;
        label.bgPadX = 4 / worldScale;
        label.bgPadY = 2 / worldScale;
        label.x = x;
        label.y = y - fontSize * 0.3;
        label.maxWidth = Math.max(w, 40 / worldScale);
        this.barLabelContainer.addChild(label);
      }
    }
  }

  // =========================================================================
  // Arrangement guide lines
  // =========================================================================
  drawGuideLines() {
    const g = this.guideLineGraphics;
    if (!g) return;
    g.clear();
    this.clearTimelineAxisLabels();

    if (!this.panel.showGuideLines) {
      this.clearCustomGridLabels();
      return;
    }
    const guideData = this.clusterMeta?.guideLineData;
    if (!guideData || guideData.groups.length === 0) {
      this.clearCustomGridLabels();
      return;
    }

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const lineW = Math.max(0.5, 1.0 / worldScale);
    const guideColor = this.isDarkTheme() ? 0x666666 : 0xbbbbbb;

    // Shared timeline mode: merge all timeline guides into one axis
    if (this.panel.guideLineMode === "shared" && guideData.arrangement === "timeline") {
      const timelineGroups = guideData.groups.filter(gr => gr.guide.type === "timeline");
      if (timelineGroups.length > 0) {
        const allTicks: { x: number; label: string }[] = [];
        let sumY = 0;
        for (const group of timelineGroups) {
          const tg = group.guide as Extract<ArrangementGuide, { type: "timeline" }>;
          sumY += group.centerY + tg.axisY;
          for (const tick of tg.ticks) {
            allTicks.push({ x: group.centerX + tick.x, label: tick.label });
          }
        }
        // Deduplicate ticks by label
        const seen = new Set<string>();
        const uniqueTicks: { x: number; label: string }[] = [];
        for (const tick of allTicks) {
          if (!seen.has(tick.label)) {
            seen.add(tick.label);
            uniqueTicks.push(tick);
          }
        }
        const sharedY = sumY / timelineGroups.length;
        if (uniqueTicks.length > 0) {
          const xs = uniqueTicks.map(t => t.x);
          const xMin = Math.min(...xs) - 20;
          const xMax = Math.max(...xs) + 20;
          g.lineStyle(lineW * 1.5, guideColor, 0.5);
          g.moveTo(xMin, sharedY);
          g.lineTo(xMax, sharedY);
          const tickH = 6 / worldScale;
          g.lineStyle(lineW, guideColor, 0.4);
          for (const tick of uniqueTicks) {
            g.moveTo(tick.x, sharedY - tickH);
            g.lineTo(tick.x, sharedY + tickH);
          }
        }

        // Shared timeline axis labels
        const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
        if (rt.timelineAxisShowLabels && uniqueTicks.length > 0) {
          const maxLabels = rt.timelineAxisLabelMaxCount!;
          let labelTicks = uniqueTicks;
          if (labelTicks.length > maxLabels) {
            const step = Math.ceil(labelTicks.length / maxLabels);
            labelTicks = labelTicks.filter((_: any, i: number) => i % step === 0);
          }
          const fontSize = rt.timelineAxisLabelFontSize! / worldScale;
          const labelOffset = rt.timelineAxisLabelOffset! / worldScale;
          const tickH2 = 6 / worldScale;
          for (const tick of labelTicks) {
            const text = new CanvasText(tick.label, {
              fontSize,
              fill: guideColor,
              fontWeight: "400",
            });
            text.anchor.set(0.5, 0);
            text.x = tick.x;
            text.y = sharedY + tickH2 + labelOffset;
            text.alpha = rt.timelineAxisLabelAlpha!;
            text.rotation = Math.PI / 4;
            g.parent?.addChild(text);
            this.timelineAxisLabels.push(text);
          }
        }
        return;
      }
    }

    // Default: per-group rendering
    for (const group of guideData.groups) {
      const { centerX: cx, centerY: cy, guide } = group;
      const gColor = this.getClusterGroupColor(group.groupKey);
      switch (guide.type) {
        case "timeline":
          this.drawTimelineAxis(g, cx, cy, guide, lineW, gColor, worldScale);
          break;
        case "spiral":
          this.drawSpiralCurve(g, cx, cy, guide, lineW, gColor);
          break;
        case "grid":
          this.drawGridLines(g, cx, cy, guide, lineW, gColor);
          break;
        case "tree":
          this.drawTreeDepthLines(g, cx, cy, guide, lineW, gColor);
          break;
        case "triangle":
          this.drawTriangleOutline(g, cx, cy, guide, lineW, gColor);
          break;
        case "mountain":
          this.drawMountainSilhouette(g, cx, cy, guide, lineW, gColor);
          break;
        case "coordinate":
          this.drawCoordinateGuide(g, cx, cy, guide as Extract<ArrangementGuide, { type: "coordinate" }>, lineW, gColor);
          break;
        case "concentric":
          this.drawConcentricGuide(g, cx, cy, guide as Extract<ArrangementGuide, { type: "concentric" }>, lineW, gColor);
          break;
      }
    }
  }

  drawGroupGrid() {
    const g = this.groupGridGraphics;
    if (!g) return;
    g.clear();

    if (!this.panel.showGroupGrid) {
      // Also hide labels when group grid is off
      if (this.groupGridLabelContainer) {
        for (const lbl of this.groupGridLabels.values()) {
          lbl.parent?.removeChild(lbl);
          lbl.destroy();
        }
        this.groupGridLabels.clear();
      }
      return;
    }
    if (!this.clusterMeta) {
      if (this.groupGridLabelContainer) {
        for (const lbl of this.groupGridLabels.values()) {
          lbl.parent?.removeChild(lbl);
          lbl.destroy();
        }
        this.groupGridLabels.clear();
      }
      return;
    }

    const centroids = this.computeLiveCentroids();
    const radii = this.clusterMeta.clusterRadii;
    if (!centroids || !radii) return;

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const lineW = Math.max(0.5, 1.0 / worldScale);
    const isDark = this.isDarkTheme();
    const fallbackColor = isDark ? 0x555555 : 0xcccccc;

    for (const [groupKey, center] of centroids) {
      const radius = radii.get(groupKey);
      if (!radius || radius < 5) continue;

      const groupColor = this.getClusterGroupColor(groupKey);
      const cx = center.x;
      const cy = center.y;
      const r = radius;

      // Bounding circle — group color, semi-transparent
      g.lineStyle(lineW * 1.5, groupColor, 0.35);
      g.drawCircle(cx, cy, r);

      // Skip cross-hair and mid-grid when guideLines already show structure
      const hasGuides = this.panel.showGuideLines && !!this.clusterMeta?.guideLineData;
      if (!hasGuides) {
        // Cross-hair at center — more subtle
        g.lineStyle(lineW, groupColor, 0.25);
        g.moveTo(cx - r, cy);
        g.lineTo(cx + r, cy);
        g.moveTo(cx, cy - r);
        g.lineTo(cx, cy + r);

        // Mid-grid lines (half-radius)
        const hr = r * 0.5;
        g.lineStyle(lineW * 0.5, groupColor, 0.15);
        g.moveTo(cx - r, cy - hr);
        g.lineTo(cx + r, cy - hr);
        g.moveTo(cx - r, cy + hr);
        g.lineTo(cx + r, cy + hr);
        g.moveTo(cx - hr, cy - r);
        g.lineTo(cx - hr, cy + r);
        g.moveTo(cx + hr, cy - r);
        g.lineTo(cx + hr, cy + r);
      }
    }

    // --- Group name labels ---
    if (!this.groupGridLabelContainer && this.worldContainer) {
      this.groupGridLabelContainer = new CanvasContainer();
      this.worldContainer.addChild(this.groupGridLabelContainer);
    }
    const labelContainer = this.groupGridLabelContainer;
    if (labelContainer) {
      // Clean up old labels
      for (const lbl of this.groupGridLabels.values()) {
        lbl.parent?.removeChild(lbl);
        lbl.destroy();
      }
      this.groupGridLabels.clear();

      const rtL = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
      const fontSize = Math.max(rtL.gridLabelFontSizeMin + 1, Math.min(rtL.gridLabelFontSizeMax + 1, rtL.gridLabelFontSizeBase / worldScale));
      const textColor = isDark ? 0xbbbbbb : 0x555555;
      const bgColor = isDark ? 0x1e1e1e : 0xf5f5f5;

      for (const [groupKey, center] of centroids) {
        const radius = radii.get(groupKey);
        if (!radius || radius < 5) continue;

        // Display name: strip prefix (e.g. "tag:fiction" → "fiction")
        const displayName = groupKey.includes(":") ? groupKey.split(":").pop()! : groupKey;

        const text = new CanvasText(displayName, {
          fontSize,
          fill: textColor,
          fontWeight: "600",
        });
        text.anchor.set(0.5, 0);
        text.x = center.x;
        text.y = center.y - radius - fontSize * 1.5 / worldScale;
        text.bgColor = bgColor;
        text.bgAlpha = 0.6;

        labelContainer.addChild(text);
        this.groupGridLabels.set(groupKey, text);
      }

      // --- Label collision avoidance for group grid labels ---
      this.cullOverlappingRotatedLabels(this.groupGridLabels);
    }
  }

  private drawTimelineAxis(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "timeline" }>,
    lineW: number, color: number, worldScale: number,
  ) {
    const y = cy + guide.axisY;
    // Find extent from ticks
    if (guide.ticks.length === 0) return;
    const xs = guide.ticks.map(t => cx + t.x);
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    const margin = rt.gridLineMargin;
    const xMin = Math.min(...xs) - margin;
    const xMax = Math.max(...xs) + margin;
    const wFactor = rt.gridLineWidthFactor;
    const alpha = rt.gridLineAlpha;

    // Main axis line
    g.lineStyle(lineW * 1.5 * wFactor, color, alpha);
    g.moveTo(xMin, y);
    g.lineTo(xMax, y);

    // Tick marks
    const tickH = 6 / worldScale;
    g.lineStyle(lineW * wFactor, color, alpha);
    for (const tick of guide.ticks) {
      const tx = cx + tick.x;
      g.moveTo(tx, y - tickH);
      g.lineTo(tx, y + tickH);
    }

    // Axis tick labels
    const rt2 = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    if (rt2.timelineAxisShowLabels && guide.ticks.length > 0) {
      const maxLabels = rt2.timelineAxisLabelMaxCount!;
      let labelTicks = guide.ticks;
      if (labelTicks.length > maxLabels) {
        const step = Math.ceil(labelTicks.length / maxLabels);
        labelTicks = labelTicks.filter((_: any, i: number) => i % step === 0);
      }
      const fontSize = rt2.timelineAxisLabelFontSize! / worldScale;
      const labelOffset = rt2.timelineAxisLabelOffset! / worldScale;
      const labelAlpha = rt2.timelineAxisLabelAlpha!;
      const labelColor = color;
      for (const tick of labelTicks) {
        const tx = cx + tick.x;
        const text = new CanvasText(tick.label, {
          fontSize,
          fill: labelColor,
          fontWeight: "400",
        });
        text.anchor.set(0.5, 0);
        text.x = tx;
        text.y = y + tickH + labelOffset;
        text.alpha = labelAlpha;
        text.rotation = Math.PI / 4;
        this.guideLineGraphics?.parent?.addChild(text);
        this.timelineAxisLabels.push(text);
      }
    }
  }

  private drawSpiralCurve(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "spiral" }>,
    lineW: number, color: number,
  ) {
    const { a, maxTheta } = guide;
    if (maxTheta <= 0) return;

    const SEGMENTS = Math.max(100, Math.ceil(maxTheta * 10));
    g.lineStyle(lineW, color, 0.3);

    let started = false;
    for (let i = 0; i <= SEGMENTS; i++) {
      const theta = (i / SEGMENTS) * maxTheta;
      const r = a * theta;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      if (!started) {
        g.moveTo(x, y);
        started = true;
      } else {
        g.lineTo(x, y);
      }
    }
  }

  private drawGridLines(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "grid" }>,
    lineW: number, color: number,
  ) {
    const { verticals, horizontals, bounds } = guide;
    const yMin = cy + bounds.yMin - 10;
    const yMax = cy + bounds.yMax + 10;
    const xMin = cx + bounds.xMin - 10;
    const xMax = cx + bounds.xMax + 10;

    g.lineStyle(lineW, color, 0.2);
    for (const vx of verticals) {
      const x = cx + vx;
      g.moveTo(x, yMin);
      g.lineTo(x, yMax);
    }
    for (const hy of horizontals) {
      const y = cy + hy;
      g.moveTo(xMin, y);
      g.lineTo(xMax, y);
    }
  }

  private drawTreeDepthLines(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "tree" }>,
    lineW: number, color: number,
  ) {
    const xMin = cx + guide.xMin - 20;
    const xMax = cx + guide.xMax + 20;

    // Draw dashed horizontal lines for each depth level
    const dashLen = 8;
    const gapLen = 4;
    g.lineStyle(lineW, color, 0.25);

    for (const level of guide.depthLevels) {
      const y = cy + level.y;
      let x = xMin;
      while (x < xMax) {
        g.moveTo(x, y);
        g.lineTo(Math.min(x + dashLen, xMax), y);
        x += dashLen + gapLen;
      }
    }
  }

  private drawTriangleOutline(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "triangle" }>,
    lineW: number, color: number,
  ) {
    const verts = guide.vertices;
    g.lineStyle(lineW, color, 0.3);
    g.moveTo(cx + verts[0].x, cy + verts[0].y);
    g.lineTo(cx + verts[1].x, cy + verts[1].y);
    g.lineTo(cx + verts[2].x, cy + verts[2].y);
    g.lineTo(cx + verts[0].x, cy + verts[0].y);
  }

  private drawMountainSilhouette(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "mountain" }>,
    lineW: number, color: number,
  ) {
    if (guide.points.length < 2) return;
    g.lineStyle(lineW, color, 0.3);
    g.moveTo(cx + guide.points[0].x, cy + guide.points[0].y);
    for (let i = 1; i < guide.points.length; i++) {
      g.lineTo(cx + guide.points[i].x, cy + guide.points[i].y);
    }
  }

  private drawCoordinateGuide(
    g: CanvasGraphics, cx: number, cy: number,
    guide: { type: "coordinate"; system: string; bounds?: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number }; gridInfo?: ResolvedGridInfo },
    lineW: number, color: number,
  ) {
    const bounds = guide.bounds;
    if (!bounds) return;

    // Custom grid takes precedence when enabled
    if (guide.gridInfo && this.panel.gridTableMode) {
      this.drawCustomGrid(g, cx, cy, guide.gridInfo, bounds, lineW, color);
      return;
    }

    if (guide.system === "polar" && bounds.maxR) {
      // Polar: concentric reference circles + radial lines
      const maxR = bounds.maxR;
      const ringCount = 3;
      g.lineStyle(lineW * 0.8, color, 0.15);
      for (let i = 1; i <= ringCount; i++) {
        const r = (maxR / ringCount) * i;
        g.drawCircle(cx, cy, r);
      }
      // 6 radial lines (every 60 degrees)
      g.lineStyle(lineW * 0.5, color, 0.1);
      for (let a = 0; a < 6; a++) {
        const angle = (a / 6) * Math.PI * 2;
        g.moveTo(cx, cy);
        g.lineTo(cx + maxR * Math.cos(angle), cy + maxR * Math.sin(angle));
      }
    } else {
      // Cartesian: grid lines
      const { xMin, yMin, xMax, yMax } = bounds;
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      if (xRange < 1 || yRange < 1) return;

      const divisions = 4;
      // Grid lines
      g.lineStyle(lineW * 0.8, color, 0.15);
      for (let i = 0; i <= divisions; i++) {
        const x = cx + xMin + (xRange / divisions) * i;
        g.moveTo(x, cy + yMin);
        g.lineTo(x, cy + yMax);
      }
      for (let i = 0; i <= divisions; i++) {
        const y = cy + yMin + (yRange / divisions) * i;
        g.moveTo(cx + xMin, y);
        g.lineTo(cx + xMax, y);
      }
      // Origin cross (stronger)
      g.lineStyle(lineW, color, 0.25);
      g.moveTo(cx + xMin, cy);
      g.lineTo(cx + xMax, cy);
      g.moveTo(cx, cy + yMin);
      g.lineTo(cx, cy + yMax);
    }
  }

  private drawCustomGrid(
    g: CanvasGraphics, cx: number, cy: number,
    gridInfo: ResolvedGridInfo,
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    lineW: number, color: number,
  ) {
    const { axis1Lines, axis2Lines, axis1Shape, axis2Shape, style, cellShading } = gridInfo;
    const isDark = this.isDarkTheme();
    const worldScale = this.worldContainer?.scale.x ?? 1;

    // Cell shading (table mode)
    if (cellShading && style === "table" && axis1Lines.length > 1 && axis2Lines.length > 1) {
      this.drawCellShading(g, cx, cy, axis1Lines, axis2Lines, bounds, color);
    }

    // Draw axis1 grid lines (vertical in cartesian, circles/radials in polar)
    const thresholds = this.getPanel().renderThresholds ?? {};
    const lineAlpha = style === "table"
      ? (thresholds.gridTableLineAlpha ?? DEFAULT_RENDER_THRESHOLDS.gridTableLineAlpha)
      : (thresholds.gridLineAlpha ?? DEFAULT_RENDER_THRESHOLDS.gridLineAlpha);
    for (const line of axis1Lines) {
      this.drawGridLine(g, cx, cy, line, axis1Shape, bounds, 1, lineW, color, lineAlpha);
    }

    // Draw axis2 grid lines (horizontal in cartesian, circles/radials in polar)
    for (const line of axis2Lines) {
      this.drawGridLine(g, cx, cy, line, axis2Shape, bounds, 2, lineW, color, lineAlpha);
    }

    // Draw tick marks at each grid line position
    this.drawGridTicks(g, cx, cy, axis1Lines, axis2Lines, axis1Shape, axis2Shape, bounds, lineW, color, worldScale);

    // Draw labels
    if (this.panel.gridShowHeaders) {
      this.drawGridLabels(cx, cy, axis1Lines, axis2Lines, axis1Shape, axis2Shape, bounds, worldScale, isDark);
    } else {
      this.clearCustomGridLabels();
    }
  }

  private drawGridLine(
    g: CanvasGraphics, cx: number, cy: number,
    line: ResolvedGridLine,
    shape: { kind: string; expr?: string },
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    axis: 1 | 2,
    lineW: number, color: number, alpha: number,
  ) {
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    g.lineStyle(lineW * rt.gridLineWidthFactor, color, alpha);
    const pos = line.position;
    const margin = rt.gridLineMargin;

    switch (shape.kind) {
      case "line":
        if (axis === 1) {
          // Vertical line at x = pos
          g.moveTo(cx + pos, cy + bounds.yMin - margin);
          g.lineTo(cx + pos, cy + bounds.yMax + margin);
        } else {
          // Horizontal line at y = pos
          g.moveTo(cx + bounds.xMin - margin, cy + pos);
          g.lineTo(cx + bounds.xMax + margin, cy + pos);
        }
        break;

      case "circle":
        // Concentric circle with radius = pos
        if (pos > 0) {
          g.drawCircle(cx, cy, Math.abs(pos));
        }
        break;

      case "radial":
        // Radial line from center at angle = pos (radians)
        {
          const maxR = bounds.maxR ?? Math.max(
            Math.abs(bounds.xMax), Math.abs(bounds.xMin),
            Math.abs(bounds.yMax), Math.abs(bounds.yMin),
          );
          g.moveTo(cx, cy);
          g.lineTo(cx + maxR * Math.cos(pos), cy + maxR * Math.sin(pos));
        }
        break;

      case "curve":
        // Parametric curve defined by expression
        if ("expr" in shape && shape.expr) {
          this.drawCurveGridLine(g, cx, cy, shape.expr, pos, bounds);
        }
        break;
    }
  }

  private drawCurveGridLine(
    g: CanvasGraphics, cx: number, cy: number,
    expr: string, offset: number,
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
  ) {
    try {
      const { parseExpr, evalExpr } = require("../utils/expr-eval");
      const ast = parseExpr(expr);
      const segments = 60;
      const range = bounds.xMax - bounds.xMin || 1;
      let started = false;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = bounds.xMin + t * range;
        const y = evalExpr(ast, { t, x, v: offset, i, n: segments + 1 });
        const px = cx + x;
        const py = cy + y;
        if (!started) { g.moveTo(px, py); started = true; }
        else { g.lineTo(px, py); }
      }
    } catch {
      // Invalid expression — skip
    }
  }

  private drawCellShading(
    g: CanvasGraphics, cx: number, cy: number,
    axis1Lines: ResolvedGridLine[], axis2Lines: ResolvedGridLine[],
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
    color: number,
  ) {
    // Count nodes per cell
    const cellCounts = new Map<string, number>();
    let maxCount = 0;

    // Build cell boundaries from line positions
    const xPositions = axis1Lines.map(l => l.position).sort((a, b) => a - b);
    const yPositions = axis2Lines.map(l => l.position).sort((a, b) => a - b);
    if (xPositions.length < 2 || yPositions.length < 2) return;

    // Count nodes in each cell
    const nodes = this.currentData?.nodes;
    if (!nodes) return;

    const xExtentMin = xPositions[0];
    const xExtentMax = xPositions[xPositions.length - 1];
    const yExtentMin = yPositions[0];
    const yExtentMax = yPositions[yPositions.length - 1];
    for (const node of nodes) {
      // Get node position relative to group center
      const nodeX = node.x - cx;
      const nodeY = node.y - cy;

      // Skip nodes outside grid extent (e.g. from other groups)
      if (nodeX < xExtentMin - 1 || nodeX > xExtentMax + 1) continue;
      if (nodeY < yExtentMin - 1 || nodeY > yExtentMax + 1) continue;

      // Find cell indices
      const xi = findCellIndex(nodeX, xPositions);
      const yi = findCellIndex(nodeY, yPositions);
      if (xi >= 0 && yi >= 0) {
        const key = `${xi}-${yi}`;
        const count = (cellCounts.get(key) ?? 0) + 1;
        cellCounts.set(key, count);
        if (count > maxCount) maxCount = count;
      }
    }

    if (maxCount === 0) return;

    // Draw shaded rectangles
    const rt = this.getPanel().renderThresholds ?? {};
    const shadingMin = rt.gridCellShadingMin ?? DEFAULT_RENDER_THRESHOLDS.gridCellShadingMin;
    const shadingRange = rt.gridCellShadingRange ?? DEFAULT_RENDER_THRESHOLDS.gridCellShadingRange;
    for (let xi = 0; xi < xPositions.length - 1; xi++) {
      for (let yi = 0; yi < yPositions.length - 1; yi++) {
        const count = cellCounts.get(`${xi}-${yi}`) ?? 0;
        if (count === 0) continue;
        const alpha = shadingMin + (count / maxCount) * shadingRange;
        g.beginFill(color, alpha);
        const x = cx + xPositions[xi];
        const y = cy + yPositions[yi];
        const w = xPositions[xi + 1] - xPositions[xi];
        const h = yPositions[yi + 1] - yPositions[yi];
        g.drawRect(x, y, w, h);
        g.endFill();
      }
    }
  }

  private drawGridTicks(
    g: CanvasGraphics, cx: number, cy: number,
    axis1Lines: ResolvedGridLine[], axis2Lines: ResolvedGridLine[],
    axis1Shape: { kind: string }, axis2Shape: { kind: string },
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    lineW: number, color: number, worldScale: number,
  ) {
    const tickLen = 6 / worldScale;
    g.lineStyle(lineW, color, 0.4);

    // Axis1 ticks — small marks at grid edge
    for (const line of axis1Lines) {
      if (!line.label) continue;
      if (axis1Shape.kind === "line") {
        const x = cx + line.position;
        const y = cy + bounds.yMin;
        g.moveTo(x, y - tickLen);
        g.lineTo(x, y);
      }
    }

    // Axis2 ticks
    for (const line of axis2Lines) {
      if (!line.label) continue;
      if (axis2Shape.kind === "line") {
        const x = cx + bounds.xMin;
        const y = cy + line.position;
        g.moveTo(x - tickLen, y);
        g.lineTo(x, y);
      }
    }
  }

  private drawGridLabels(
    cx: number, cy: number,
    axis1Lines: ResolvedGridLine[], axis2Lines: ResolvedGridLine[],
    axis1Shape: { kind: string }, axis2Shape: { kind: string },
    bounds: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number },
    worldScale: number, isDark: boolean,
  ) {
    this.clearCustomGridLabels();

    if (!this.customGridLabelContainer && this.worldContainer) {
      this.customGridLabelContainer = new CanvasContainer();
      this.worldContainer.addChild(this.customGridLabelContainer);
    }
    const container = this.customGridLabelContainer;
    if (!container) return;

    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    const fontSize = Math.max(rt.gridLabelFontSizeMin, Math.min(rt.gridLabelFontSizeMax, rt.gridLabelFontSizeBase / worldScale));
    const textColor = isDark ? 0xbbbbbb : 0x555555;
    const bgColor = isDark ? 0x1e1e1e : 0xf5f5f5;
    const labelOffset = rt.gridLabelOffset / worldScale;

    const placement = this.panel.gridLabelPlacement ?? "on-line";
    const useBetween = placement === "between";

    // Helper: create a text label and add to container
    const addLabel = (label: string, x: number, y: number, anchorX: number, anchorY: number) => {
      const text = new CanvasText(label, {
        fontSize,
        fill: textColor,
        fontWeight: "500",
      });
      text.bgColor = bgColor;
      text.bgAlpha = 0.6;
      text.anchor.set(anchorX, anchorY);
      text.x = x;
      text.y = y;
      container.addChild(text);
      this.customGridLabels.push(text);
    };

    // Axis1 labels — placed above the grid
    if (useBetween && axis1Lines.length >= 2) {
      // Between mode: place label i between axis1Lines[i] and axis1Lines[i+1]
      // Labels come from axis1Lines[i].label (N labels for N+1 boundary lines)
      for (let i = 0; i + 1 < axis1Lines.length; i++) {
        const label = axis1Lines[i].label;
        if (!label) continue;
        const midPos = (axis1Lines[i].position + axis1Lines[i + 1].position) / 2;

        if (axis1Shape.kind === "radial") {
          const maxR = bounds.maxR ?? Math.max(Math.abs(bounds.xMax), Math.abs(bounds.yMax));
          const angle = midPos;
          addLabel(label, cx + (maxR + labelOffset * 2) * Math.cos(angle),
            cy + (maxR + labelOffset * 2) * Math.sin(angle), 0.5, 0.5);
        } else {
          addLabel(label, cx + midPos, cy + bounds.yMin - labelOffset, 0.5, 1);
        }
      }
    } else {
      // On-line mode (default): label at each grid line position
      for (const line of axis1Lines) {
        if (!line.label) continue;
        if (axis1Shape.kind === "radial") {
          const maxR = bounds.maxR ?? Math.max(Math.abs(bounds.xMax), Math.abs(bounds.yMax));
          const angle = line.position;
          addLabel(line.label, cx + (maxR + labelOffset * 2) * Math.cos(angle),
            cy + (maxR + labelOffset * 2) * Math.sin(angle), 0.5, 0.5);
        } else {
          addLabel(line.label, cx + line.position, cy + bounds.yMin - labelOffset, 0.5, 1);
        }
      }
    }

    // Axis2 labels — placed to the left of the grid
    if (useBetween && axis2Lines.length >= 2) {
      // Between mode: place label i between axis2Lines[i] and axis2Lines[i+1]
      for (let i = 0; i + 1 < axis2Lines.length; i++) {
        const label = axis2Lines[i].label;
        if (!label) continue;
        const midPos = (axis2Lines[i].position + axis2Lines[i + 1].position) / 2;

        if (axis2Shape.kind === "circle") {
          addLabel(label, cx + Math.abs(midPos) + labelOffset * 0.5,
            cy - labelOffset * 0.5, 0, 0.5);
        } else {
          addLabel(label, cx + bounds.xMin - labelOffset, cy + midPos, 1, 0.5);
        }
      }
    } else {
      // On-line mode (default): label at each grid line position
      for (const line of axis2Lines) {
        if (!line.label) continue;
        if (axis2Shape.kind === "circle") {
          addLabel(line.label, cx + Math.abs(line.position) + labelOffset * 0.5,
            cy - labelOffset * 0.5, 0, 0.5);
        } else {
          addLabel(line.label, cx + bounds.xMin - labelOffset, cy + line.position, 1, 0.5);
        }
      }
    }
  }

  private clearCustomGridLabels() {
    for (const lbl of this.customGridLabels) {
      lbl.parent?.removeChild(lbl);
      lbl.destroy();
    }
    this.customGridLabels = [];
  }

  private clearTimelineAxisLabels() {
    for (const label of this.timelineAxisLabels) {
      label.parent?.removeChild(label);
      label.destroy();
    }
    this.timelineAxisLabels = [];
  }

  private drawConcentricGuide(
    g: CanvasGraphics, cx: number, cy: number,
    guide: { type: "concentric"; rings: number[] },
    lineW: number, color: number,
  ) {
    if (guide.rings.length === 0) return;

    // Draw concentric ring circles
    g.lineStyle(lineW * 0.8, color, 0.3);
    for (const r of guide.rings) {
      g.drawCircle(cx, cy, r);
    }

    // Light cross at center spanning to max ring
    const maxR = guide.rings[guide.rings.length - 1];
    g.lineStyle(lineW * 0.5, color, 0.15);
    g.moveTo(cx - maxR, cy);
    g.lineTo(cx + maxR, cy);
    g.moveTo(cx, cy - maxR);
    g.lineTo(cx, cy + maxR);
  }

  // =========================================================================
  // Layout transition animation (called by RenderPipeline each frame)
  // =========================================================================
  tickLayoutTransition(): boolean {
    return this.layoutTransition.tick();
  }

  // =========================================================================
  // Update positions
  // =========================================================================
  // Delegated to RenderPipeline
  // =========================================================================
  markDirty(forceFullRedraw = false) {
    this.renderPipeline?.markDirty(forceFullRedraw);
  }

  private startRenderLoop() {
    this.renderPipeline?.startRenderLoop();
  }

  wakeRenderLoop() {
    this.renderPipeline?.wakeRenderLoop();
  }

  private createPixiNodes(
    nodes: GraphNode[],
    nodeR: (n: GraphNode) => number,
    nodeColor: (n: GraphNode) => number
  ) {
    this.renderPipeline?.createPixiNodes(nodes, nodeR, nodeColor);
  }

  private drawNodeCircle(pn: PixiNode, highlight: boolean) {
    this.renderPipeline?.drawNodeCircle(pn, highlight);
  }

  private redrawNodeBatch() {
    this.renderPipeline?.redrawNodeBatch();
  }

  private updatePositions(forceFullRedraw = false) {
    // Delegate position sync to the pipeline; this method is still called
    // from doRender for the initial layout draw.
    for (const pn of this.pixiNodes.values()) {
      pn.gfx.x = pn.data.x;
      pn.gfx.y = pn.data.y;
    }
    this.rebuildSpatialGrid();
    this.redrawNodeBatch();
    this.drawOrbitRings();
    this.drawEnclosures();
    this.drawSunburstArcs();
    this.drawClusterSunburstLabels();
    this.drawSunburstLayoutArcs();
    this.drawEdges();
  }

  // =========================================================================
  // Auto-fit view
  // =========================================================================

  /**
   * Public entry point for triggering a one-shot auto-fit from outside the
   * class (e.g. E2E tests, external toolbar buttons).  Reads the current
   * canvas dimensions and delegates to the private autoFitView() helper,
   * then wakes the render loop so the new transform is painted.
   */
  autoFitOnce() {
    if (!this.canvasWrap) return;
    this.autoFitView(this.canvasWrap.clientWidth, this.canvasWrap.clientHeight);
    this.markDirty();
  }

  private autoFitView(W: number, H: number) {
    const world = this.worldContainer;
    if (!world || this.pixiNodes.size === 0) return;

    const isCardMode = (this.panel.nodeDisplayMode ?? "node") === "card";
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };

    // Pass 1: compute bounding box from node positions only (no card size)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pn of this.pixiNodes.values()) {
      const r = pn.radius;
      if (pn.data.x - r < minX) minX = pn.data.x - r;
      if (pn.data.y - r < minY) minY = pn.data.y - r;
      if (pn.data.x + r > maxX) maxX = pn.data.x + r;
      if (pn.data.y + r > maxY) maxY = pn.data.y + r;
    }

    const padding = isCardMode ? rt.autoFitCardPadding * 2 : 40;

    if (isCardMode) {
      // Two-pass auto-fit for card mode:
      // 1. Estimate worldScale from node positions
      const bw0 = maxX - minX + padding;
      const bh0 = maxY - minY + padding;
      let sc0 = Math.min(W / bw0, H / bh0, 1.5);
      if (rt.autoFitMinScale > 0) sc0 = Math.max(sc0, rt.autoFitMinScale);
      if (this.pixiNodes.size > 0) {
        const sampleR = this.pixiNodes.values().next().value?.radius ?? 1;
        const lodMin = rt.cardLODNormalPx / Math.max(sampleR, 1);
        sc0 = Math.max(sc0, lodMin);
      }

      // 2. Compute actual card dimensions at estimated scale
      const cardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
      const cardConfig = this.panel.cardDisplayConfig ?? { fields: [] };
      const numFields = (cardConfig.fields ?? []).length;
      const hH = crc.tableHeaderHeight / sc0;
      const fLH = crc.fieldLineHeight / sc0;
      const padW = crc.cardPadding / sc0;
      const totalH = hH + numFields * fLH + padW * 2;
      const cardHalfW = (totalH * cardAR) / 2;
      const cardHalfH = totalH / 2;

      // 3. Recompute bounding box with actual card extents
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      for (const pn of this.pixiNodes.values()) {
        if (pn.data.x - cardHalfW < minX) minX = pn.data.x - cardHalfW;
        if (pn.data.y - cardHalfH < minY) minY = pn.data.y - cardHalfH;
        if (pn.data.x + cardHalfW > maxX) maxX = pn.data.x + cardHalfW;
        if (pn.data.y + cardHalfH > maxY) maxY = pn.data.y + cardHalfH;
      }
    }

    // DQ-09: Expand bounding box when enclosures or guidelines are active
    // so they are not clipped at viewport edges after auto-fit.
    if (this.panel.tagDisplay === "enclosure") {
      const encPad = 30; // OUTLINE_PAD + typical label height
      minX -= encPad; minY -= encPad; maxX += encPad; maxY += encPad;
    }
    if (this.panel.showGuideLines && this.clusterMeta?.guideLineData) {
      const guidePad = 20; // gridLabelFontSize margin
      minX -= guidePad; minY -= guidePad; maxX += guidePad; maxY += guidePad;
    }

    const bw = maxX - minX + padding;
    const bh = maxY - minY + padding;
    let sc = Math.min(W / bw, H / bh, 1.5);
    if (rt.autoFitMinScale > 0) sc = Math.max(sc, rt.autoFitMinScale);
    // Card mode: ensure scale is high enough for LOD to show cards (not circles)
    if (isCardMode && this.pixiNodes.size > 0) {
      const sampleRadius = this.pixiNodes.values().next().value?.radius ?? 1;
      const lodMin = rt.cardLODNormalPx / Math.max(sampleRadius, 1);
      sc = Math.max(sc, lodMin);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    world.scale.set(sc);
    world.x = W / 2 - cx * sc;
    world.y = H / 2 - cy * sc;
    this.updateLabelsForZoom();
  }

  /**
   * Zoom the view so that the given screen-space rectangle fills the viewport.
   */
  zoomToScreenRect(sx: number, sy: number, sw: number, sh: number) {
    const world = this.worldContainer;
    const wrap = this.canvasWrap;
    if (!world || !wrap) return;

    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const stage = this.pixiApp!.stage;

    // Convert screen-space rectangle corners to world coordinates
    const topLeft = world.toLocal({ x: sx, y: sy }, stage);
    const bottomRight = world.toLocal({ x: sx + sw, y: sy + sh }, stage);

    const worldW = bottomRight.x - topLeft.x;
    const worldH = bottomRight.y - topLeft.y;
    const cx = (topLeft.x + bottomRight.x) / 2;
    const cy = (topLeft.y + bottomRight.y) / 2;

    const sc = Math.min(W / worldW, H / worldH, 10);
    world.scale.set(sc);
    world.x = W / 2 - cx * sc;
    world.y = H / 2 - cy * sc;
    this.updateLabelsForZoom();
  }

  private zoomBy(factor: number) {
    const world = this.worldContainer;
    const wrap = this.canvasWrap;
    if (!world || !wrap) return;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const worldPos = world.toLocal({ x: cx, y: cy }, this.pixiApp!.stage);
    const s = Math.max(0.02, Math.min(10, world.scale.x * factor));
    world.scale.set(s);
    const newScreen = world.toGlobal(worldPos);
    world.x += cx - newScreen.x;
    world.y += cy - newScreen.y;
    this.updateZoomIndicator(s);
    this.updateLabelsForZoom();
    this.markDirty();
  }

  private setZoom(level: number) {
    const world = this.worldContainer;
    const wrap = this.canvasWrap;
    if (!world || !wrap) return;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const worldPos = world.toLocal({ x: cx, y: cy }, this.pixiApp!.stage);
    const s = Math.max(0.02, Math.min(10, level));
    world.scale.set(s);
    const newScreen = world.toGlobal(worldPos);
    world.x += cx - newScreen.x;
    world.y += cy - newScreen.y;
    this.updateZoomIndicator(s);
    this.updateLabelsForZoom();
    this.markDirty();
  }

  private updateZoomIndicator(scale?: number) {
    if (!this.zoomIndicatorEl) return;
    const s = scale ?? this.worldContainer?.scale?.x ?? 1;
    this.zoomIndicatorEl.textContent = `${Math.round(s * 100)}%`;
  }

  // =========================================================================
  // Control Panel UI (delegated to PanelBuilder)
  // =========================================================================
  private buildPanel() {
    if (!this.panelEl) return;
    const ctx: PanelContext = {
      currentLayout: this.currentLayout,
      setLayout: (l: LayoutType) => { this.currentLayout = l; this.requestSave(); },
      shells: this.shells,
      pixiNodes: this.pixiNodes,
      relationColors: this.relationColors,
      simulation: this.simulation,
      settings: this.plugin.settings,
      saveSettings: () => { this.plugin.saveSettings(); },
      nodeCount: this.pixiNodes.size,
      edgeCount: 0,
      app: this.app,
      frontmatterKeys: this.collectFrontmatterKeys(),
      availableGroups: this.collectAvailableGroups(),
      availableTags: this.collectAvailableTags(),
    };
    const cb: PanelCallbacks = {
      doRender: () => { this.doRender(); this.requestSave(); },
      doRenderKeepPanel: () => { this.skipPanelRebuildCount++; this.doRender().finally(() => { this.skipPanelRebuildCount = Math.max(0, this.skipPanelRebuildCount - 1); }); this.requestSave(); },
      markDirty: () => { invalidateBundleCache(); this.markDirty(true); this.requestSave(); },
      updateForces: () => { this.updateForces(); this.requestSave(); },
      applySearch: () => this.applySearch(),
      applyTextFade: () => { this.applyTextFade(); this.requestSave(); },
      applyDirectionalGravityForce: () => { this.applyNodeRulesForce(); this.requestSave(); },
      applyNodeRules: () => { this.applyNodeRulesForce(); this.applyClusterForce(); this.requestSave(); },
      applyClusterForce: () => { this.applyClusterForce(); this.requestSave(); },
      startOrbitAnimation: () => { this.startOrbitAnimation(); this.requestSave(); },
      stopOrbitAnimation: () => { this.stopOrbitAnimation(); this.requestSave(); },
      wakeRenderLoop: () => this.wakeRenderLoop(),
      rebuildPanel: () => { this.buildPanel(); this.requestSave(); },
      invalidateData: () => { this.rawData = null; this.doRender(); this.requestSave(); },
      invalidateDataKeepPanel: () => { this.rawData = null; this.skipPanelRebuildCount++; this.doRender().finally(() => { this.skipPanelRebuildCount = Math.max(0, this.skipPanelRebuildCount - 1); }); this.requestSave(); },
      restartSimulation: (alpha: number) => {
        if (this.simulation) { this.simulation.alpha(alpha).restart(); this.wakeRenderLoop(); }
      },
      collectFieldSuggestions: () => {
        const builtIn = ["label", "tag", "category", "folder", "path", "file", "id", "isTag"];
        const fmKeys = this.collectFrontmatterKeys();
        return [...new Set([...builtIn, ...fmKeys])];
      },
      collectValueSuggestions: (field: string) => {
        const values = new Set<string>();
        for (const pn of this.pixiNodes.values()) {
          for (const v of getNodeFieldValues(pn.data, field)) values.add(v);
          // "label" is not in getNodeFieldValues, handle explicitly
          if (field === "label") values.add(pn.data.label);
        }
        return [...values].sort();
      },
      saveGroupPreset: () => {
        // Reverse-derive commonQueries from clusterGroupRules for preset backward compat
        const derivedQueries = this.panel.clusterGroupRules.map(r => {
          // Convert "field:?" → "field:*" for query format
          const field = r.groupBy.endsWith(":?") ? r.groupBy.slice(0, -2) : r.groupBy;
          // Legacy mapping for backward compat
          const legacyMap: Record<string, string> = { node_type: "category", none: "tag" };
          const queryField = legacyMap[field] ?? field;
          return { query: `${queryField}:*`, recursive: r.recursive };
        });
        const preset: GroupPreset = {
          condition: {
            layout: this.currentLayout,
            tagDisplay: this.panel.tagDisplay,
          },
          groups: this.panel.groups.map(g => ({ ...g })),
          commonQueries: derivedQueries,
        };
        this.plugin.settings.groupPresets.push(preset);
        this.plugin.saveSettings();
      },
      resetPanel: () => {
        const s = this.plugin.settings;
        Object.assign(this.panel, {
          ...DEFAULT_PANEL,
          sortRules: [...(s.defaultSortRules ?? [{ key: "degree", order: "desc" }])].map(r => ({ ...r })),
          clusterGroupRules: [...(s.defaultClusterGroupRules ?? [])].map(r => ({ ...r })),
          nodeRules: [...(s.defaultNodeRules ?? [])].map(r => ({ ...r })),
          ...(s.defaultClusterArrangement ? { clusterArrangement: s.defaultClusterArrangement } : {}),
          ...(s.defaultClusterNodeSpacing != null ? { clusterNodeSpacing: s.defaultClusterNodeSpacing } : {}),
          ...(s.defaultClusterGroupScale != null ? { clusterGroupScale: s.defaultClusterGroupScale } : {}),
          ...(s.defaultClusterGroupSpacing != null ? { clusterGroupSpacing: s.defaultClusterGroupSpacing } : {}),
          ...(s.defaultEdgeBundleStrength != null ? { edgeBundleStrength: s.defaultEdgeBundleStrength } : {}),
        });
        this.applyGroupPresets();
        this.buildPanel();
        this.applyClusterForce();
        if (this.simulation) { this.simulation.alpha(0.8).restart(); this.wakeRenderLoop(); }
        this.requestSave();
      },
      jumpToNode: (nodeId: string) => this.jumpToNode(nodeId),
      getNodeIds: () => [...this.pixiNodes.keys()],
      recolorNodes: () => { this.recolorNodes(); this.requestSave(); },
      autoOptimize: () => {
        const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.panel.renderThresholds };
        const maxPasses = rt.autoOptMaxPasses ?? 3;
        const nodes: { id: string; x: number; y: number }[] = [];
        const radii = new Map<string, number>();
        for (const [id, pn] of this.pixiNodes) {
          nodes.push({ id, x: pn.data.x, y: pn.data.y });
          radii.set(id, pn.radius);
        }
        const runPass = (pass: number) => {
          if (pass >= maxPasses) { this.buildPanel(); this.requestSave(); return; }
          const result = analyzeOverlap(nodes, radii, rt.autoOptCloseThreshold ?? 3.0);
          const constants = this.panel.coordinateLayout?.constants ?? {};
          const opt = computeAutoOptimize(
            result.overlapRatio, result.avgRadius, constants,
            this.panel.repelForce, this.panel.linkDistance,
            { overlapThreshold: rt.autoOptOverlapThreshold ?? 0.15,
              padIncrement: rt.autoOptPadIncrement ?? 0.2,
              padMax: rt.autoOptPadMax ?? 3.0,
              repelScale: rt.autoOptRepelScale ?? 1.3,
              linkScale: rt.autoOptLinkScale ?? 1.2 });
          if (!opt.needsMore) { this.buildPanel(); this.requestSave(); return; }
          if (this.panel.coordinateLayout) {
            this.panel.coordinateLayout.constants = { ...constants, ...opt.constants };
          }
          this.panel.repelForce = opt.repelForce;
          this.panel.linkDistance = opt.linkDistance;
          this.applyClusterForce();
          this.updateForces();
          if (this.simulation) { this.simulation.alpha(0.8).restart(); this.wakeRenderLoop(); }
          // Re-read positions after simulation settles
          setTimeout(() => {
            for (const [id, pn] of this.pixiNodes) {
              const n = nodes.find(nd => nd.id === id);
              if (n) { n.x = pn.data.x; n.y = pn.data.y; }
            }
            runPass(pass + 1);
          }, 1500);
        };
        runPass(0);
      },
    };
    buildPanelUI(this.panelEl, this.panel, ctx, cb);
  }

  // =========================================================================
  // Recolor nodes in-place (no graph/panel rebuild)
  // =========================================================================
  private recolorNodes() {
    const defaultNodeColor = cssColorToHex(DEFAULT_COLORS[0]);
    const colorMap = this.nodeColorMap;
    for (const pn of this.pixiNodes.values()) {
      const n = pn.data;
      let color = defaultNodeColor;
      // Manual group overrides take priority
      let matched = false;
      for (const grp of this.panel.groups) {
        if (grp.expression && evaluateExpr(grp.expression, n)) { color = cssColorToHex(grp.color); matched = true; break; }
      }
      if (!matched && this.panel.colorNodesByCategory) {
        if (n.category) {
          color = cssColorToHex(colorMap.get(n.category) || DEFAULT_COLORS[0]);
        } else if (n.tags && n.tags.length > 0) {
          color = cssColorToHex(colorMap.get(`tag:${n.tags[0]}`) || DEFAULT_COLORS[0]);
        }
      }
      pn.color = color;
    }
    this.markDirty(true);
  }

  // =========================================================================
  // Status
  // =========================================================================
  private setStatus(t: string) { if (this.statusEl) this.statusEl.textContent = t; }

  /** Update the group color legend overlay */
  private updateLegend() {
    if (!this.legendEl) return;
    const colorMap = this.nodeColorMap;
    if (colorMap.size === 0) {
      this.legendEl.style.display = "none";
      return;
    }
    this.legendEl.empty();
    this.legendEl.style.display = "";

    // Header with toggle + close button
    const header = this.legendEl.createDiv({ cls: "gi-legend-header" });
    header.createEl("span", { text: `${colorMap.size} colors` });
    const closeBtn = header.createEl("span", { cls: "gi-legend-close", text: "\u00d7" });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.legendEl) this.legendEl.style.display = "none";
    });
    const body = this.legendEl.createDiv({ cls: "gi-legend-body" });

    // Start collapsed if many entries
    if (colorMap.size > 10) body.style.display = "none";

    header.addEventListener("click", () => {
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
    });

    for (const [label, cssColor] of colorMap) {
      const row = body.createDiv({ cls: "gi-legend-item" });
      const dot = row.createDiv({ cls: "gi-legend-dot" });
      dot.style.background = cssColor;
      row.createEl("span", { cls: "gi-legend-label", text: label.replace(/^tag:/, "#") });
    }
  }

  // =========================================================================
  // Graph data
  // =========================================================================
  private getGraphData(): GraphData {
    if (!this.rawData) {
      this.rawData = buildGraphFromVault(this.app, this.plugin.settings);
    }
    let { nodes, edges } = this.rawData;

    edges = edges.map(e => ({
      ...e,
      source: typeof e.source === "object" ? (e.source as any).id : e.source,
      target: typeof e.target === "object" ? (e.target as any).id : e.target,
    }));

    // Local graph: BFS N-hop filter from center node
    if (this.panel.localGraphCenter) {
      const centerId = nodes.find(n => n.filePath === this.panel.localGraphCenter || n.id === this.panel.localGraphCenter)?.id;
      if (centerId) {
        // Build adjacency for BFS
        const adj = new Map<string, Set<string>>();
        for (const e of edges) {
          if (!adj.has(e.source)) adj.set(e.source, new Set());
          if (!adj.has(e.target)) adj.set(e.target, new Set());
          adj.get(e.source)!.add(e.target);
          adj.get(e.target)!.add(e.source);
        }
        // BFS
        const reachable = new Set<string>([centerId]);
        let frontier = [centerId];
        for (let h = 0; h < this.panel.localGraphHops && frontier.length > 0; h++) {
          const next: string[] = [];
          for (const id of frontier) {
            const nb = adj.get(id);
            if (nb) for (const n of nb) {
              if (!reachable.has(n)) { reachable.add(n); next.push(n); }
            }
          }
          frontier = next;
        }
        nodes = nodes.filter(n => reachable.has(n.id));
        edges = edges.filter(e => reachable.has(e.source) && reachable.has(e.target));
      }
    }

    if (!this.panel.showOrphans) {
      const connected = new Set<string>();
      for (const e of edges) { connected.add(e.source); connected.add(e.target); }
      nodes = nodes.filter((n) => connected.has(n.id));
    }

    if (this.panel.existingOnly) {
      const existing = new Set(this.app.vault.getMarkdownFiles().map((f) => f.path));
      nodes = nodes.filter((n) => n.isTag || existing.has(n.id));
    }

    if (!this.panel.showAttachments) {
      nodes = nodes.filter((n) => !n.id.match(/\.(png|jpg|jpeg|gif|svg|pdf|mp3|mp4|webm|webp|zip)$/i));
    }

    // Master switch: hide all tag nodes and tag edges when showTags is off
    if (!this.panel.showTags) {
      nodes = nodes.filter((n) => !n.isTag);
      edges = edges.filter((e) => e.type !== "has-tag");
    }

    if (!this.panel.showTagNodes || this.panel.tagDisplay === "enclosure") {
      nodes = nodes.filter((n) => !n.isTag);
      edges = edges.filter((e) => e.type !== "has-tag");
    }

    // Filter out "similar" edges unless the user has enabled them
    if (!this.panel.showSimilar) edges = edges.filter((e) => e.type !== "similar");

    // Dataview query filter
    if (this.panel.dataviewQuery.trim()) {
      const matchingPaths = queryDataviewPages(this.app, this.panel.dataviewQuery.trim());
      if (matchingPaths.size > 0) {
        nodes = filterNodesByDataview(nodes, matchingPaths, this.panel.showTagNodes);
      }
    }

    // Search query filter — parse the search expression and remove non-matching nodes
    {
      const raw = this.panel.searchQuery;
      // Extract hop: tokens (not used for data filtering, only for visual highlight later)
      const remaining = raw.replace(/hop:[^:,]+:\d+/gi, "").replace(/,/g, " ").trim();
      if (remaining) {
        const searchExpr = parseQueryExpr(remaining);
        if (searchExpr) {
          nodes = nodes.filter((n) => evaluateExpr(searchExpr, n));
        }
      }
    }

    const nodeSet = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

    // Apply node grouping (collapse groups into super nodes)
    let result: GraphData = { nodes, edges };
    if (this.panel.groupBy && this.panel.groupBy !== "none") {
      this.originalGraphData = { nodes: [...result.nodes], edges: [...result.edges] };
      const groupOpts: GroupOptions = {
        minSize: this.panel.groupMinSize,
        filter: this.panel.groupFilter,
      };
      const groups = this.resolveGroupByField(result.nodes, groupOpts);
      // Auto-collapse all groups when groupBy is first enabled
      if (this.panel.collapsedGroups.size === 0 && groups.length > 0) {
        for (const g of groups) this.panel.collapsedGroups.add(g.key);
      }
      // Apply collapse for each collapsed group
      for (const g of groups) {
        if (this.panel.collapsedGroups.has(g.key)) {
          result = collapseGroup(result, g);
        }
      }
    } else {
      this.originalGraphData = null;
    }

    return result;
  }

  // =========================================================================
  // Stop simulation
  // =========================================================================
  private stopSim() {
    if (this.simulation) { this.simulation.stop(); this.simulation = null; }
  }

  // =========================================================================
  // Main render
  // =========================================================================
  private async doRender() {
    if (!this.canvasWrap) return;
    this.ac?.abort();
    this.ac = new AbortController();
    const signal = this.ac.signal;
    // Cancel any in-progress layout transition
    this.layoutTransition.cancel();

    // Save current node positions for animated transition
    this.savedPositions.clear();
    // Also track super node → member mapping so expanded members get
    // positioned near their former super node instead of randomly
    const superNodeMembers = new Map<string, string[]>();
    for (const [id, pn] of this.pixiNodes) {
      this.savedPositions.set(id, { x: pn.data.x, y: pn.data.y });
      if (pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0) {
        superNodeMembers.set(id, pn.data.collapsedMembers);
      }
    }
    // Pre-populate savedPositions for members of super nodes: position them
    // in a circle around the super node's location so they don't scatter randomly
    for (const [superId, memberIds] of superNodeMembers) {
      const superPos = this.savedPositions.get(superId);
      if (!superPos) continue;
      const count = memberIds.length;
      const spreadR = Math.sqrt(count) * 20;
      for (let i = 0; i < count; i++) {
        if (this.savedPositions.has(memberIds[i])) continue;
        const angle = (2 * Math.PI * i) / count;
        this.savedPositions.set(memberIds[i], {
          x: superPos.x + Math.cos(angle) * spreadR,
          y: superPos.y + Math.sin(angle) * spreadR,
        });
      }
    }

    this.stopSim();
    this.stopOrbitAnimation();
    this.cachedBgColor = null; // invalidate bg color cache on re-render
    this.cachedLabelColor = null;

    const rect = this.canvasWrap.getBoundingClientRect();
    const W = rect.width || 600;
    const H = rect.height || 400;
    const cx = W / 2;
    const cy = H / 2;

    this.setStatus("Building...");
    await yieldFrame(); if (signal.aborted) return;

    let gd: GraphData;
    try {
      gd = this.getGraphData();
    } catch (err) {
      console.error("[Graph Island] Failed to build graph:", err);
      this.setStatus(t("error.graphBuildFailed"));
      return;
    }
    this.setStatus(`${gd.nodes.length} nodes, ${gd.edges.length} edges`);
    await yieldFrame(); if (signal.aborted) return;

    // Init Canvas 2D
    const pixiResult = this.initPixi(W, H);
    if (!pixiResult) return;
    if (signal.aborted) { this.destroyPixi(); return; }

    this.degrees = computeNodeDegrees(gd.nodes, gd.edges);
    const colorMap = assignNodeColors(gd.nodes, this.plugin.settings.colorField);
    this.nodeColorMap = colorMap;
    this.relationColors = buildRelationColorMap(gd.edges);
    this.adj = buildAdj(gd);

    // Build tag membership for enclosure mode
    this.tagMembership.clear();
    this.tagRelPairsCache.clear();
    this.overlapCache.counts.clear();
    this.overlapCache.frame = 0;
    if (this.panel.tagDisplay === "enclosure") {
      // Pass 1: count members per tag to determine specificity
      const tagCounts = new Map<string, number>();
      for (const n of gd.nodes) {
        if (n.isTag || !n.tags) continue;
        for (const tag of n.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
      // Pass 2: assign each node to ONLY its most specific (smallest) tag.
      // This prevents parent tags from creating giant overlapping enclosures.
      for (const n of gd.nodes) {
        if (n.isTag || !n.tags || n.tags.length === 0) continue;
        let bestTag = n.tags[0];
        let bestCount = tagCounts.get(bestTag) ?? Infinity;
        for (let i = 1; i < n.tags.length; i++) {
          const c = tagCounts.get(n.tags[i]) ?? Infinity;
          if (c < bestCount) { bestCount = c; bestTag = n.tags[i]; }
        }
        if (!this.tagMembership.has(bestTag)) this.tagMembership.set(bestTag, new Set());
        this.tagMembership.get(bestTag)!.add(n.id);
      }
      // Pre-build tag relationship pairs (once per render, not per frame)
      for (const e of gd.edges) {
        if (e.type !== "inheritance" && e.type !== "aggregation") continue;
        const src = typeof e.source === "string" ? e.source : (e.source as any).id;
        const tgt = typeof e.target === "string" ? e.target : (e.target as any).id;
        if (src?.startsWith("tag:") && tgt?.startsWith("tag:")) {
          const t1 = src.slice(4), t2 = tgt.slice(4);
          this.tagRelPairsCache.add(`${t1}\0${t2}`);
          this.tagRelPairsCache.add(`${t2}\0${t1}`);
        }
      }
    }
    // Clear stale labels
    for (const lbl of this.enclosureLabels.values()) {
      lbl.parent?.removeChild(lbl);
      lbl.destroy();
    }
    this.enclosureLabels.clear();
    const baseSize = this.panel.nodeSize;

    const nodeR = this.panel.scaleByDegree
      ? (n: GraphNode) => Math.max(baseSize, baseSize + Math.sqrt(this.degrees.get(n.id) || 0) * 3.2)
      : (_n: GraphNode) => baseSize;
    const defaultNodeColor = cssColorToHex(DEFAULT_COLORS[0]);

    // Heatmap: precompute max degree for normalization
    let maxDegree = 1;
    if (this.panel.heatmapMode) {
      for (const n of gd.nodes) {
        const d = this.degrees.get(n.id) || 0;
        if (d > maxDegree) maxDegree = d;
      }
    }
    // Heatmap color ramp: cold (blue 0x3b82f6) → warm (red 0xef4444)
    const heatmapColor = (degree: number): number => {
      const t = Math.min(1, degree / maxDegree);
      const r = Math.round(59 + t * (239 - 59));   // 0x3b → 0xef
      const g = Math.round(130 - t * (130 - 68));   // 0x82 → 0x44
      const b = Math.round(246 - t * (246 - 68));   // 0xf6 → 0x44
      return (r << 16) | (g << 8) | b;
    };

    const nodeColor = (n: GraphNode): number => {
      // Manual group overrides take priority
      for (const grp of this.panel.groups) {
        if (grp.expression && evaluateExpr(grp.expression, n)) return cssColorToHex(grp.color);
      }
      // Heatmap mode: color by degree
      if (this.panel.heatmapMode) {
        return heatmapColor(this.degrees.get(n.id) || 0);
      }
      if (!this.panel.colorNodesByCategory) return defaultNodeColor;
      // Category-based coloring
      if (n.category) {
        const css = colorMap.get(n.category) || DEFAULT_COLORS[0];
        return cssColorToHex(css);
      }
      // Tag-based coloring: tag nodes use their own tag, file nodes use first tag
      if (n.tags && n.tags.length > 0) {
        const tagKey = `tag:${n.tags[0]}`;
        const css = colorMap.get(tagKey) || DEFAULT_COLORS[0];
        return cssColorToHex(css);
      }
      return defaultNodeColor;
    };

    // ==== Force layout ====
    if (this.currentLayout === "force") {
      for (const n of gd.nodes) {
        // Use saved positions from previous layout as starting positions
        const saved = this.savedPositions.get(n.id);
        if (saved) {
          n.x = saved.x;
          n.y = saved.y;
        } else if (n.x === 0 && n.y === 0) {
          n.x = cx + (Math.random() - 0.5) * W * 0.8;
          n.y = cy + (Math.random() - 0.5) * H * 0.8;
        }
      }
      this.savedPositions.clear();

      this.graphEdges = gd.edges;
      invalidateBundleCache();
      this.createPixiNodes(gd.nodes, nodeR, nodeColor);

      let tickCount = 0;
      this.simulation = this.layoutController.createForceSimulation(gd.nodes, gd.edges, cx, cy);

      // Apply directional gravity rules from settings + panel + node rules
      this.applyNodeRulesForce();

      // Apply enclosure repulsion force (push tag groups apart)
      this.applyEnclosureRepulsionForce();

      // Apply cluster arrangement force if configured
      this.applyClusterForce();

      this.simulation.on("tick", () => {
          if (++tickCount % TICK_SKIP !== 0) return;
          this.markDirty();
        });

      this.setStatus(`${gd.nodes.length} nodes — simulating...`);
      this.simulation.on("end", () => {
        this.setStatus(`${gd.nodes.length} nodes`);
        if (this.panel.autoFit) {
          this.updatePositions(true);
          const wrap = this.canvasWrap;
          if (wrap) {
            this.autoFitView(wrap.clientWidth, wrap.clientHeight);
            this.markDirty();
          }
        }
      });

      this.updateLegend();
      this.startRenderLoop();
      if (this.skipPanelRebuildCount === 0) this.buildPanel();
      return;
    }

    // ==== Static layouts ====
    this.setStatus("Computing layout...");
    await yieldFrame(); if (signal.aborted) return;

    let ld: GraphData;
    this.shells = [];
    this.nodeShellIndex.clear();
    try {
      const sortCmp = this.buildSortComparator(gd.nodes, gd.edges);
      const nsMap = this.computeNodeSpacingMap(gd.nodes);
      switch (this.currentLayout) {
        case "concentric": {
          const result = applyConcentricLayout(gd, { centerX: cx, centerY: cy, minRadius: this.panel.concentricMinRadius, radiusStep: this.panel.concentricRadiusStep, sortComparator: sortCmp, nodeSpacingMap: nsMap });
          ld = result.data;
          this.shells = result.shells;
          this.shells.forEach((s, i) => s.nodeIds.forEach((id) => this.nodeShellIndex.set(id, i)));
          break;
        }
        case "tree": ld = applyTreeLayout(gd, { startX: cx, startY: 40, sortComparator: sortCmp, nodeSpacingMap: nsMap }); break;
        case "arc": ld = applyArcLayout(gd, { centerX: cx, centerY: cy, radius: Math.min(W, H) * 0.4, sortComparator: sortCmp }); break;
        case "sunburst": {
          const root = buildSunburstData(this.app, this.plugin.settings.groupField);
          const result = applySunburstLayout(gd, root, {
            centerX: cx,
            centerY: cy,
            width: W,
            height: H,
            groupField: this.plugin.settings.groupField,
            sortComparator: sortCmp,
          });
          ld = result.data;
          this.sunburstLayoutArcs = result.arcs;
          this.sunburstCenter = { x: result.cx, y: result.cy };
          break;
        }
        case "timeline": {
          const timeKey = this.panel.timelineKey || "date";
          const tlResult = applyTimelineLayout(gd, {
            timeKey,
            startX: 60,
            startY: 60,
            stepWidth: 120,
            laneHeight: 80,
            getNodeProperty: (nodeId: string, key: string) => {
              // Find the file for this node and read its frontmatter
              const pn = this.pixiNodes.get(nodeId);
              const fp = pn?.data.filePath ?? gd.nodes.find(n => n.id === nodeId)?.filePath;
              if (!fp) return undefined;
              const tf = this.app.vault.getAbstractFileByPath(fp);
              if (!(tf instanceof TFile)) return undefined;
              const cache = this.app.metadataCache.getFileCache(tf);
              const val = cache?.frontmatter?.[key];
              return val !== undefined && val !== null ? String(val) : undefined;
            },
          });
          ld = tlResult.data;
          break;
        }
        default: {
          const result = applyConcentricLayout(gd, { centerX: cx, centerY: cy, sortComparator: sortCmp, nodeSpacingMap: nsMap });
          ld = result.data;
          this.shells = result.shells;
          this.shells.forEach((s, i) => s.nodeIds.forEach((id) => this.nodeShellIndex.set(id, i)));
          break;
        }
      }
    } catch (err) {
      console.error("[Graph Island] Layout computation failed:", err);
      this.setStatus(t("error.layoutFailed"));
      return;
    }
    if (signal.aborted) return;

    this.graphEdges = ld.edges;
    invalidateBundleCache();
    this.setStatus(`Creating ${ld.nodes.length} nodes...`);
    await yieldFrame(); if (signal.aborted) return;

    this.createPixiNodes(ld.nodes, nodeR, nodeColor);
    await yieldFrame(); if (signal.aborted) return;

    // Build transition data: from saved positions, to new layout positions
    const transitionData: { data: { x: number; y: number }; fromX: number; fromY: number; toX: number; toY: number }[] = [];
    for (const pn of this.pixiNodes.values()) {
      const saved = this.savedPositions.get(pn.data.id);
      if (saved && (Math.abs(saved.x - pn.data.x) > 1 || Math.abs(saved.y - pn.data.y) > 1)) {
        transitionData.push({
          data: pn.data,
          fromX: saved.x, fromY: saved.y,
          toX: pn.data.x, toY: pn.data.y,
        });
      }
    }
    this.savedPositions.clear();

    if (transitionData.length > 0) {
      this.layoutTransition.start(transitionData, () => {
        this.markDirty(true);
      });
    }

    this.setStatus(`Drawing ${ld.edges.length} edges...`);
    await yieldFrame(); if (signal.aborted) return;

    this.updatePositions(true);
    this.autoFitView(W, H);

    const groupCount = this.nodeColorMap.size;
    const totalNodes = this.rawData?.nodes.length ?? ld.nodes.length;
    const totalEdges = this.rawData?.edges.length ?? ld.edges.length;
    const filtered = totalNodes !== ld.nodes.length;
    const statusParts = [`${ld.nodes.length}${filtered ? ' / ' + totalNodes : ''} nodes`];
    statusParts.push(`${ld.edges.length} edges`);
    if (groupCount > 0) statusParts.push(`${groupCount} groups`);
    this.setStatus(statusParts.join(', '));
    this.updateLegend();
    this.startRenderLoop();
    this.applySearch();
    // updateLabelsForZoom is also called inside autoFitView above,
    // but we call it again here after applySearch so search-highlighted
    // labels respect semantic zoom visibility.
    this.updateLabelsForZoom();

    // Rebuild panel — relationColors and other data are now available
    this.stopOrbitAnimation();
    if (this.skipPanelRebuildCount === 0) this.buildPanel();
    if (this.currentLayout === "concentric" && this.shells.length > 0) {
      if (this.panel.orbitAutoRotate) this.startOrbitAnimation();
    }
  }

  // =========================================================================
  // Live panel adjustments
  // =========================================================================
  // =========================================================================
  // Delegated to LayoutController
  // =========================================================================
  private updateForces() { this.layoutController.updateForces(); }
  private applyNodeRulesForce() { this.layoutController.applyNodeRulesForce(); }
  private applyEnclosureRepulsionForce() { this.layoutController.applyEnclosureRepulsionForce(); }
  private applyClusterForce() {
    this.layoutController.applyClusterForce();
    // Schedule auto-fit after arrangement changes so layout fills the viewport
    if (this.canvasWrap) {
      const wrap = this.canvasWrap;
      clearTimeout(this._autoFitTimer);
      this._autoFitTimer = window.setTimeout(() => {
        this.autoFitView(wrap.clientWidth, wrap.clientHeight);
        this.markDirty();
      }, 600);
    }
  }
  private _autoFitTimer: number = 0;
  private buildSortComparator(nodes: GraphNode[], edges: GraphEdge[]) { return this.layoutController.buildSortComparator(nodes, edges); }
  private computeNodeSpacingMap(nodes: GraphNode[]) { return this.layoutController.computeNodeSpacingMap(nodes); }
  private computeLiveCentroids() { return this.layoutController.computeLiveCentroids(this.clusterMeta); }

  /** Get a hex color for a cluster group, cycling through DEFAULT_COLORS palette */
  private getClusterGroupColor(groupKey: string): number {
    const centroids = this.clusterMeta?.clusterCentroids;
    if (!centroids) return 0x666666;

    // Get sorted group keys for stable color assignment
    const keys = [...centroids.keys()].sort();
    const idx = keys.indexOf(groupKey);
    if (idx < 0) return 0x666666;

    return cssColorToHex(DEFAULT_COLORS[idx % DEFAULT_COLORS.length]);
  }

  /** Collect all frontmatter keys from the vault for field selects */
  private _fmKeysCache: string[] | null = null;
  private _fmKeysCacheTime = 0;

  private collectFrontmatterKeys(): string[] {
    // Cache for 5 seconds — vault metadata rarely changes mid-interaction
    const now = Date.now();
    if (this._fmKeysCache && now - this._fmKeysCacheTime < 5000) {
      return this._fmKeysCache;
    }
    const keys = new Set<string>();
    const files = (this.app as any).vault?.getMarkdownFiles?.() ?? [];
    for (const f of files) {
      const cache = (this.app as any).metadataCache?.getFileCache?.(f);
      const fm = cache?.frontmatter;
      if (fm) {
        for (const k of Object.keys(fm)) {
          if (k !== "position") keys.add(k);
        }
      }
    }
    this._fmKeysCache = [...keys].sort();
    this._fmKeysCacheTime = now;
    return this._fmKeysCache;
  }

  /** Collect available group names based on current groupBy mode */
  private collectAvailableGroups(): string[] {
    if (!this.panel.groupBy || this.panel.groupBy === "none") return [];
    // Use original graph data if available, otherwise pixiNodes
    const nodes: GraphNode[] = this.originalGraphData
      ? this.originalGraphData.nodes
      : [...this.pixiNodes.values()].map(pn => pn.data);
    const groups = this.resolveGroupByField(nodes, { minSize: this.panel.groupMinSize });
    return groups.map(g => g.label).sort();
  }

  // -- Tab focus navigation --
  private focusNodeIndex = -1;
  private focusNodeOrder: string[] = [];

  private cycleFocusNode(direction: 1 | -1) {
    // Build sorted node list on first use or when nodes change
    if (this.focusNodeOrder.length !== this.pixiNodes.size) {
      this.focusNodeOrder = [...this.pixiNodes.keys()].sort((a, b) => {
        const pa = this.pixiNodes.get(a)!;
        const pb = this.pixiNodes.get(b)!;
        return pa.data.label.localeCompare(pb.data.label);
      });
      this.focusNodeIndex = -1;
    }
    if (this.focusNodeOrder.length === 0) return;
    this.focusNodeIndex = (this.focusNodeIndex + direction + this.focusNodeOrder.length) % this.focusNodeOrder.length;
    const nodeId = this.focusNodeOrder[this.focusNodeIndex];
    this.setHighlightedNodeId(nodeId);
    this.applyHover();
    this.panToNode(nodeId);
  }

  /** Copy the current graph view as PNG to clipboard */
  private async copyGraphToClipboard() {
    if (!this.pixiApp) return;
    try {
      const { exportGraphAsPng } = await import("../utils/export-png");
      const blob = await exportGraphAsPng(this.pixiApp);
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      showToast(t("toast.copiedToClipboard"));
    } catch (e) {
      console.error("Graph Island: clipboard copy failed", e);
      showToast(t("toast.clipboardFailed"), 5000);
    }
  }

  /** Collect all unique tag names from graph nodes */
  private collectAvailableTags(): string[] {
    const tags = new Set<string>();
    const nodes = this.originalGraphData
      ? this.originalGraphData.nodes
      : [...this.pixiNodes.values()].map(pn => pn.data);
    for (const n of nodes) {
      if (n.tags) for (const tag of n.tags) tags.add(tag);
    }
    return [...tags].sort();
  }

  private buildNodeRadiiMap(): Map<string, number> {
    const m = new Map<string, number>();
    for (const [id, pn] of this.pixiNodes) m.set(id, pn.radius);
    return m;
  }

  /** Cached version of computeLiveCentroids — recomputes max once per frame */
  private getCachedCentroids(): Map<string, { x: number; y: number }> | null {
    if (this._centroidCacheFrame === this._frameCounter && this._centroidCache) {
      return this._centroidCache;
    }
    this._centroidCache = this.computeLiveCentroids();
    this._centroidCacheFrame = this._frameCounter;
    return this._centroidCache;
  }

  /** Cached version of buildNodeRadiiMap — recomputes max once per frame */
  private getCachedNodeRadii(): Map<string, number> {
    if (this._nodeRadiiCacheFrame === this._frameCounter && this._nodeRadiiCache) {
      return this._nodeRadiiCache;
    }
    this._nodeRadiiCache = this.buildNodeRadiiMap();
    this._nodeRadiiCacheFrame = this._frameCounter;
    return this._nodeRadiiCache;
  }

  /**
   * Find the node ID corresponding to a vault file path.
   */
  private findNodeIdByPath(path: string): string | null {
    for (const [id, pn] of this.pixiNodes) {
      if (pn.data.filePath === path) return id;
    }
    return null;
  }

  /**
   * Smoothly pan the camera so that the given node is centered on screen.
   * Uses 200ms ease-out animation; skips animation when prefers-reduced-motion is set.
   */
  private panToNode(nodeId: string) {
    const pn = this.pixiNodes.get(nodeId);
    if (!pn) return;
    const world = this.worldContainer;
    const wrap = this.canvasWrap;
    if (!world || !wrap) return;

    const targetX = wrap.clientWidth / 2 - pn.data.x * world.scale.x;
    const targetY = wrap.clientHeight / 2 - pn.data.y * world.scale.y;

    // Reduced motion: jump immediately
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      world.x = targetX;
      world.y = targetY;
      this.markDirty(true);
      return;
    }

    // Animated pan (200ms ease-out)
    const startX = world.x;
    const startY = world.y;
    const duration = 200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - (1 - t) * (1 - t); // ease-out quadratic
      world.x = startX + (targetX - startX) * ease;
      world.y = startY + (targetY - startY) * ease;
      this.markDirty();
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /**
   * Pan the camera so that the given node is centered on screen, then highlight it.
   */
  private jumpToNode(nodeId: string) {
    const pn = this.pixiNodes.get(nodeId);
    if (!pn) return;

    const world = this.worldContainer;
    const wrap = this.canvasWrap;
    if (!world || !wrap) return;

    const worldX = pn.data.x;
    const worldY = pn.data.y;
    const screenCenterX = wrap.clientWidth / 2;
    const screenCenterY = wrap.clientHeight / 2;

    world.x = screenCenterX - worldX * world.scale.x;
    world.y = screenCenterY - worldY * world.scale.y;

    // Highlight the target node via search
    this.panel.searchQuery = nodeId;
    this.applySearch();
    this.wakeRenderLoop();
  }

  private applySearch() {
    const raw = this.panel.searchQuery;
    // Parse hop filters: "hop:name:n" (comma-separated, mixable with text)
    const hopMatches = [...raw.matchAll(/hop:([^:,]+):(\d+)/gi)];
    const textParts: string[] = [];
    let remaining = raw;
    for (const m of hopMatches) remaining = remaining.replace(m[0], "");
    const trimmed = remaining.replace(/,/g, " ").trim().toLowerCase();
    if (trimmed) textParts.push(trimmed);

    // Build hop highlight set via BFS from each specified origin
    let hopSet: Set<string> | null = null;
    if (hopMatches.length > 0) {
      hopSet = new Set<string>();
      for (const m of hopMatches) {
        const name = m[1].toLowerCase();
        const hops = parseInt(m[2], 10);
        // Find origin node(s) by partial name match
        const origins: string[] = [];
        for (const pn of this.pixiNodes.values()) {
          if (pn.data.label.toLowerCase().includes(name)) origins.push(pn.data.id);
        }
        // BFS from each origin
        for (const origin of origins) {
          hopSet.add(origin);
          let frontier = [origin];
          for (let h = 0; h < hops && frontier.length > 0; h++) {
            const next: string[] = [];
            for (const id of frontier) {
              const nb = this.adj.get(id);
              if (nb) for (const n of nb) {
                if (!hopSet.has(n)) { hopSet.add(n); next.push(n); }
              }
            }
            frontier = next;
          }
        }
      }
    }

    const hasHop = hopSet !== null;

    for (const pn of this.pixiNodes.values()) {
      if (!hasHop) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, false);
        continue;
      }

      if (hopSet.has(pn.data.id)) {
        pn.gfx.alpha = 1;
        pn.circle.visible = true;
        pn.circle.clear();
        const searchHitColor = this.getAccentColor();
        const shape = getNodeShape(pn.data, this.panel.nodeShapeRules);
        drawShape(pn.circle, shape, pn.radius * 2.2, searchHitColor, 0.10);
        pn.circle.lineStyle(2, searchHitColor, 0.85);
        drawShape(pn.circle, shape, pn.radius, pn.color, 1);
      } else {
        pn.gfx.alpha = 0.12;
        this.drawNodeCircle(pn, false);
      }
    }
    this.markDirty();
  }

  private applyTextFade() {
    const baseOpacity = 1 - this.panel.textFadeThreshold;
    const zoom = this.worldContainer?.scale.x ?? 1;
    const degrees = this.degrees;
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.panel.renderThresholds };

    // Compute degree percentiles for progressive label display
    const degValues = Array.from(degrees.values()).sort((a, b) => b - a);
    const pTier1 = degValues[Math.floor(degValues.length * rt.labelDegreePctTier1)] ?? 1;
    const pTier2 = degValues[Math.floor(degValues.length * rt.labelDegreePctTier2)] ?? 1;
    const pTier3 = degValues[Math.floor(degValues.length * rt.labelDegreePctTier3)] ?? 1;

    // Counter-scaling with minimum screen-size guarantee.
    // screenPx = LABEL_FONT * counterScale * zoom  ≥  labelMinScreenPx
    // The floor formula guarantees readability at any zoom level.
    const LABEL_FONT = 11;
    const rawScale = 1 / Math.pow(zoom, rt.labelScalePower);
    const floorScale = rt.labelMinScreenPx / (LABEL_FONT * zoom);
    const counterScale = Math.min(rt.labelScaleMax, Math.max(rt.labelScaleMin, rawScale, floorScale));

    for (const pn of this.pixiNodes.values()) {
      if (!pn.label) continue;

      // Apply counter-scaling so labels stay readable at any zoom
      pn.label.scale.set(counterScale);

      // Reset label to default position (nodeR + 2, offset above) before overlap cull
      const r = pn.radius ?? 6;
      pn.label.x = r + 2;
      pn.label.y = -(r * 0.4 + 2);

      // Super nodes (collapsed groups) always visible
      if (pn.data.collapsedMembers && pn.data.collapsedMembers.length > 0) {
        pn.label.visible = true;
        pn.label.alpha = baseOpacity;
        continue;
      }

      const deg = degrees.get(pn.data.id) ?? 0;

      // Semantic zoom: show/hide labels based on zoom level + node importance
      if (zoom < rt.labelZoomTier1) {
        pn.label.visible = deg >= pTier1;
      } else if (zoom < rt.labelZoomTier2) {
        pn.label.visible = deg >= pTier2;
      } else if (zoom < rt.labelZoomTier3) {
        pn.label.visible = deg >= pTier3;
      } else {
        pn.label.visible = true;
      }

      pn.label.alpha = pn.label.visible ? Math.max(rt.labelAlphaMin, baseOpacity) : 0;
    }

    // Enclosure labels are managed by EnclosureRenderer (drawEnclosuresImpl)
    // which runs every frame with its own zoom-dependent scaling (1/ws).
    // We only handle sunburst/grid labels here.

    const groupLabelScale = Math.min(rt.groupLabelScaleMax,
      Math.max(rt.groupLabelScaleMin, 1 / Math.pow(zoom, rt.groupLabelScalePower)));

    // --- Cluster sunburst labels: hide at low zoom ---
    for (const [, lbl] of this.clusterSunburstLabels) {
      if (zoom < rt.labelZoomTier1) {
        lbl.visible = false;
      } else {
        lbl.scale.set(groupLabelScale);
      }
    }

    // --- Sunburst layout labels ---
    for (const [, lbl] of this.sunburstLabels) {
      if (zoom < rt.labelZoomTier1) {
        lbl.visible = false;
      } else {
        lbl.scale.set(groupLabelScale);
      }
    }

    // --- Group grid labels ---
    for (const [, lbl] of this.groupGridLabels) {
      if (zoom < rt.groupGridLabelZoomMin) {
        lbl.visible = false;
      } else {
        lbl.scale.set(groupLabelScale);
      }
    }

    this.markDirty();
  }

  /** Called by InteractionManager after zoom changes to update label visibility */
  updateLabelsForZoom() {
    this.applyTextFade();
    // Re-cull node labels with leader lines after counter-scale changes
    this.renderPipeline?.cullOverlappingLabels();
    // Re-cull rotated labels after zoom change (screen-space overlap changes)
    this.cullOverlappingRotatedLabels(this.clusterSunburstLabels);
    this.cullOverlappingRotatedLabels(this.sunburstLabels);
    this.cullOverlappingRotatedLabels(this.groupGridLabels);
  }

  // =========================================================================
  // Sunburst layout arc rendering (Canvas 2D)
  // =========================================================================

  /**
   * Draw sunburst layout arcs behind nodes using CanvasGraphics.
   * Called from updatePositions when sunburst layout is active.
   */
  private drawSunburstLayoutArcs() {
    const gfx = this.sunburstGraphics;
    if (!gfx) return;
    if (this.currentLayout !== "sunburst") return;
    if (this.sunburstLayoutArcs.length === 0) return;

    const arcs = this.sunburstLayoutArcs;
    const { x: cx, y: cy } = this.sunburstCenter;

    // Assign colors by depth-1 group (top-level category)
    const groupColorMap = new Map<string, number>();
    let groupIdx = 0;
    for (const arc of arcs) {
      if (arc.depth === 1 && !groupColorMap.has(arc.name)) {
        groupColorMap.set(arc.name, groupIdx++);
      }
    }

    // Find depth-1 ancestor by angle range containment
    const arcGroupName = (arc: LayoutSunburstArc): string | null => {
      for (const a of arcs) {
        if (a.depth === 1 && a.x0 <= arc.x0 && a.x1 >= arc.x1) {
          return a.name;
        }
      }
      return null;
    };

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const strokeW = Math.max(0.5, 1.0 / worldScale);

    for (let i = 0; i < arcs.length; i++) {
      const arc = arcs[i];
      if (arc.depth === 0) continue;

      let groupName: string;
      if (arc.depth === 1) {
        groupName = arc.name;
      } else {
        groupName = arcGroupName(arc) ?? arc.name;
      }
      const ci = groupColorMap.get(groupName) ?? 0;
      const css = DEFAULT_COLORS[ci % DEFAULT_COLORS.length];
      const color = cssColorToHex(css);

      const fillAlpha = arc.depth === 1 ? 0.25 : 0.15;
      gfx.beginFill(color, fillAlpha);
      gfx.lineStyle(strokeW, color, 0.5);

      // Draw annular sector: offset angles by -PI/2 so top is 0
      this.drawArcPath(gfx, cx, cy, arc.y0, arc.y1, arc.x0 - Math.PI / 2, arc.x1 - Math.PI / 2);
      gfx.endFill();
    }

    this.drawSunburstLabels(arcs, cx, cy);
  }

  /** Group grid label container for group names */
  private groupGridLabelContainer: CanvasContainer | null = null;
  private groupGridLabels: Map<string, CanvasText> = new Map();
  private customGridLabelContainer: CanvasContainer | null = null;
  private customGridLabels: CanvasText[] = [];

  /** Sunburst label container for category names */
  private sunburstLabelContainer: CanvasContainer | null = null;
  private sunburstLabels: Map<string, CanvasText> = new Map();
  private clusterSunburstLabelContainer: CanvasContainer | null = null;
  private clusterSunburstLabels: Map<string, CanvasText> = new Map();
  private timelineAxisLabels: CanvasText[] = [];

  private drawSunburstLabels(arcs: LayoutSunburstArc[], cx: number, cy: number) {
    if (!this.sunburstLabelContainer && this.worldContainer) {
      this.sunburstLabelContainer = new CanvasContainer();
      this.worldContainer.addChild(this.sunburstLabelContainer);
    }
    const container = this.sunburstLabelContainer;
    if (!container) return;

    for (const lbl of this.sunburstLabels.values()) {
      lbl.parent?.removeChild(lbl);
      lbl.destroy();
    }
    this.sunburstLabels.clear();

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const fontSize = Math.max(8, 12 / worldScale);
    const isDark = this.cachedIsDark ?? true;
    const textColor = isDark ? 0xdddddd : 0x333333;

    for (const arc of arcs) {
      if (arc.depth !== 1) continue;

      const midAngle = (arc.x0 + arc.x1) / 2 - Math.PI / 2;
      const midRadius = (arc.y0 + arc.y1) / 2;
      const lx = cx + midRadius * Math.cos(midAngle);
      const ly = cy + midRadius * Math.sin(midAngle);

      const text = new CanvasText(arc.name, {
        fontSize,
        fill: textColor,
        fontWeight: "bold",
        align: "center",
      });
      text.anchor.set(0.5, 0.5);
      text.x = lx;
      text.y = ly;

      let rotation = midAngle + Math.PI / 2;
      if (rotation > Math.PI / 2 && rotation < 3 * Math.PI / 2) {
        rotation += Math.PI;
      }
      text.rotation = rotation;

      container.addChild(text);
      this.sunburstLabels.set(arc.name, text);
    }

    // --- Label collision avoidance for rotated labels ---
    this.cullOverlappingRotatedLabels(this.sunburstLabels);
  }

  /**
   * Hide rotated labels that overlap with higher-priority labels.
   * Uses rotated bounding-box AABB approximation with pre-render width estimation.
   */
  private cullOverlappingRotatedLabels(labels: Map<string, CanvasText>) {
    if (labels.size === 0) return;

    // Estimate text width before first render (measureText hasn't run yet)
    const estimateWidth = (txt: CanvasText): number => {
      if (txt.width > 0) return txt.width;
      const fontSize = txt.style.fontSize ?? 11;
      const isBold = txt.style.fontWeight === "bold" || txt.style.fontWeight === "600";
      // Average character width ≈ 0.6 × fontSize (proportional font heuristic)
      return txt.text.length * fontSize * (isBold ? 0.65 : 0.58);
    };

    // Compute AABB for each rotated label in world coordinates
    const rotatedAABB = (txt: CanvasText) => {
      const w = estimateWidth(txt);
      const h = txt.height || (txt.style.fontSize ?? 11);
      const cos = Math.abs(Math.cos(txt.rotation));
      const sin = Math.abs(Math.sin(txt.rotation));
      // Rotated bounding box width/height
      const bw = w * cos + h * sin;
      const bh = w * sin + h * cos;
      return {
        x: txt.x - bw * txt.anchor.x,
        y: txt.y - bh * txt.anchor.y,
        w: bw,
        h: bh,
      };
    };

    const rectsOverlap = (
      a: { x: number; y: number; w: number; h: number },
      b: { x: number; y: number; w: number; h: number },
    ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    const placedRects: { x: number; y: number; w: number; h: number }[] = [];
    for (const [, txt] of labels) {
      if (!txt.visible) continue;
      const rect = rotatedAABB(txt);

      // Check against all placed rects
      const overlaps = placedRects.some(pr => rectsOverlap(rect, pr));
      if (overlaps) {
        txt.visible = false;
      } else {
        placedRects.push(rect);
      }
    }
  }

}

