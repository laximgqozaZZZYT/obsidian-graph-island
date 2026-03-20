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
  /** True when label was force-shown by hover (needs restore on hover-clear). */
  hoverForcedLabel: boolean;
  /** Sub-labels showing additional metadata fields below the node */
  subLabels: CanvasText[];
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
  /** Feature CY: export N-hop subgraph as JSON download */
  exportSubgraph?(nodeId: string): void;
  /** Create a new note at the given world coordinates (Phase 4a) */
  createNoteAtPosition?(wx: number, wy: number): void;
  /** I2: Insert a blank placeholder node at the given world coordinates */
  insertBlankNode?(wx: number, wy: number): void;
  /** Set search query and trigger filter (context menu shortcut) */
  setSearchQuery(query: string): void;
  /** Export full graph as JSON download */
  exportFullGraph?(): void;
  /** F2: Whether inline ontology editor is enabled */
  isInlineOntologyEnabled?(): boolean;
  /** C3: Whether relation type picker is enabled */
  isRelationTypePickerEnabled?(): boolean;
  /** F2: Set ontology type on a node via frontmatter */
  setNodeOntologyType?(nodeId: string, type: string): void;
  /** C3: Add a typed relation between two nodes via frontmatter */
  addRelationToNode?(nodeId: string, targetId: string, relType: string): void;
  /** Get neighbor IDs for a node */
  getNeighborIds?(nodeId: string): string[];
  /** C6: Toggle multi-select for a node */
  toggleMultiSelect?(nodeId: string): void;
  /** D5: Toggle cluster compare for a node's cluster */
  toggleClusterCompare?(nodeId: string): void;
  /** D5: Whether cluster compare is enabled */
  isClusterCompareEnabled?(): boolean;
  /** C4: Whether manual clustering is enabled */
  isManualClusteringEnabled?(): boolean;
  /** C4: Get available cluster group keys */
  getClusterGroupKeys?(): string[];
  /** C4: Set a node's manual cluster override */
  setManualCluster?(nodeId: string, groupKey: string): void;
  /** C7: Show inline editor for a node */
  showInlineEditor?(pn: PixiNode): void;
  /** C7: Whether inline edit is enabled */
  isInlineEditEnabled?(): boolean;
  /** I1: Persist node position after drag */
  saveDragPosition?(nodeId: string, x: number, y: number): void;
  /** D1: Toggle expand/collapse of a node's neighbors in local graph mode */
  toggleExpandNode?(nodeId: string): void;
  /** D1: Check if a node is expanded */
  isNodeExpanded?(nodeId: string): boolean;
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
  private _dragStartX = 0;
  private _dragStartY = 0;
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
      this._dragStartX = hit.data.x;
      this._dragStartY = hit.data.y;
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

      // Drag distance limit: auto-release if dragged too far (prevents node loss)
      const dragDist = Math.sqrt(
        (nx - this._dragStartX) ** 2 + (ny - this._dragStartY) ** 2
      );
      const maxDist = Math.max(this.canvas.width, this.canvas.height) * 3 / (world.scale.x || 1);
      if (dragDist > maxDist) {
        // Snap back to start position
        this.draggedNode.data.x = this._dragStartX;
        this.draggedNode.data.y = this._dragStartY;
        const sim = this.host.getSimulation();
        if (sim) {
          this.draggedNode.data.fx = undefined as any;
          this.draggedNode.data.fy = undefined as any;
        }
        this.draggedNode = null;
        this.host.markDirty();
        return;
      }

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
        if (e.shiftKey && this.host.toggleMultiSelect) {
          // Shift+click: multi-select toggle (C6)
          this.host.toggleMultiSelect(node.data.id);
          this.host.markDirty(true);
          this.draggedNode = null;
          this.isPanning = false;
          return;
        } else if (e.altKey) {
          // B2: Alt+click: pathfinder — first alt+click sets start, second sets end
          const pf = this.host.getPathfinderState();
          if (!pf.startId) {
            this.host.setPathfinderNode(node.data.id, "start");
          } else if (!pf.endId) {
            this.host.setPathfinderNode(node.data.id, "end");
          } else {
            // Both set — reset and set new start
            this.host.clearPathfinder();
            this.host.setPathfinderNode(node.data.id, "start");
          }
          this.draggedNode = null;
          this.isPanning = false;
          return;
        } else if (e.ctrlKey || e.metaKey) {
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
        // I1: Auto-persist drag position
        this.host.saveDragPosition?.(node.data.id, node.data.x, node.data.y);
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
    // C7: Inline edit — show editor overlay instead of opening file
    if (this.host.isInlineEditEnabled?.() && this.host.showInlineEditor) {
      this.host.showInlineEditor(hit);
      return;
    }
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

    e.preventDefault();

    // Empty canvas right-click: show canvas context menu
    if (!hit) {
      this._showCanvasContextMenu(e, worldPt);
      return;
    }

    const menu = new Menu();
    const node = hit;

    // --- Section: Open ---
    if (node.data.filePath) {
      menu.addItem((item) => {
        item.setTitle(t("context.openFile"))
          .setIcon("file-text")
          .onClick(() => this.host.openFile(node.data.filePath!));
      });
    }

    // --- Section: Linked nodes ---
    const neighborIds = this.host.getNeighborIds?.(node.data.id) ?? [];
    if (neighborIds.length > 0) {
      menu.addSeparator();
      const topNeighbors = neighborIds.slice(0, 8);
      for (const nbId of topNeighbors) {
        const nbPn = this.host.getPixiNodes().get(nbId);
        if (!nbPn) continue;
        const nbLabel = nbPn.data.label || nbId.split("/").pop() || nbId;
        menu.addItem((item) => {
          item.setTitle(`→ ${nbLabel}`)
            .setIcon("arrow-right")
            .onClick(() => {
              this.host.setHighlightedNodeId(nbId);
              this.host.applyHover();
              if (nbPn.data.filePath) this.host.openFile(nbPn.data.filePath);
            });
        });
      }
      if (neighborIds.length > 8) {
        menu.addItem((item) => {
          item.setTitle(`… +${neighborIds.length - 8} more`)
            .setIcon("more-horizontal")
            .setDisabled(true);
        });
      }
    }

    // --- Section: Edit ---
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle(node.held ? t("context.unpin") : t("context.pin"))
        .setIcon(node.held ? "pin-off" : "pin")
        .onClick(() => this.host.toggleHold(node));
    });

    // Search in vault
    menu.addItem((item) => {
      item.setTitle("Search in vault")
        .setIcon("search")
        .onClick(() => {
          const app = this.host.getApp();
          (app as any).commands.executeCommandById("global-search:open");
          // Delay to let search pane open, then set query
          setTimeout(() => {
            const searchLeaf = app.workspace.getLeavesOfType("search")[0];
            if (searchLeaf) {
              const search = (searchLeaf.view as any);
              if (search?.setQuery) search.setQuery(node.data.label);
            }
          }, 300);
        });
    });

    const copyText = node.data.filePath || node.data.id;
    menu.addItem((item) => {
      item.setTitle(t("context.copyPath"))
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

    // D1: Expand/collapse node neighbors (local graph mode only)
    if (this.host.toggleExpandNode) {
      const isExpanded = this.host.isNodeExpanded?.(node.data.id) ?? false;
      menu.addItem((item) => {
        item.setTitle(isExpanded ? t("context.collapse") : t("context.expand"))
          .setIcon(isExpanded ? "minimize-2" : "maximize-2")
          .onClick(() => this.host.toggleExpandNode!(node.data.id));
      });
    }

    // Export subgraph (Feature CY)
    if (this.host.exportSubgraph) {
      menu.addItem((item) => {
        item.setTitle(t("context.exportSubgraph"))
          .setIcon("download")
          .onClick(() => this.host.exportSubgraph!(node.data.id));
      });
    }

    // Filter shortcuts
    menu.addSeparator();
    if (node.data.filePath) {
      const folder = node.data.filePath.split("/").slice(0, -1).join("/");
      if (folder) {
        menu.addItem((item) => {
          item.setTitle(`Filter: ${folder}`)
            .setIcon("folder")
            .onClick(() => this.host.setSearchQuery(`path:${folder}`));
        });
      }
    }
    if (node.data.tags && node.data.tags.length > 0) {
      const firstTag = node.data.tags[0];
      menu.addItem((item) => {
        item.setTitle(`Filter: #${firstTag}`)
          .setIcon("tag")
          .onClick(() => this.host.setSearchQuery(`tag:${firstTag}`));
      });
    }

    // --- Section: Navigate ---
    menu.addSeparator();
    const pfState = this.host.getPathfinderState();
    menu.addItem((item) => {
      item.setTitle(t("context.pathStart"))
        .setIcon("navigation")
        .onClick(() => this.host.setPathfinderNode(node.data.id, "start"));
    });
    menu.addItem((item) => {
      item.setTitle(t("context.pathEnd"))
        .setIcon("flag")
        .onClick(() => this.host.setPathfinderNode(node.data.id, "end"));
    });
    if (pfState.startId || pfState.endId) {
      menu.addItem((item) => {
        item.setTitle(t("context.pathClear"))
          .setIcon("x")
          .onClick(() => this.host.clearPathfinder());
      });
    }

    // F2: Inline ontology editor — set node type
    if (this.host.isInlineOntologyEnabled?.()) {
      menu.addSeparator();
      const ontologyTypes = ["is-a", "has-a", "similar"];
      for (const otype of ontologyTypes) {
        menu.addItem((item) => {
          item.setTitle(t("context.setType").replace("{type}", otype))
            .setIcon("tag")
            .onClick(() => this.host.setNodeOntologyType?.(node.data.id, otype));
        });
      }
    }

    // C3: Relation type picker — relate to top 2 neighbors (simplified)
    if (this.host.isRelationTypePickerEnabled?.()) {
      const neighborIds = this.host.getNeighborIds?.(node.data.id) ?? [];
      const topNeighbors = neighborIds.slice(0, 2);
      if (topNeighbors.length > 0) {
        menu.addSeparator();
        for (const nbId of topNeighbors) {
          const nbPn = this.host.getPixiNodes().get(nbId);
          if (!nbPn) continue;
          const nbLabel = nbPn.data.label || nbId;
          menu.addItem((item) => {
            item.setTitle(`Link → ${nbLabel}`)
              .setIcon("git-branch")
              .onClick(() => this.host.addRelationToNode?.(node.data.id, nbId, "is-a"));
          });
        }
      }
    }

    // D5: Cluster compare
    if (this.host.isClusterCompareEnabled?.()) {
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle(t("context.clusterCompare"))
          .setIcon("git-compare")
          .onClick(() => this.host.toggleClusterCompare?.(node.data.id));
      });
    }

    // C4: Manual clustering — move to group
    if (this.host.isManualClusteringEnabled?.()) {
      const groupKeys = this.host.getClusterGroupKeys?.() ?? [];
      if (groupKeys.length > 0) {
        menu.addSeparator();
        for (const gk of groupKeys.slice(0, 5)) {
          menu.addItem((item) => {
            item.setTitle(t("context.moveTo").replace("{group}", gk))
              .setIcon("folder")
              .onClick(() => this.host.setManualCluster?.(node.data.id, gk));
          });
        }
      }
    }

    // C6: Multi-select
    if (this.host.toggleMultiSelect) {
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle(t("context.multiSelect"))
          .setIcon("check-square")
          .onClick(() => this.host.toggleMultiSelect!(node.data.id));
      });
    }

    menu.showAtPosition({ x: e.clientX, y: e.clientY });
  }

  // -----------------------------------------------------------------------
  // Canvas context menu (right-click on empty space)
  // -----------------------------------------------------------------------
  private _showCanvasContextMenu(e: MouseEvent, worldPt: { x: number; y: number }) {
    const menu = new Menu();

    // Create note here (4a)
    if (this.host.createNoteAtPosition) {
      menu.addItem((item) => {
        item.setTitle(t("context.createNote"))
          .setIcon("file-plus")
          .onClick(() => this.host.createNoteAtPosition!(worldPt.x, worldPt.y));
      });
    }

    // I2: Insert blank placeholder node
    if (this.host.insertBlankNode) {
      menu.addItem((item) => {
        item.setTitle(t("context.insertBlank"))
          .setIcon("plus-circle")
          .onClick(() => this.host.insertBlankNode!(worldPt.x, worldPt.y));
      });
    }

    // Export full graph as JSON
    if (this.host.exportFullGraph) {
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle("Export Graph JSON")
          .setIcon("download")
          .onClick(() => this.host.exportFullGraph!());
      });
    }

    menu.showAtPosition({ x: e.clientX, y: e.clientY });
  }
}
