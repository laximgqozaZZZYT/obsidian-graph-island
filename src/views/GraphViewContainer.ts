import { ItemView, WorkspaceLeaf, Platform, MarkdownRenderer, TFile } from "obsidian";
import * as PIXI from "pixi.js";
import * as d3 from "d3";
import type GraphViewsPlugin from "../main";
import type { GraphData, GraphNode, GraphEdge, LayoutType, ShellInfo } from "../types";
import { DEFAULT_COLORS } from "../types";
import { buildGraphFromVault, assignNodeColors, buildRelationColorMap, buildSunburstData } from "../parsers/metadata-parser";
import { applyConcentricLayout, repositionShell } from "../layouts/concentric";
import { applyTreeLayout } from "../layouts/tree";
import { applyArcLayout } from "../layouts/arc";
import { computeSunburstArcs } from "../layouts/sunburst";
import { computeNodeDegrees } from "../analysis/graph-analysis";

export const VIEW_TYPE_GRAPH = "graph-view";

const TICK_SKIP = 2;

// ---------------------------------------------------------------------------
// Panel state
// ---------------------------------------------------------------------------
interface PanelState {
  showTags: boolean;
  showAttachments: boolean;
  existingOnly: boolean;
  showOrphans: boolean;
  showArrows: boolean;
  textFadeThreshold: number;
  nodeSize: number;
  linkThickness: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
  concentricMinRadius: number;
  concentricRadiusStep: number;
  showOrbitRings: boolean;
  orbitAutoRotate: boolean;
  groups: { query: string; color: string }[];
  searchQuery: string;
  colorEdgesByRelation: boolean;
  colorNodesByCategory: boolean;
  showInheritance: boolean;
  showAggregation: boolean;
  showTagNodes: boolean;
}

const DEFAULT_PANEL: PanelState = {
  showTags: false,
  showAttachments: false,
  existingOnly: false,
  showOrphans: true,
  showArrows: false,
  textFadeThreshold: 0,
  nodeSize: 6,
  linkThickness: 1,
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
};

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
  private simulation: d3.Simulation<GraphNode, GraphEdge> | null = null;
  private highlightedNodeId: string | null = null;

  // PIXI
  private pixiApp: PIXI.Application | null = null;
  private worldContainer: PIXI.Container | null = null;
  private edgeGraphics: PIXI.Graphics | null = null;
  private orbitGraphics: PIXI.Graphics | null = null;
  private pixiNodes: Map<string, PixiNode> = new Map();
  private canvasWrap: HTMLElement | null = null;
  private graphEdges: GraphEdge[] = [];
  private degrees: Map<string, number> = new Map();
  private adj: Map<string, Set<string>> = new Map();
  private relationColors: Map<string, string> = new Map();

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

  // Hover info preview
  private previewWrapEl: HTMLElement | null = null;

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

    const panelToggle = toolbar.createEl("button", { cls: "graph-settings-btn", text: "⚙" });
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
    this.canvasWrap = main.createDiv({ cls: "graph-svg-wrap" });

    // --- Control Panel ---
    this.panelEl = main.createDiv({ cls: "graph-panel is-hidden" });
    this.buildPanel();

    // --- Floating preview window (inside main, not canvasWrap — survives initPixi) ---
    this.previewWrapEl = main.createDiv({ cls: "graph-preview-wrap" });
    this.setupPreviewDrag();

    // --- Resize observer for PIXI canvas ---
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.canvasWrap);

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
    this.canvasWrap = null;
    this.previewWrapEl = null;
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
    if (this._tickerBound && this.pixiApp) {
      this.pixiApp.ticker.remove(this.renderTick, this);
      this._tickerBound = false;
    }
    if (this.pixiApp) {
      this.pixiApp.destroy(true, { children: true, texture: true });
      this.pixiApp = null;
    }
    this.worldContainer = null;
    this.edgeGraphics = null;
    this.orbitGraphics = null;
    this.pixiNodes.clear();
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

    // Edge layer (single Graphics object — batch drawn)
    const edgeGfx = new PIXI.Graphics();
    world.addChild(edgeGfx);
    this.edgeGraphics = edgeGfx;

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
        const worldPt = world.toLocal(new PIXI.Point(mx, my), app.stage);
        const hit = this.hitTestNode(worldPt.x, worldPt.y);
        const newId = hit?.data.id ?? null;
        if (newId !== this.highlightedNodeId) {
          this.highlightedNodeId = newId;
          this.applyHover();
          this.markDirty();
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
              this.markDirty();
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
        this.markDirty();
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

  private hitTestNode(wx: number, wy: number): PixiNode | null {
    let closest: PixiNode | null = null;
    let closestDist = Infinity;
    for (const pn of this.pixiNodes.values()) {
      const dx = pn.data.x - wx;
      const dy = pn.data.y - wy;
      const dist = dx * dx + dy * dy;
      const r = pn.radius + 4;
      if (dist < r * r && dist < closestDist) {
        closestDist = dist;
        closest = pn;
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

    for (const pn of this.pixiNodes.values()) {
      if (!hId) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, false);
        if (pn.hoverLabel) { pn.gfx.removeChild(pn.hoverLabel); pn.hoverLabel.destroy(); pn.hoverLabel = null; }
      } else if (pn.data.id === hId || neighbors?.has(pn.data.id)) {
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
    this.updatePreviewPanel();
  }

  private updatePreviewPanel() {
    const wrap = this.previewWrapEl;
    if (!wrap) return;

    const hId = this.highlightedNodeId;
    if (!hId) return; // Don't close on hover-out — user closes manually

    const pn = this.pixiNodes.get(hId);
    if (!pn) return;

    // Rebuild content
    wrap.empty();
    wrap.addClass("is-visible");

    // Title bar (drag handle + close)
    const titleBar = wrap.createDiv({ cls: "graph-preview-titlebar" });
    titleBar.createEl("span", { cls: "graph-preview-titlebar-text", text: pn.data.label });
    const closeBtn = titleBar.createEl("span", { cls: "graph-preview-close", text: "\u00D7" });
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      wrap.removeClass("is-visible");
      wrap.empty();
    });

    // Content area
    const content = wrap.createDiv({ cls: "graph-preview-content" });

    // 1. Hovered node
    this.renderPreviewCard(content, pn.data, "ホバー中のノード");

    // 2. Linked nodes
    const neighbors = this.adj.get(hId);
    if (neighbors && neighbors.size > 0) {
      const linkedSection = content.createDiv({ cls: "graph-preview-linked" });
      linkedSection.createEl("div", { cls: "graph-preview-section-title", text: `リンク先 (${neighbors.size})` });
      const listEl = linkedSection.createDiv({ cls: "graph-preview-list" });
      for (const nId of neighbors) {
        const npn = this.pixiNodes.get(nId);
        if (npn) this.renderPreviewCard(listEl, npn.data);
      }
    }
  }

  private setupPreviewDrag() {
    const wrap = this.previewWrapEl;
    if (!wrap) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    wrap.addEventListener("pointerdown", (e) => {
      const target = e.target as HTMLElement;
      // Only drag from title bar area
      if (!target.closest(".graph-preview-titlebar")) return;
      if (target.closest(".graph-preview-close")) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origLeft = wrap.offsetLeft;
      origTop = wrap.offsetTop;
      e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      wrap.style.left = `${origLeft + dx}px`;
      wrap.style.top = `${origTop + dy}px`;
      wrap.style.right = "auto";
      wrap.style.bottom = "auto";
    });

    window.addEventListener("pointerup", () => {
      dragging = false;
    });
  }

  private renderPreviewCard(container: HTMLElement, node: GraphNode, sectionTitle?: string) {
    const card = container.createDiv({ cls: "graph-preview-card" });
    if (sectionTitle) {
      card.createEl("div", { cls: "graph-preview-section-title", text: sectionTitle });
    }
    card.createEl("div", { cls: "graph-preview-name", text: node.label });

    // Meta info
    const meta: string[] = [];
    if (node.category) meta.push(node.category);
    if (node.tags && node.tags.length > 0) meta.push(node.tags.map(t => `#${t}`).join(" "));
    if (meta.length > 0) {
      card.createEl("div", { cls: "graph-preview-meta", text: meta.join(" · ") });
    }

    // Render markdown content
    if (node.filePath) {
      const file = this.app.vault.getAbstractFileByPath(node.filePath);
      if (file instanceof TFile) {
        const bodyEl = card.createDiv({ cls: "graph-preview-body markdown-rendered" });
        this.app.vault.cachedRead(file).then(content => {
          const body = content.replace(/^---[\s\S]*?---\n*/, "");
          const preview = body.length > 500 ? body.slice(0, 500) + "\n\n…" : body;
          MarkdownRenderer.render(this.app, preview, bodyEl, node.filePath!, this);
        });
      }
    }

    // Click to open
    card.addEventListener("click", () => {
      if (node.filePath) {
        this.app.workspace.openLinkText(node.filePath, "", false);
      }
    });
  }

  private drawNodeCircle(pn: PixiNode, highlight: boolean) {
    pn.circle.clear();
    if (highlight) {
      pn.circle.lineStyle(2.5, 0x6366f1, 1);
    }
    pn.circle.beginFill(pn.color);
    if (pn.data.isTag) {
      const r = pn.radius;
      pn.circle.drawPolygon([0, -r * 1.3, r * 1.3, 0, 0, r * 1.3, -r * 1.3, 0]);
    } else {
      pn.circle.drawCircle(0, 0, pn.radius);
    }
    pn.circle.endFill();
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
  // Draw edges (single Graphics batch — fast)
  // =========================================================================
  private drawEdges() {
    const g = this.edgeGraphics;
    if (!g) return;
    g.clear();

    const hId = this.highlightedNodeId;
    const defaultColor = 0x555555;
    const highlightColor = 0x888888;
    const inheritanceColor = 0x9ca3af;
    const aggregationColor = 0x60a5fa;
    const thickness = this.panel.linkThickness;
    const isArc = this.currentLayout === "arc";
    const useRelColor = this.panel.colorEdgesByRelation;

    for (const e of this.graphEdges) {
      if (e.type === "inheritance" && !this.panel.showInheritance) continue;
      if (e.type === "aggregation" && !this.panel.showAggregation) continue;
      if (e.type === "has-tag" && !this.panel.showTagNodes) continue;

      const src = typeof e.source === "object" ? (e.source as any) : this.pixiNodes.get(e.source)?.data;
      const tgt = typeof e.target === "object" ? (e.target as any) : this.pixiNodes.get(e.target)?.data;
      if (!src || !tgt) continue;

      // Determine color
      const hasTagColor = 0xa78bfa;
      let lineColor = defaultColor;
      if (e.type === "inheritance") {
        lineColor = inheritanceColor;
      } else if (e.type === "aggregation") {
        lineColor = aggregationColor;
      } else if (e.type === "has-tag") {
        lineColor = hasTagColor;
      } else if (useRelColor && e.relation) {
        const css = this.relationColors.get(e.relation);
        if (css) lineColor = cssColorToHex(css);
      }

      // Determine alpha & thickness
      const isOnto = e.type === "inheritance" || e.type === "aggregation";
      const isStructural = isOnto || e.type === "has-tag";
      let alpha = isStructural ? 0.5 : 0.4;
      let lineThick = thickness;

      if (!isOnto && e.relation && useRelColor) alpha = 0.7;

      if (hId) {
        const sid = src.id ?? e.source;
        const tid = tgt.id ?? e.target;
        if (sid === hId || tid === hId) {
          lineThick = 2;
          alpha = 1;
          if (!isOnto && !e.relation) lineColor = highlightColor;
        } else {
          alpha = 0.04;
        }
      }

      g.lineStyle(lineThick, lineColor, alpha);

      // Draw the line
      if (isArc) {
        const mx = (src.x + tgt.x) / 2;
        const minY = Math.min(src.y, tgt.y);
        const dist = Math.abs(tgt.x - src.x);
        const cpY = minY - dist * 0.3 - 20;
        g.moveTo(src.x, src.y);
        g.quadraticCurveTo(mx, cpY, tgt.x, tgt.y);
      } else {
        g.moveTo(src.x, src.y);
        g.lineTo(tgt.x, tgt.y);
      }

      // Draw markers for ontology edges
      if (isOnto) {
        this.drawEdgeMarker(g, src, tgt, e.type as "inheritance" | "aggregation", lineColor, alpha);
      }
    }
  }

  /**
   * Draw a marker at the end of an ontology edge.
   * - inheritance: hollow triangle at target (UML generalization)
   * - aggregation: hollow diamond at source (UML aggregation)
   */
  /** Get the background color as a hex number for "hollow" marker fills */
  private getBgColor(): number {
    const el = this.canvasWrap ?? this.containerEl;
    const bg = getComputedStyle(el).getPropertyValue("--background-primary").trim();
    return bg ? cssColorToHex(bg) : 0x1e1e2e;
  }

  private drawEdgeMarker(
    g: PIXI.Graphics,
    src: { x: number; y: number },
    tgt: { x: number; y: number },
    type: "inheritance" | "aggregation",
    color: number,
    alpha: number
  ) {
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const sz = 8;
    const bgColor = this.getBgColor();

    if (type === "inheritance") {
      // Hollow triangle at target
      const bx = tgt.x - ux * sz;
      const by = tgt.y - uy * sz;
      g.lineStyle(1.5, color, alpha);
      g.beginFill(bgColor, alpha * 0.9);
      g.moveTo(tgt.x, tgt.y);
      g.lineTo(bx + px * sz * 0.5, by + py * sz * 0.5);
      g.lineTo(bx - px * sz * 0.5, by - py * sz * 0.5);
      g.closePath();
      g.endFill();
    } else {
      // Hollow diamond at source
      const mx = src.x + ux * sz;
      const my = src.y + uy * sz;
      const fx = src.x + ux * sz * 2;
      const fy = src.y + uy * sz * 2;
      g.lineStyle(1.5, color, alpha);
      g.beginFill(bgColor, alpha * 0.9);
      g.moveTo(src.x, src.y);
      g.lineTo(mx + px * sz * 0.4, my + py * sz * 0.4);
      g.lineTo(fx, fy);
      g.lineTo(mx - px * sz * 0.4, my - py * sz * 0.4);
      g.closePath();
      g.endFill();
    }
  }

  // =========================================================================
  // Update positions
  // =========================================================================
  private updatePositions() {
    for (const pn of this.pixiNodes.values()) {
      pn.gfx.x = pn.data.x;
      pn.gfx.y = pn.data.y;
    }
    this.drawOrbitRings();
    this.drawEdges();
  }

  // =========================================================================
  // Render loop with idle optimization
  // =========================================================================
  private markDirty() {
    this.needsRedraw = true;
    this.idleFrames = 0;
    this.wakeRenderLoop();
  }

  private renderTick = () => {
    if (this.needsRedraw) {
      this.updatePositions();
      this.needsRedraw = false;
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
  private createPixiNodes(
    nodes: GraphNode[],
    nodeR: (n: GraphNode) => number,
    nodeColor: (n: GraphNode) => number
  ) {
    this.pixiNodes.clear();
    const world = this.worldContainer!;

    for (const n of nodes) {
      const container = new PIXI.Container();
      container.x = n.x;
      container.y = n.y;

      const r = nodeR(n);
      const color = nodeColor(n);
      const circle = new PIXI.Graphics();
      circle.beginFill(color);
      if (n.isTag) {
        // Diamond shape for tag nodes
        circle.drawPolygon([0, -r * 1.3, r * 1.3, 0, 0, r * 1.3, -r * 1.3, 0]);
      } else {
        circle.drawCircle(0, 0, r);
      }
      circle.endFill();
      container.addChild(circle);

      let label: PIXI.Text | null = null;
      const deg = this.degrees.get(n.id) || 0;
      if (deg > 2) {
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

  // =========================================================================
  // Control Panel UI
  // =========================================================================
  private buildPanel() {
    const p = this.panelEl!;
    p.empty();

    this.buildSection(p, "グラフの種類", (body) => {
      const select = body.createEl("select", { cls: "ngp-select" });
      const layouts: { type: LayoutType; label: string }[] = [
        { type: "force", label: "Force" },
        { type: "concentric", label: "Concentric" },
        { type: "tree", label: "Tree" },
        { type: "arc", label: "Arc" },
        { type: "sunburst", label: "Sunburst" },
      ];
      for (const l of layouts) {
        const opt = select.createEl("option", { text: l.label, value: l.type });
        if (l.type === this.currentLayout) opt.selected = true;
      }
      select.addEventListener("change", () => {
        this.currentLayout = select.value as LayoutType;
        this.buildPanel();
        this.doRender();
      });
    });

    if (this.currentLayout === "concentric") {
      this.buildSection(p, "同心円レイアウト", (body) => {
        this.addSlider(body, "最小半径", 10, 200, 5, this.panel.concentricMinRadius, (v) => { this.panel.concentricMinRadius = v; this.doRender(); });
        this.addSlider(body, "軌道間距離", 10, 200, 5, this.panel.concentricRadiusStep, (v) => { this.panel.concentricRadiusStep = v; this.doRender(); });
        this.addToggle(body, "軌道リングを表示", this.panel.showOrbitRings, (v) => { this.panel.showOrbitRings = v; this.markDirty(); });
        this.addToggle(body, "自動回転", this.panel.orbitAutoRotate, (v) => {
          this.panel.orbitAutoRotate = v;
          if (v) { this.startOrbitAnimation(); } else { this.stopOrbitAnimation(); }
        });
      });
      if (this.shells.length > 0) {
        this.buildSection(p, "各軌道の調整", (body) => {
          this.shells.forEach((shell, i) => {
            if (i === 0 && shell.nodeIds.length === 1) return; // center node
            const label = `軌道 ${i} (${shell.nodeIds.length}ノード)`;
            body.createEl("div", { cls: "ngp-orbit-label", text: label });
            this.addSlider(body, "半径", 10, 500, 5, shell.radius, (v) => {
              shell.radius = v;
              const nodeMap = new Map<string, GraphNode>();
              for (const pn of this.pixiNodes.values()) nodeMap.set(pn.data.id, pn.data);
              repositionShell(shell, nodeMap);
              this.markDirty();
            });
            this.addSlider(body, "回転速度", 0, 2, 0.05, shell.rotationSpeed, (v) => {
              shell.rotationSpeed = v;
            });
            this.addDirectionToggle(body, "回転方向", shell.rotationDirection, (v) => {
              shell.rotationDirection = v;
            });
          });
          body.createEl("p", { cls: "ngp-hint", text: "ドラッグでも軌道を回転できます" });
        });
      }
    }

    this.buildSection(p, "フィルタ", (body) => {
      const search = body.createEl("input", { cls: "ngp-search", type: "text", placeholder: "ファイルを検索..." });
      search.value = this.panel.searchQuery;
      search.addEventListener("input", () => { this.panel.searchQuery = search.value.toLowerCase(); this.applySearch(); });
      this.addToggle(body, "タグ", this.panel.showTags, (v) => { this.panel.showTags = v; this.rawData = null; this.doRender(); });
      this.addToggle(body, "添付書類", this.panel.showAttachments, (v) => { this.panel.showAttachments = v; this.rawData = null; this.doRender(); });
      this.addToggle(body, "存在するファイルのみ表示", this.panel.existingOnly, (v) => { this.panel.existingOnly = v; this.rawData = null; this.doRender(); });
      this.addToggle(body, "オーファン", this.panel.showOrphans, (v) => { this.panel.showOrphans = v; this.rawData = null; this.doRender(); });
      this.addToggle(body, "タグノード", this.panel.showTagNodes, (v) => { this.panel.showTagNodes = v; this.rawData = null; this.doRender(); });
      this.addToggle(body, "継承エッジ (is-a)", this.panel.showInheritance, (v) => { this.panel.showInheritance = v; this.markDirty(); });
      this.addToggle(body, "集約エッジ (has-a)", this.panel.showAggregation, (v) => { this.panel.showAggregation = v; this.markDirty(); });
    });

    this.buildSection(p, "グループ", (body) => {
      const list = body.createDiv();
      this.renderGroupList(list);
      const addBtn = body.createEl("button", { cls: "ngp-add-group", text: "新規グループ" });
      addBtn.addEventListener("click", () => {
        const idx = this.panel.groups.length;
        this.panel.groups.push({ query: "", color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length] });
        this.renderGroupList(list);
      });
    });

    this.buildSection(p, "表示", (body) => {
      this.addToggle(body, "矢印", this.panel.showArrows, (v) => { this.panel.showArrows = v; this.doRender(); });
      this.addToggle(body, "ノード色（カテゴリ別）", this.panel.colorNodesByCategory, (v) => { this.panel.colorNodesByCategory = v; this.doRender(); });
      this.addToggle(body, "エッジ色（属性別）", this.panel.colorEdgesByRelation, (v) => { this.panel.colorEdgesByRelation = v; this.markDirty(); });
      this.addSlider(body, "テキストフェードの閾値", 0, 1, 0.05, this.panel.textFadeThreshold, (v) => { this.panel.textFadeThreshold = v; this.applyTextFade(); });
      this.addSlider(body, "ノードの大きさ", 2, 20, 1, this.panel.nodeSize, (v) => { this.panel.nodeSize = v; this.doRender(); });
      this.addSlider(body, "リンクの太さ", 0.5, 5, 0.5, this.panel.linkThickness, (v) => { this.panel.linkThickness = v; this.markDirty(); });
    });

    // Show relation color legend when edge coloring is on
    if (this.panel.colorEdgesByRelation && this.relationColors.size > 0) {
      this.buildSection(p, "属性カラー", (body) => {
        for (const [rel, color] of this.relationColors) {
          const row = body.createDiv({ cls: "setting-item" });
          const dot = row.createEl("span");
          dot.style.cssText = `display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};margin-right:8px;vertical-align:middle;`;
          row.createEl("span", { text: rel, cls: "setting-item-name" });
        }
      });
    }

    // Ontology edge legend
    this.buildSection(p, "エッジ凡例", (body) => {
      const items: { label: string; color: string; shape: string }[] = [
        { label: "継承 (is-a)", color: "#9ca3af", shape: "▷" },
        { label: "集約 (has-a)", color: "#60a5fa", shape: "◇" },
        { label: "has-tag", color: "#a78bfa", shape: "─" },
        { label: "通常リンク", color: "#555555", shape: "─" },
      ];
      for (const item of items) {
        const row = body.createDiv({ cls: "setting-item" });
        const marker = row.createEl("span");
        marker.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:20px;height:14px;color:${item.color};font-size:14px;margin-right:6px;`;
        marker.textContent = item.shape;
        row.createEl("span", { text: item.label, cls: "setting-item-name" });
      }
    });

    this.buildSection(p, "力の強さ", (body) => {
      this.addSlider(body, "中心力", 0, 0.2, 0.005, this.panel.centerForce, (v) => { this.panel.centerForce = v; this.updateForces(); });
      this.addSlider(body, "反発力", 0, 1000, 10, this.panel.repelForce, (v) => { this.panel.repelForce = v; this.updateForces(); });
      this.addSlider(body, "リンクの力", 0, 0.1, 0.002, this.panel.linkForce, (v) => { this.panel.linkForce = v; this.updateForces(); });
      this.addSlider(body, "リンク距離", 20, 500, 10, this.panel.linkDistance, (v) => { this.panel.linkDistance = v; this.updateForces(); });
    });
  }

  private buildSection(container: HTMLElement, title: string, build: (body: HTMLElement) => void) {
    const section = container.createDiv({ cls: "graph-control-section tree-item" });
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
    const body = section.createDiv({ cls: "tree-item-children" });
    build(body);
    header.addEventListener("click", () => {
      const collapsed = section.hasClass("is-collapsed");
      section.toggleClass("is-collapsed", !collapsed);
    });
  }

  private addSlider(container: HTMLElement, label: string, min: number, max: number, step: number, initial: number, onChange: (v: number) => void) {
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
  }

  private addToggle(container: HTMLElement, label: string, initial: boolean, onChange: (v: boolean) => void) {
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

  private addDirectionToggle(container: HTMLElement, label: string, initial: 1 | -1, onChange: (v: 1 | -1) => void) {
    const row = container.createDiv({ cls: "setting-item" });
    const info = row.createDiv({ cls: "setting-item-info" });
    info.createDiv({ cls: "setting-item-name", text: label });
    const control = row.createDiv({ cls: "setting-item-control" });
    const btn = control.createEl("button", { cls: "ngp-direction-btn", text: initial === 1 ? "時計回り ↻" : "反時計回り ↺" });
    btn.addEventListener("click", () => {
      const next: 1 | -1 = btn.textContent?.includes("時計回り ↻") ? -1 : 1;
      btn.textContent = next === 1 ? "時計回り ↻" : "反時計回り ↺";
      onChange(next);
    });
  }

  private renderGroupList(container: HTMLElement) {
    container.empty();
    this.panel.groups.forEach((g, i) => {
      const row = container.createDiv({ cls: "ngp-group-item" });
      const colorDot = row.createDiv({ cls: "ngp-group-color" });
      colorDot.style.background = g.color;
      colorDot.addEventListener("click", () => {
        const next = DEFAULT_COLORS[(DEFAULT_COLORS.indexOf(g.color as typeof DEFAULT_COLORS[number]) + 1) % DEFAULT_COLORS.length];
        g.color = next;
        colorDot.style.background = next;
        this.doRender();
      });
      const input = row.createEl("input", { cls: "ngp-group-query", type: "text", placeholder: "検索クエリ..." });
      input.value = g.query;
      input.addEventListener("input", () => { g.query = input.value.toLowerCase(); this.doRender(); });
      const rm = row.createEl("span", { cls: "ngp-group-remove", text: "\u00D7" });
      rm.addEventListener("click", () => { this.panel.groups.splice(i, 1); this.renderGroupList(container); this.doRender(); });
    });
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

    if (!this.panel.showTagNodes) {
      nodes = nodes.filter((n) => !n.isTag);
      edges = edges.filter((e) => e.type !== "has-tag");
    }

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
    this.relationColors = buildRelationColorMap(gd.edges);
    this.adj = buildAdj(gd);
    const baseSize = this.panel.nodeSize;

    const nodeR = (n: GraphNode) => Math.max(baseSize, baseSize + Math.sqrt(this.degrees.get(n.id) || 0) * 1.5);
    const defaultNodeColor = cssColorToHex(DEFAULT_COLORS[0]);
    const nodeColor = (n: GraphNode): number => {
      for (const grp of this.panel.groups) {
        if (grp.query && n.label.toLowerCase().includes(grp.query)) return cssColorToHex(grp.color);
      }
      if (!this.panel.colorNodesByCategory) return defaultNodeColor;
      const css = n.category ? (colorMap.get(n.category) || DEFAULT_COLORS[0]) : DEFAULT_COLORS[0];
      return cssColorToHex(css);
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
      this.simulation = d3.forceSimulation<GraphNode>(gd.nodes)
        .force("charge", d3.forceManyBody().strength(-this.panel.repelForce).theta(0.9))
        .force("center", d3.forceCenter(cx, cy).strength(this.panel.centerForce))
        .force("link", d3.forceLink<GraphNode, GraphEdge>(gd.edges)
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
        .alphaDecay(0.05)
        .velocityDecay(0.4)
        .on("tick", () => {
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
    this.createPixiNodes(ld.nodes, nodeR, nodeColor);
    this.updatePositions();
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
      .force("charge", d3.forceManyBody().strength(-this.panel.repelForce).theta(0.9))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(this.panel.centerForce));
    const linkForce = this.simulation.force("link") as d3.ForceLink<GraphNode, GraphEdge> | undefined;
    if (linkForce) {
      linkForce
        .distance((e: GraphEdge) => {
          if (e.type === "inheritance" || e.type === "aggregation") return this.panel.linkDistance * 0.5;
          if (e.type === "has-tag") return this.panel.linkDistance * 0.7;
          return this.panel.linkDistance;
        })
        .strength((e: GraphEdge) => {
          if (e.type === "inheritance" || e.type === "aggregation") return this.panel.linkForce * 3;
          if (e.type === "has-tag") return this.panel.linkForce * 1.5;
          return this.panel.linkForce;
        });
    }
    this.simulation.alpha(0.5).restart();
    this.wakeRenderLoop();
  }

  private applySearch() {
    const q = this.panel.searchQuery;
    for (const pn of this.pixiNodes.values()) {
      if (!q) {
        pn.gfx.alpha = 1;
        this.drawNodeCircle(pn, false);
      } else if (pn.data.label.toLowerCase().includes(q)) {
        pn.gfx.alpha = 1;
        // Search highlight: yellow stroke
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

    const svg = d3.select(svgEl);
    const root = buildSunburstData(this.app, this.plugin.settings.groupField);
    const arcs = computeSunburstArcs(root, W, H);
    const cx = W / 2, cy = H / 2;
    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 3])
      .on("zoom", (ev) => g.attr("transform", `translate(${cx},${cy}) ${ev.transform}`));
    svg.call(zoom);
    const arcGen = d3.arc<{ x0: number; x1: number; y0: number; y1: number }>()
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function yieldFrame(): Promise<void> { return new Promise((r) => requestAnimationFrame(() => r())); }

function buildAdj(gd: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of gd.nodes) adj.set(n.id, new Set());
  for (const e of gd.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  return adj;
}

function cssColorToHex(css: string): number {
  if (css.startsWith("#")) {
    return parseInt(css.slice(1), 16);
  }
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
  }
  return 0x6366f1;
}
