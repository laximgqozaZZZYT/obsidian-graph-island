import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import { Menu, Platform, type App } from "obsidian";
import type { GraphNode, LayoutType, ShellInfo } from "../types";
import { repositionShell } from "../layouts/concentric";
import type { Simulation } from "d3-force";
import { LAYOUT_CONCENTRIC } from "../constants";
import { t } from "../i18n";

// ---------------------------------------------------------------------------
// PixiNode shape (mirrors the one in GraphViewContainer)
// ---------------------------------------------------------------------------
export interface PixiNode {
  data: GraphNode;
  gfx: CanvasContainer;
  circle: CanvasGraphics;
  label: CanvasText | null;
  /** Tag label displayed below the node (LOD-gated) */
  tagLabel: CanvasText | null;
  hoverLabel: CanvasText | null;
  leaderLine: CanvasGraphics | null;
  radius: number;
  color: number;
  held: boolean;
  /** Sort rank (0 = highest/most prominent, increases downward). -1 = unranked. */
  sortRank: number;
  /** Pre-computed LOD priority score (higher = shown at lower zoom). */
  priorityScore: number;
  /** Minimum zoom level at which this node's label becomes visible. */
  minShowZoom: number;
  /** Whether label was visible in the previous zoom update (hysteresis). */
  labelWasVisible: boolean;
}

// ---------------------------------------------------------------------------
// InteractionHost — the interface the InteractionManager needs from its parent
// ---------------------------------------------------------------------------
export interface InteractionHost {
  /** Hit-test a world-coordinate point against the spatial grid */
  hitTestNode(wx: number, wy: number): PixiNode | null;
  /** Mark the render loop as needing a redraw */
  markDirty(forceFullRedraw?: boolean): void;
  /** Apply hover highlight based on current highlightedNodeId */
  applyHover(): void;
  /** Get/set the currently highlighted (hovered) node ID */
  getHighlightedNodeId(): string | null;
  setHighlightedNodeId(id: string | null): void;
  /** Current layout type */
  getCurrentLayout(): LayoutType;
  /** Concentric layout shell data */
  getShells(): ShellInfo[];
  getNodeShellIndex(): Map<string, number>;
  /** The PIXI node map */
  getPixiNodes(): Map<string, PixiNode>;
  /** The d3 force simulation (null for static layouts) */
  getSimulation(): Simulation<GraphNode, any> | null;
  /** Open a file in the workspace */
  openFile(filePath: string): void;
  /** Toggle hold (pin) state for a node */
  toggleHold(pn: PixiNode): void;
  applyFocusOnClick?(nodeId: string): void;
  /** Clear all held (pinned) nodes */
  clearAllHolds(): void;
  /** Get the accent color (for marquee drawing) */
  getAccentColor(): number;
  /** Zoom the view to fit a screen-space rectangle */
  zoomToScreenRect(sx: number, sy: number, sw: number, sh: number): void;
  /** The CanvasApp instance (for coordinate transforms) */
  getPixiApp(): CanvasApp | null;
  /** Handle double-click on a super node (collapsed group) — returns true if handled */
  handleSuperNodeDblClick(pn: PixiNode): boolean;
  /** Set pathfinder start or end node */
  setPathfinderNode(nodeId: string, role: "start" | "end"): void;
  /** Clear pathfinder state */
  clearPathfinder(): void;
  /** Get current pathfinder state */
  getPathfinderState(): { startId: string | null; endId: string | null };
  /** Get the Obsidian App instance (for hover-link events) */
  getApp(): App;
  /** Get the view's container element (for hover-link parent) */
  getContainerEl(): HTMLElement;
  /** Called when zoom changes — debounced layout recalculation */
  onZoomLayoutUpdate?(zoom: number): void;
  /** Update label visibility for semantic zoom */
  updateLabelsForZoom?(): void;
  /** Update the on-screen zoom percentage indicator */
  updateZoomIndicator?(scale: number): void;
  /** 比較選択にノードを追加 (最大2件、FIFO) */
  addCompareNode(nodeId: string): void;
  /** 比較選択をクリア */
  clearCompareSelection(): void;
  /** キャンバス空白ダブルクリック: 注釈を追加 */
  addAnnotationAt?(wx: number, wy: number): void;
  /** ブックマークの追加/削除 */
  toggleBookmark?(nodeId: string): void;
  /** ブックマーク済みかどうか判定 */
  isBookmarked?(nodeId: string): boolean;
  /** ビジュアルリンクエディタが有効かどうか */
  isVisualLinkEditorEnabled?(): boolean;
  /** ドラッグでリンク作成 (ソースファイルに [[target]] wikilink を挿入) */
  createLink?(sourceId: string, targetId: string): void;
  /** リンクプレビュー線を描画 (ソースノード中心からワールド座標まで) */
  drawLinkPreview?(srcX: number, srcY: number, dstX: number, dstY: number): void;
  /** リンクプレビュー線をクリア */
  clearLinkPreview?(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Scale multiplier per wheel tick (zoom in / zoom out) */
const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 0.9;

/** Minimum/maximum scale clamp for wheel zoom */
const ZOOM_SCALE_MIN = 0.02;
const ZOOM_SCALE_MAX = 10;

/** d3 simulation alphaTarget when dragging a node */
const DRAG_ALPHA_TARGET = 0.3;

/** Minimum marquee rectangle size (px) to trigger zoom */
const MARQUEE_MIN_SIZE_PX = 10;

/** Debounce delay (ms) for zoom-dependent layout recalculation */
const ZOOM_LAYOUT_DEBOUNCE_MS = 400;
/** Marquee selection stroke width */
const MARQUEE_STROKE_WIDTH = 1.5;
/** Marquee selection stroke alpha */
const MARQUEE_STROKE_ALPHA = 0.9;
/** Marquee selection fill alpha */
const MARQUEE_FILL_ALPHA = 0.08;

// ---------------------------------------------------------------------------
// InteractionManager — owns all pointer/wheel event handling
// ---------------------------------------------------------------------------
export class InteractionManager {
  private host: InteractionHost;
  private canvas: HTMLCanvasElement;
  private world: CanvasContainer;

  // Interaction state
  private draggedNode: PixiNode | null = null;
  private dragOffset = { x: 0, y: 0 };
  private hasDragged = false;
  private isPanning = false;
  private panStart = { x: 0, y: 0 };
  private worldStart = { x: 0, y: 0 };

  // Shell rotation (concentric layout)
  private rotatingShellIdx: number | null = null;
  private rotateStartAngle = 0;
  private rotateStartOffset = 0;

  // Marquee zoom
  marqueeMode = false;
  private isMarqueeActive = false;
  private marqueeStart = { x: 0, y: 0 };
  private marqueeGraphics: CanvasGraphics | null = null;

  // ビジュアルリンクエディタ: Alt+ドラッグでリンク作成
  private dragLinkSource: PixiNode | null = null;

  // Debounced zoom layout recalculation
  private _zoomLayoutTimer = 0;

  // Hover preview: track last hovered node to avoid redundant hover-link events
  private lastHoveredId: string | null = null;

  // Bound handlers for removal
  private _onWheel: (e: WheelEvent) => void;
  private _onPointerDown: (e: PointerEvent) => void;
  private _onPointerMove: (e: PointerEvent) => void;
  private _onPointerUp: (e: PointerEvent) => void;
  private _onPointerLeave: () => void;
  private _onDblClick: ((e: MouseEvent) => void) | null = null;
  private _onContextMenu: ((e: MouseEvent) => void) | null = null;

  constructor(host: InteractionHost, canvas: HTMLCanvasElement, world: CanvasContainer) {
    this.host = host;
    this.canvas = canvas;
    this.world = world;

    this._onWheel = this.handleWheel.bind(this);
    this._onPointerDown = this.handlePointerDown.bind(this);
    this._onPointerMove = this.handlePointerMove.bind(this);
    this._onPointerUp = this.handlePointerUp.bind(this);
    this._onPointerLeave = this.handlePointerLeave.bind(this);

    canvas.addEventListener("wheel", this._onWheel, { passive: false });
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerup", this._onPointerUp);
    canvas.addEventListener("pointerleave", this._onPointerLeave);

    if (!Platform.isMobile) {
      this._onDblClick = this.handleDblClick.bind(this);
      canvas.addEventListener("dblclick", this._onDblClick);
      this._onContextMenu = this.handleContextMenu.bind(this);
      canvas.addEventListener("contextmenu", this._onContextMenu);
    }
  }

  /** Remove all event listeners and clean up PIXI resources */
  detach() {
    clearTimeout(this._zoomLayoutTimer);
    this.canvas.removeEventListener("wheel", this._onWheel);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointerleave", this._onPointerLeave);
    if (this._onDblClick) {
      this.canvas.removeEventListener("dblclick", this._onDblClick);
    }
    if (this._onContextMenu) {
      this.canvas.removeEventListener("contextmenu", this._onContextMenu);
    }
    if (this.marqueeGraphics) {
      this.marqueeGraphics.destroy();
      this.marqueeGraphics = null;
    }
  }

  // -----------------------------------------------------------------------
  // Wheel zoom
  // -----------------------------------------------------------------------
  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const app = this.host.getPixiApp();
    if (!app) return;
    const world = this.world;

    const scaleFactor = e.deltaY < 0 ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldPos = world.toLocal({ x: mx, y: my }, app.stage);
    world.scale.x *= scaleFactor;
    world.scale.y *= scaleFactor;
    // Clamp scale
    const s = Math.max(ZOOM_SCALE_MIN, Math.min(ZOOM_SCALE_MAX, world.scale.x));
    world.scale.set(s);
    const newScreenPos = world.toGlobal(worldPos);
    world.x += mx - newScreenPos.x;
    world.y += my - newScreenPos.y;

    this.host.markDirty();
    // Update label visibility for semantic zoom
    this.host.updateLabelsForZoom?.();
    // Update zoom percentage indicator
    this.host.updateZoomIndicator?.(s);
    // Debounced layout recalculation for zoom-correlated node sizes
    clearTimeout(this._zoomLayoutTimer);
    this._zoomLayoutTimer = window.setTimeout(() => {
      this.host.onZoomLayoutUpdate?.(s);
    }, ZOOM_LAYOUT_DEBOUNCE_MS) as unknown as number;
  }

  // -----------------------------------------------------------------------
  // Pointer down
  // -----------------------------------------------------------------------
  private handlePointerDown(e: PointerEvent) {
    const app = this.host.getPixiApp();
    if (!app) return;
    const world = this.world;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldPt = world.toLocal({ x: mx, y: my }, app.stage);

    const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
    if (hit) {
      // ビジュアルリンクエディタ: Alt+ドラッグでリンク作成開始
      if (e.altKey && this.host.isVisualLinkEditorEnabled?.()) {
        this.dragLinkSource = hit;
        this.hasDragged = false;
        return;
      }
      // Concentric: rotate shell instead of dragging individual node
      if (this.host.getCurrentLayout() === LAYOUT_CONCENTRIC && this.host.getShells().length > 0) {
        const shellIdx = this.host.getNodeShellIndex().get(hit.data.id);
        if (shellIdx !== undefined && shellIdx > 0) {
          const shell = this.host.getShells()[shellIdx];
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
      const sim = this.host.getSimulation();
      if (sim) {
        hit.data.fx = hit.data.x;
        hit.data.fy = hit.data.y;
        sim.alphaTarget(DRAG_ALPHA_TARGET).restart();
      }
    } else if (e.button === 1 || e.altKey) {
      // Middle-click or Alt+drag → pan
      this.isPanning = true;
      this.panStart = { x: mx, y: my };
      this.worldStart = { x: world.x, y: world.y };
    } else if (this.marqueeMode) {
      // Marquee mode active → left-click drag for range zoom
      this.isMarqueeActive = true;
      this.marqueeStart = { x: mx, y: my };
      if (!this.marqueeGraphics) {
        this.marqueeGraphics = new CanvasGraphics();
        app.stage.addChild(this.marqueeGraphics);
      }
      this.marqueeGraphics.clear();
    } else {
      // Default left-click drag on empty space → pan
      this.isPanning = true;
      this.panStart = { x: mx, y: my };
      this.worldStart = { x: world.x, y: world.y };
    }
  }

  // -----------------------------------------------------------------------
  // Pointer move
  // -----------------------------------------------------------------------
  private handlePointerMove(e: PointerEvent) {
    const app = this.host.getPixiApp();
    if (!app) return;
    const world = this.world;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // ビジュアルリンクエディタ: プレビュー線を描画 + ターゲットハイライト
    if (this.dragLinkSource) {
      this.hasDragged = true;
      const worldPt = world.toLocal({ x: mx, y: my }, app.stage);
      // ターゲットノードのハイライト（スナップ）
      const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
      const targetId = (hit && hit !== this.dragLinkSource) ? hit.data.id : null;
      if (targetId !== this.host.getHighlightedNodeId()) {
        this.host.setHighlightedNodeId(targetId);
        this.host.applyHover();
      }
      // ターゲットにスナップする場合はターゲット中心座標を使用
      const dstX = (hit && hit !== this.dragLinkSource) ? hit.data.x : worldPt.x;
      const dstY = (hit && hit !== this.dragLinkSource) ? hit.data.y : worldPt.y;
      this.host.drawLinkPreview?.(this.dragLinkSource.data.x, this.dragLinkSource.data.y, dstX, dstY);
      this.host.markDirty();
      return;
    }
    if (this.rotatingShellIdx !== null) {
      this.hasDragged = true;
      const worldPt = world.toLocal({ x: mx, y: my }, app.stage);
      const shell = this.host.getShells()[this.rotatingShellIdx];
      const currentAngle = Math.atan2(worldPt.y - shell.centerY, worldPt.x - shell.centerX);
      shell.angleOffset = this.rotateStartOffset + (currentAngle - this.rotateStartAngle);
      const nodeMap = new Map<string, GraphNode>();
      for (const pn of this.host.getPixiNodes().values()) nodeMap.set(pn.data.id, pn.data);
      repositionShell(shell, nodeMap);
      this.host.markDirty();
    } else if (this.draggedNode) {
      this.hasDragged = true;
      const worldPt = world.toLocal({ x: mx, y: my }, app.stage);
      const nx = worldPt.x - this.dragOffset.x;
      const ny = worldPt.y - this.dragOffset.y;
      this.draggedNode.data.x = nx;
      this.draggedNode.data.y = ny;
      const sim = this.host.getSimulation();
      if (sim) {
        this.draggedNode.data.fx = nx;
        this.draggedNode.data.fy = ny;
      }
      this.host.markDirty();
    } else if (this.isMarqueeActive && this.marqueeGraphics) {
      this.hasDragged = true;
      const sx = this.marqueeStart.x;
      const sy = this.marqueeStart.y;
      const w = mx - sx;
      const h = my - sy;
      this.marqueeGraphics.clear();
      const marqueeColor = this.host.getAccentColor();
      this.marqueeGraphics.lineStyle(MARQUEE_STROKE_WIDTH, marqueeColor, MARQUEE_STROKE_ALPHA);
      this.marqueeGraphics.beginFill(marqueeColor, MARQUEE_FILL_ALPHA);
      this.marqueeGraphics.drawRect(Math.min(sx, mx), Math.min(sy, my), Math.abs(w), Math.abs(h));
      this.marqueeGraphics.endFill();
    } else if (this.isPanning) {
      world.x = this.worldStart.x + (mx - this.panStart.x);
      world.y = this.worldStart.y + (my - this.panStart.y);
      this.host.markDirty();
    } else {
      // Hover
      const worldPt = world.toLocal({ x: mx, y: my }, app.stage);
      const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
      const newId = hit?.data.id ?? null;
      if (newId !== this.host.getHighlightedNodeId()) {
        this.host.setHighlightedNodeId(newId);
        this.host.applyHover();
        this.host.markDirty(true);
      }
      // Hover preview: fire Obsidian hover-link event (once per node)
      if (newId && newId !== this.lastHoveredId) {
        this.lastHoveredId = newId;
        const filePath = hit?.data.filePath;
        if (filePath) {
          this.host.getApp().workspace.trigger("hover-link", {
            event: e,
            source: "graph-island",
            hoverParent: this.host.getContainerEl(),
            targetEl: e.target,
            linktext: filePath,
            sourcePath: filePath,
          });
        }
      } else if (!newId) {
        this.lastHoveredId = null;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Pointer up
  // -----------------------------------------------------------------------
  private handlePointerUp(e: PointerEvent) {
    // ビジュアルリンクエディタ: ドロップでリンク作成
    if (this.dragLinkSource) {
      const src = this.dragLinkSource;
      this.dragLinkSource = null;
      this.host.clearLinkPreview?.();
      this.host.setHighlightedNodeId(null);
      this.host.applyHover();
      if (this.hasDragged) {
        const app = this.host.getPixiApp();
        if (app) {
          const rect = this.canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
          const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
          // ターゲットがソースと異なるノードの場合のみリンク作成
          if (hit && hit !== src && hit.data.id !== src.data.id) {
            this.host.createLink?.(src.data.id, hit.data.id);
          }
        }
      }
      this.hasDragged = false;
      this.host.markDirty(true);
      return;
    }
    if (this.isMarqueeActive) {
      this.isMarqueeActive = false;
      if (this.marqueeGraphics) {
        this.marqueeGraphics.clear();
      }
      if (this.hasDragged) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const sx = this.marqueeStart.x;
        const sy = this.marqueeStart.y;
        const minSx = Math.min(sx, mx);
        const minSy = Math.min(sy, my);
        const w = Math.abs(mx - sx);
        const h = Math.abs(my - sy);
        // Only zoom if rectangle is large enough (> 10px each dimension)
        if (w > MARQUEE_MIN_SIZE_PX && h > MARQUEE_MIN_SIZE_PX) {
          this.host.zoomToScreenRect(minSx, minSy, w, h);
        }
      }
      this.hasDragged = false;
      return;
    }
    if (this.rotatingShellIdx !== null) {
      this.rotatingShellIdx = null;
      return;
    }
    if (this.draggedNode) {
      const node = this.draggedNode;
      if (!this.hasDragged) {
        // Super node single-click → expand children
        if (node.data.collapsedMembers && node.data.id.startsWith("__super__")) {
          this.host.handleSuperNodeDblClick(node);
          this.draggedNode = null;
          this.host.markDirty(true);
          return;
        }
        // Click (no drag) → toggle hold (pin position)
        if (e.ctrlKey || e.metaKey) {
          // Ctrl+click: 比較選択に追加し、holdもトグル (focusは変更しない)
          this.host.addCompareNode(node.data.id);
        } else {
          // 通常クリック: 他のholdと比較選択をクリア + フォーカス適用
          this.host.clearAllHolds();
          this.host.clearCompareSelection();
          this.host.applyFocusOnClick?.(node.data.id);
        }
        this.host.toggleHold(node);
      } else {
        // Drag ended — if node was held, keep it pinned; otherwise release
        const sim = this.host.getSimulation();
        if (!node.held && sim) {
          node.data.fx = null;
          node.data.fy = null;
        }
      }
      const sim = this.host.getSimulation();
      if (sim) sim.alphaTarget(0);
      this.draggedNode = null;
      this.host.markDirty(true);
    }
    this.isPanning = false;
  }

  // -----------------------------------------------------------------------
  // Pointer leave
  // -----------------------------------------------------------------------
  private handlePointerLeave() {
    // リンクドラッグ中にキャンバスを離れた場合はキャンセル
    if (this.dragLinkSource) {
      this.dragLinkSource = null;
      this.host.clearLinkPreview?.();
    }
    if (!Platform.isMobile && this.host.getHighlightedNodeId()) {
      this.host.setHighlightedNodeId(null);
      this.host.applyHover();
      this.host.markDirty(true);
    }
  }

  // -----------------------------------------------------------------------
  // Double-click to open file
  // -----------------------------------------------------------------------
  private handleDblClick(e: MouseEvent) {
    const app = this.host.getPixiApp();
    if (!app) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
    const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
    if (!hit) {
      // 空白ダブルクリック: 注釈を追加
      if (this.host.addAnnotationAt) {
        this.host.addAnnotationAt(worldPt.x, worldPt.y);
      }
      return;
    }
    // Handle super node expand/collapse first
    if (this.host.handleSuperNodeDblClick(hit)) return;
    // Default: open file
    if (hit.data.filePath) {
      this.host.openFile(hit.data.filePath);
    }
  }

  // -----------------------------------------------------------------------
  // Context menu (right-click on node)
  // -----------------------------------------------------------------------
  private handleContextMenu(e: MouseEvent) {
    const app = this.host.getPixiApp();
    if (!app) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldPt = this.world.toLocal({ x: mx, y: my }, app.stage);
    const hit = this.host.hitTestNode(worldPt.x, worldPt.y);
    if (!hit) return;

    e.preventDefault();
    const menu = new Menu();
    const node = hit;

    // Open file
    if (node.data.filePath) {
      menu.addItem((item) => {
        item.setTitle("Open file")
          .setIcon("file-text")
          .onClick(() => this.host.openFile(node.data.filePath!));
      });
    }

    // Pin / Unpin
    menu.addItem((item) => {
      item.setTitle(node.held ? "Unpin" : "Pin")
        .setIcon(node.held ? "pin-off" : "pin")
        .onClick(() => this.host.toggleHold(node));
    });

    // Copy node ID / path
    const copyText = node.data.filePath || node.data.id;
    menu.addItem((item) => {
      item.setTitle("Copy path")
        .setIcon("copy")
        .onClick(() => navigator.clipboard.writeText(copyText));
    });

    // ブックマーク
    if (this.host.toggleBookmark) {
      const isBookmarked = this.host.isBookmarked?.(node.data.id) ?? false;
      menu.addItem((item) => {
        item.setTitle(isBookmarked ? t("bookmark.remove") : t("bookmark.add"))
          .setIcon(isBookmarked ? "star-off" : "star")
          .onClick(() => this.host.toggleBookmark!(node.data.id));
      });
    }

    // Pathfinder
    menu.addSeparator();
    const pfState = this.host.getPathfinderState();
    menu.addItem((item) => {
      item.setTitle("Path: set start")
        .setIcon("navigation")
        .onClick(() => this.host.setPathfinderNode(node.data.id, "start"));
    });
    menu.addItem((item) => {
      item.setTitle("Path: set end")
        .setIcon("flag")
        .onClick(() => this.host.setPathfinderNode(node.data.id, "end"));
    });
    if (pfState.startId || pfState.endId) {
      menu.addItem((item) => {
        item.setTitle("Path: clear")
          .setIcon("x")
          .onClick(() => this.host.clearPathfinder());
      });
    }

    menu.showAtPosition({ x: e.clientX, y: e.clientY });
  }
}
