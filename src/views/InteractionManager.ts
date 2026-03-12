import { CanvasApp, CanvasContainer, CanvasGraphics, CanvasText } from "./canvas2d";
import { Platform } from "obsidian";
import type { GraphNode, LayoutType, ShellInfo } from "../types";
import { repositionShell } from "../layouts/concentric";
import type { Simulation } from "d3-force";

// ---------------------------------------------------------------------------
// PixiNode shape (mirrors the one in GraphViewContainer)
// ---------------------------------------------------------------------------
export interface PixiNode {
  data: GraphNode;
  gfx: CanvasContainer;
  circle: CanvasGraphics;
  label: CanvasText | null;
  hoverLabel: CanvasText | null;
  radius: number;
  color: number;
  held: boolean;
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
}

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

  // Bound handlers for removal
  private _onWheel: (e: WheelEvent) => void;
  private _onPointerDown: (e: PointerEvent) => void;
  private _onPointerMove: (e: PointerEvent) => void;
  private _onPointerUp: (e: PointerEvent) => void;
  private _onPointerLeave: () => void;
  private _onDblClick: ((e: MouseEvent) => void) | null = null;

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
    }
  }

  /** Remove all event listeners and clean up PIXI resources */
  detach() {
    this.canvas.removeEventListener("wheel", this._onWheel);
    this.canvas.removeEventListener("pointerdown", this._onPointerDown);
    this.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.canvas.removeEventListener("pointerup", this._onPointerUp);
    this.canvas.removeEventListener("pointerleave", this._onPointerLeave);
    if (this._onDblClick) {
      this.canvas.removeEventListener("dblclick", this._onDblClick);
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

    const scaleFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldPos = world.toLocal({ x: mx, y: my }, app.stage);
    world.scale.x *= scaleFactor;
    world.scale.y *= scaleFactor;
    // Clamp scale
    const s = Math.max(0.02, Math.min(10, world.scale.x));
    world.scale.set(s);
    const newScreenPos = world.toGlobal(worldPos);
    world.x += mx - newScreenPos.x;
    world.y += my - newScreenPos.y;

    this.host.markDirty();
    // Update label visibility for semantic zoom
    (this.host as any).updateLabelsForZoom?.();
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
      // Concentric: rotate shell instead of dragging individual node
      if (this.host.getCurrentLayout() === "concentric" && this.host.getShells().length > 0) {
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
        sim.alphaTarget(0.3).restart();
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
      this.marqueeGraphics.lineStyle(1.5, marqueeColor, 0.9);
      this.marqueeGraphics.beginFill(marqueeColor, 0.08);
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
    }
  }

  // -----------------------------------------------------------------------
  // Pointer up
  // -----------------------------------------------------------------------
  private handlePointerUp(e: PointerEvent) {
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
        if (w > 10 && h > 10) {
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
        if (!e.ctrlKey && !e.metaKey) {
          // Without Ctrl: clear all other holds first
          this.host.clearAllHolds();
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
    if (!hit) return;
    // Handle super node expand/collapse first
    if (this.host.handleSuperNodeDblClick(hit)) return;
    // Default: open file
    if (hit.data.filePath) {
      this.host.openFile(hit.data.filePath);
    }
  }
}
