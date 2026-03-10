import { ItemView, WorkspaceLeaf, Platform, TFile, setIcon } from "obsidian";
import * as PIXI from "pixi.js";
import type { Simulation } from "d3-force";
import type GraphViewsPlugin from "../main";
import type { GraphData, GraphNode, GraphEdge, LayoutType, ShellInfo, DirectionalGravityRule, GroupPreset, ClusterGroupRule, NodeRule } from "../types";
import { DEFAULT_COLORS } from "../types";
import { evaluateExpr, parseQueryExpr, serializeExpr } from "../utils/query-expr";
import { buildGraphFromVault, assignNodeColors, buildRelationColorMap, buildSunburstData } from "../parsers/metadata-parser";
import { applyConcentricLayout, repositionShell } from "../layouts/concentric";
import { applyTreeLayout } from "../layouts/tree";
import { applyArcLayout } from "../layouts/arc";
import { applySunburstLayout, type SunburstArc as LayoutSunburstArc } from "../layouts/sunburst";
import { computeNodeDegrees } from "../analysis/graph-analysis";
import { yieldFrame, buildAdj, cssColorToHex } from "../utils/graph-helpers";
import { buildPanel as buildPanelUI, type PanelState, type PanelCallbacks, type PanelContext, DEFAULT_PANEL } from "./PanelBuilder";
import { drawEdges as drawEdgesImpl, drawEdgeLabels as drawEdgeLabelsImpl, type EdgeDrawConfig } from "./EdgeRenderer";
import { t } from "../i18n";
import { drawEnclosures as drawEnclosuresImpl, type OverlapCache, type EnclosureConfig } from "./EnclosureRenderer";
import type { ClusterMetadata } from "../layouts/cluster-force";
import { InteractionManager, type PixiNode, type InteractionHost } from "./InteractionManager";
import { RenderPipeline, darkenColor, type RenderHost } from "./RenderPipeline";
import { LayoutController, type LayoutHost } from "./LayoutController";
import { Minimap, type MinimapHost } from "./Minimap";
import { LayoutTransition } from "./LayoutTransition";
import { groupNodesByTag, groupNodesByCategory, collapseGroup, type GroupSpec } from "../utils/node-grouping";
import { queryDataviewPages, filterNodesByDataview } from "../utils/dataview-source";
import { getNodeShape, drawShape, drawShapeAt } from "../utils/node-shapes";

/**
 * Derive a single ClusterGroupRule from a query string + recursive flag.
 * Supports wildcard patterns like "tag:*" → groupBy: "tag".
 */
function deriveOneRule(queryText: string, recursive: boolean): ClusterGroupRule | null {
  if (!queryText.trim()) return null;
  const expr = parseQueryExpr(queryText.trim());
  if (!expr) return null;
  if (expr.type === "leaf" && expr.value === "*") {
    const fieldToGroupBy: Record<string, "tag" | "backlinks" | "node_type"> = {
      tag: "tag",
      category: "node_type",
      backlinks: "backlinks",
    };
    const groupBy = fieldToGroupBy[expr.field];
    if (groupBy) return { groupBy, recursive };
  }
  return { groupBy: "tag", recursive };
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
  private panel: PanelState = { ...JSON.parse(JSON.stringify(DEFAULT_PANEL)), collapsedGroups: new Set<string>() };
  private panelEl: HTMLElement | null = null;
  private simulation: Simulation<GraphNode, GraphEdge> | null = null;
  private highlightedNodeId: string | null = null;

  // PIXI
  private pixiApp: PIXI.Application | null = null;
  private worldContainer: PIXI.Container | null = null;
  private edgeGraphics: PIXI.Graphics | null = null;
  private orbitGraphics: PIXI.Graphics | null = null;
  private enclosureGraphics: PIXI.Graphics | null = null;
  private enclosureLabelContainer: PIXI.Container | null = null;
  private sunburstGraphics: PIXI.Graphics | null = null;
  private edgeLabelContainer: PIXI.Container | null = null;
  private nodeCircleBatch: PIXI.Graphics | null = null;
  private pixiNodes: Map<string, PixiNode> = new Map();
  private canvasWrap: HTMLElement | null = null;
  private graphEdges: GraphEdge[] = [];
  private degrees: Map<string, number> = new Map();
  private adj: Map<string, Set<string>> = new Map();
  private relationColors: Map<string, string> = new Map();
  private nodeColorMap: Map<string, string> = new Map();
  /** tag name → set of file node IDs that have this tag */
  private tagMembership: Map<string, Set<string>> = new Map();
  private enclosureLabels: Map<string, PIXI.Text> = new Map();
  private overlapCache: OverlapCache = { frame: 0, counts: new Map() };
  /** Cluster metadata for edge bundling (updated when cluster force is applied) */
  private clusterMeta: ClusterMetadata | null = null;
  /** Cached tag relationship pairs for fast lookup */
  private tagRelPairsCache: Set<string> = new Set();

  // Interaction manager (owns pointer events, drag, pan, hover, marquee, shell rotation)
  private interactionManager: InteractionManager | null = null;

  // Render pipeline (owns render loop, PIXI node creation, batch drawing)
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
  private cachedLabelColor: number | null = null;
  private cachedIsDark: boolean | null = null;
  /** Ephemeral highlight set from side-panel hover (null = not active) */
  private ephemeralHighlight: Set<string> | null = null;

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

  // Marquee button reference (for toolbar toggle styling)
  private marqueeBtnEl: HTMLElement | null = null;

  // Sunburst layout arc data for PIXI rendering
  private sunburstLayoutArcs: LayoutSunburstArc[] = [];
  private sunburstCenter = { x: 0, y: 0 };

  constructor(leaf: WorkspaceLeaf, plugin: GraphViewsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentLayout = plugin.settings.defaultLayout;
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
    return {
      ...sup,
      layout: this.currentLayout,
      panel: JSON.parse(JSON.stringify(this.panel)),  // deep clone for safe serialization
    };
  }

  async setState(state: any, result: any): Promise<void> {
    await super.setState(state, result);
    if (state.layout && typeof state.layout === "string") {
      this.currentLayout = state.layout as LayoutType;
    }
    if (state.panel && typeof state.panel === "object") {
      // Deep-clone the saved panel to avoid aliasing with Obsidian internals
      const saved = JSON.parse(JSON.stringify(state.panel)) as Partial<PanelState>;
      for (const key of Object.keys(DEFAULT_PANEL) as (keyof PanelState)[]) {
        if (key in saved && saved[key] !== undefined) {
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
    zoomInBtn.addEventListener("click", () => {
      this.zoomBy(1.3);
    });

    const zoomOutBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(zoomOutBtn, "zoom-out");
    zoomOutBtn.setAttribute("aria-label", t("toolbar.zoomOut"));
    zoomOutBtn.addEventListener("click", () => {
      this.zoomBy(1 / 1.3);
    });

    const marqueeBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(marqueeBtn, "box-select");
    marqueeBtn.setAttribute("aria-label", t("toolbar.marquee"));
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
    exportBtn.addEventListener("click", async () => {
      if (!this.pixiApp || !this.worldContainer) return;
      exportBtn.disabled = true;
      const origLabel = exportBtn.getAttribute("aria-label") ?? "";
      exportBtn.setAttribute("aria-label", t("toolbar.exporting"));
      try {
        const { exportGraphAsPng, downloadBlob, makeExportFilename } = await import("../utils/export-png");
        const blob = await exportGraphAsPng(this.pixiApp, this.worldContainer);
        downloadBlob(blob, makeExportFilename());
      } catch (e) {
        console.error("Graph Island: PNG export failed", e);
      } finally {
        exportBtn.disabled = false;
        exportBtn.setAttribute("aria-label", origLabel);
      }
    });

    const panelToggle = toolbar.createEl("button", { cls: "graph-settings-btn" });
    setIcon(panelToggle, "settings");
    panelToggle.setAttribute("aria-label", t("toolbar.graphSettings"));
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

    // --- Control Panel ---
    this.panelEl = main.createDiv({ cls: "graph-panel is-hidden" });
    this.buildPanel();

    // --- Resize observer for PIXI canvas ---
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvasArea);

    // Wake render loop when this leaf becomes active again (e.g. tab switch)
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf !== this.leaf) return;
        if (this.pixiApp) {
          // Just wake the render loop & resize — don't recreate PIXI
          this.markDirty();
        }
      })
    );

    // Theme / CSS snippet change — invalidate color caches and update PIXI background
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
  // PIXI lifecycle
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
    // Clean up enclosure labels before PIXI destroy (they reference PIXI objects)
    for (const lbl of this.enclosureLabels.values()) {
      try { lbl.destroy(); } catch { /* already destroyed */ }
    }
    this.enclosureLabels.clear();
    // Clean up sunburst labels
    for (const lbl of this.sunburstLabels.values()) {
      try { lbl.destroy(); } catch { /* already destroyed */ }
    }
    this.sunburstLabels.clear();
    this.sunburstLayoutArcs = [];
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
    this.spatialGrid.clear();
    if (this.pixiApp) {
      try {
        this.pixiApp.destroy(true, { children: true, texture: true });
      } catch {
        // PIXI internal state may already be partially torn down
      }
      this.pixiApp = null;
    }
  }

  private handleResize() {
    if (!this.pixiApp || !this.canvasWrap) return;
    const rect = this.canvasWrap.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 400;
    this.pixiApp.renderer.resize(w, h);
    this.markDirty();
  }

  private initPixi(width: number, height: number): PIXI.Application | null {
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

      const app = new PIXI.Application({
        width,
        height,
        backgroundColor: bgColor,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      this.canvasWrap!.appendChild(app.view as HTMLCanvasElement);
      const canvas = app.view as HTMLCanvasElement;
      canvas.style.width = "100%";
      canvas.style.height = "100%";

      this.pixiApp = app;

      // World container (for zoom/pan)
      const world = new PIXI.Container();
      app.stage.addChild(world);
      this.worldContainer = world;

      // Orbit ring layer (drawn behind edges)
      const orbitGfx = new PIXI.Graphics();
      world.addChild(orbitGfx);
      this.orbitGraphics = orbitGfx;

      // Sunburst arc guide lines (drawn behind enclosures)
      const sunburstGfx = new PIXI.Graphics();
      world.addChild(sunburstGfx);
      this.sunburstGraphics = sunburstGfx;

      // Enclosure layer (tag enclosures, drawn behind edges)
      const enclosureGfx = new PIXI.Graphics();
      world.addChild(enclosureGfx);
      this.enclosureGraphics = enclosureGfx;

      // Edge layer (single Graphics object — batch drawn)
      const edgeGfx = new PIXI.Graphics();
      world.addChild(edgeGfx);
      this.edgeGraphics = edgeGfx;

      // Edge label layer (PIXI.Text objects — on top of edges, below nodes)
      const edgeLabelCont = new PIXI.Container();
      world.addChild(edgeLabelCont);
      this.edgeLabelContainer = edgeLabelCont;

      // Batch node circle layer — draws all non-highlighted circles in one draw call
      const batchGfx = new PIXI.Graphics();
      world.addChild(batchGfx);
      this.nodeCircleBatch = batchGfx;

      // Enclosure label container — on top of nodes so labels are visible & hoverable
      const labelContainer = new PIXI.Container();
      world.addChild(labelContainer);
      this.enclosureLabelContainer = labelContainer;

    // Set up interaction handling (pointer events, drag, pan, hover, marquee)
    this.interactionManager?.detach();
    this.interactionManager = new InteractionManager(this, canvas, world);

    // Set up render pipeline (render loop, PIXI node creation, batch drawing)
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
      if (this.minimap) {
        this.minimap.setVisible(this.panel.showMinimap);
        this.minimap.draw();
      }
    };

      return app;
    } catch (err) {
      console.error("[Graph Island] Failed to initialize PIXI renderer:", err);
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
  getPixiApp(): PIXI.Application | null { return this.pixiApp; }
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
    if (this.panel.groupBy !== "none" && this.originalGraphData) {
      const groups = this.panel.groupBy === "tag"
        ? groupNodesByTag(this.originalGraphData.nodes)
        : groupNodesByCategory(this.originalGraphData.nodes);
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
  getWorldContainer(): PIXI.Container | null { return this.worldContainer; }
  getNodeCircleBatch(): PIXI.Graphics | null { return this.nodeCircleBatch; }
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
  setClusterMeta(meta: ClusterMetadata | null) { this.clusterMeta = meta; }
  getNodeShapeRules() { return this.panel.nodeShapeRules; }

  // =========================================================================
  // Zoom & Hit testing
  // =========================================================================

  /** Rebuild the spatial hash grid from current node positions */
  rebuildSpatialGrid() {
    this.spatialGrid.clear();
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
  // Hover highlight (PIXI)
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

    for (const pn of nodesToUpdate) {
      if (!hId) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, false);
        if (pn.hoverLabel) { pn.gfx.removeChild(pn.hoverLabel); pn.hoverLabel.destroy(); pn.hoverLabel = null; }
      } else if (curSet.has(pn.data.id)) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, true);
        if (!pn.label && !pn.hoverLabel) {
          const hl = new PIXI.Text(pn.data.label, {
            fontSize: 11, fill: this.getLabelColor(),
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          });
          hl.x = pn.radius + 2;
          hl.y = -6;
          hl.resolution = 2;
          pn.gfx.addChild(hl);
          pn.hoverLabel = hl;
        }
      } else {
        pn.gfx.alpha = 0.12;
        if (pn.hoverLabel) { pn.gfx.removeChild(pn.hoverLabel); pn.hoverLabel.destroy(); pn.hoverLabel = null; }
      }
    }

    this.prevHighlightSet = curSet;
    this.redrawNodeBatch();
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

    // Update PIXI renderer background color
    if (this.pixiApp) {
      const el = this.canvasWrap ?? this.containerEl;
      const bgStr = getComputedStyle(el).getPropertyValue("--graph-background").trim()
        || getComputedStyle(el).getPropertyValue("--background-primary").trim();
      if (bgStr) {
        try { this.pixiApp.renderer.background.color = cssColorToHex(bgStr); } catch { /* ignore */ }
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
  drawEdges() {
    if (!this.edgeGraphics) return;
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

    const cfg: EdgeDrawConfig = {
      showLinks: this.panel.showLinks,
      showTagEdges: this.panel.showTagEdges,
      showCategoryEdges: this.panel.showCategoryEdges,
      showSemanticEdges: this.panel.showSemanticEdges,
      showInheritance: this.panel.showInheritance,
      showAggregation: this.panel.showAggregation,
      showTagNodes: this.panel.showTagNodes,
      showSimilar: this.panel.showSimilar,
      showSibling: this.panel.showSibling,
      showSequence: this.panel.showSequence,
      colorEdgesByRelation: this.panel.colorEdgesByRelation,
      isArcLayout: this.currentLayout === "arc",
      highlightedNodeId: effectiveHighlightId,
      highlightSet: effectiveHighlightSet,
      bgColor: this.cachedBgColor,
      relationColors: this.relationColors,
      fadeByDegree: this.panel.fadeEdgesByDegree,
      degrees: this.degrees,
      maxDegree: maxDeg,
      totalEdgeCount: this.graphEdges.length,
      // Edge bundling: pass live cluster centroids computed from current node positions
      nodeClusterMap: this.clusterMeta?.nodeClusterMap ?? null,
      clusterCentroids: this.computeLiveCentroids(),
      clusterRadii: this.clusterMeta?.clusterRadii ?? null,
      bundleStrength: this.panel.edgeBundleStrength,
      isDark: this.isDarkTheme(),
      showEdgeLabels: this.panel.showEdgeLabels,
    };
    const resolvePos = (ref: string | object) =>
      typeof ref === "object" ? (ref as any) : this.pixiNodes.get(ref as string)?.data;
    drawEdgesImpl(
      this.edgeGraphics,
      this.graphEdges,
      resolvePos,
      cfg,
    );
    // Draw edge labels into dedicated container (on top of edges, below nodes)
    if (this.edgeLabelContainer) {
      drawEdgeLabelsImpl(
        this.edgeLabelContainer,
        this.graphEdges,
        resolvePos,
        cfg,
      );
    }
  }

  // =========================================================================
  // Tag enclosures (delegated to EnclosureRenderer)
  // =========================================================================
  drawEnclosures() {
    if (!this.enclosureGraphics) return;
    const cfg: EnclosureConfig = {
      tagDisplay: this.panel.tagDisplay,
      tagMembership: this.tagMembership,
      nodeColorMap: this.nodeColorMap,
      tagRelPairsCache: this.tagRelPairsCache,
      resolvePos: (id) => {
        const pn = this.pixiNodes.get(id);
        return pn ? { x: pn.data.x, y: pn.data.y, radius: pn.radius } : undefined;
      },
      worldScale: this.worldContainer?.scale.x ?? 1,
      totalNodeCount: this.pixiNodes.size,
      enclosureMinRatio: this.plugin.settings.enclosureMinRatio,
      onTagHover: (tag) => {
        if (tag) {
          const members = this.tagMembership.get(tag);
          if (members) this.applyEphemeralHighlight(new Set(members));
        } else {
          this.applyEphemeralHighlight(null);
        }
      },
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

    // Build parent group → color index map (sub-groups inherit parent color)
    const parentColorIdx = new Map<string, number>();
    let colorIdx = 0;
    for (const arc of sunburstArcs) {
      if (arc.groupKey === "__inner__") continue;
      const parent = arc.groupKey.replace(/::.*$/, "");
      if (!parentColorIdx.has(parent)) {
        parentColorIdx.set(parent, colorIdx++);
      }
    }
    // Map any group key to its parent's color index
    const getColorIdx = (key: string) => {
      const parent = key.replace(/::.*$/, "");
      return parentColorIdx.get(parent) ?? 0;
    };

    const worldScale = this.worldContainer?.scale.x ?? 1;
    const lineW = Math.max(0.8, 1.5 / worldScale);
    const thinW = Math.max(0.4, 0.8 / worldScale);

    // --- 1. Draw light filled backgrounds per group sector ---
    // Find max outer radius per group for the full sector fill
    const groupMaxR = new Map<string, number>();
    const groupSector = new Map<string, { start: number; end: number; rMin: number }>();
    for (const arc of sunburstArcs) {
      if (arc.groupKey === "__inner__") continue;
      const prev = groupMaxR.get(arc.groupKey) ?? 0;
      if (arc.rOuter > prev) groupMaxR.set(arc.groupKey, arc.rOuter);
      if (!groupSector.has(arc.groupKey)) {
        groupSector.set(arc.groupKey, { start: arc.startAngle, end: arc.endAngle, rMin: arc.rInner });
      }
    }

    // --- 1. Draw light filled backgrounds per parent-group sector ---
    for (const [groupKey, maxR] of groupMaxR) {
      const ci = getColorIdx(groupKey);
      const css = DEFAULT_COLORS[ci % DEFAULT_COLORS.length];
      const color = cssColorToHex(css);
      const sector = groupSector.get(groupKey)!;
      const { cx, cy } = sunburstArcs.find(a => a.groupKey === groupKey)!;

      // Slightly stronger fill for sub-groups to show hierarchy
      const isSubGroup = groupKey.includes("::");
      const fillAlpha = isSubGroup ? 0.08 : 0.05;
      gfx.beginFill(color, fillAlpha);
      this.drawArcPath(gfx, cx, cy, sector.rMin, maxR, sector.start, sector.end);
      gfx.endFill();
    }

    // --- 2. Draw ring outlines (concentric arcs) + radial boundaries ---
    for (const arc of sunburstArcs) {
      const { cx, cy, rInner, rOuter, startAngle, endAngle, groupKey } = arc;
      if (rOuter <= 0 || endAngle - startAngle < 0.001) continue;

      const isInner = groupKey === "__inner__";
      const isSubGroup = groupKey.includes("::");
      const ci = isInner ? -1 : getColorIdx(groupKey);
      const css = isInner ? "" : DEFAULT_COLORS[ci % DEFAULT_COLORS.length];
      const color = isInner ? 0x888888 : cssColorToHex(css);
      const alpha = isInner ? 0.2 : (isSubGroup ? 0.25 : 0.4);

      // Concentric arcs (outer and inner boundaries)
      gfx.lineStyle(thinW, color, alpha);
      this.drawArcLine(gfx, cx, cy, rOuter, startAngle, endAngle);
      this.drawArcLine(gfx, cx, cy, rInner, startAngle, endAngle);

      // Radial sector boundaries (thicker for parent groups, thinner for sub-groups)
      const radW = isSubGroup ? thinW : lineW;
      const radAlpha = isSubGroup ? alpha * 0.6 : alpha;
      gfx.lineStyle(radW, color, radAlpha);
      gfx.moveTo(cx + rInner * Math.cos(startAngle), cy + rInner * Math.sin(startAngle));
      gfx.lineTo(cx + rOuter * Math.cos(startAngle), cy + rOuter * Math.sin(startAngle));
      gfx.moveTo(cx + rInner * Math.cos(endAngle), cy + rInner * Math.sin(endAngle));
      gfx.lineTo(cx + rOuter * Math.cos(endAngle), cy + rOuter * Math.sin(endAngle));
    }
  }

  /** Draw an arc line (stroke only, no fill) */
  private drawArcLine(
    gfx: PIXI.Graphics,
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
    gfx: PIXI.Graphics,
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
    this.drawSunburstLayoutArcs();
    this.drawEdges();
  }

  // =========================================================================
  // Auto-fit view
  // =========================================================================
  private autoFitView(W: number, H: number) {
    const world = this.worldContainer;
    if (!world || this.pixiNodes.size === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pn of this.pixiNodes.values()) {
      const r = pn.radius;
      if (pn.data.x - r < minX) minX = pn.data.x - r;
      if (pn.data.y - r < minY) minY = pn.data.y - r;
      if (pn.data.x + r > maxX) maxX = pn.data.x + r;
      if (pn.data.y + r > maxY) maxY = pn.data.y + r;
    }

    const bw = maxX - minX + 40;
    const bh = maxY - minY + 40;
    const sc = Math.min(W / bw, H / bh, 1.5);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    world.scale.set(sc);
    world.x = W / 2 - cx * sc;
    world.y = H / 2 - cy * sc;
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
    const topLeft = world.toLocal(new PIXI.Point(sx, sy), stage);
    const bottomRight = world.toLocal(new PIXI.Point(sx + sw, sy + sh), stage);

    const worldW = bottomRight.x - topLeft.x;
    const worldH = bottomRight.y - topLeft.y;
    const cx = (topLeft.x + bottomRight.x) / 2;
    const cy = (topLeft.y + bottomRight.y) / 2;

    const sc = Math.min(W / worldW, H / worldH, 10);
    world.scale.set(sc);
    world.x = W / 2 - cx * sc;
    world.y = H / 2 - cy * sc;
    this.markDirty();
  }

  private zoomBy(factor: number) {
    const world = this.worldContainer;
    const wrap = this.canvasWrap;
    if (!world || !wrap) return;
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const worldPos = world.toLocal(new PIXI.Point(cx, cy), this.pixiApp!.stage);
    const s = Math.max(0.02, Math.min(10, world.scale.x * factor));
    world.scale.set(s);
    const newScreen = world.toGlobal(worldPos);
    world.x += cx - newScreen.x;
    world.y += cy - newScreen.y;
    this.markDirty();
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
    };
    const cb: PanelCallbacks = {
      doRender: () => { this.doRender(); this.requestSave(); },
      markDirty: () => { this.markDirty(); this.requestSave(); },
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
      restartSimulation: (alpha: number) => {
        if (this.simulation) { this.simulation.alpha(alpha).restart(); this.wakeRenderLoop(); }
      },
      collectFieldSuggestions: () => {
        return ["label", "tag", "category", "path", "id", "isTag"];
      },
      collectValueSuggestions: (field: string) => {
        const values = new Set<string>();
        for (const pn of this.pixiNodes.values()) {
          const n = pn.data;
          switch (field) {
            case "tag": (n.tags ?? []).forEach(t => values.add(t)); break;
            case "category": if (n.category) values.add(n.category); break;
            case "label": values.add(n.label); break;
            case "path": if (n.filePath) values.add(n.filePath); break;
            case "file": if (n.filePath) values.add(n.filePath.replace(/^.*\//, "").replace(/\.md$/, "")); break;
            case "id": values.add(n.id); break;
          }
        }
        return [...values].sort();
      },
      saveGroupPreset: () => {
        // Reverse-derive commonQueries from clusterGroupRules for preset backward compat
        const derivedQueries = this.panel.clusterGroupRules.map(r => {
          const queryMap: Record<string, string> = { tag: "tag:*", node_type: "category:*", backlinks: "backlinks:*" };
          return { query: queryMap[r.groupBy] ?? "tag:*", recursive: r.recursive };
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
      applyPreset: (preset: "simple" | "analysis" | "creative") => {
        // Start from defaults, then overlay preset-specific settings
        Object.assign(this.panel, { ...DEFAULT_PANEL });
        this.panel.collapsedGroups = new Set<string>();
        switch (preset) {
          case "simple":
            Object.assign(this.panel, {
              showLinks: true, showTagEdges: false, showCategoryEdges: false, showSemanticEdges: false,
              showInheritance: false, showAggregation: false, showSimilar: false,
              colorEdgesByRelation: false, colorNodesByCategory: false,
              showTagNodes: false, scaleByDegree: false,
            });
            break;
          case "analysis":
            Object.assign(this.panel, {
              showLinks: true, showTagEdges: true, showCategoryEdges: true, showSemanticEdges: true,
              showInheritance: true, showAggregation: true, showSimilar: true,
              colorEdgesByRelation: true, colorNodesByCategory: true,
              scaleByDegree: true, fadeEdgesByDegree: true,
              showTagNodes: true, tagDisplay: "node" as const,
            });
            break;
          case "creative":
            Object.assign(this.panel, {
              showLinks: true, showTagEdges: true, showCategoryEdges: true, showSemanticEdges: true,
              showInheritance: false, showAggregation: false, showSimilar: false,
              colorEdgesByRelation: true, colorNodesByCategory: true,
              showTagNodes: true, tagDisplay: "enclosure" as const,
              clusterGroupRules: [{ groupBy: "tag" as const, recursive: false }],
            });
            break;
        }
        this.buildPanel();
        this.rawData = null;
        this.doRender();
        this.requestSave();
      },
      jumpToNode: (nodeId: string) => this.jumpToNode(nodeId),
      getNodeIds: () => [...this.pixiNodes.keys()],
    };
    buildPanelUI(this.panelEl, this.panel, ctx, cb);
  }

  // =========================================================================
  // Status
  // =========================================================================
  private setStatus(t: string) { if (this.statusEl) this.statusEl.textContent = t; }

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

    const nodeSet = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));

    // Apply node grouping (collapse groups into super nodes)
    let result: GraphData = { nodes, edges };
    if (this.panel.groupBy !== "none") {
      this.originalGraphData = { nodes: [...result.nodes], edges: [...result.edges] };
      const groups = this.panel.groupBy === "tag"
        ? groupNodesByTag(result.nodes)
        : groupNodesByCategory(result.nodes);
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
    for (const [id, pn] of this.pixiNodes) {
      this.savedPositions.set(id, { x: pn.data.x, y: pn.data.y });
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

    // Init PIXI
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
    const nodeColor = (n: GraphNode): number => {
      // Manual group overrides take priority
      for (const grp of this.panel.groups) {
        if (grp.expression && evaluateExpr(grp.expression, n)) return cssColorToHex(grp.color);
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
      this.simulation.on("end", () => this.setStatus(`${gd.nodes.length} nodes`));

      this.startRenderLoop();
      this.buildPanel();
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
    this.setStatus(`Creating ${ld.nodes.length} nodes...`);
    await yieldFrame(); if (signal.aborted) return;

    this.createPixiNodes(ld.nodes, nodeR, nodeColor);
    await yieldFrame(); if (signal.aborted) return;

    this.setStatus(`Drawing ${ld.edges.length} edges...`);
    await yieldFrame(); if (signal.aborted) return;

    this.updatePositions(true);
    this.autoFitView(W, H);

    this.setStatus(`${ld.nodes.length} nodes, ${ld.edges.length} edges`);
    this.startRenderLoop();
    this.applySearch();
    this.applyTextFade();

    // Rebuild panel — relationColors and other data are now available
    this.stopOrbitAnimation();
    this.buildPanel();
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
  private applyClusterForce() { this.layoutController.applyClusterForce(); }
  private buildSortComparator(nodes: GraphNode[], edges: GraphEdge[]) { return this.layoutController.buildSortComparator(nodes, edges); }
  private computeNodeSpacingMap(nodes: GraphNode[]) { return this.layoutController.computeNodeSpacingMap(nodes); }
  private computeLiveCentroids() { return this.layoutController.computeLiveCentroids(this.clusterMeta); }

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

    const hasText = textParts.length > 0;
    const searchExpr = hasText ? parseQueryExpr(trimmed) : null;
    const hasFilter = hasText || hopSet !== null;

    for (const pn of this.pixiNodes.values()) {
      if (!hasFilter) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, false);
        continue;
      }

      const textMatch = searchExpr !== null && evaluateExpr(searchExpr, pn.data);
      const hopMatch = hopSet !== null && hopSet.has(pn.data.id);
      const match = (hasText && hopSet !== null) ? (textMatch && hopMatch)
                  : hasText ? textMatch
                  : hopMatch;

      if (match) {
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
    const opacity = 1 - this.panel.textFadeThreshold;
    for (const pn of this.pixiNodes.values()) {
      if (pn.label) pn.label.alpha = opacity;
    }
    this.markDirty();
  }

  // =========================================================================
  // Sunburst layout arc rendering (PIXI)
  // =========================================================================

  /**
   * Draw sunburst layout arcs behind nodes using PIXI.Graphics.
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

  /** Sunburst label container for category names */
  private sunburstLabelContainer: PIXI.Container | null = null;
  private sunburstLabels: Map<string, PIXI.Text> = new Map();

  private drawSunburstLabels(arcs: LayoutSunburstArc[], cx: number, cy: number) {
    if (!this.sunburstLabelContainer && this.worldContainer) {
      this.sunburstLabelContainer = new PIXI.Container();
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

      const text = new PIXI.Text(arc.name, {
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
  }

}

