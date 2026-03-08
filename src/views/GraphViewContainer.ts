import { ItemView, WorkspaceLeaf, Platform, TFile, setIcon } from "obsidian";
import * as PIXI from "pixi.js";
import { select as d3select } from "d3-selection";
import { zoom as d3zoom } from "d3-zoom";
import { arc as d3arc } from "d3-shape";
import { forceSimulation, forceManyBody, forceCenter, forceLink, type Simulation, type Force } from "d3-force";
import type GraphViewsPlugin from "../main";
import type { GraphData, GraphNode, GraphEdge, LayoutType, ShellInfo, DirectionalGravityRule } from "../types";
import { DEFAULT_COLORS } from "../types";
import { resolveDirection, matchesFilter } from "../layouts/force";
import { buildGraphFromVault, assignNodeColors, buildRelationColorMap, buildSunburstData } from "../parsers/metadata-parser";
import { applyConcentricLayout, repositionShell } from "../layouts/concentric";
import { applyTreeLayout } from "../layouts/tree";
import { applyArcLayout } from "../layouts/arc";
import { computeSunburstArcs } from "../layouts/sunburst";
import { computeNodeDegrees } from "../analysis/graph-analysis";
import { yieldFrame, buildAdj, cssColorToHex } from "../utils/graph-helpers";
import { buildPanel as buildPanelUI, type PanelState, type PanelCallbacks, type PanelContext, DEFAULT_PANEL } from "./PanelBuilder";
import { drawEdges as drawEdgesImpl, type EdgeDrawConfig } from "./EdgeRenderer";
import { drawEnclosures as drawEnclosuresImpl, type OverlapCache, type EnclosureConfig } from "./EnclosureRenderer";

export const VIEW_TYPE_GRAPH = "graph-view";

const TICK_SKIP = 4;
const EDGE_REDRAW_SKIP = 1; // redraw edges every dirty frame so they track node movement

// ---------------------------------------------------------------------------
// PIXI node wrapper
// ---------------------------------------------------------------------------
interface PixiNode {
  data: GraphNode;
  gfx: PIXI.Container;
  circle: PIXI.Graphics;
  label: PIXI.Text | null;
  hoverLabel: PIXI.Text | null;
  radius: number;
  color: number;
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------
export class GraphViewContainer extends ItemView {
  plugin: GraphViewsPlugin;
  private currentLayout: LayoutType;
  private rawData: GraphData | null = null;
  private ac: AbortController | null = null;
  private statusEl: HTMLElement | null = null;
  private panel: PanelState = { ...DEFAULT_PANEL };
  private panelEl: HTMLElement | null = null;
  private simulation: Simulation<GraphNode, GraphEdge> | null = null;
  private highlightedNodeId: string | null = null;

  // PIXI
  private pixiApp: PIXI.Application | null = null;
  private worldContainer: PIXI.Container | null = null;
  private edgeGraphics: PIXI.Graphics | null = null;
  private orbitGraphics: PIXI.Graphics | null = null;
  private enclosureGraphics: PIXI.Graphics | null = null;
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
  /** Cached tag relationship pairs for fast lookup */
  private tagRelPairsCache: Set<string> = new Set();

  // Interaction state
  private draggedNode: PixiNode | null = null;
  private dragOffset = { x: 0, y: 0 };
  private hasDragged = false;
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private worldStart = { x: 0, y: 0 };

  // Idle frame optimization
  private idleFrames = 0;
  private needsRedraw = true;
  private _tickerBound = false;
  private edgeRedrawCounter = 0;
  private cachedBgColor: number | null = null;

  // Last hover pointer position (for page-preview popover)
  private lastHoverEvent: PointerEvent | null = null;

  // Resize observer
  private resizeObserver: ResizeObserver | null = null;

  // Concentric shells (for rotation & radius adjustment)
  private shells: ShellInfo[] = [];
  private nodeShellIndex: Map<string, number> = new Map();
  private rotatingShellIdx: number | null = null;
  private rotateStartAngle = 0;
  private rotateStartOffset = 0;

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

  // Sunburst SVG fallback
  private svgEl: SVGSVGElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: GraphViewsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentLayout = plugin.settings.defaultLayout;
    this.panel.nodeSize = plugin.settings.nodeSize;
  }

  getViewType() { return VIEW_TYPE_GRAPH; }
  getDisplayText() { return "Graph Views"; }
  getIcon() { return "git-fork"; }

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
    fitBtn.setAttribute("aria-label", "全体俯瞰");
    fitBtn.addEventListener("click", () => {
      if (!this.canvasWrap) return;
      const W = this.canvasWrap.clientWidth;
      const H = this.canvasWrap.clientHeight;
      this.autoFitView(W, H);
      this.markDirty();
    });

    const zoomInBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(zoomInBtn, "zoom-in");
    zoomInBtn.setAttribute("aria-label", "ズームイン");
    zoomInBtn.addEventListener("click", () => {
      this.zoomBy(1.3);
    });

    const zoomOutBtn = zoomGroup.createEl("button", { cls: "graph-toolbar-btn" });
    setIcon(zoomOutBtn, "zoom-out");
    zoomOutBtn.setAttribute("aria-label", "ズームアウト");
    zoomOutBtn.addEventListener("click", () => {
      this.zoomBy(1 / 1.3);
    });

    const panelToggle = toolbar.createEl("button", { cls: "graph-settings-btn" });
    setIcon(panelToggle, "settings");
    panelToggle.setAttribute("aria-label", "グラフ設定");
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
    // canvasWrap is emptied by initPixi / drawSunburstSVG, so nodeInfoEl
    // lives in a sibling wrapper that won't be cleared.
    const canvasArea = main.createDiv({ cls: "ngp-canvas-area" });
    this.canvasWrap = canvasArea.createDiv({ cls: "graph-svg-wrap" });

    // --- Node Info Overlay (floating, survives canvas rebuilds) ---
    this.nodeInfoEl = canvasArea.createDiv({ cls: "ngp-node-info" });
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

    this.doRender();
  }

  async onClose() {
    this.stopOrbitAnimation();
    this.stopSim();
    this.ac?.abort();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.destroyPixi();
    this.svgEl = null;
    this.statusEl = null;
    this.panelEl = null;
    this.nodeInfoEl = null;
    this.canvasWrap = null;
    this.lastHoverEvent = null;
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
    this.cancelDeferredBatch();
    if (this._tickerBound && this.pixiApp) {
      this.pixiApp.ticker.remove(this.renderTick, this);
      this._tickerBound = false;
    }
    // Clean up enclosure labels before PIXI destroy (they reference PIXI objects)
    for (const lbl of this.enclosureLabels.values()) {
      try { lbl.destroy(); } catch { /* already destroyed */ }
    }
    this.enclosureLabels.clear();
    this.pixiNodes.clear();
    this.worldContainer = null;
    this.edgeGraphics = null;
    this.orbitGraphics = null;
    this.enclosureGraphics = null;
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

  private initPixi(width: number, height: number): PIXI.Application {
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
      antialias: false,
      resolution: 1,
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

    // Enclosure layer (tag enclosures, drawn behind edges)
    const enclosureGfx = new PIXI.Graphics();
    world.addChild(enclosureGfx);
    this.enclosureGraphics = enclosureGfx;

    // Edge layer (single Graphics object — batch drawn)
    const edgeGfx = new PIXI.Graphics();
    world.addChild(edgeGfx);
    this.edgeGraphics = edgeGfx;

    // Batch node circle layer — draws all non-highlighted circles in one draw call
    const batchGfx = new PIXI.Graphics();
    world.addChild(batchGfx);
    this.nodeCircleBatch = batchGfx;

    this.setupInteraction(canvas, world);

    return app;
  }

  // =========================================================================
  // Zoom & Pan & Hit testing
  // =========================================================================
  private setupInteraction(canvas: HTMLCanvasElement, world: PIXI.Container) {
    const app = this.pixiApp!;

    // Wheel zoom
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const worldPos = world.toLocal(new PIXI.Point(mx, my), app.stage);
      world.scale.x *= scaleFactor;
      world.scale.y *= scaleFactor;
      // Clamp scale
      const s = Math.max(0.02, Math.min(10, world.scale.x));
      world.scale.set(s);
      const newScreenPos = world.toGlobal(worldPos);
      world.x += mx - newScreenPos.x;
      world.y += my - newScreenPos.y;

      this.markDirty();
    }, { passive: false });

    // Pointer down
    canvas.addEventListener("pointerdown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const worldPt = world.toLocal(new PIXI.Point(mx, my), app.stage);

      const hit = this.hitTestNode(worldPt.x, worldPt.y);
      if (hit) {
        // Concentric: rotate shell instead of dragging individual node
        if (this.currentLayout === "concentric" && this.shells.length > 0) {
          const shellIdx = this.nodeShellIndex.get(hit.data.id);
          if (shellIdx !== undefined && shellIdx > 0) {
            const shell = this.shells[shellIdx];
            this.rotatingShellIdx = shellIdx;
            this.rotateStartAngle = Math.atan2(worldPt.y - shell.centerY, worldPt.x - shell.centerX);
            this.rotateStartOffset = shell.angleOffset;
            this.hasDragged = false;
            return;
          }
        }
        this.draggedNode = hit;
        this.hasDragged = false;
        this.dragOffset.x = worldPt.x - hit.data.x;
        this.dragOffset.y = worldPt.y - hit.data.y;
        if (this.simulation) {
          hit.data.fx = hit.data.x;
          hit.data.fy = hit.data.y;
          this.simulation.alphaTarget(0.3).restart();
        }
      } else {
        this.isPanning = true;
        this.panStart = { x: mx, y: my };
        this.worldStart = { x: world.x, y: world.y };
      }
    });

    // Pointer move
    canvas.addEventListener("pointermove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (this.rotatingShellIdx !== null) {
        this.hasDragged = true;
        const worldPt = world.toLocal(new PIXI.Point(mx, my), app.stage);
        const shell = this.shells[this.rotatingShellIdx];
        const currentAngle = Math.atan2(worldPt.y - shell.centerY, worldPt.x - shell.centerX);
        shell.angleOffset = this.rotateStartOffset + (currentAngle - this.rotateStartAngle);
        const nodeMap = new Map<string, GraphNode>();
        for (const pn of this.pixiNodes.values()) nodeMap.set(pn.data.id, pn.data);
        repositionShell(shell, nodeMap);
        this.markDirty();
      } else if (this.draggedNode) {
        this.hasDragged = true;
        const worldPt = world.toLocal(new PIXI.Point(mx, my), app.stage);
        const nx = worldPt.x - this.dragOffset.x;
        const ny = worldPt.y - this.dragOffset.y;
        this.draggedNode.data.x = nx;
        this.draggedNode.data.y = ny;
        if (this.simulation) {
          this.draggedNode.data.fx = nx;
          this.draggedNode.data.fy = ny;
        }
        this.markDirty();
      } else if (this.isPanning) {
        world.x = this.worldStart.x + (mx - this.panStart.x);
        world.y = this.worldStart.y + (my - this.panStart.y);
        this.markDirty();
      } else {
        // Hover
        this.lastHoverEvent = e;
        const worldPt = world.toLocal(new PIXI.Point(mx, my), app.stage);
        const hit = this.hitTestNode(worldPt.x, worldPt.y);
        const newId = hit?.data.id ?? null;
        if (newId !== this.highlightedNodeId) {
          this.highlightedNodeId = newId;
          this.applyHover();
          this.markDirty(true);
        }
      }
    });

    // Pointer up
    canvas.addEventListener("pointerup", () => {
      if (this.rotatingShellIdx !== null) {
        this.rotatingShellIdx = null;
        return;
      }
      if (this.draggedNode) {
        if (this.simulation) {
          this.draggedNode.data.fx = null;
          this.draggedNode.data.fy = null;
          this.simulation.alphaTarget(0);
        }
        // Click (no drag) to open file
        if (!this.hasDragged && this.draggedNode.data.filePath) {
          if (Platform.isMobile) {
            // On mobile: first tap = highlight, second tap = open
            if (this.highlightedNodeId === this.draggedNode.data.id) {
              this.app.workspace.openLinkText(this.draggedNode.data.filePath, "", false);
            } else {
              this.highlightedNodeId = this.draggedNode.data.id;
              this.applyHover();
              this.markDirty(true);
            }
          } else {
            this.app.workspace.openLinkText(this.draggedNode.data.filePath, "", false);
          }
        }
        this.draggedNode = null;
      }
      this.isPanning = false;
    });

    // Pointer leave
    canvas.addEventListener("pointerleave", () => {
      if (!Platform.isMobile && this.highlightedNodeId) {
        this.highlightedNodeId = null;
        this.applyHover();
        this.markDirty(true);
      }
    });

    // Double-click to open file (desktop)
    if (!Platform.isMobile) {
      canvas.addEventListener("dblclick", (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const worldPt = world.toLocal(new PIXI.Point(mx, my), app.stage);
        const hit = this.hitTestNode(worldPt.x, worldPt.y);
        if (hit?.data.filePath) {
          this.app.workspace.openLinkText(hit.data.filePath, "", false);
        }
      });
    }
  }

  /** Rebuild the spatial hash grid from current node positions */
  private rebuildSpatialGrid() {
    this.spatialGrid.clear();
    const cs = this.spatialCellSize;
    for (const pn of this.pixiNodes.values()) {
      const key = `${Math.floor(pn.data.x / cs)},${Math.floor(pn.data.y / cs)}`;
      let cell = this.spatialGrid.get(key);
      if (!cell) { cell = []; this.spatialGrid.set(key, cell); }
      cell.push(pn);
    }
  }

  private hitTestNode(wx: number, wy: number): PixiNode | null {
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



  // =========================================================================
  // Hover highlight (PIXI)
  // =========================================================================
  private applyHover() {
    const hId = this.highlightedNodeId;
    const neighbors = hId ? this.adj.get(hId) : null;

    // Build current highlight set
    const curSet = new Set<string>();
    if (hId) {
      curSet.add(hId);
      if (neighbors) for (const nb of neighbors) curSet.add(nb);
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
            fontSize: 11, fill: 0x999999,
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
    this.triggerPagePreview();
    this.updateNodeInfo();
  }

  /**
   * Trigger Obsidian's core page-preview popover for the hovered node.
   *
   * Page Preview requires:
   *   - source: a registered view type (we use "markdown" which is always allowed)
   *   - targetEl: a DOM element at the pointer position for anchor placement
   */
  private triggerPagePreview() {
    const hId = this.highlightedNodeId;
    if (!hId) return;

    const pn = this.pixiNodes.get(hId);
    if (!pn?.data.filePath) return;

    const ev = this.lastHoverEvent;
    if (!ev) return;

    // Create a temporary anchor element at the pointer position.
    // Page Preview uses targetEl's bounding rect to position the popover.
    const anchor = this.contentEl.createEl("span");
    anchor.style.cssText = `position:fixed;left:${ev.clientX}px;top:${ev.clientY}px;width:1px;height:1px;pointer-events:none;`;
    // Clean up anchor after popover has had time to read its position
    setTimeout(() => anchor.remove(), 200);

    this.app.workspace.trigger("hover-link", {
      event: ev,
      source: "preview",
      hoverParent: this,
      targetEl: anchor,
      linktext: pn.data.filePath,
      sourcePath: "",
    });
  }

  /**
   * Notify the dedicated NodeDetailView side-pane about the hovered node.
   */
  private notifyDetailPane(node: GraphNode | null) {
    // Emit a custom event that NodeDetailView listens for
    this.app.workspace.trigger("graph-views:hover-node", node, this.adj, this.pixiNodes, this.degrees);
  }

  /**
   * Update the floating node-info overlay with hovered node details + linked nodes.
   */
  private updateNodeInfo() {
    const el = this.nodeInfoEl;
    if (!el) return;

    const hId = this.highlightedNodeId;
    if (!hId) {
      el.style.display = "none";
      this.notifyDetailPane(null);
      return;
    }

    const pn = this.pixiNodes.get(hId);
    if (!pn) { el.style.display = "none"; this.notifyDetailPane(null); return; }
    const node = pn.data;

    this.notifyDetailPane(node);

    el.empty();
    el.style.display = "";

    // -- Node summary --
    const nameEl = el.createEl("div", { cls: "ngp-ni-name" });
    nameEl.textContent = node.label;
    if (node.isTag) {
      nameEl.createEl("span", { cls: "ngp-ni-badge", text: "tag" });
    }

    if (node.category) {
      el.createEl("div", { cls: "ngp-ni-meta", text: `カテゴリ: ${node.category}` });
    }
    if (node.tags && node.tags.length > 0) {
      el.createEl("div", { cls: "ngp-ni-meta", text: `タグ: ${node.tags.map(t => "#" + t).join(" ")}` });
    }

    const deg = this.degrees.get(hId) || 0;
    el.createEl("div", { cls: "ngp-ni-meta", text: `リンク数: ${deg}` });

    // -- Linked node list --
    const neighbors = this.adj.get(hId);
    if (neighbors && neighbors.size > 0) {
      el.createEl("div", { cls: "ngp-ni-section-title", text: "リンク中のノード" });
      const list = el.createEl("ul", { cls: "ngp-ni-list" });
      for (const nbId of neighbors) {
        const nbPn = this.pixiNodes.get(nbId);
        if (!nbPn) continue;
        const li = list.createEl("li", { cls: "ngp-ni-list-item" });
        const link = li.createEl("span", { cls: "ngp-ni-link", text: nbPn.data.label });
        if (nbPn.data.isTag) {
          li.createEl("span", { cls: "ngp-ni-badge", text: "tag" });
        }
        if (nbPn.data.filePath) {
          link.addEventListener("click", () => {
            this.app.workspace.openLinkText(nbPn.data.filePath!, "", false);
          });
        }
      }
    }
  }

  private drawNodeCircle(pn: PixiNode, highlight: boolean) {
    pn.circle.clear();
    if (highlight) {
      // Highlighted nodes use individual Graphics so they appear on top of the batch
      pn.circle.visible = true;
      pn.circle.lineStyle(2.5, 0x6366f1, 1);
      pn.circle.beginFill(pn.color);
      pn.circle.drawCircle(0, 0, pn.radius);
      pn.circle.endFill();
    } else {
      // Non-highlighted nodes are drawn by the batch layer
      pn.circle.visible = false;
    }
  }

  /**
   * Redraw all non-highlighted node circles in a single batch Graphics.
   * Reduces GPU draw calls from 1000+ to 1.
   */
  private redrawNodeBatch() {
    const g = this.nodeCircleBatch;
    if (!g) return;
    g.clear();
    const hId = this.highlightedNodeId;
    const neighbors = hId ? this.adj.get(hId) : null;
    for (const pn of this.pixiNodes.values()) {
      // Skip highlighted nodes — they use their own individual Graphics
      if (hId && (pn.data.id === hId || neighbors?.has(pn.data.id))) continue;
      g.beginFill(pn.color, hId ? 0.12 : 1);
      g.drawCircle(pn.data.x, pn.data.y, pn.radius);
      g.endFill();
    }
  }

  // =========================================================================
  // Draw orbit rings (concentric circles)
  // =========================================================================
  private drawOrbitRings() {
    const g = this.orbitGraphics;
    if (!g) return;
    g.clear();
    if (!this.panel.showOrbitRings || this.currentLayout !== "concentric" || this.shells.length === 0) return;

    const ringColor = 0x555555;
    const ringAlpha = 0.2;

    for (const shell of this.shells) {
      if (shell.radius <= 0) continue;
      g.lineStyle(1, ringColor, ringAlpha);
      g.drawCircle(shell.centerX, shell.centerY, shell.radius);
    }
  }

  // =========================================================================
  // Draw edges (delegated to EdgeRenderer)
  // =========================================================================
  private drawEdges() {
    if (!this.edgeGraphics) return;
    // Cache background color to avoid getComputedStyle on every frame
    if (this.cachedBgColor === null) {
      const el = this.canvasWrap ?? this.containerEl;
      const bg = getComputedStyle(el).getPropertyValue("--background-primary").trim();
      this.cachedBgColor = bg ? cssColorToHex(bg) : 0x1e1e2e;
    }
    const cfg: EdgeDrawConfig = {
      linkThickness: this.panel.linkThickness,
      showInheritance: this.panel.showInheritance,
      showAggregation: this.panel.showAggregation,
      showTagNodes: this.panel.showTagNodes,
      showSimilar: this.panel.showSimilar,
      colorEdgesByRelation: this.panel.colorEdgesByRelation,
      isArcLayout: this.currentLayout === "arc",
      highlightedNodeId: this.highlightedNodeId,
      bgColor: this.cachedBgColor,
      relationColors: this.relationColors,
    };
    drawEdgesImpl(
      this.edgeGraphics,
      this.graphEdges,
      (ref) => typeof ref === "object" ? (ref as any) : this.pixiNodes.get(ref as string)?.data,
      cfg,
    );
  }

  // =========================================================================
  // Tag enclosures (delegated to EnclosureRenderer)
  // =========================================================================
  private drawEnclosures() {
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
    };
    drawEnclosuresImpl(this.enclosureGraphics, this.enclosureLabels, this.overlapCache, cfg);
  }

  // =========================================================================
  // Update positions
  // =========================================================================
  private updatePositions(forceFullRedraw = false) {
    for (const pn of this.pixiNodes.values()) {
      pn.gfx.x = pn.data.x;
      pn.gfx.y = pn.data.y;
    }
    this.rebuildSpatialGrid();
    this.redrawNodeBatch();
    this.drawOrbitRings();

    // Throttle expensive edge + enclosure redraws during simulation.
    // Node positions update every frame, but edges/enclosures only every Nth.
    this.edgeRedrawCounter++;
    if (forceFullRedraw || this.edgeRedrawCounter >= EDGE_REDRAW_SKIP) {
      this.edgeRedrawCounter = 0;
      this.drawEnclosures();
      this.drawEdges();
    }
  }

  // =========================================================================
  // Render loop with idle optimization
  // =========================================================================
  private needsFullRedraw = false;

  private markDirty(forceFullRedraw = false) {
    this.needsRedraw = true;
    if (forceFullRedraw) this.needsFullRedraw = true;
    this.idleFrames = 0;
    this.wakeRenderLoop();
  }

  private renderTick = () => {
    if (this.needsRedraw) {
      this.updatePositions(this.needsFullRedraw);
      this.needsRedraw = false;
      this.needsFullRedraw = false;
      this.idleFrames = 0;
    } else {
      this.idleFrames++;
      if (this.idleFrames > 60 && this.pixiApp) {
        this.pixiApp.ticker.remove(this.renderTick, this);
        this._tickerBound = false;
      }
    }
  };

  private startRenderLoop() {
    if (!this.pixiApp) return;
    if (this._tickerBound) return;
    this.needsRedraw = true;
    this.idleFrames = 0;
    this.pixiApp.ticker.add(this.renderTick, this);
    this._tickerBound = true;
  }

  private wakeRenderLoop() {
    if (!this._tickerBound && this.pixiApp) {
      this.startRenderLoop();
    }
  }

  // =========================================================================
  // Create PIXI nodes
  // =========================================================================
  /** Deferred node stack for progressive rendering */
  private pendingNodes: GraphNode[] = [];
  private pendingNodeR: ((n: GraphNode) => number) | null = null;
  private pendingNodeColor: ((n: GraphNode) => number) | null = null;
  private pendingLabelThreshold = 3;
  private deferredBatchId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Create PIXI nodes in batches via a deferred stack.
   * First batch is created synchronously so the graph is immediately visible,
   * remaining nodes are pushed onto a stack and processed in idle frames.
   */
  private createPixiNodes(
    nodes: GraphNode[],
    nodeR: (n: GraphNode) => number,
    nodeColor: (n: GraphNode) => number
  ) {
    this.pixiNodes.clear();
    this.cancelDeferredBatch();

    // Dynamically raise label threshold for large graphs to limit GPU texture memory.
    const MAX_LABELS = 300;
    const degValues = nodes.map(n => this.degrees.get(n.id) || 0).sort((a, b) => b - a);
    this.pendingLabelThreshold = degValues.length > MAX_LABELS
      ? Math.max(3, degValues[MAX_LABELS - 1])
      : 3;

    // Sort by degree descending — high-degree nodes render first (most important)
    const sorted = [...nodes].sort((a, b) =>
      (this.degrees.get(b.id) || 0) - (this.degrees.get(a.id) || 0)
    );

    // Immediate batch: create enough nodes for an initial visible graph
    const IMMEDIATE_BATCH = Math.min(200, sorted.length);
    const world = this.worldContainer!;

    for (let i = 0; i < IMMEDIATE_BATCH; i++) {
      this.createSinglePixiNode(sorted[i], nodeR, nodeColor, world);
    }

    // Push remaining nodes onto the deferred stack
    if (sorted.length > IMMEDIATE_BATCH) {
      this.pendingNodes = sorted.slice(IMMEDIATE_BATCH);
      this.pendingNodeR = nodeR;
      this.pendingNodeColor = nodeColor;
      this.scheduleDeferredBatch();
    }
  }

  private createSinglePixiNode(
    n: GraphNode,
    nodeR: (n: GraphNode) => number,
    nodeColor: (n: GraphNode) => number,
    world: PIXI.Container,
  ) {
    const container = new PIXI.Container();
    container.x = n.x;
    container.y = n.y;

    const r = nodeR(n);
    const color = nodeColor(n);
    const circle = new PIXI.Graphics();
    // Individual circle is hidden by default — batch layer draws all circles.
    // Only made visible when this node is highlighted (drawNodeCircle).
    circle.visible = false;
    container.addChild(circle);

    let label: PIXI.Text | null = null;
    const deg = this.degrees.get(n.id) || 0;
    if (deg > this.pendingLabelThreshold) {
      label = new PIXI.Text(n.label, {
        fontSize: 11, fill: 0x999999,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      });
      label.x = r + 2;
      label.y = -6;
      label.resolution = 2;
      container.addChild(label);
    }

    world.addChild(container);

    this.pixiNodes.set(n.id, {
      data: n, gfx: container, circle, label,
      hoverLabel: null, radius: r, color,
    });
  }

  /** Process the next batch of deferred nodes from the stack */
  private processDeferredBatch = () => {
    this.deferredBatchId = null;
    const world = this.worldContainer;
    if (!world || !this.pendingNodeR || !this.pendingNodeColor) return;
    if (this.pendingNodes.length === 0) return;

    const BATCH_SIZE = 100;
    const batch = this.pendingNodes.splice(0, BATCH_SIZE);

    for (const n of batch) {
      this.createSinglePixiNode(n, this.pendingNodeR, this.pendingNodeColor, world);
    }

    this.markDirty(true);

    if (this.pendingNodes.length > 0) {
      this.scheduleDeferredBatch();
    } else {
      // All nodes created — final cleanup
      this.pendingNodeR = null;
      this.pendingNodeColor = null;
    }
  };

  private scheduleDeferredBatch() {
    if (this.deferredBatchId !== null) return;
    // Use setTimeout(0) to yield to the browser event loop between batches
    this.deferredBatchId = setTimeout(this.processDeferredBatch, 0);
  }

  private cancelDeferredBatch() {
    if (this.deferredBatchId !== null) {
      clearTimeout(this.deferredBatchId);
      this.deferredBatchId = null;
    }
    this.pendingNodes = [];
    this.pendingNodeR = null;
    this.pendingNodeColor = null;
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
      setLayout: (l: LayoutType) => { this.currentLayout = l; },
      shells: this.shells,
      pixiNodes: this.pixiNodes,
      relationColors: this.relationColors,
      simulation: this.simulation,
    };
    const cb: PanelCallbacks = {
      doRender: () => this.doRender(),
      markDirty: () => this.markDirty(),
      updateForces: () => this.updateForces(),
      applySearch: () => this.applySearch(),
      applyTextFade: () => this.applyTextFade(),
      applyDirectionalGravityForce: () => this.applyDirectionalGravityForce(),
      startOrbitAnimation: () => this.startOrbitAnimation(),
      stopOrbitAnimation: () => this.stopOrbitAnimation(),
      wakeRenderLoop: () => this.wakeRenderLoop(),
      rebuildPanel: () => this.buildPanel(),
      invalidateData: () => { this.rawData = null; this.doRender(); },
      restartSimulation: (alpha: number) => {
        if (this.simulation) { this.simulation.alpha(alpha).restart(); this.wakeRenderLoop(); }
      },
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

    const nodeSet = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
    return { nodes, edges };
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
    this.stopSim();
    this.stopOrbitAnimation();
    this.cachedBgColor = null; // invalidate bg color cache on re-render

    const rect = this.canvasWrap.getBoundingClientRect();
    const W = rect.width || 600;
    const H = rect.height || 400;
    const cx = W / 2;
    const cy = H / 2;

    this.setStatus("Building...");
    await yieldFrame(); if (signal.aborted) return;

    const gd = this.getGraphData();
    this.setStatus(`${gd.nodes.length} nodes, ${gd.edges.length} edges`);
    await yieldFrame(); if (signal.aborted) return;

    // Sunburst uses SVG (arc paths work better with SVG)
    if (this.currentLayout === "sunburst") {
      this.destroyPixi();
      this.drawSunburstSVG(W, H);
      return;
    }

    // Init PIXI
    this.initPixi(W, H);
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

    const nodeR = (n: GraphNode) => Math.max(baseSize, baseSize + Math.sqrt(this.degrees.get(n.id) || 0) * 2.5);
    const defaultNodeColor = cssColorToHex(DEFAULT_COLORS[0]);
    const nodeColor = (n: GraphNode): number => {
      // Manual group overrides take priority
      for (const grp of this.panel.groups) {
        if (grp.query && n.label.toLowerCase().includes(grp.query)) return cssColorToHex(grp.color);
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
        if (n.x === 0 && n.y === 0) {
          n.x = cx + (Math.random() - 0.5) * W * 0.8;
          n.y = cy + (Math.random() - 0.5) * H * 0.8;
        }
      }

      this.graphEdges = gd.edges;
      this.createPixiNodes(gd.nodes, nodeR, nodeColor);

      let tickCount = 0;
      this.simulation = forceSimulation<GraphNode, GraphEdge>(gd.nodes)
        .force("charge", forceManyBody<GraphNode>().strength(-this.panel.repelForce))
        .force("center", forceCenter<GraphNode>(cx, cy).strength(this.panel.centerForce))
        .force("link", forceLink<GraphNode, GraphEdge>(gd.edges)
          .id((d) => d.id)
          .distance((e) => {
            if (e.type === "inheritance" || e.type === "aggregation") return this.panel.linkDistance * 0.5;
            if (e.type === "has-tag") return this.panel.linkDistance * 0.7;
            return this.panel.linkDistance;
          })
          .strength((e) => {
            if (e.type === "inheritance" || e.type === "aggregation") return this.panel.linkForce * 3;
            if (e.type === "has-tag") return this.panel.linkForce * 1.5;
            return this.panel.linkForce;
          }))
        .alphaDecay(0.08)
        .velocityDecay(0.55);

      // Apply directional gravity rules from settings + panel
      this.applyDirectionalGravityForce();

      // Apply enclosure repulsion force (push tag groups apart)
      this.applyEnclosureRepulsionForce();

      this.simulation.on("tick", () => {
          if (++tickCount % TICK_SKIP !== 0) return;
          this.markDirty();
        });

      this.setStatus(`${gd.nodes.length} nodes — simulating...`);
      this.simulation.on("end", () => this.setStatus(`${gd.nodes.length} nodes`));

      this.startRenderLoop();
      return;
    }

    // ==== Static layouts ====
    this.setStatus("Computing layout...");
    await yieldFrame(); if (signal.aborted) return;

    let ld: GraphData;
    this.shells = [];
    this.nodeShellIndex.clear();
    switch (this.currentLayout) {
      case "concentric": {
        const result = applyConcentricLayout(gd, { centerX: cx, centerY: cy, minRadius: this.panel.concentricMinRadius, radiusStep: this.panel.concentricRadiusStep });
        ld = result.data;
        this.shells = result.shells;
        this.shells.forEach((s, i) => s.nodeIds.forEach((id) => this.nodeShellIndex.set(id, i)));
        break;
      }
      case "tree": ld = applyTreeLayout(gd, { startX: cx, startY: 40 }); break;
      case "arc": ld = applyArcLayout(gd, { centerX: cx, centerY: cy, radius: Math.min(W, H) * 0.4 }); break;
      default: {
        const result = applyConcentricLayout(gd, { centerX: cx, centerY: cy });
        ld = result.data;
        this.shells = result.shells;
        this.shells.forEach((s, i) => s.nodeIds.forEach((id) => this.nodeShellIndex.set(id, i)));
        break;
      }
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

    // Rebuild panel to show per-orbit controls if concentric
    this.stopOrbitAnimation();
    if (this.currentLayout === "concentric" && this.shells.length > 0) {
      this.buildPanel();
      if (this.panel.orbitAutoRotate) this.startOrbitAnimation();
    }
  }

  // =========================================================================
  // Live panel adjustments
  // =========================================================================
  private updateForces() {
    if (!this.simulation) return;
    const rect = this.canvasWrap?.getBoundingClientRect();
    const W = rect?.width || 600;
    const H = rect?.height || 400;
    this.simulation
      .force("charge", forceManyBody<GraphNode>().strength(-this.panel.repelForce))
      .force("center", forceCenter<GraphNode>(W / 2, H / 2).strength(this.panel.centerForce))
      .force("link", forceLink<GraphNode, GraphEdge>(this.graphEdges)
        .id((d) => d.id)
        .distance((e) => {
          if (e.type === "inheritance" || e.type === "aggregation") return this.panel.linkDistance * 0.5;
          if (e.type === "has-tag") return this.panel.linkDistance * 0.7;
          return this.panel.linkDistance;
        })
        .strength((e) => {
          if (e.type === "inheritance" || e.type === "aggregation") return this.panel.linkForce * 3;
          if (e.type === "has-tag") return this.panel.linkForce * 1.5;
          return this.panel.linkForce;
        }));
    this.applyDirectionalGravityForce();
    this.applyEnclosureRepulsionForce();
    this.simulation.alpha(0.5).restart();
    this.wakeRenderLoop();
  }

  /**
   * Create or update the custom force for directional gravity rules.
   * Merges rules from plugin settings and panel-local overrides.
   */
  private applyDirectionalGravityForce() {
    if (!this.simulation) return;
    const rules = this.getActiveDirectionalGravityRules();
    if (rules.length === 0) {
      this.simulation.force("directionalGravity", null);
      return;
    }
    // Simulation calls force(alpha) on each tick
    const sim = this.simulation;
    const forceFn = (alpha: number) => {
      const nodes = sim.nodes();
      for (const rule of rules) {
        const dir = resolveDirection(rule.direction);
        const ddx = Math.cos(dir);
        const ddy = Math.sin(dir);
        const str = (rule.strength ?? 0.1) * alpha;
        for (const node of nodes) {
          if (!matchesFilter(node, rule.filter)) continue;
          node.vx! += ddx * str * 100;
          node.vy! += ddy * str * 100;
        }
      }
    };
    this.simulation.force("directionalGravity", forceFn as Force<GraphNode, GraphEdge>);
  }

  /**
   * Get the combined list of directional gravity rules (from settings + panel).
   */
  private getActiveDirectionalGravityRules(): DirectionalGravityRule[] {
    const settingsRules = this.plugin.settings.directionalGravityRules ?? [];
    const panelRules = this.panel.directionalGravityRules ?? [];
    return [...settingsRules, ...panelRules];
  }

  /**
   * Custom d3 force that repels enclosure centroids from each other.
   * Each tag group is treated as a virtual body at its centroid.
   * Repulsion is distributed to member nodes, pushing overlapping groups apart.
   * Only active in enclosure mode.
   */
  private applyEnclosureRepulsionForce() {
    if (!this.simulation) return;
    if (this.panel.tagDisplay !== "enclosure" || this.tagMembership.size === 0) {
      this.simulation.force("enclosureRepulsion", null);
      return;
    }

    const membership = this.tagMembership;
    const nodeIndex = new Map<string, GraphNode>();
    for (const n of this.simulation.nodes()) {
      nodeIndex.set(n.id, n);
    }

    const relPairs = this.tagRelPairsCache;
    const tags = [...membership.keys()];
    const panel = this.panel;

    // Two-phase enclosure repulsion:
    //   Phase 1 (alpha > 0.3): Strong repulsion with wide spacing (3× user setting)
    //     — pushes enclosures far apart before other forces converge
    //   Phase 2 (alpha ≤ 0.3): Settle to user-configured enclosureSpacing
    //     — allows graph to compact to the desired density
    const PHASE_THRESHOLD = 0.3;

    const forceFn = (alpha: number) => {
      const userSpacing = panel.enclosureSpacing;
      // In phase 1, use 3× spacing so enclosures spread wide first
      const effectiveSpacing = alpha > PHASE_THRESHOLD
        ? userSpacing * 3
        : userSpacing;

      // Stronger base repulsion in phase 1 for decisive separation
      const baseStr = alpha > PHASE_THRESHOLD ? 4000 : 2000;

      // Compute centroids
      const centroids: { tag: string; cx: number; cy: number; count: number; radius: number }[] = [];
      for (const tag of tags) {
        const ids = membership.get(tag);
        if (!ids || ids.size === 0) continue;
        let sx = 0, sy = 0, cnt = 0;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of ids) {
          const n = nodeIndex.get(id);
          if (!n) continue;
          sx += n.x; sy += n.y; cnt++;
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x > maxX) maxX = n.x;
          if (n.y > maxY) maxY = n.y;
        }
        if (cnt === 0) continue;
        const r = Math.max(30, Math.hypot(maxX - minX, maxY - minY) / 2);
        centroids.push({ tag, cx: sx / cnt, cy: sy / cnt, count: cnt, radius: r });
      }

      // Repel centroid pairs (only unrelated tags)
      const repStr = baseStr * alpha;
      for (let i = 0; i < centroids.length; i++) {
        for (let j = i + 1; j < centroids.length; j++) {
          const a = centroids[i], b = centroids[j];
          if (relPairs.has(`${a.tag}\0${b.tag}`)) continue;

          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const desiredDist = (a.radius + b.radius) * effectiveSpacing;
          let dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= desiredDist) continue; // far enough apart
          if (dist < 1) dist = 1;

          const overlap = desiredDist - dist;
          const force = repStr * overlap / dist;
          const fx = dx * force / dist;
          const fy = dy * force / dist;

          // Distribute force to member nodes (inversely weighted by group size)
          const wA = 1 / a.count;
          const wB = 1 / b.count;
          const idsA = membership.get(a.tag)!;
          const idsB = membership.get(b.tag)!;
          for (const id of idsA) {
            const n = nodeIndex.get(id);
            if (n) { n.vx! -= fx * wA; n.vy! -= fy * wA; }
          }
          for (const id of idsB) {
            const n = nodeIndex.get(id);
            if (n) { n.vx! += fx * wB; n.vy! += fy * wB; }
          }
        }
      }
    };

    this.simulation.force("enclosureRepulsion", forceFn as Force<GraphNode, GraphEdge>);
  }

  private applySearch() {
    const q = this.panel.searchQuery;
    for (const pn of this.pixiNodes.values()) {
      if (!q) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, false);
      } else if (pn.data.label.toLowerCase().includes(q)) {
        pn.gfx.alpha = 1;
        // Search highlight: yellow stroke — render via individual Graphics
        pn.circle.visible = true;
        pn.circle.clear();
        pn.circle.lineStyle(3, 0xf59e0b, 1);
        pn.circle.beginFill(pn.color);
        pn.circle.drawCircle(0, 0, pn.radius);
        pn.circle.endFill();
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
  // Sunburst (SVG fallback — arc paths are inherently SVG)
  // =========================================================================
  private drawSunburstSVG(W: number, H: number) {
    if (this.canvasWrap) this.canvasWrap.empty();

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("width", String(W));
    svgEl.setAttribute("height", String(H));
    svgEl.style.width = "100%";
    svgEl.style.height = "100%";
    this.canvasWrap!.appendChild(svgEl);
    this.svgEl = svgEl;

    const svg = d3select(svgEl);
    const root = buildSunburstData(this.app, this.plugin.settings.groupField);
    const arcs = computeSunburstArcs(root, W, H);
    const cx = W / 2, cy = H / 2;
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    const zoomBehavior = d3zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 3])
      .on("zoom", (ev) => g.attr("transform", `translate(${cx},${cy}) ${ev.transform}`));
    svg.call(zoomBehavior);
    const arcGen = d3arc<{ x0: number; x1: number; y0: number; y1: number }>()
      .startAngle((d) => d.x0).endAngle((d) => d.x1)
      .innerRadius((d) => d.y0).outerRadius((d) => d.y1);
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i]; if (a.depth === 0) continue;
      g.append("path").attr("d", arcGen(a)).attr("fill", DEFAULT_COLORS[i % DEFAULT_COLORS.length])
        .attr("stroke", "var(--background-primary)").attr("stroke-width", 1)
        .style("cursor", a.filePath ? "pointer" : "default")
        .on("click", () => { if (a.filePath) this.app.workspace.openLinkText(a.filePath, "", false); })
        .append("title").text(`${a.name} (${a.value})`);
    }
    this.setStatus(`${arcs.length} arcs`);
  }

}

