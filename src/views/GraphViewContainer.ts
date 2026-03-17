import { ItemView, WorkspaceLeaf, Platform, TFile, FileView, setIcon, Menu, MarkdownView, type ViewStateResult } from "obsidian";
import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import type { Simulation } from "d3-force";
import type GraphViewsPlugin from "../main";
import type { GraphData, GraphNode, GraphEdge, LayoutType, ShellInfo, DirectionalGravityRule, GroupPreset, ClusterGroupRule, NodeRule, NodeDisplayMode, CardDisplayConfig, DonutDisplayConfig, GraphSnapshot } from "../types";
import { DEFAULT_COLORS, DEFAULT_RENDER_THRESHOLDS, DEFAULT_CARD_RENDER_CONFIG, DEFAULT_ONTOLOGY } from "../types";
import { evaluateExpr, parseQueryExpr, serializeExpr } from "../utils/query-expr";
import { buildGraphFromVault, assignNodeColors, buildRelationColorMap, buildSunburstData } from "../parsers/metadata-parser";
import { applyConcentricLayout, repositionShell } from "../layouts/concentric";
import { applyTreeLayout } from "../layouts/tree";
import { applyArcLayout } from "../layouts/arc";
import { applySunburstLayout, type SunburstArc as LayoutSunburstArc } from "../layouts/sunburst";
import { applyTimelineLayout } from "../layouts/timeline";
import { computeNodeDegrees } from "../analysis/graph-analysis";
import type { RoadNetwork } from "../layouts/cable-tray";
import { RoadNetworkBuilder, getBestRoadNetwork, type RoadNetworkHost } from "../layouts/RoadNetworkBuilder";
import { yieldFrame, buildAdj, cssColorToHex, edgeSourceId, edgeTargetId, bfsNeighborSet } from "../utils/graph-helpers";
import { buildPanel as buildPanelUI, type PanelState, type PanelCallbacks, type PanelContext, DEFAULT_PANEL, createDefaultPanel } from "./PanelBuilder";
import { drawEdges as drawEdgesImpl, drawEdgeLabels as drawEdgeLabelsImpl, invalidateBundleCache, type EdgeDrawConfig } from "./EdgeRenderer";
import { t } from "../i18n";
import { showToast } from "../utils/toast";
import { drawEnclosures as drawEnclosuresImpl, type OverlapCache, type EnclosureConfig } from "./EnclosureRenderer";
import type { ClusterMetadata, TimelineBarInfo, ArrangementGuide, TimelineRoute, GroupGuideEntry } from "../layouts/cluster-force";
import { analyzeOverlap, computeAutoOptimize, effectiveRadius, nodeRadius } from "../layouts/cluster-force";
import { matchesFilter } from "../layouts/force";
import type { ResolvedGridInfo, ResolvedGridLine } from "../layouts/coordinate-engine";
import { InteractionManager, type PixiNode, type InteractionHost } from "./InteractionManager";
import { RenderPipeline, darkenColor, MIN_WORLD_RADIUS_PX, type RenderHost } from "./RenderPipeline";
import { LayoutController, type LayoutHost } from "./LayoutController";
import { LabelManager, type LabelManagerHost } from "./LabelManager";
import { Minimap, type MinimapHost } from "./Minimap";
import { DiffOverlay } from "./DiffOverlay";
import { captureSnapshot, computeSnapshotDiff } from "../utils/snapshot";
import { GuideRenderer, type GuideRendererHost } from "./GuideRenderer";
import { LayoutTransition } from "./LayoutTransition";
import { groupNodesByField, getNodeFieldValues, collapseGroup, type GroupSpec, type GroupOptions } from "../utils/node-grouping";
import { louvainCommunities } from "../utils/louvain";
import { queryDataviewPages, filterNodesByDataview } from "../utils/dataview-source";
import { getNodeShape, drawShape, drawShapeAt } from "../utils/node-shapes";
import {
  EDGE_TYPE_INHERITANCE, EDGE_TYPE_AGGREGATION, EDGE_TYPE_HAS_TAG,
  EDGE_TYPE_SIMILAR, LAYOUT_FORCE, LAYOUT_CONCENTRIC, LAYOUT_TREE,
  LAYOUT_ARC, LAYOUT_SUNBURST, LAYOUT_TIMELINE,
  TAG_DISPLAY_ENCLOSURE, TAG_DISPLAY_NODE,
  ARRANGEMENT_TIMELINE, ARRANGEMENT_CONCENTRIC, ARRANGEMENT_GRID,
  EVENT_HOVER_NODE, EVENT_HIGHLIGHT_NODES, EVENT_COMPARE_NODES,
  EVENT_SYNC_PANEL,
  POLAR_ARRANGEMENTS,
} from "../constants";

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
  /** Louvain コミュニティ検出キャッシュ（rawData 変更時に無効化） */
  private louvainCache: { dataRef: GraphData; groups: GroupSpec[] } | null = null;
  private ac: AbortController | null = null;
  private statusEl: HTMLElement | null = null;
  private zoomIndicatorEl: HTMLElement | null = null;
  private panel: PanelState = createDefaultPanel();
  private panelEl: HTMLElement | null = null;
  private simulation: Simulation<GraphNode, GraphEdge> | null = null;
  private highlightedNodeId: string | null = null;
  /** True when the current highlight was set via keyboard (Tab), false when via mouse hover. */
  private _isKeyboardFocused = false;
  /** aria-live element for screen reader announcements (zoom, focus changes). */
  private _ariaLiveEl: HTMLElement | null = null;

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
  private routeGraphics: CanvasGraphics | null = null;
  private routeData: TimelineRoute[] | null = null;
  private roadBuilder: RoadNetworkBuilder | null = null;
  private trayGraphics: CanvasGraphics | null = null;
  private barGraphics: CanvasGraphics | null = null;
  private barLabelContainer: CanvasContainer | null = null;
  /** ビジュアルリンクエディタ: プレビュー線描画用 */
  private linkPreviewGfx: CanvasGraphics | null = null;
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

  // Label LOD, truncation, scaling pipeline
  private labelManager: LabelManager | null = null;

  // Guide / grid / axis renderer (coordinate guides, grids, triangles, etc.)
  private guideRenderer: GuideRenderer | null = null;

  // スナップショット差分オーバーレイ
  private diffOverlay: DiffOverlay = new DiffOverlay();

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

  // 比較選択ノードID (最大2件)
  private compareNodeIds: string[] = [];

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
  private shortcutHelpEl: HTMLElement | null = null;

  // Marquee button reference (for toolbar toggle styling)
  private marqueeBtnEl: HTMLElement | null = null;

  // Sunburst layout arc data for Canvas 2D rendering
  private sunburstLayoutArcs: LayoutSunburstArc[] = [];
  private sunburstCenter = { x: 0, y: 0 };

  // ビュー同期: 再帰イベントを防止するフラグ
  private _syncReceiving = false;

  // 注釈オーバーレイ管理
  private annotationLayer: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GraphViewsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentLayout = LAYOUT_FORCE; // Always use force layout; arrangement patterns handle visual layout
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
    if (this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE && this.panel.commonQueries.length === 0) {
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
    // ビュー同期ブロードキャスト
    this._broadcastPanelSync();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.app.workspace.requestSaveLayout();
      this._saveTimer = null;
    }, 500);
  }

  getState() {
    const sup = super.getState();
    // Serialize panel with special handling for Set (collapsedGroups) and transient fields
    const panelClone: Record<string, unknown> = {};
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

  async setState(state: any, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);
    // Layout is always "force"; legacy state values are migrated to cluster arrangement
    if (state.layout && typeof state.layout === "string" && state.layout !== LAYOUT_FORCE) {
      // Migrate legacy layout type to cluster arrangement pattern where applicable
      const legacyMap: Record<string, string> = {
        [LAYOUT_TREE]: ARRANGEMENT_GRID, [LAYOUT_CONCENTRIC]: ARRANGEMENT_CONCENTRIC, [LAYOUT_SUNBURST]: ARRANGEMENT_GRID,
        [LAYOUT_TIMELINE]: ARRANGEMENT_TIMELINE, [LAYOUT_ARC]: ARRANGEMENT_CONCENTRIC,
      };
      const mapped = legacyMap[state.layout];
      if (mapped && state.panel) {
        state.panel.clusterArrangement = mapped;
      }
    }
    this.currentLayout = LAYOUT_FORCE;
    if (state.panel && typeof state.panel === "object") {
      const saved = JSON.parse(JSON.stringify(state.panel)) as Record<string, unknown>;
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
          // Safe: key is validated against DEFAULT_PANEL keys above
          (this.panel as Record<string, unknown>)[key] = saved[key];
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
    this._initToolbar(root);

    // --- Main area ---
    const main = root.createDiv({ cls: "graph-main" });
    const canvasArea = this._initCanvasArea(main);

    // --- Keyboard shortcuts ---
    this._registerKeyboardShortcuts();

    // --- Overlays (legend, shortcut help) ---
    this._initOverlays(canvasArea);

    // --- Panel resize handle + control panel ---
    this._initPanelWithResize(main);

    // --- Resize observer for Canvas 2D ---
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvasArea);

    // --- Workspace event subscriptions ---
    this._registerWorkspaceEvents();

    this.doRender();
  }

  /** Create the toolbar with zoom, fit, export, local graph, fullscreen, and settings buttons. */
  private _initToolbar(root: HTMLElement): void {
    const toolbar = root.createDiv({ cls: "graph-toolbar", attr: { role: "toolbar", "aria-label": "Graph controls" } });
    this.statusEl = toolbar.createEl("span", { cls: "graph-status", attr: { "aria-live": "polite" } });

    const zoomGroup = toolbar.createDiv({ cls: "graph-toolbar-zoom" });
    this._initZoomButtons(zoomGroup);
    this._initActionButtons(zoomGroup);
    this._initSettingsButtons(toolbar);
  }

  /** Create zoom in/out, fit, and marquee buttons. */
  private _initZoomButtons(zoomGroup: HTMLElement): void {
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
  }

  /** Create export, clipboard, and local graph buttons. */
  private _initActionButtons(zoomGroup: HTMLElement): void {
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

    // ノートにグラフを埋め込むボタン
    const embedBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(embedBtn, "image-down");
    embedBtn.setAttribute("aria-label", t("toolbar.embedInNote"));
    embedBtn.title = t("toolbar.embedInNote");
    embedBtn.addEventListener("click", async () => {
      embedBtn.disabled = true;
      try {
        await this.embedGraphInNote();
      } finally {
        embedBtn.disabled = false;
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
      this.requestSave();
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

    // スナップショットボタン
    const snapshotBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(snapshotBtn, "bookmark");
    snapshotBtn.setAttribute("aria-label", t("toolbar.snapshot"));
    snapshotBtn.title = t("toolbar.snapshot");
    snapshotBtn.addEventListener("click", (evt) => {
      this._showSnapshotMenu(evt);
    });
  }

  // =========================================================================
  // スナップショット操作
  // =========================================================================

  /** スナップショットメニューを表示する */
  private _showSnapshotMenu(evt: MouseEvent): void {
    const menu = new Menu();

    // 保存メニュー項目
    menu.addItem((item) => {
      item.setTitle(t("snapshot.save"))
        .setIcon("plus")
        .onClick(() => this._saveSnapshot());
    });

    const snapshots = this.plugin.settings.snapshots ?? [];
    if (snapshots.length > 0) {
      menu.addSeparator();

      // 各スナップショットのサブメニュー
      for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        menu.addItem((item) => {
          item.setTitle(snap.name)
            .setIcon("bookmark")
            .onClick(() => this._compareWithSnapshot(snap));
        });
      }

      // 削除用サブメニュー
      menu.addSeparator();
      for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        menu.addItem((item) => {
          item.setTitle(`${t("snapshot.delete")}: ${snap.name}`)
            .setIcon("trash")
            .onClick(() => this._deleteSnapshot(i));
        });
      }
    }

    // 差分が有効な場合、解除ボタンを表示
    if (this.diffOverlay.isActive()) {
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle(t("snapshot.clearDiff"))
          .setIcon("x")
          .onClick(() => this._clearDiffOverlay());
      });
    }

    menu.showAtMouseEvent(evt);
  }

  /** 現在のグラフ状態をスナップショットとして保存する */
  private _saveSnapshot(): void {
    const snapshots = this.plugin.settings.snapshots ?? [];

    // 10件制限チェック
    if (snapshots.length >= 10) {
      showToast(t("snapshot.limitReached"), 5000);
      return;
    }

    // 名前入力（簡易プロンプト）
    const name = window.prompt(
      t("snapshot.enterName"),
      `Snapshot ${snapshots.length + 1}`,
    );
    if (!name) return;

    // 現在のグラフデータを取得してキャプチャ
    const data = this.getGraphData();
    const snapshot = captureSnapshot(data, name, {
      layout: this.currentLayout ?? "force",
      searchQuery: this.panel.searchQuery ?? "",
      groupBy: (this.panel.clusterGroupRules?.[0]?.groupBy) ?? "",
    });

    // 設定に保存
    if (!this.plugin.settings.snapshots) {
      this.plugin.settings.snapshots = [];
    }
    this.plugin.settings.snapshots.push(snapshot);
    this.plugin.saveSettings();

    showToast(t("snapshot.saved").replace("{name}", name));
  }

  /** スナップショットと現在のグラフを比較する */
  private _compareWithSnapshot(snapshot: GraphSnapshot): void {
    const data = this.getGraphData();
    const diff = computeSnapshotDiff(data, snapshot);
    this.diffOverlay.activate(diff, snapshot.name);

    // 再描画を要求してオーバーレイを表示
    this.pixiApp?.markNeedsRender();
    this.wakeRenderLoop();
  }

  /** スナップショットを削除する */
  private _deleteSnapshot(index: number): void {
    const snapshots = this.plugin.settings.snapshots ?? [];
    if (index < 0 || index >= snapshots.length) return;

    const name = snapshots[index].name;
    snapshots.splice(index, 1);
    this.plugin.saveSettings();

    showToast(t("snapshot.deleted").replace("{name}", name));
  }

  /** 差分オーバーレイを解除する */
  private _clearDiffOverlay(): void {
    this.diffOverlay.deactivate();
    this.pixiApp?.markNeedsRender();
    this.wakeRenderLoop();
  }

  /** Create fullscreen toggle and settings panel toggle buttons. */
  private _initSettingsButtons(toolbar: HTMLElement): void {
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
  }

  /** Create the canvas area with the canvas wrap and node info overlay. */
  private _initCanvasArea(main: HTMLElement): HTMLElement {
    // canvasWrap is emptied by initPixi, so nodeInfoEl
    // lives in a sibling wrapper that won't be cleared.
    const canvasArea = main.createDiv({ cls: "gi-canvas-area", attr: { role: "main", "aria-label": "Graph canvas" } });
    this.canvasWrap = canvasArea.createDiv({ cls: "graph-svg-wrap" });

    // 注釈オーバーレイレイヤー（キャンバスの上に配置、ポインターイベント透過）
    this.annotationLayer = canvasArea.createDiv({ cls: "gi-annotation-layer" });

    // --- Node Info Overlay (floating, survives canvas rebuilds) ---
    this.nodeInfoEl = canvasArea.createDiv({ cls: "gi-node-info" });
    this.nodeInfoEl.style.display = "none";

    return canvasArea;
  }

  /** Register all keyboard shortcuts for the graph view. */
  private _registerKeyboardShortcuts(): void {
    this.registerDomEvent(document, "keydown", (e: KeyboardEvent) => {
      const activeLeaf = this.app.workspace.activeLeaf;
      if (activeLeaf?.view !== this) return;
      if (e.key === "Escape") { this._handleEscapeKey(); return; }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      this._handleShortcutKey(e.key, e);
    });
  }

  /** Handle Escape key: close overlays or clear keyboard focus. */
  private _handleEscapeKey(): void {
    // 差分オーバーレイが有効なら解除
    if (this.diffOverlay.isActive()) {
      this._clearDiffOverlay();
      return;
    }
    if (this.nodeInfoEl && this.nodeInfoEl.style.display !== "none") {
      this.nodeInfoEl.style.display = "none";
      this.nodeInfoEl.classList.remove("is-visible");
      return;
    }
    if (this.legendEl && this.legendEl.style.display !== "none") {
      this.legendEl.style.display = "none";
      return;
    }
    if (this.shortcutHelpEl && this.shortcutHelpEl.style.display !== "none") {
      this.shortcutHelpEl.style.display = "none";
      return;
    }
    // フォーカスモードのクリア (Escape)
    if (this.panel.focusNodeId) {
      this.clearFocus();
      return;
    }
    if (this._isKeyboardFocused) {
      this._isKeyboardFocused = false;
      this.setHighlightedNodeId(null);
      this.applyHover();
      this.markDirty(true);
    }
  }

  /** Dispatch a non-Escape keyboard shortcut. */
  private _handleShortcutKey(key: string, e: KeyboardEvent): void {
    // Ctrl/Cmd+F: focus search input
    if ((e.ctrlKey || e.metaKey) && key === "f") {
      e.preventDefault();
      const search = this.panelEl?.querySelector<HTMLInputElement>(".gi-settings-filter");
      if (search) {
        this.panelEl?.classList.remove("is-hidden");
        search.focus();
      }
      return;
    }

    // Space: auto-fit view
    if (key === " " && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const wrap = this.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
      if (wrap) this.autoFitView(wrap.clientWidth, wrap.clientHeight);
      return;
    }

    // 1-4: switch panel tabs
    if (key >= "1" && key <= "4" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const idx = parseInt(key) - 1;
      const tabs = this.panelEl?.querySelectorAll<HTMLButtonElement>(".gi-tab-btn");
      if (tabs && tabs[idx]) {
        tabs[idx].click();
      }
      return;
    }

    // P: toggle panel visibility
    if (key === "p" && !e.ctrlKey && !e.metaKey) {
      this.panelEl?.classList.toggle("is-hidden");
      return;
    }

    // +/=: zoom in
    if ((key === "+" || key === "=") && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.zoomBy(1.2);
      return;
    }
    // -: zoom out
    if (key === "-" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      this.zoomBy(1 / 1.2);
      return;
    }
    // 0: zoom reset (100%)
    if (key === "0" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      this.setZoom(1.0);
      return;
    }
    // F: fit view (same as Space)
    if (key === "f" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const wrap = this.containerEl.querySelector<HTMLElement>(".graph-svg-wrap");
      if (wrap) this.autoFitView(wrap.clientWidth, wrap.clientHeight);
      return;
    }
    // L: 凡例表示トグル
    if (key === "l" && !e.ctrlKey && !e.metaKey) {
      this.panel.showLegend = !this.panel.showLegend;
      this.updateLegend();
      this.requestSave();
      return;
    }
    // M: toggle minimap
    if (key === "m" && !e.ctrlKey && !e.metaKey) {
      this.panel.showMinimap = !this.panel.showMinimap;
      this.markDirty(true);
      return;
    }
    // G: toggle grid
    if (key === "g" && !e.ctrlKey && !e.metaKey) {
      this.panel.showDotGrid = !this.panel.showDotGrid;
      this.markDirty(true);
      return;
    }
    // [: decrease hoverHops
    if (key === "[" && !e.ctrlKey && !e.metaKey) {
      this.panel.hoverHops = Math.max(0, this.panel.hoverHops - 1);
      this.applyHover();
      this.markDirty(true);
      return;
    }
    // ]: increase hoverHops
    if (key === "]" && !e.ctrlKey && !e.metaKey) {
      this.panel.hoverHops = Math.min(10, this.panel.hoverHops + 1);
      this.applyHover();
      this.markDirty(true);
      return;
    }
    // Ctrl/Cmd+Shift+C: copy graph to clipboard as PNG
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "C") {
      e.preventDefault();
      this.copyGraphToClipboard();
      return;
    }
    // Enter: activate (open file of) keyboard-focused node
    if (key === "Enter" && this._isKeyboardFocused && this.highlightedNodeId) {
      e.preventDefault();
      const pn = this.pixiNodes.get(this.highlightedNodeId);
      if (pn?.data.filePath) {
        const file = this.app.vault.getAbstractFileByPath(pn.data.filePath);
        if (file instanceof TFile) this.app.workspace.getLeaf(false).openFile(file);
      }
      return;
    }
    // ?: toggle shortcut help
    if (key === "?" && !e.ctrlKey && !e.metaKey) {
      if (this.shortcutHelpEl) {
        this.shortcutHelpEl.style.display = this.shortcutHelpEl.style.display === "none" ? "" : "none";
      }
      return;
    }
    // Tab / Shift+Tab: cycle focus through nodes
    if (key === "Tab") {
      e.preventDefault();
      this.cycleFocusNode(e.shiftKey ? -1 : 1);
      return;
    }
  }

  /** Create legend and keyboard shortcut help overlays. */
  private _initOverlays(canvasArea: HTMLElement): void {
    // --- Legend Overlay ---
    this.legendEl = canvasArea.createDiv({ cls: "gi-legend" });
    this.legendEl.style.display = "none";

    // --- Keyboard Shortcut Help Overlay ---
    this.shortcutHelpEl = canvasArea.createDiv({ cls: "gi-shortcut-help" });
    this.shortcutHelpEl.style.display = "none";
    this.shortcutHelpEl.setAttribute("role", "dialog");
    this.shortcutHelpEl.setAttribute("aria-label", "Keyboard shortcuts");
    {
      const titleEl = this.shortcutHelpEl.createDiv({ cls: "gi-shortcut-help-title" });
      titleEl.textContent = "Keyboard Shortcuts";
      const table = this.shortcutHelpEl.createEl("table", { cls: "gi-shortcut-help-table" });
      const shortcuts: [string, string][] = [
        ["Tab / Shift+Tab", "Cycle focus through nodes"],
        ["Enter", "Open focused node's file"],
        ["Escape", "Close overlay / clear focus"],
        ["+/= / \u2212", "Zoom in / out"],
        ["0", "Reset zoom (100%)"],
        ["Space / F", "Fit graph to view"],
        ["P", "Toggle settings panel"],
        ["L", "Toggle legend"],
        ["M", "Toggle minimap"],
        ["G", "Toggle dot grid"],
        ["[ / ]", "Decrease / increase hover hops"],
        ["1\u20134", "Switch panel tab"],
        ["Ctrl+F", "Focus search"],
        ["Ctrl+Shift+C", "Copy graph as PNG"],
        ["?", "Toggle this help"],
      ];
      for (const [key, desc] of shortcuts) {
        const tr = table.createEl("tr");
        const tdKey = tr.createEl("td", { cls: "gi-shortcut-key" });
        tdKey.textContent = key;
        const tdDesc = tr.createEl("td");
        tdDesc.textContent = desc;
      }
    }
  }

  /** Create panel resize handle and control panel element. */
  private _initPanelWithResize(main: HTMLElement): void {
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
    this.panelEl = main.createDiv({ cls: "graph-panel is-hidden", attr: { role: "complementary", "aria-label": "Graph settings" } });
    this.buildPanel();
  }

  /** Subscribe to workspace events (active-leaf-change, css-change, ephemeral highlight). */
  private _registerWorkspaceEvents(): void {
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
        const file = (leaf?.view instanceof FileView) ? leaf.view.file : undefined;
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
          this.requestSave();
        }
      })
    );

    // Theme / CSS snippet change — invalidate color caches and update canvas background
    this.registerEvent(
      // "css-change" is an undocumented Obsidian workspace event not in the public type definitions
      this.app.workspace.on("css-change" as any, () => {
        this.invalidateThemeCache();
      })
    );

    // Ephemeral highlight from side-panel (property value hover, backlink hover)
    this.registerEvent(
      // Custom plugin event not in Obsidian's Workspace type definitions
      this.app.workspace.on(EVENT_HIGHLIGHT_NODES as any, (nodeIds: Set<string> | null) => {
        this.applyEphemeralHighlight(nodeIds);
      })
    );

    // ビュー同期: 他の Graph Island ビューからのパネル状態変更を受信
    this.registerEvent(
      this.app.workspace.on(EVENT_SYNC_PANEL as any, (data: { senderId: string; panel: Record<string, unknown> }) => {
        if (!data || !this.panel.syncViewId) return;
        // 自分自身が送信元の場合は無視
        if (data.senderId === this.leaf.id) return;
        this._syncReceiving = true;
        try {
          this._applySyncedPanel(data.panel);
        } finally {
          this._syncReceiving = false;
        }
      })
    );
  }

  // ---------------------------------------------------------------------------
  // ビュー同期: パネル状態のブロードキャストと受信
  // ---------------------------------------------------------------------------

  /** 同期対象フィールド — 検索クエリやローカルグラフは除外 */
  private static readonly SYNC_FIELDS: (keyof PanelState)[] = [
    "showTags", "showAttachments", "existingOnly", "showOrphans", "showArrows",
    "showOrbitRings", "colorEdgesByRelation", "colorNodesByCategory",
    "heatmapMode", "showInheritance", "showAggregation", "showTagNodes",
    "tagDisplay", "showSimilar", "showSibling", "showSequence",
    "showLinks", "showTagEdges", "showCategoryEdges", "showSemanticEdges",
    "showEdgeLabels", "showMinimap", "showDotGrid", "showDurationBars",
    "clusterArrangement", "clusterGroupArrangement",
    "nodeSize", "textFadeThreshold", "hoverHops",
    "fadeEdgesByDegree", "edgeBundleStrength",
    "nodeDisplayMode", "focusMode",
  ];

  /** 同期を他のビューにブロードキャスト */
  private _broadcastPanelSync(): void {
    if (!this.panel.syncViewId || this._syncReceiving) return;
    const payload: Record<string, unknown> = {};
    for (const key of GraphViewContainer.SYNC_FIELDS) {
      payload[key] = (this.panel as Record<string, unknown>)[key];
    }
    // workspace.trigger でカスタムイベントを発火
    (this.app.workspace as any).trigger(EVENT_SYNC_PANEL, {
      senderId: this.leaf.id,
      panel: payload,
    });
  }

  /** 受信した同期データをパネルに適用 */
  private _applySyncedPanel(incoming: Record<string, unknown>): void {
    let needsRender = false;
    for (const key of GraphViewContainer.SYNC_FIELDS) {
      if (!(key in incoming)) continue;
      const cur = (this.panel as Record<string, unknown>)[key];
      const next = incoming[key];
      if (cur !== next) {
        (this.panel as Record<string, unknown>)[key] = next;
        needsRender = true;
      }
    }
    if (needsRender) {
      this.buildPanel();
      this.doRender();
    }
  }

  // ---------------------------------------------------------------------------
  // Feature P: ノード注釈 — キャンバス上のフローティングテキストボックス
  // ---------------------------------------------------------------------------

  /** 空白ダブルクリック時に呼ばれる: 注釈を追加 */
  addAnnotationAt(wx: number, wy: number): void {
    const id = crypto.randomUUID();
    const annotation = { nodeId: id, text: "", x: wx, y: wy };
    this.panel.annotations.push(annotation);
    this._renderAnnotation(annotation);
    this.requestSave();
  }

  /** 全注釈を再描画（レンダー後に呼ぶ） */
  private _renderAllAnnotations(): void {
    if (!this.annotationLayer) return;
    this.annotationLayer.empty();
    for (const ann of this.panel.annotations) {
      this._renderAnnotation(ann);
    }
  }

  /** 個別の注釈 DOM 要素を生成 */
  private _renderAnnotation(
    ann: { nodeId: string; text: string; x: number; y: number },
  ): void {
    if (!this.annotationLayer || !this.worldContainer || !this.pixiApp) return;

    const el = this.annotationLayer.createDiv({ cls: "gi-annotation" });

    // テキスト入力エリア
    const textEl = el.createEl("textarea", {
      cls: "gi-annotation-text",
      attr: { placeholder: t("annotation.placeholder"), rows: "2" },
    });
    textEl.value = ann.text;
    textEl.addEventListener("input", () => {
      ann.text = textEl.value;
      this.requestSave();
    });
    // テキストエリアのフォーカス時はドラッグ無効
    textEl.addEventListener("pointerdown", (e) => e.stopPropagation());

    // 削除ボタン
    const deleteBtn = el.createEl("button", {
      cls: "gi-annotation-delete",
      attr: { "aria-label": t("annotation.delete"), title: t("annotation.delete") },
    });
    deleteBtn.textContent = "\u00d7";
    deleteBtn.addEventListener("click", () => {
      const idx = this.panel.annotations.indexOf(ann);
      if (idx >= 0) this.panel.annotations.splice(idx, 1);
      el.remove();
      this.requestSave();
    });

    // ドラッグ処理: スクリーン座標のデルタをワールド座標に変換
    let dragging = false;
    let lastScreenX = 0;
    let lastScreenY = 0;

    el.addEventListener("pointerdown", (e) => {
      if (e.target === textEl) return; // テキスト編集中はドラッグしない
      dragging = true;
      lastScreenX = e.clientX;
      lastScreenY = e.clientY;
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging || !this.worldContainer) return;
      const scale = this.worldContainer.scale.x || 1;
      const dx = (e.clientX - lastScreenX) / scale;
      const dy = (e.clientY - lastScreenY) / scale;
      ann.x += dx;
      ann.y += dy;
      lastScreenX = e.clientX;
      lastScreenY = e.clientY;
      this._positionAnnotationEl(el, ann);
    });
    el.addEventListener("pointerup", (e) => {
      if (dragging) {
        dragging = false;
        el.releasePointerCapture(e.pointerId);
        this.requestSave();
      }
    });

    this._positionAnnotationEl(el, ann);
  }

  /** 注釈 DOM 要素をワールド座標→スクリーン座標に変換して配置 */
  private _positionAnnotationEl(
    el: HTMLElement,
    ann: { x: number; y: number },
  ): void {
    if (!this.worldContainer || !this.pixiApp) return;
    const screen = this.worldContainer.toGlobal({ x: ann.x, y: ann.y });
    const parentRect = this.annotationLayer?.parentElement?.getBoundingClientRect();
    if (!parentRect) return;
    el.style.left = `${screen.x - parentRect.left}px`;
    el.style.top = `${screen.y - parentRect.top}px`;
  }

  /** 全注釈位置を更新（ズーム/パン時に呼ぶ） */
  private _updateAnnotationPositions(): void {
    if (!this.annotationLayer) return;
    const children = this.annotationLayer.children;
    for (let i = 0; i < children.length && i < this.panel.annotations.length; i++) {
      this._positionAnnotationEl(children[i] as HTMLElement, this.panel.annotations[i]);
    }
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
    this.annotationLayer = null;
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
    this.guideRenderer?.clearAll();
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
    this.routeGraphics = null;
    this.routeData = null;
    this.trayGraphics = null;
    // Keep roadBuilder.trayData across destroyPixi — only rebuild via simulation end handler
    if (this.roadBuilder) this.roadBuilder.reset();
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

      const app = this._createCanvasApp(width, height);
      const canvas = app.view;
      this.pixiApp = app;

      const world = this._setupGraphicsLayers(app);
      this._wireCanvasManagers(canvas, world);

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

  /** Create the CanvasApp, attach the canvas element, and set up accessibility attributes. */
  private _createCanvasApp(width: number, height: number): CanvasApp {
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

    // Accessibility: make canvas focusable and identifiable to assistive technology
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", t("a11y.canvasLabel") ?? "Interactive graph visualization. Use Tab to cycle nodes, +/- to zoom.");
    canvas.setAttribute("tabindex", "0");

    // aria-live region for screen reader announcements (focus, zoom changes)
    if (!this._ariaLiveEl) {
      this._ariaLiveEl = this.canvasWrap!.createEl("span", {
        attr: { "aria-live": "polite", "aria-atomic": "true" },
      });
      this._ariaLiveEl.addClass("sr-only");
    }

    return app;
  }

  /** Create the world container and all graphics layers in correct z-order. */
  private _setupGraphicsLayers(app: CanvasApp): CanvasContainer {
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

    // Route line layer (transit map style — per-group colored paths)
    const routeGfx = new CanvasGraphics();
    world.addChild(routeGfx);
    this.routeGraphics = routeGfx;

    // Road network layer (auto-generated roads from coordinate grid)
    const roadGfx = new CanvasGraphics();
    world.addChild(roadGfx);
    this.trayGraphics = roadGfx;

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

    return world;
  }

  /** Wire up InteractionManager, RenderPipeline, and Minimap to the canvas. */
  private _wireCanvasManagers(canvas: HTMLCanvasElement, world: CanvasContainer): void {
    // Set up interaction handling (pointer events, drag, pan, hover, marquee)
    this.interactionManager?.detach();
    this.interactionManager = new InteractionManager(this, canvas, world);

    // Set up render pipeline (render loop, Canvas 2D node creation, batch drawing)
    this.renderPipeline = new RenderPipeline(this);

    // Set up label manager (LOD, truncation, scaling pipeline)
    this.labelManager = new LabelManager(this);

    // Set up guide / grid renderer
    this.guideRenderer = new GuideRenderer(this);

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

    // 差分オーバーレイのポストフラッシュフック設定
    const pixiApp = this.pixiApp;
    if (pixiApp) {
      pixiApp.onPostFlush = (ctx: CanvasRenderingContext2D, _dpr: number) => {
        if (!this.diffOverlay.isActive()) return;
        const w = world;
        this.diffOverlay.render(
          ctx,
          this.pixiNodes,
          { x: w.x, y: w.y, scale: w.scale.x },
          {
            width: this.canvasWrap?.clientWidth ?? 600,
            height: this.canvasWrap?.clientHeight ?? 400,
          },
        );
      };
    }
  }

  // =========================================================================
  // InteractionHost + RenderHost implementation
  // =========================================================================
  getHighlightedNodeId(): string | null { return this.highlightedNodeId; }
  setHighlightedNodeId(id: string | null) {
    this.highlightedNodeId = id;
    // Mouse hover clears keyboard focus flag (cycleFocusNode sets it back to true)
    this._isKeyboardFocused = false;
  }
  /** Whether the current highlight was set via keyboard (Tab cycling). */
  getIsKeyboardFocused(): boolean { return this._isKeyboardFocused; }
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
      this.requestSave();
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
        this.requestSave();
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
      // Louvain コミュニティ自動検出
      if (raw === "louvain") {
        allGroups.push(...this.resolveLouvainGroups(nodes, opts));
        continue;
      }
      allGroups.push(...groupNodesByField(nodes, raw, opts));
    }
    return allGroups;
  }

  /** Louvain アルゴリズムでコミュニティを検出し GroupSpec[] を返す。
   *  結果は rawData が変わるまでキャッシュする。 */
  private resolveLouvainGroups(nodes: GraphNode[], opts: GroupOptions): GroupSpec[] {
    // キャッシュが有効ならそのまま返す（rawData の参照一致で判定）
    if (this.louvainCache && this.louvainCache.dataRef === this.rawData) {
      return this.louvainCache.groups;
    }

    // 現在のグラフデータからエッジ情報を取得
    const graphData = this.rawData ?? this.originalGraphData;
    if (!graphData) return [];

    const nodeIds = nodes.filter(n => !n.isTag).map(n => n.id);
    const edges = graphData.edges.map(e => ({
      source: e.source,
      target: e.target,
      weight: 1,
    }));

    const communityMap = louvainCommunities(nodeIds, edges);

    // コミュニティIDごとにノードを集約
    const minSize = opts?.minSize ?? 2;
    const commGroups = new Map<number, string[]>();
    for (const [nodeId, commId] of communityMap) {
      if (!commGroups.has(commId)) commGroups.set(commId, []);
      commGroups.get(commId)!.push(nodeId);
    }

    const groups: GroupSpec[] = [];
    for (const [commId, memberIds] of commGroups) {
      if (memberIds.length < minSize) continue;
      groups.push({
        key: `louvain:${commId}`,
        label: `Community ${commId + 1}`,
        memberIds,
      });
    }

    // キャッシュに保存
    if (this.rawData) {
      this.louvainCache = { dataRef: this.rawData, groups };
    }

    return groups;
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
    this.routeData = meta?.timelineRoutes ?? null;
    // Road network is rebuilt in the simulation "end" handler when node positions are final
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
  getSequenceFields(): string[] {
    const fields = this.plugin.settings.ontology?.sequenceFields;
    return fields && fields.length > 0 ? fields : DEFAULT_ONTOLOGY.sequenceFields;
  }
  getReverseSequenceFields(): string[] {
    const fields = this.plugin.settings.ontology?.reverseSequenceFields;
    return fields && fields.length > 0 ? fields : DEFAULT_ONTOLOGY.reverseSequenceFields;
  }
  getNodeShapeRules() { return this.panel.nodeShapeRules; }
  getSearchHiddenNodes() { return new Set<string>(); }
  getCanvasDimensions() {
    return {
      width: this.canvasWrap?.clientWidth ?? 600,
      height: this.canvasWrap?.clientHeight ?? 400,
    };
  }

  /** Return current graph nodes (for cell-shading density heatmap). */
  getCurrentNodes(): GraphNode[] | undefined {
    if (this.pixiNodes.size === 0) return undefined;
    const nodes: GraphNode[] = [];
    for (const pn of this.pixiNodes.values()) nodes.push(pn.data);
    return nodes;
  }

  isRingChartMode(): boolean {
    return false;
  }

  getNodeDisplayMode() { return this.panel.nodeDisplayMode ?? "node"; }
  getCardDisplayConfig() { return this.panel.cardDisplayConfig ?? { fields: [], maxWidth: 120, showIcon: false }; }
  getDonutDisplayConfig() { return this.panel.donutDisplayConfig ?? { innerRadius: 0.6 }; }
  getRenderThresholds() { return this.panel.renderThresholds ?? {}; }
  getTextFadeThreshold(): number { return this.panel.textFadeThreshold; }
  getWorldScale(): number { return this.worldContainer?.scale.x ?? 1; }
  getRenderPipeline(): RenderPipeline | null { return this.renderPipeline; }
  getSunburstLabels(): Map<string, CanvasText> { return this.sunburstLabels; }
  getClusterSunburstLabels(): Map<string, CanvasText> { return this.clusterSunburstLabels; }
  getNodeSize() { return this.panel.nodeSize; }
  getAdjacency() { return this.adj; }

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

    const cfg = this._prepareHitTestConfig();

    // Determine if grid search can cover the hit radius, otherwise brute-force
    const maxHitWorld = cfg.displayMode === "card"
      ? Math.max(cfg.hitCardMaxHalfW, cfg.hitCardHalfH) + cfg.pad
      : cfg.hitWorldR;
    const gridSearchLimit = 20;
    const neededCells = Math.ceil(maxHitWorld / cs);
    const useGrid = neededCells <= gridSearchLimit;

    const hitTest = (pn: PixiNode) => {
      const ddx = pn.data.x - wx;
      const ddy = pn.data.y - wy;
      const dist = ddx * ddx + ddy * ddy;
      if (cfg.displayMode === "card") {
        const effR = Math.max(pn.radius, cfg.minWorldRadius);
        const halfW = Math.min(cfg.hitCardMaxHalfW, cfg.hitCardAspectRatio > 0 ? (cfg.hitCardHalfH * cfg.hitCardAR) : effR * cfg.hitCardWidthFactor);
        if (Math.abs(ddx) <= halfW + cfg.pad && Math.abs(ddy) <= cfg.hitCardHalfH + cfg.pad && dist < closestDist) {
          closestDist = dist;
          closest = pn;
        }
      } else {
        const effR = Math.max(pn.radius, cfg.minWorldRadius);
        const r = Math.max(effR * cfg.glowRadius, cfg.hitScreenPx / cfg.zoom) + cfg.pad;
        if (dist < r * r && dist < closestDist) {
          closestDist = dist;
          closest = pn;
        }
      }
    };

    if (useGrid) {
      const searchCells = Math.max(1, neededCells);
      for (let dx = -searchCells; dx <= searchCells; dx++) {
        for (let dy = -searchCells; dy <= searchCells; dy++) {
          const cell = this.spatialGrid.get(`${cx + dx},${cy + dy}`);
          if (!cell) continue;
          for (const pn of cell) hitTest(pn);
        }
      }
    } else {
      for (const pn of this.pixiNodes.values()) hitTest(pn);
    }

    if (!closest) {
      closest = this._hitTestTimelineBars(wx, wy);
    }

    return closest;
  }

  /** Pre-compute all configuration values needed for hit testing. */
  private _prepareHitTestConfig() {
    const rt = this.panel.renderThresholds ?? {};
    const minScreenPx = rt.minHoverScreenPx ?? DEFAULT_RENDER_THRESHOLDS.minHoverScreenPx;
    const zoom = this.worldContainer?.scale?.x ?? 1;
    const minWorldRadius = Math.max(0, MIN_WORLD_RADIUS_PX / zoom);
    const pad = rt.collisionPadding ?? DEFAULT_RENDER_THRESHOLDS.collisionPadding;
    const displayMode = this.panel.nodeDisplayMode ?? "node";
    const glowRadius = rt.glowBaseRadius ?? DEFAULT_RENDER_THRESHOLDS.glowBaseRadius ?? 2.2;
    const hitScreenPx = Math.max(MIN_WORLD_RADIUS_PX * glowRadius, minScreenPx);
    const hitWorldR = hitScreenPx / zoom + pad;

    let hitCardMaxHalfW = 0;
    let hitCardAR = 0;
    let hitCardWidthFactor = 0;
    let hitCardAspectRatio = 0;
    let hitCardHalfH = 0;
    if (displayMode === "card") {
      const crc = { ...DEFAULT_CARD_RENDER_CONFIG, ...(this.panel.cardRenderConfig ?? {}) };
      const cardConfig = this.panel.cardDisplayConfig ?? { fields: [], maxWidth: 120, showIcon: false };
      const headerH = crc.tableHeaderHeight / zoom;
      const fieldLineH = crc.fieldLineHeight / zoom;
      const cardPad = crc.cardPadding / zoom;
      const fieldCount = cardConfig.fields?.length ?? 0;
      hitCardHalfH = (headerH + fieldCount * fieldLineH + cardPad * 2) / 2;
      hitCardMaxHalfW = ((cardConfig.maxWidth ?? 120) / zoom) / 2;
      hitCardAR = crc.cardAspectRatio > 0 ? crc.cardAspectRatio : 1.618;
      hitCardWidthFactor = crc.cardWidthFactor;
      hitCardAspectRatio = crc.cardAspectRatio;
    }

    return { zoom, minWorldRadius, pad, displayMode, glowRadius, hitScreenPx, hitWorldR, hitCardMaxHalfW, hitCardAR, hitCardWidthFactor, hitCardAspectRatio, hitCardHalfH };
  }

  /** Hit-test timeline duration bars (rectangles). */
  private _hitTestTimelineBars(wx: number, wy: number): PixiNode | null {
    const bars = this.clusterMeta?.timelineBars;
    if (bars && bars.length > 0) {
      for (const bar of bars) {
        const halfH = bar.barHeight / 2;
        if (wx >= bar.xStart && wx <= bar.xEnd &&
            wy >= bar.yCenter - halfH && wy <= bar.yCenter + halfH) {
          const pn = this.pixiNodes.get(bar.nodeId);
          if (pn) return pn;
        }
      }
    }
    return null;
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
    // フォーカスモード: クリック時にハイライトを固定
    if (this.panel.focusMode) {
      if (this.panel.focusNodeId === pn.data.id) {
        // 同じノードを再クリック → フォーカス解除
        this.panel.focusNodeId = null;
      } else {
        this.panel.focusNodeId = pn.data.id;
      }
      this._applyFocusHighlight();
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

  // =========================================================================
  // 比較選択 (Ctrl+click で最大2ノード選択 → 比較パネルに通知)
  // =========================================================================
  addCompareNode(nodeId: string) {
    // 既に選択済みならトグル解除
    const idx = this.compareNodeIds.indexOf(nodeId);
    if (idx >= 0) {
      this.compareNodeIds.splice(idx, 1);
    } else {
      // FIFO: 2件を超えたら最も古いものを除去
      if (this.compareNodeIds.length >= 2) {
        this.compareNodeIds.shift();
      }
      this.compareNodeIds.push(nodeId);
    }
    this.notifyCompare();
    this.markDirty(true);
  }

  clearCompareSelection() {
    if (this.compareNodeIds.length === 0) return;
    this.compareNodeIds = [];
    this.notifyCompare();
    this.markDirty(true);
  }

  getCompareNodeIds(): string[] {
    return this.compareNodeIds;
  }

  // =========================================================================
  // ブックマーク (Feature L)
  // =========================================================================
  /** ノードのブックマークをトグル */
  toggleBookmark(nodeId: string) {
    const idx = this.panel.bookmarkedNodes.indexOf(nodeId);
    if (idx >= 0) {
      this.panel.bookmarkedNodes.splice(idx, 1);
    } else {
      this.panel.bookmarkedNodes.push(nodeId);
    }
    this.requestSave();
    this.markDirty(true);
    this.buildPanel();
  }

  /** ノードがブックマーク済みかどうか */
  isBookmarked(nodeId: string): boolean {
    return this.panel.bookmarkedNodes.includes(nodeId);
  }

  /** ブックマーク済みノードIDセットを取得（RenderHost用） */
  getBookmarkedNodeIds(): Set<string> {
    return new Set(this.panel.bookmarkedNodes);
  }

  /** 比較イベントをワークスペースに発火。2ノード揃ったらパスファインダーも連動。 */
  private notifyCompare() {
    if (this.compareNodeIds.length === 2) {
      const a = this.pixiNodes.get(this.compareNodeIds[0]);
      const b = this.pixiNodes.get(this.compareNodeIds[1]);
      if (a && b) {
        this.app.workspace.trigger(EVENT_COMPARE_NODES as any, {
          nodeA: a.data,
          nodeB: b.data,
          adj: this.adj,
          pixiNodes: this.pixiNodes,
        });
        // パスファインダーも連動して最短経路を表示
        this.setPathfinderNode(this.compareNodeIds[0], "start");
        this.setPathfinderNode(this.compareNodeIds[1], "end");
      }
    } else {
      this.app.workspace.trigger(EVENT_COMPARE_NODES as any, null);
      this.clearPathfinder();
    }
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
    const active = (min > 0.001 || max < 0.999) && this.panel.clusterArrangement === ARRANGEMENT_TIMELINE;
    return { min, max, active };
  }



  // =========================================================================
  // Hover highlight (Canvas 2D)
  // =========================================================================
  applyHover() {
    const hId = this.highlightedNodeId;

    // Build current highlight set via BFS up to hoverHops
    let curSet = this._buildHoverHighlightSet(hId);

    // フォーカスモード: ホバーなしでフォーカスが有効なら、フォーカスセットを使用
    const focusActive = this.panel.focusMode && this.panel.focusNodeId && !hId;
    if (focusActive) {
      curSet = this._buildHoverHighlightSet(this.panel.focusNodeId);
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

    // フォーカスモード時はフォーカスノードIDを実効ハイライトIDとして使用
    const effectiveHId = hId || (focusActive ? this.panel.focusNodeId : null);

    for (const pn of nodesToUpdate) {
      if (!effectiveHId) {
        pn.gfx.alpha = 1;
        if (isCardMode) pn.gfx.scale.set(1);
        this.drawNodeCircle(pn, false);
        if (pn.hoverLabel) { pn.gfx.removeChild(pn.hoverLabel); pn.hoverLabel.destroy(); pn.hoverLabel = null; }
      } else if (curSet.has(pn.data.id)) {
        pn.gfx.alpha = 1;
        if (isCardMode && pn.data.id === effectiveHId) {
          pn.gfx.scale.set(crc.cardHoverScale);
        } else if (isCardMode) {
          pn.gfx.scale.set(1);
        }
        this.drawNodeCircle(pn, true);
        if (!pn.hoverLabel) {
          this._createHoverTooltip(pn);
        }
        // When hovering, also force-show tag label if present but hidden by LOD
        if (pn.tagLabel && !pn.tagLabel.visible) {
          pn.tagLabel.visible = true;
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

  /** Build the set of node IDs within hoverHops of the given node via BFS. */
  private _buildHoverHighlightSet(hId: string | null): Set<string> {
    if (!hId) return new Set<string>();
    return bfsNeighborSet(this.adj, hId, this.panel.hoverHops);
  }

  /** フォーカスモードのハイライトを適用 (クリック時に呼ばれる) */
  private _applyFocusHighlight(): void {
    // ホバーが無い状態でフォーカスを再適用
    if (!this.highlightedNodeId) {
      this.applyHover();
    }
    this.markDirty(true);
  }

  /** フォーカスをクリア */
  clearFocus(): void {
    this.panel.focusNodeId = null;
    this.applyHover();
    this.markDirty(true);
  }

  /** Create and attach a hover tooltip label to the given PixiNode. */
  private _createHoverTooltip(pn: PixiNode) {
    // Build combined tooltip: name + tags + group
    // For nodes that already have a visible label, only show extra info (tags/group)
    // to avoid duplicating the node name. For unlabeled nodes, show everything.
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.panel.renderThresholds };
    const showTooltip = rt.hoverTooltipShow ?? true;
    const hasVisibleLabel = !!(pn.label && pn.label.visible);
    let tooltipText = hasVisibleLabel ? "" : pn.data.label;
    if (showTooltip) {
      // Append tag info if tags exist (and not already shown via tagLabel)
      const hasVisibleTagLabel = !!(pn.tagLabel && pn.tagLabel.visible);
      if (pn.data.tags && pn.data.tags.length > 0 && !hasVisibleTagLabel) {
        const tagLine = pn.data.tags.map((t: string) => `#${t}`).join(" ");
        tooltipText = tooltipText ? tooltipText + "\n" + tagLine : tagLine;
      }
      if (pn.data.category) {
        const catLine = "[" + pn.data.category + "]";
        tooltipText = tooltipText ? tooltipText + "\n" + catLine : catLine;
      }
    }
    // Only create tooltip if there is content to show
    if (tooltipText) {
      const tooltipFontSize = rt.hoverTooltipFontSize ?? 10;
      const hl = new CanvasText(tooltipText, {
        fontSize: tooltipFontSize, fill: this.getLabelColor(),
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      hl.bgColor = rt.labelBgColor ?? 0x1a1a2e;
      hl.bgAlpha = rt.labelBgAlpha ?? 0.85;
      hl.bgPadX = 6;
      hl.bgPadY = 3;
      hl.cornerRadius = rt.labelHaloCornerRadius ?? null;
      // Position tooltip below the node when label is above, otherwise beside the node
      if (hasVisibleLabel) {
        hl.anchor.set(0.5, 0);
        hl.x = 0;
        hl.y = pn.radius + (pn.tagLabel ? (rt.tagLabelFontSize ?? 9) + 8 : 4);
      } else {
        hl.x = pn.radius + 2;
        hl.y = -(pn.radius * 0.4 + 2);
      }
      hl.resolution = 2;
      pn.gfx.addChild(hl);
      pn.hoverLabel = hl;
    }
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
    this.app.workspace.trigger(EVENT_HOVER_NODE, node, this.adj, this.pixiNodes, this.degrees);
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
    if (!this.panel.showOrbitRings || this.currentLayout !== LAYOUT_CONCENTRIC || this.shells.length === 0) return;

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
  private _resolveEdgePos = (ref: string | object): { x: number; y: number; id?: string } | undefined =>
    typeof ref === "object" ? (ref as { x: number; y: number; id?: string }) : this.pixiNodes.get(ref)?.data;

  /** Resolve an enclosure member node ID to position + radius.
   *  Bound method — avoids per-frame closure allocation. */
  private _resolveEnclosurePos = (id: string) => {
    const pn = this.pixiNodes.get(id);
    return pn ? { x: pn.data.x, y: pn.data.y, radius: pn.radius } : undefined;
  };

  drawEdges() {
    if (!this.edgeGraphics) return;
    // Ring chart mode: hide all edges (retained for backward compat)
    if (this.isRingChartMode()) {
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

    const cfg = this._buildEdgeDrawConfig();

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
    this._drawPathfinderOverlay();

    // Ensure arrow layer stays on top of all node containers
    if (this.arrowGraphics && this.worldContainer) {
      this.worldContainer.addChild(this.arrowGraphics);
    }
  }

  /** Assemble the EdgeDrawConfig from current panel state (reuses object to avoid allocation). */
  private _buildEdgeDrawConfig(): EdgeDrawConfig {
    // Pre-compute max degree for fade normalization
    let maxDeg = 0;
    if (this.panel.fadeEdgesByDegree) {
      for (const d of this.degrees.values()) { if (d > maxDeg) maxDeg = d; }
    }
    // Ephemeral highlight (from side panel hover) overrides normal hover for edge drawing
    const ephActive = this.ephemeralHighlight && this.ephemeralHighlight.size > 0;
    // フォーカスモード: ホバーがない場合、フォーカスノードIDを実効ハイライトIDとして使用
    const focusFallbackId = (this.panel.focusMode && this.panel.focusNodeId && !this.highlightedNodeId)
      ? this.panel.focusNodeId : null;
    const effectiveHighlightId = ephActive ? "__ephemeral__" : (this.highlightedNodeId || focusFallbackId);
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
    cfg.isArcLayout = this.currentLayout === LAYOUT_ARC;
    cfg.highlightedNodeId = effectiveHighlightId;
    cfg.highlightSet = effectiveHighlightSet;
    cfg.bgColor = this.cachedBgColor!;
    cfg.relationColors = this.relationColors;
    cfg.fadeByDegree = this.panel.fadeEdgesByDegree;
    cfg.degrees = this.degrees;
    cfg.maxDegree = maxDeg;
    cfg.totalEdgeCount = this.graphEdges.length;
    cfg.nodeClusterMap = this.clusterMeta?.nodeClusterMap ?? null;
    // Use live centroids when available, fall back to target centroids from clusterMeta
    const liveCentroids = this.getCachedCentroids();
    const metaCentroids = this.clusterMeta?.clusterCentroids ?? null;
    // Live centroids may have fewer entries during simulation startup (nodes overlap)
    // Use whichever has more entries
    cfg.clusterCentroids = (liveCentroids && metaCentroids && liveCentroids.size < metaCentroids.size)
      ? metaCentroids
      : liveCentroids ?? metaCentroids;
    cfg.clusterRadii = this.clusterMeta?.clusterRadii ?? null;
    cfg.bundleStrength = this.panel.edgeBundleStrength;
    cfg.cableBundleMode = this.panel.cableBundleMode;
    cfg.cableTrunkWidth = this.panel.cableTrunkWidth;
    cfg.cableTrunkAlpha = this.panel.cableTrunkAlpha;
    cfg.cableSpacing = this.panel.cableSpacing;
    cfg.cableFanWidth = this.panel.cableFanWidth;
    cfg.cableFanAlpha = this.panel.cableFanAlpha;
    const edgeRt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    cfg.edgeDensityFloor = edgeRt.edgeDensityFloor;
    cfg.highlightEdgeAlpha = edgeRt.highlightEdgeAlpha;
    cfg.highlightEdgeNonMatchAlpha = edgeRt.highlightEdgeNonMatchAlpha;
    cfg.isDark = this.isDarkTheme();
    cfg.showEdgeLabels = this.panel.showEdgeLabels;
    cfg.edgeLayerMode = this.panel.edgeLayerMode;
    cfg.showArrows = this.panel.showArrows;
    cfg.nodeRadii = (this.panel.showArrows || this.panel.edgeCardinalityMode !== "none") ? this.getCachedNodeRadii() : null;
    cfg.worldScale = this.worldContainer?.scale?.x ?? 1;
    cfg.edgeCardinalityMode = this.panel.edgeCardinalityMode;
    cfg.cardinalityRules = this.panel.cardinalityRules;
    cfg.cardinalityRenderConfig = this.panel.cardinalityRenderConfig;
    cfg.edgeWeightThickness = this.panel.edgeWeightThickness;
    cfg.showEdgeWeightLabels = this.panel.showEdgeWeightLabels;
    const rt2 = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    // roadRouteEdges toggle: when off, suppress road network so edges draw straight
    cfg.roadNetwork = (rt2.roadRouteEdges !== false) ? this.getRoadNetwork() : null;
    cfg.clusterArrangement = this.panel.clusterArrangement;
    // Resolve coordinate system: check panel.coordinateLayout first, then infer from arrangement name
    cfg.coordinateSystem = this.panel.coordinateLayout?.system === "polar"
      ? "polar"
      : POLAR_ARRANGEMENTS.has(this.panel.clusterArrangement) ? "polar" : "cartesian";
    return cfg;
  }

  /** Draw the pathfinder path overlay on top of edges. */
  private _drawPathfinderOverlay() {
    if (this.pathfinderPath && this.pathfinderPath.length > 1) {
      const g = this.edgeGraphics!;
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
  }

  // =========================================================================
  // Tag enclosures (delegated to EnclosureRenderer)
  // =========================================================================
  drawEnclosures() {
    if (!this.enclosureGraphics) return;
    // Ring chart mode: hide enclosures
    if (this.isRingChartMode()) { this.enclosureGraphics.clear(); return; }
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
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
      groupLabelFontSize: rt.groupLabelFontSize,
      groupLabelFontWeight: rt.groupLabelFontWeight as string | undefined,
      groupLabelLetterSpacing: rt.groupLabelLetterSpacing,
      groupLabelAlpha: rt.groupLabelAlpha,
      groupLabelHullOffset: rt.groupLabelHullOffset,
      groupLabelBgAlpha: rt.groupLabelBgAlpha,
      enclosureOutlierFactor: rt.enclosureOutlierFactor,
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

    const rtSb = { ...DEFAULT_RENDER_THRESHOLDS, ...this.panel.renderThresholds };
    const worldScale = this.worldContainer?.scale.x ?? 1;
    const sbFontBase = rtSb.groupLabelFontSize ?? 12;
    const sbFontMin = rtSb.groupLabelScaleMin ?? 0.6;
    const fontSize = Math.max(sbFontBase * sbFontMin, sbFontBase / worldScale);
    const isDark = this.cachedIsDark ?? true;
    const textColor = isDark ? 0xdddddd : 0x333333;

    const minSweep = rtSb.sunburstMinArcSweep ?? 0.005;

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
        fontSize: arc.depth === 0 ? fontSize * 1.2 : fontSize,
        fill: textColor,
        fontWeight: arc.depth === 0 ? "bold" : "600",
        align: "center",
      });
      text.anchor.set(0.5, 0.5);
      text.strokeColor = 0x000000;
      text.strokeWidth = arc.depth === 0 ? 3 : 2;
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

  drawRouteLines() {
    const g = this.routeGraphics;
    if (!g) return;
    g.clear();

    const routes = this.routeData;
    if (!routes || routes.length === 0) return;
    if (!this.panel.showTimelineRoutes) return;

    const worldScale = this.worldContainer?.scale.x ?? 1;
    // Route line width: ensure at least 2px on screen
    const baseWidth = Math.max(3, 6 / Math.max(worldScale, 0.1));
    const alpha = 0.55;

    const centroids = this.clusterMeta?.clusterCentroids;
    if (!centroids) return;
    const sortedKeys = [...centroids.keys()].sort();

    // Set round line caps and joins for smooth curves
    g.setLineCap("round");
    g.setLineJoin("round");

    for (const route of routes) {
      if (route.waypoints.length < 2) continue;

      // Get group color from DEFAULT_COLORS palette
      const colorIdx = sortedKeys.indexOf(route.groupKey);
      const colorHex = DEFAULT_COLORS[(colorIdx >= 0 ? colorIdx : 0) % DEFAULT_COLORS.length];
      const color = cssColorToHex(colorHex);

      g.lineStyle(baseWidth, color, alpha);

      const pts = route.waypoints;
      g.moveTo(pts[0].x, pts[0].y);

      // Catmull-Rom to cubic Bezier conversion for smooth curves
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        // Catmull-Rom -> Bezier control points (tension = 0.5)
        const t = 0.5;
        const cp1x = p1.x + (p2.x - p0.x) / (6 * t);
        const cp1y = p1.y + (p2.y - p0.y) / (6 * t);
        const cp2x = p2.x - (p3.x - p1.x) / (6 * t);
        const cp2y = p2.y - (p3.y - p1.y) / (6 * t);

        g.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    }
  }

  // =========================================================================
  // Phantom Nodes — invisible junction points for road network
  // =========================================================================

  /**
   * Generate phantom nodes at layout pattern intersections.
   * These participate in the simulation (forces, arrangement, auto-adjustment)
   * but are never rendered (isPhantom = true, nodeR = 0).
   *
   * Polar layouts: spoke × ring intersections
   * Cartesian layouts: grid intersections
   */
  private _generatePhantomNodes(
    realNodes: GraphNode[],
    cx: number, cy: number,
  ): GraphNode[] {
    const arrangement = this.panel.clusterArrangement;
    const isPolar = POLAR_ARRANGEMENTS.has(arrangement);
    const phantoms: GraphNode[] = [];

    if (isPolar) {
      const spokeCount = Math.min(12, Math.max(8, Math.ceil(Math.sqrt(realNodes.length / 5))));
      const ringCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(realNodes.length / 10))));
      // Estimate max radius from node positions (or use viewport)
      let maxR = 0;
      for (const n of realNodes) {
        if (n.isPhantom) continue;
        const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
        if (d > maxR) maxR = d;
      }
      if (maxR < 10) maxR = 500;

      for (let ri = 1; ri <= ringCount; ri++) {
        const r = (maxR * ri) / (ringCount + 1);
        for (let si = 0; si < spokeCount; si++) {
          const theta = (si / spokeCount) * Math.PI * 2;
          phantoms.push({
            id: `__phantom_r${ri}_s${si}`,
            label: "",
            x: cx + r * Math.cos(theta),
            y: cy + r * Math.sin(theta),
            vx: 0, vy: 0,
            isPhantom: true,
          });
        }
      }
    } else {
      const gridSize = Math.min(10, Math.max(6, Math.ceil(Math.sqrt(realNodes.length / 8))));
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (const n of realNodes) {
        if (n.isPhantom) continue;
        if (n.x < xMin) xMin = n.x; if (n.x > xMax) xMax = n.x;
        if (n.y < yMin) yMin = n.y; if (n.y > yMax) yMax = n.y;
      }
      if (xMin === Infinity) { xMin = cx - 250; xMax = cx + 250; yMin = cy - 250; yMax = cy + 250; }
      const w = (xMax - xMin) || 500;
      const h = (yMax - yMin) || 500;

      for (let xi = 0; xi <= gridSize; xi++) {
        for (let yi = 0; yi <= gridSize; yi++) {
          phantoms.push({
            id: `__phantom_x${xi}_y${yi}`,
            label: "",
            x: xMin + (w * xi) / gridSize,
            y: yMin + (h * yi) / gridSize,
            vx: 0, vy: 0,
            isPhantom: true,
          });
        }
      }
    }

    return phantoms;
  }

  // =========================================================================
  // Road Network — auto-generated roads from coordinate grid lines
  // =========================================================================

  /** Ensure the road builder is initialized and return it. */
  private _ensureRoadBuilder(): RoadNetworkBuilder {
    if (!this.roadBuilder) {
      this.roadBuilder = new RoadNetworkBuilder(this as unknown as RoadNetworkHost);
    }
    return this.roadBuilder;
  }

  private _rebuildRoadNetwork(final = false) {
    this._ensureRoadBuilder().rebuild(final);
  }




  /** Compute axis-aligned bounding box from node positions */
  computeNodeBounds(nodes: GraphNode[]): { xMin: number; yMin: number; xMax: number; yMax: number } {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x; if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y; if (n.y > maxY) maxY = n.y;
    }
    return { xMin: minX, yMin: minY, xMax: maxX, yMax: maxY };
  }

  drawRoadNetwork() {
    const rb = this._ensureRoadBuilder();
    // Build road network if not finalized and not yet built
    if (!rb.finalized && !rb.trayData && this.pixiNodes.size > 0) {
      let hasPosition = false;
      for (const pn of this.pixiNodes.values()) {
        if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) { hasPosition = true; break; }
      }
      if (hasPosition) rb.rebuild();
    }

    const g = this.trayGraphics;
    if (!g) return;

    // Skip redraw if road commands are already up-to-date (perf: ~120K cmds)
    if (rb.roadDrawn && g.commands.length > 0) return;

    g.clear();

    // Use instance-level network for drawing (sparse, ~200 segments).
    // getRoadNetwork() may return a densified global cache (~60K segments)
    // which is useful for edge routing but far too heavy for visual rendering.
    const network = rb.trayData;
    if (!network || network.intersections.length === 0) return;

    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.panel.renderThresholds };
    if (!(rt.showRoadNetwork ?? false)) return;

    const isDark = this.isDarkTheme();
    const roadColor = rt.roadColor ?? (isDark ? 0x555577 : 0xaaaacc);
    const worldScale = this.worldContainer?.scale.x ?? 1;

    // LOD: roads are only meaningful at medium-to-high zoom.
    // Below 10% zoom the entire graph is visible and roads just create noise.
    const roadMinZoom = rt.roadMinZoom ?? 0.10;
    if (worldScale < roadMinZoom) return;

    // Road width: fixed in world space (no zoom scaling).
    // Roads are drawn as thin bands in world coordinates.
    const baseRoadWidth = rt.roadWidth ?? 4;

    // Alpha fades in between roadMinZoom and 2× roadMinZoom
    const baseAlpha = rt.roadAlpha ?? 0.12;
    const fadeRange = roadMinZoom * 2;
    const fadeFactor = worldScale < fadeRange
      ? (worldScale - roadMinZoom) / (fadeRange - roadMinZoom)
      : 1;
    const roadAlpha = baseAlpha * fadeFactor;

    g.setLineCap("round");
    g.setLineJoin("round");

    // --- Single pass: semi-transparent band (the "road surface") ---
    g.lineStyle(baseRoadWidth, roadColor, roadAlpha);
    for (const seg of network.segments) {
      const from = network.intersections[seg.from];
      const to = network.intersections[seg.to];
      if (!from || !to) continue;
      g.moveTo(from.x, from.y);
      for (const wp of seg.waypoints) g.lineTo(wp.x, wp.y);
      g.lineTo(to.x, to.y);
    }

    rb.roadDrawn = true;
  }

  /** Get road network for edge routing */
  getRoadNetwork(): RoadNetwork | null {
    return getBestRoadNetwork(this.roadBuilder);
  }


  // --- Guide drawing (delegated to GuideRenderer) ---

  private drawTimelineAxis(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "timeline" }>,
    lineW: number, color: number, worldScale: number,
  ) { this.guideRenderer?.drawTimelineAxis(g, cx, cy, guide, lineW, color, worldScale); }

  private drawGridLines(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "grid" }>,
    lineW: number, color: number,
  ) { this.guideRenderer?.drawGridLines(g, cx, cy, guide, lineW, color); }

  private drawTriangleOutline(
    g: CanvasGraphics, cx: number, cy: number,
    guide: Extract<ArrangementGuide, { type: "triangle" }>,
    lineW: number, color: number,
  ) { this.guideRenderer?.drawTriangleOutline(g, cx, cy, guide, lineW, color); }

  private drawCoordinateGuide(
    g: CanvasGraphics, cx: number, cy: number,
    guide: { type: "coordinate"; system: string; axis1Label?: string; axis2Label?: string; bounds?: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number }; gridInfo?: ResolvedGridInfo },
    lineW: number, color: number,
  ) { this.guideRenderer?.drawCoordinateGuide(g, cx, cy, guide, lineW, color); }

  private drawConcentricGuide(
    g: CanvasGraphics, cx: number, cy: number,
    guide: { type: "concentric"; rings: number[] },
    lineW: number, color: number,
  ) { this.guideRenderer?.drawConcentricGuide(g, cx, cy, guide, lineW, color); }

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
    // 注釈位置をワールド座標に同期
    this._updateAnnotationPositions();
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

  /**
   * Scale node world positions outward so the graph fills at least
   * minViewportUtilization of the viewport at z=1.0.
   * Called after layout computation, before autoFitView/rendering.
   */
  private ensureViewportUtilization(vpW: number, vpH: number): void {
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...(this.panel.renderThresholds ?? {}) };
    const minUtil = rt.minViewportUtilization ?? 0.10;
    if (minUtil <= 0 || this.pixiNodes.size < 2) return;

    const bbox = this._computeNodeBBox();
    const bboxW = bbox.maxX - bbox.minX;
    const bboxH = bbox.maxY - bbox.minY;
    const bboxArea = bboxW * bboxH;
    const vpArea = vpW * vpH;
    if (vpArea <= 0) return;

    const util = bboxArea / vpArea;
    if (util >= minUtil) return;

    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;

    if (bboxArea < 1) {
      // All nodes at same position -- spread in a circle
      const defaultR = Math.sqrt(vpW * vpH * minUtil) / 2;
      const nodes = Array.from(this.pixiNodes.values());
      const n = nodes.length;
      nodes.forEach((pn, i) => {
        const angle = (2 * Math.PI * i) / n;
        pn.data.x = cx + defaultR * Math.cos(angle);
        pn.data.y = cy + defaultR * Math.sin(angle);
      });
      return;
    }

    // Detect and fix degenerate (line-like) distributions
    const avgNodeR = this._computeAvgNodeRadius();
    const degenerateThreshold = avgNodeR * 4;
    this._spreadDegenerateAxis(cx, cy, vpW, vpH, bboxW, bboxH, degenerateThreshold, minUtil, vpArea);

    // Recompute bbox after degenerate fix
    const bbox2 = this._computeNodeBBox();
    const bboxArea2 = (bbox2.maxX - bbox2.minX) * (bbox2.maxY - bbox2.minY);
    const util2 = bboxArea2 / vpArea;
    if (util2 >= minUtil) return;

    const cx2 = (bbox2.minX + bbox2.maxX) / 2;
    const cy2 = (bbox2.minY + bbox2.maxY) / 2;
    const scaleFactor = this._computeViewportScaleFactor(
      bbox2.maxX - bbox2.minX, bbox2.maxY - bbox2.minY,
      minUtil, vpArea, util2,
    );
    for (const pn of this.pixiNodes.values()) {
      pn.data.x = cx2 + (pn.data.x - cx2) * scaleFactor;
      pn.data.y = cy2 + (pn.data.y - cy2) * scaleFactor;
    }
  }

  /** Compute axis-aligned bounding box of all nodes (including radius). */
  private _computeNodeBBox(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pn of this.pixiNodes.values()) {
      const r = pn.radius ?? 6;
      minX = Math.min(minX, pn.data.x - r);
      minY = Math.min(minY, pn.data.y - r);
      maxX = Math.max(maxX, pn.data.x + r);
      maxY = Math.max(maxY, pn.data.y + r);
    }
    return { minX, minY, maxX, maxY };
  }

  /** Compute average node radius across all pixiNodes. */
  private _computeAvgNodeRadius(): number {
    let sum = 0;
    for (const pn of this.pixiNodes.values()) sum += pn.radius ?? 6;
    return sum / this.pixiNodes.size;
  }

  /**
   * Spread nodes along a degenerate (near-zero) axis so the bbox becomes
   * roughly square before uniform scaling.
   */
  private _spreadDegenerateAxis(
    cx: number, cy: number, vpW: number, vpH: number,
    bboxW: number, bboxH: number, degenerateThreshold: number,
    minUtil: number, vpArea: number,
  ): void {
    if (bboxW > degenerateThreshold && bboxH < degenerateThreshold) {
      const targetH = Math.max(bboxW * 0.3, minUtil * vpArea / bboxW);
      const nodes = Array.from(this.pixiNodes.values());
      const n = nodes.length;
      nodes.forEach((pn, i) => {
        const t = n > 1 ? (i / (n - 1) - 0.5) : 0;
        pn.data.y = cy + t * targetH;
      });
    } else if (bboxH > degenerateThreshold && bboxW < degenerateThreshold) {
      const targetW = Math.max(bboxH * 0.3, minUtil * vpArea / bboxH);
      const nodes = Array.from(this.pixiNodes.values());
      const n = nodes.length;
      nodes.forEach((pn, i) => {
        const t = n > 1 ? (i / (n - 1) - 0.5) : 0;
        pn.data.x = cx + t * targetW;
      });
    }
  }

  /**
   * Compute the uniform scale factor via quadratic equation so that
   * scaled positions + constant radii meet the minUtil threshold exactly.
   */
  private _computeViewportScaleFactor(
    bboxW: number, bboxH: number,
    minUtil: number, vpArea: number, util: number,
  ): number {
    const avgR = this._computeAvgNodeRadius();
    const posSpanW = Math.max(bboxW - 2 * avgR, 1);
    const posSpanH = Math.max(bboxH - 2 * avgR, 1);
    const A = posSpanW * posSpanH;
    const B = 2 * avgR * (posSpanW + posSpanH);
    const C = 4 * avgR * avgR - minUtil * vpArea;
    const disc = B * B - 4 * A * C;
    return disc >= 0
      ? (-B + Math.sqrt(disc)) / (2 * A)
      : Math.sqrt(minUtil / util); // fallback
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

    const padding = isCardMode ? rt.autoFitCardPadding * 2 : (rt.autoFitBasePadding ?? 40);

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

    // DQ-09: Expand bounding box when enclosures are active
    // so they are not clipped at viewport edges after auto-fit.
    if (this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
      const encPad = 30; // OUTLINE_PAD + typical label height
      minX -= encPad; minY -= encPad; maxX += encPad; maxY += encPad;
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
    const pct = `${Math.round(s * 100)}%`;
    this.zoomIndicatorEl.textContent = pct;
    this._announceA11y(`Zoom: ${pct}`);
  }

  // =========================================================================
  // Control Panel UI (delegated to PanelBuilder)
  // =========================================================================
  private buildPanel() {
    if (!this.panelEl) return;
    const ctx = this._buildPanelContext();
    const cb = this._buildPanelCallbacks();
    buildPanelUI(this.panelEl, this.panel, ctx, cb);
  }

  /** Build the context object describing current graph state for the panel UI. */
  private _buildPanelContext(): PanelContext {
    return {
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
      degrees: this.degrees,
    };
  }

  /** Build the callbacks object wiring panel UI actions to graph view methods. */
  private _buildPanelCallbacks(): PanelCallbacks {
    return {
      doRender: () => { this.doRender(); this.requestSave(); },
      doRenderKeepPanel: () => { this.skipPanelRebuildCount++; this.doRender().finally(() => { this.skipPanelRebuildCount = Math.max(0, this.skipPanelRebuildCount - 1); }); this.requestSave(); },
      markDirty: () => { invalidateBundleCache(); this.markDirty(true); this.requestSave(); },
      updateForces: () => { this.updateForces(); this.requestSave(); },
      applySearch: () => this.applySearch(),
      applyTextFade: () => { this.applyTextFade(); this.requestSave(); },
      applyHover: () => { this.applyHover(); },
      applyDirectionalGravityForce: () => { this.applyNodeRulesForce(); this.requestSave(); },
      applyNodeRules: () => { this.applyNodeRulesForce(); this.applyClusterForce(); this.requestSave(); },
      applyClusterForce: (reset?: boolean) => { this.applyClusterForce(reset); this.requestSave(); },
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
      resetPanel: () => this._buildResetPanelCallback(),
      applyPreset: (preset: "simple" | "analysis" | "creative") => {
        const presets: Record<string, Partial<typeof this.panel>> = {
          simple: { showLinks: true, showTagEdges: false, showCategoryEdges: false, showSemanticEdges: false, showInheritance: false, showAggregation: false, showSimilar: false, showSibling: false, showSequence: false, colorEdgesByRelation: false, fadeEdgesByDegree: false, heatmapMode: false, showEdgeLabels: false, showArrows: false },
          analysis: { showLinks: true, showTagEdges: true, showCategoryEdges: true, showSemanticEdges: true, showInheritance: true, showAggregation: true, showSimilar: true, showSibling: true, showSequence: true, colorEdgesByRelation: true, fadeEdgesByDegree: true, heatmapMode: false, showEdgeLabels: false, showArrows: true },
          creative: { showLinks: true, showTagEdges: true, showCategoryEdges: false, showSemanticEdges: true, showInheritance: false, showAggregation: false, showSimilar: false, showSibling: false, showSequence: false, colorEdgesByRelation: true, fadeEdgesByDegree: false, heatmapMode: false, tagDisplay: "enclosure", showTagNodes: true },
        };
        const p = presets[preset];
        if (p) { Object.assign(this.panel, p); this.doRender(); this.requestSave(); }
      },
      jumpToNode: (nodeId: string) => this.jumpToNode(nodeId),
      getNodeIds: () => [...this.pixiNodes.keys()],
      recolorNodes: () => { this.recolorNodes(); this.requestSave(); },
      autoOptimize: () => this._buildAutoOptimizeCallback(),
    };
  }

  /** Execute the reset-panel action: restore defaults and re-render. */
  private _buildResetPanelCallback(): void {
    const s = this.plugin.settings;
    // createDefaultPanel() returns fresh mutable instances — no shared-reference risk
    Object.assign(this.panel, {
      ...createDefaultPanel(),
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
  }

  /** Execute the auto-optimize action: iterative overlap reduction loop. */
  private _buildAutoOptimizeCallback(): void {
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

  /** インタラクティブ凡例オーバーレイを更新（ノードカラー＋エッジ属性カラー、クリックで表示切替） */
  private updateLegend() {
    if (!this.legendEl) return;
    // showLegend が false の場合は非表示
    if (!this.panel.showLegend) {
      this.legendEl.style.display = "none";
      return;
    }
    const colorMap = this.nodeColorMap;
    const relColors = this.relationColors;
    if (colorMap.size === 0 && relColors.size === 0) {
      this.legendEl.style.display = "none";
      return;
    }
    this.legendEl.empty();
    this.legendEl.style.display = "";

    // ヘッダー（閉じるボタン付き）
    const header = this.legendEl.createDiv({ cls: "gi-legend-header" });
    header.createEl("span", { text: `${colorMap.size + relColors.size} items` });
    const closeBtn = header.createEl("span", { cls: "gi-legend-close", text: "\u00d7" });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.panel.showLegend = false;
      if (this.legendEl) this.legendEl.style.display = "none";
      this.requestSave();
    });

    const body = this.legendEl.createDiv({ cls: "gi-legend-body" });
    // エントリ数が多い場合は折りたたみ
    if (colorMap.size + relColors.size > 10) body.style.display = "none";
    header.addEventListener("click", () => {
      const hidden = body.style.display === "none";
      body.style.display = hidden ? "" : "none";
    });

    // --- ノードカラーセクション ---
    if (colorMap.size > 0 && this.panel.colorNodesByCategory) {
      const nodeSection = body.createDiv({ cls: "gi-legend-section" });
      nodeSection.createEl("div", { cls: "gi-legend-section-title", text: t("legend.nodeColors") });
      for (const [label, cssColor] of colorMap) {
        const row = nodeSection.createDiv({ cls: "gi-legend-item gi-legend-item-clickable" });
        const dot = row.createDiv({ cls: "gi-legend-color-dot" });
        dot.style.background = cssColor;
        row.createEl("span", { cls: "gi-legend-label", text: label.replace(/^tag:/, "#") });
        // クリックで検索フィルターにトグル
        row.addEventListener("click", () => {
          const field = label.startsWith("tag:") ? label : `category:${label}`;
          if (this.panel.searchQuery === field) {
            this.panel.searchQuery = "";
          } else {
            this.panel.searchQuery = field;
          }
          this.rawData = null;
          this.doRender();
          this.requestSave();
        });
      }
    }

    // --- エッジ属性カラーセクション ---
    if (relColors.size > 0 && this.panel.colorEdgesByRelation) {
      const edgeSection = body.createDiv({ cls: "gi-legend-section" });
      edgeSection.createEl("div", { cls: "gi-legend-section-title", text: t("legend.edgeRelations") });
      // エッジタイプ→パネルプロパティのマッピング
      const edgeTypeToggles: Record<string, { key: keyof PanelState; label: string }> = {
        "link": { key: "showLinks", label: "Links" },
        "tag": { key: "showTagEdges", label: "Tags" },
        "category": { key: "showCategoryEdges", label: "Category" },
        "semantic": { key: "showSemanticEdges", label: "Semantic" },
        "inheritance": { key: "showInheritance", label: "Inheritance" },
        "aggregation": { key: "showAggregation", label: "Aggregation" },
        "similar": { key: "showSimilar", label: "Similar" },
        "sibling": { key: "showSibling", label: "Sibling" },
        "sequence": { key: "showSequence", label: "Sequence" },
      };

      for (const [rel, cssColor] of relColors) {
        const row = edgeSection.createDiv({ cls: "gi-legend-item gi-legend-item-clickable" });
        const dot = row.createDiv({ cls: "gi-legend-color-dot" });
        dot.style.background = cssColor;
        const labelEl = row.createEl("span", { cls: "gi-legend-label", text: rel });
        // エッジタイプに対応するトグルがあれば、クリックで表示切替
        const toggle = edgeTypeToggles[rel.toLowerCase()];
        if (toggle) {
          const isVisible = this.panel[toggle.key] as boolean;
          if (!isVisible) {
            row.addClass("gi-legend-item-disabled");
            labelEl.textContent = `${rel} ${t("legend.hidden")}`;
          }
          row.addEventListener("click", () => {
            const current = this.panel[toggle.key] as boolean;
            (this.panel as Record<string, unknown>)[toggle.key] = !current;
            invalidateBundleCache();
            this.markDirty(true);
            this.updateLegend();
            this.buildPanel();
            this.requestSave();
          });
        }
      }
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
      source: edgeSourceId(e),
      target: edgeTargetId(e),
    }));

    ({ nodes, edges } = this._filterLocalGraph(nodes, edges));
    ({ nodes, edges } = this._filterNodeVisibility(nodes, edges));
    ({ nodes, edges } = this._filterByQuery(nodes, edges));

    const nodeSet = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

    return this._applyGroupCollapse({ nodes, edges });
  }

  /** BFS N-hop filter for local graph mode. */
  private _filterLocalGraph(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (!this.panel.localGraphCenter) return { nodes, edges };
    const centerId = nodes.find(n => n.filePath === this.panel.localGraphCenter || n.id === this.panel.localGraphCenter)?.id;
    if (!centerId) return { nodes, edges };

    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adj.has(e.source)) adj.set(e.source, new Set());
      if (!adj.has(e.target)) adj.set(e.target, new Set());
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
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
    return {
      nodes: nodes.filter(n => reachable.has(n.id)),
      edges: edges.filter(e => reachable.has(e.source) && reachable.has(e.target)),
    };
  }

  /** Filter nodes by orphan/existing/attachment/tag visibility settings. */
  private _filterNodeVisibility(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
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

    if (!this.panel.showTags) {
      nodes = nodes.filter((n) => !n.isTag);
      edges = edges.filter((e) => e.type !== EDGE_TYPE_HAS_TAG);
    }

    if (!this.panel.showTagNodes || this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
      nodes = nodes.filter((n) => !n.isTag);
      edges = edges.filter((e) => e.type !== EDGE_TYPE_HAS_TAG);
    }

    if (!this.panel.showSimilar) edges = edges.filter((e) => e.type !== EDGE_TYPE_SIMILAR);

    return { nodes, edges };
  }

  /** Apply dataview and search query filters. */
  private _filterByQuery(nodes: GraphNode[], edges: GraphEdge[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
    if (this.panel.dataviewQuery.trim()) {
      const matchingPaths = queryDataviewPages(this.app, this.panel.dataviewQuery.trim());
      if (matchingPaths.size > 0) {
        nodes = filterNodesByDataview(nodes, matchingPaths, this.panel.showTagNodes);
      }
    }

    const raw = this.panel.searchQuery;
    const remaining = raw.replace(/hop:[^:,]+:\d+/gi, "").replace(/,/g, " ").trim();
    if (remaining) {
      const searchExpr = parseQueryExpr(remaining);
      if (searchExpr) {
        nodes = nodes.filter((n) => evaluateExpr(searchExpr, n));
      }
    }

    return { nodes, edges };
  }

  /** Apply group collapse (fold groups into super nodes). */
  private _applyGroupCollapse(data: GraphData): GraphData {
    let result = data;
    if (this.panel.groupBy && this.panel.groupBy !== "none") {
      this.originalGraphData = { nodes: [...result.nodes], edges: [...result.edges] };
      const groupOpts: GroupOptions = {
        minSize: this.panel.groupMinSize,
        filter: this.panel.groupFilter,
      };
      const groups = this.resolveGroupByField(result.nodes, groupOpts);
      if (this.panel.collapsedGroups.size === 0 && groups.length > 0) {
        for (const g of groups) this.panel.collapsedGroups.add(g.key);
      }
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

    this._savePositionsForTransition();

    this.stopSim();
    this.stopOrbitAnimation();
    this.cachedBgColor = null; // invalidate bg color cache on re-render
    this.cachedLabelColor = null;

    // Capture baseline nodeSize for zoom-correlated sizing (once per render cycle)
    this._zoomBaseNodeSize = this.panel.nodeSize;

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

    this._buildGraphMetadata(gd);
    this._buildTagMembership(gd);

    const nodeR = this._buildNodeRadiusFn();
    const nodeColor = this._buildNodeColorFn(gd);

    // ==== Force layout ====
    if (this.currentLayout === LAYOUT_FORCE) {
      this._setupForceLayout(gd, nodeR, nodeColor, cx, cy, W, H);
      return;
    }

    // ==== Static layouts ====
    this.setStatus("Computing layout...");
    await yieldFrame(); if (signal.aborted) return;

    const ld = this._computeStaticLayout(gd, cx, cy, W, H);
    if (!ld) return;
    if (signal.aborted) return;

    await this._finalizeStaticLayout(ld, nodeR, nodeColor, W, H, signal);
  }

  /** Save current node positions for animated transition, including super node member spreading. */
  private _savePositionsForTransition(): void {
    this.savedPositions.clear();
    // Also track super node -> member mapping so expanded members get
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
  }

  /** Compute degrees, colors, relation colors, and adjacency from graph data. */
  private _buildGraphMetadata(gd: GraphData): void {
    this.degrees = computeNodeDegrees(gd.nodes, gd.edges);
    const colorMap = assignNodeColors(gd.nodes, this.plugin.settings.colorField);
    this.nodeColorMap = colorMap;
    this.relationColors = buildRelationColorMap(gd.edges);
    this.adj = buildAdj(gd);
  }

  /** Build tag membership map for enclosure mode and clear stale enclosure labels. */
  private _buildTagMembership(gd: GraphData): void {
    this.tagMembership.clear();
    this.tagRelPairsCache.clear();
    this.overlapCache.counts.clear();
    this.overlapCache.frame = 0;
    if (this.panel.tagDisplay === TAG_DISPLAY_ENCLOSURE) {
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
        if (e.type !== EDGE_TYPE_INHERITANCE && e.type !== EDGE_TYPE_AGGREGATION) continue;
        const src = edgeSourceId(e);
        const tgt = edgeTargetId(e);
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
  }

  /** Build the node radius function based on current panel settings. */
  private _buildNodeRadiusFn(): (n: GraphNode) => number {
    const baseSize = this.panel.nodeSize;
    const degs = this.degrees;
    return (n: GraphNode) => n.isPhantom ? 0 : nodeRadius(baseSize, degs.get(n.id) || 0);
  }

  /** Build the node color function considering groups, heatmap, and category coloring. */
  private _buildNodeColorFn(gd: GraphData): (n: GraphNode) => number {
    const colorMap = this.nodeColorMap;
    const defaultNodeColor = cssColorToHex(DEFAULT_COLORS[0]);

    // Heatmap: precompute max degree for normalization
    let maxDegree = 1;
    if (this.panel.heatmapMode) {
      for (const n of gd.nodes) {
        const d = this.degrees.get(n.id) || 0;
        if (d > maxDegree) maxDegree = d;
      }
    }
    // Heatmap color ramp: cold (blue 0x3b82f6) -> warm (red 0xef4444)
    const heatmapColor = (degree: number): number => {
      const t = Math.min(1, degree / maxDegree);
      const r = Math.round(59 + t * (239 - 59));   // 0x3b -> 0xef
      const g = Math.round(130 - t * (130 - 68));   // 0x82 -> 0x44
      const b = Math.round(246 - t * (246 - 68));   // 0xf6 -> 0x44
      return (r << 16) | (g << 8) | b;
    };

    // ノードルールのカラーオーバーライドをプリコンパイル
    const nodeRulesWithColor = (this.panel.nodeRules ?? []).filter(r => r.color);

    return (n: GraphNode): number => {
      // NodeRule カラーオーバーライドが最優先
      for (const rule of nodeRulesWithColor) {
        if (matchesFilter(n, rule.query)) return cssColorToHex(rule.color!);
      }
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
  }

  /** Set up force-directed layout: create simulation, apply forces, and wire tick/end events. */
  private _setupForceLayout(
    gd: GraphData,
    nodeR: (n: GraphNode) => number,
    nodeColor: (n: GraphNode) => number,
    cx: number, cy: number, W: number, H: number,
  ): void {
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

    // Generate phantom junction nodes for road network routing.
    // Phantom nodes participate in the same simulation as real nodes
    // but are excluded from rendering (isPhantom = true).
    const phantomNodes = this._generatePhantomNodes(gd.nodes, cx, cy);
    if (phantomNodes.length > 0) {
      gd.nodes.push(...phantomNodes);
    }

    this.createPixiNodes(gd.nodes, nodeR, nodeColor);
    this.computeSortRanks();

    let tickCount = 0;
    this.simulation = this.layoutController.createForceSimulation(gd.nodes, gd.edges, cx, cy);

    // Apply directional gravity rules from settings + panel + node rules
    this.applyNodeRulesForce();

    // Apply enclosure repulsion force (push tag groups apart)
    this.applyEnclosureRepulsionForce();

    // Apply cluster arrangement force if configured
    this.applyClusterForce();

    // Hide world until 6-step pipeline completes (simulation end).
    // This prevents partial/in-progress layout from being displayed.
    if (this.worldContainer) this.worldContainer.visible = false;

    this.simulation.on("tick", () => {
        // Do NOT call markDirty() during simulation — rendering is deferred
        // until all 6 steps are complete (simulation "end" event).
        tickCount++;
      });

    this.setStatus(`${gd.nodes.length} nodes — simulating...`);
    this.simulation.on("end", () => {
      // 6-step pipeline complete — reveal world and render final positions
      if (this.worldContainer) this.worldContainer.visible = true;
      this.setStatus(`${gd.nodes.length} nodes`);
      const wrap = this.canvasWrap;
      // Ensure minimum viewport utilization regardless of autoFit
      {
        let evW = wrap?.clientWidth ?? 0;
        let evH = wrap?.clientHeight ?? 0;
        // Fallback to renderer size if DOM element has zero dimensions
        if (evW <= 0 || evH <= 0) {
          const renderer = this.pixiApp?.renderer;
          evW = renderer?.width ?? 800;
          evH = renderer?.height ?? 600;
        }
        if (evW > 0 && evH > 0) {
          this.ensureViewportUtilization(evW, evH);
        }
      }
      // Rebuild road network now that final node positions are available
      this._rebuildRoadNetwork(true);
      // Force full redraw now that all positions are final
      this.updatePositions(true);
      if (this.panel.autoFit && wrap) {
        this.autoFitView(wrap.clientWidth, wrap.clientHeight);
      }
      this.markDirty(true);
      // Re-cull labels after simulation settles to fix overlap
      // caused by node positions changing during simulation
      this.updateLabelsForZoom();
    });

    this.updateLegend();
    this.startRenderLoop();
    if (this.skipPanelRebuildCount === 0) this.buildPanel();
    // 注釈を再描画
    this._renderAllAnnotations();
  }

  /** Compute a static layout (concentric, tree, arc, sunburst, timeline) and return the result. */
  private _computeStaticLayout(
    gd: GraphData, cx: number, cy: number, W: number, H: number,
  ): GraphData | null {
    let ld: GraphData;
    this.shells = [];
    this.nodeShellIndex.clear();
    try {
      const sortCmp = this.buildSortComparator(gd.nodes, gd.edges);
      const nsMap = this.computeNodeSpacingMap(gd.nodes);
      switch (this.currentLayout) {
        case LAYOUT_CONCENTRIC: {
          const result = applyConcentricLayout(gd, { centerX: cx, centerY: cy, minRadius: this.panel.concentricMinRadius, radiusStep: this.panel.concentricRadiusStep, sortComparator: sortCmp, nodeSpacingMap: nsMap });
          ld = result.data;
          this.shells = result.shells;
          this.shells.forEach((s, i) => s.nodeIds.forEach((id) => this.nodeShellIndex.set(id, i)));
          break;
        }
        case LAYOUT_TREE: ld = applyTreeLayout(gd, { startX: cx, startY: 40, sortComparator: sortCmp, nodeSpacingMap: nsMap }); break;
        case LAYOUT_ARC: ld = applyArcLayout(gd, { centerX: cx, centerY: cy, radius: Math.min(W, H) * 0.4, sortComparator: sortCmp }); break;
        case LAYOUT_SUNBURST: {
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
        case LAYOUT_TIMELINE: {
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
      return null;
    }
    return ld;
  }

  /** Create nodes, build transition animation, and finalize the static layout render. */
  private async _finalizeStaticLayout(
    ld: GraphData,
    nodeR: (n: GraphNode) => number,
    nodeColor: (n: GraphNode) => number,
    W: number, H: number,
    signal: AbortSignal,
  ): Promise<void> {
    this.graphEdges = ld.edges;
    invalidateBundleCache();
    this.setStatus(`Creating ${ld.nodes.length} nodes...`);
    await yieldFrame(); if (signal.aborted) return;

    this.createPixiNodes(ld.nodes, nodeR, nodeColor);
    this.computeSortRanks();
    await yieldFrame(); if (signal.aborted) return;

    // Ensure viewport utilization BEFORE building transition data,
    // so the expanded positions become the animation target (toX/toY).
    this.ensureViewportUtilization(W, H);

    // updatePositions + autoFitView BEFORE layoutTransition.start(),
    // because start() immediately resets data.x/y = fromX/fromY.
    // If we wait until after, autoFitView would compute bbox from
    // the old saved positions instead of the new layout targets.
    this.updatePositions(true);
    this.autoFitView(W, H);

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

    this._postRenderUpdate(ld);
  }

  /** Update status, legend, search, and panel after static layout render completes. */
  private _postRenderUpdate(ld: GraphData): void {
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
    if (this.currentLayout === LAYOUT_CONCENTRIC && this.shells.length > 0) {
      if (this.panel.orbitAutoRotate) this.startOrbitAnimation();
    }
    // 注釈を再描画
    this._renderAllAnnotations();
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
  private applyClusterForce(resetPositions = true) {
    this.layoutController.applyClusterForce(resetPositions);
    // Schedule auto-fit after arrangement changes so layout fills the viewport
    if (resetPositions && this.canvasWrap) {
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

  /** Get positions of nodes belonging to a specific group (for convex hull placement). */
  private getGroupNodePositions(groupKey: string): { x: number; y: number }[] {
    const ncm = this.clusterMeta?.nodeClusterMap;
    if (!ncm) return [];
    const result: { x: number; y: number }[] = [];
    for (const [nodeId, cluster] of ncm) {
      if (cluster !== groupKey) continue;
      const pn = this.pixiNodes.get(nodeId);
      if (pn) result.push({ x: pn.data.x, y: pn.data.y });
    }
    return result;
  }

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
    const files = this.app.vault.getMarkdownFiles();
    for (const f of files) {
      const cache = this.app.metadataCache.getFileCache(f);
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
    this._isKeyboardFocused = true;
    this.setHighlightedNodeId(nodeId);
    this.applyHover();
    this.panToNode(nodeId);
    // Announce focused node to screen readers
    this._announceA11y(this.pixiNodes.get(nodeId)?.data.label ?? nodeId);
  }

  /** Push a short message into the aria-live region for screen reader users. */
  private _announceA11y(msg: string) {
    if (!this._ariaLiveEl) return;
    // Toggle text to force re-announcement even if same content
    this._ariaLiveEl.textContent = "";
    requestAnimationFrame(() => { if (this._ariaLiveEl) this._ariaLiveEl.textContent = msg; });
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

  /**
   * 現在のグラフをPNGとしてキャプチャし、アクティブなノートに埋め込む。
   * ツールバーボタンおよびコマンドパレットから呼び出される。
   */
  public async embedGraphInNote(): Promise<void> {
    // アクティブなエディタを取得
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!mdView || !mdView.editor) {
      showToast(t("toast.embedNoEditor"), 5000);
      return;
    }
    if (!this.pixiApp) {
      showToast(t("toast.embedNoGraph"), 5000);
      return;
    }

    try {
      const { exportGraphAsPng } = await import("../utils/export-png");
      const blob = await exportGraphAsPng(this.pixiApp);

      // タイムスタンプ付きファイル名を生成
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

      // Obsidianの添付ファイルフォルダ設定を尊重してパスを決定
      const activeFile = mdView.file;
      const attachPath = (this.app.vault as any).getAvailablePath
        ? (this.app.vault as any).getAvailablePath(
            ((this.app.vault as any).config?.attachmentFolderPath || "") + "/" + filename.replace(".png", ""),
            "png"
          )
        : filename;

      // バイナリデータとしてvaultに保存
      const buffer = await blob.arrayBuffer();
      await this.app.vault.createBinary(attachPath, buffer);

      // エディタのカーソル位置にwikilink画像を挿入
      const editor = mdView.editor;
      const basename = attachPath.replace(/^.*\//, "");
      editor.replaceSelection(`![[${basename}]]\n`);

      showToast(t("toast.embedSuccess"));
    } catch (e) {
      console.error("Graph Island: embed failed", e);
      showToast(t("toast.embedFailed"), 5000);
    }
  }

  /**
   * キャンバスをPNG Blobとしてエクスポートする公開メソッド。
   * コマンドパレットからの呼び出し用。
   */
  public async exportCanvasAsBlob(): Promise<Blob | null> {
    if (!this.pixiApp) return null;
    const { exportGraphAsPng } = await import("../utils/export-png");
    return exportGraphAsPng(this.pixiApp);
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

    // Highlight the target node via ephemeral hover (NOT search query,
    // which would silently re-filter data on next render)
    this.setHighlightedNodeId(nodeId);
    this.applyHover();
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

  private applyTextFade() { this.labelManager?.applyTextFade(); }

  /** Called by InteractionManager after zoom changes to update label visibility */
  updateLabelsForZoom() { this.labelManager?.updateLabelsForZoom(); }

  /** Delegate to LabelManager for rotated label culling (also called from drawSunburstLabels, drawClusterSunburstArcs) */
  cullOverlappingRotatedLabels(labels: Map<string, CanvasText>) { this.labelManager?.cullOverlappingRotatedLabels(labels); }

  /** Called by InteractionManager (debounced) when zoom changes.
   *  Adjusts effective node size based on zoom level and recalculates layout. */
  onZoomLayoutUpdate(zoom: number) {
    if (!this.simulation) return;
    const t = this.panel.renderThresholds ?? {};
    const zoomAdapt = t.zoomNodeSizeAdapt ?? DEFAULT_RENDER_THRESHOLDS.zoomNodeSizeAdapt;
    if (!zoomAdapt) return;

    // Effective node size: counter-scale to maintain consistent screen-space size.
    // At zoom=1 use panel.nodeSize as-is; at zoom<1 enlarge, at zoom>1 shrink.
    // Dampened by sqrt to avoid extreme size changes.
    const baseSize = this._zoomBaseNodeSize ?? this.panel.nodeSize;
    const factor = 1 / Math.sqrt(Math.max(0.02, zoom));
    this.panel.nodeSize = Math.max(
      t.minNodeRadius ?? DEFAULT_RENDER_THRESHOLDS.minNodeRadius,
      Math.round(baseSize * factor * 10) / 10,
    );

    // Update visual radii of all existing PixiNodes to reflect new nodeSize
    this.recalcNodeRadii();

    // Recalculate layout without position reset (smooth transition)
    this.applyClusterForce(false);
    this.markDirty();
  }

  /** Stores the original nodeSize before zoom-adaptation (set once on first render) */
  private _zoomBaseNodeSize: number | null = null;

  /** Recalculate and apply visual radii for all PixiNodes based on current panel.nodeSize. */
  private recalcNodeRadii() {
    const ns = this.panel.nodeSize;
    const rt = { ...DEFAULT_RENDER_THRESHOLDS, ...this.panel.renderThresholds };
    const maxR = rt.maxNodeRadius > 0 ? rt.maxNodeRadius : Infinity;
    const minR = rt.minNodeRadius;
    for (const pn of this.pixiNodes.values()) {
      pn.radius = effectiveRadius(pn.data, ns, this.degrees.get(pn.data.id) || 0, maxR, minR);
    }
  }

  /** Compute sort ranks for all PixiNodes. Rank 0 = most prominent. */
  private computeSortRanks() {
    const cmp = this.layoutController?.buildSortComparator(
      Array.from(this.pixiNodes.values()).map(pn => pn.data),
      this.graphEdges
    );
    if (!cmp) {
      // No sort rules -- rank by degree (default behavior)
      const sorted = Array.from(this.pixiNodes.values())
        .sort((a, b) => (this.degrees.get(b.data.id) ?? 0) - (this.degrees.get(a.data.id) ?? 0));
      sorted.forEach((pn, i) => { pn.sortRank = i; });
      return;
    }
    const sorted = Array.from(this.pixiNodes.values())
      .sort((a, b) => cmp(a.data, b.data));
    sorted.forEach((pn, i) => { pn.sortRank = i; });
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
    if (this.currentLayout !== LAYOUT_SUNBURST) return;
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

  /** Sunburst label container for category names */
  private sunburstLabelContainer: CanvasContainer | null = null;
  private sunburstLabels: Map<string, CanvasText> = new Map();
  private clusterSunburstLabelContainer: CanvasContainer | null = null;
  private clusterSunburstLabels: Map<string, CanvasText> = new Map();

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

    const rtSb2 = { ...DEFAULT_RENDER_THRESHOLDS, ...this.panel.renderThresholds };
    const worldScale = this.worldContainer?.scale.x ?? 1;
    const sbFontBase2 = rtSb2.groupLabelFontSize ?? 12;
    const sbFontMin2 = rtSb2.groupLabelScaleMin ?? 0.6;
    const fontSize = Math.max(sbFontBase2 * sbFontMin2, sbFontBase2 / worldScale);
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


}

