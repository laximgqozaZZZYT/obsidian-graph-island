/**
 * Minimap — a small overview of the full graph shown as a 2D canvas overlay.
 * Shows all node positions as dots and a viewport rectangle.
 * Click or drag on the minimap to pan the main view.
 */

import type { RenderThresholds } from "../types";
import { computeBoundingBox } from "../utils/geometry";

export interface MinimapHost {
  /** Get all node positions (world coordinates) */
  getNodePositions(): { x: number; y: number; id: string }[];
  /** Get the world container transform */
  getWorldTransform(): { x: number; y: number; scaleX: number; scaleY: number };
  /** Get the canvas/viewport dimensions */
  getViewportSize(): { width: number; height: number };
  /** Set world container position (for pan via minimap click) */
  setWorldPosition(x: number, y: number): void;
  /** Wake the render loop */
  wakeRenderLoop(): void;
}

const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;

/** World bounds padding for node extent calculation */
const MINIMAP_BOUNDS_PAD = 50;

/** Dot radius scale threshold — large graphs (>2000 nodes) */
const MINIMAP_LARGE_GRAPH_THRESHOLD = 2000;
/** Dot radius scale threshold — medium graphs (>500 nodes) */
const MINIMAP_MEDIUM_GRAPH_THRESHOLD = 500;
/** Dot radius multiplier for large graphs */
const MINIMAP_DOT_SCALE_LARGE = 0.6;
/** Dot radius multiplier for medium graphs */
const MINIMAP_DOT_SCALE_MEDIUM = 0.8;

/** Viewport rectangle stroke width */
const MINIMAP_VIEWPORT_LINE_WIDTH = 1.5;
/** Minimum viewport rect dimension to trigger drawing */
const MINIMAP_VIEWPORT_MIN_SIZE = 2;

interface MinimapBounds {
  minX: number;
  minY: number;
  scale: number;
}

export class Minimap {
  private wrapper: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private host: MinimapHost;
  private visible = true;
  private isPanning = false;
  private bounds: MinimapBounds | null = null;
  private renderThresholds: RenderThresholds | null = null;

  // --- Drag-to-move state ---
  private isMoving = false;
  private moveStartX = 0;
  private moveStartY = 0;
  private moveStartLeft = 0;
  private moveStartTop = 0;

  // --- Theme colors (read from CSS variables) ---
  private colorBg = "rgba(30,30,50,0.80)";
  private colorDot = "rgba(140,170,255,0.9)";
  private colorViewport = "rgba(255,255,255,0.85)";

  constructor(host: MinimapHost, parentEl: HTMLElement) {
    this.host = host;

    // Wrapper div for positioning
    this.wrapper = document.createElement("div");
    this.wrapper.className = "gi-minimap-wrap";
    this.wrapper.setAttribute("role", "img");
    this.wrapper.setAttribute("aria-label", "Graph minimap — drag to navigate");
    parentEl.appendChild(this.wrapper);

    // Drag handle bar
    const handle = document.createElement("div");
    handle.className = "gi-minimap-handle";
    this.wrapper.appendChild(handle);
    handle.addEventListener("mousedown", this.onHandleDown);

    // Canvas
    this.canvas = document.createElement("canvas");
    this.canvas.width = MINIMAP_WIDTH;
    this.canvas.height = MINIMAP_HEIGHT;
    this.canvas.className = "gi-minimap";
    this.ctx = this.canvas.getContext("2d")!;
    this.wrapper.appendChild(this.canvas);

    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("mousemove", this.onHandleMove);

    this.refreshColors();
  }

  /** Read CSS custom properties for theme-aware minimap colors */
  refreshColors() {
    const s = getComputedStyle(this.wrapper);
    this.colorBg = s.getPropertyValue("--gi-minimap-bg").trim() || this.colorBg;
    this.colorDot = s.getPropertyValue("--gi-minimap-dot").trim() || this.colorDot;
    this.colorViewport = s.getPropertyValue("--gi-minimap-viewport").trim() || this.colorViewport;
  }

  setRenderThresholds(rt: RenderThresholds) {
    this.renderThresholds = rt;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.wrapper.style.display = v ? "" : "none";
  }

  draw() {
    if (!this.visible) return;
    const ctx = this.ctx;
    const nodes = this.host.getNodePositions();
    if (nodes.length === 0) {
      ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
      return;
    }

    // Compute bounds of all nodes
    const bb = computeBoundingBox(nodes);
    let { minX, minY, maxX, maxY } = bb;
    const pad = MINIMAP_BOUNDS_PAD;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const worldW = maxX - minX || 1;
    const worldH = maxY - minY || 1;

    const scale = Math.min(MINIMAP_WIDTH / worldW, MINIMAP_HEIGHT / worldH);
    const toMx = (wx: number) => (wx - minX) * scale;
    const toMy = (wy: number) => (wy - minY) * scale;

    // Store for click-to-pan
    this.bounds = { minX, minY, scale };

    // Clear
    ctx.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Background
    ctx.fillStyle = this.colorBg;
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw nodes as dots (thin if too many)
    ctx.fillStyle = this.colorDot;
    const thinThreshold = this.renderThresholds?.minimapThinThreshold ?? 800;
    const thinStep = this.renderThresholds?.minimapThinStep ?? 3;
    const baseDotR = this.renderThresholds?.minimapDotRadius ?? 2.5;
    const step = nodes.length > thinThreshold ? thinStep : 1;
    // Scale dot radius down slightly for very large graphs
    const dotR = nodes.length > MINIMAP_LARGE_GRAPH_THRESHOLD ? baseDotR * MINIMAP_DOT_SCALE_LARGE : nodes.length > MINIMAP_MEDIUM_GRAPH_THRESHOLD ? baseDotR * MINIMAP_DOT_SCALE_MEDIUM : baseDotR;
    for (let i = 0; i < nodes.length; i += step) {
      const n = nodes[i];
      ctx.beginPath();
      ctx.arc(toMx(n.x), toMy(n.y), dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw viewport rectangle (clamped to minimap bounds)
    const wt = this.host.getWorldTransform();
    const vp = this.host.getViewportSize();
    const vpWorldX = -wt.x / wt.scaleX;
    const vpWorldY = -wt.y / wt.scaleY;
    const vpWorldW = vp.width / wt.scaleX;
    const vpWorldH = vp.height / wt.scaleY;

    let rx = toMx(vpWorldX);
    let ry = toMy(vpWorldY);
    let rw = vpWorldW * scale;
    let rh = vpWorldH * scale;

    // Clamp to minimap canvas
    if (rx < 0) { rw += rx; rx = 0; }
    if (ry < 0) { rh += ry; ry = 0; }
    if (rx + rw > MINIMAP_WIDTH) rw = MINIMAP_WIDTH - rx;
    if (ry + rh > MINIMAP_HEIGHT) rh = MINIMAP_HEIGHT - ry;

    // Only draw if viewport doesn't cover the entire minimap
    if (rw > MINIMAP_VIEWPORT_MIN_SIZE && rh > MINIMAP_VIEWPORT_MIN_SIZE && (rw < MINIMAP_WIDTH - MINIMAP_VIEWPORT_MIN_SIZE || rh < MINIMAP_HEIGHT - MINIMAP_VIEWPORT_MIN_SIZE)) {
      ctx.strokeStyle = this.colorViewport;
      ctx.lineWidth = MINIMAP_VIEWPORT_LINE_WIDTH;
      ctx.strokeRect(rx, ry, rw, rh);
    }
  }

  // --- Canvas pan (click inside minimap to pan viewport) ---
  private onMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    this.isPanning = true;
    this.panToMinimapClick(e);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isPanning) return;
    this.panToMinimapClick(e);
  };

  private onMouseUp = () => {
    this.isPanning = false;
    this.isMoving = false;
  };

  // --- Handle drag (move the minimap itself) ---
  private onHandleDown = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    this.isMoving = true;
    this.moveStartX = e.clientX;
    this.moveStartY = e.clientY;
    const rect = this.wrapper.getBoundingClientRect();
    const parentRect = this.wrapper.parentElement!.getBoundingClientRect();
    this.moveStartLeft = rect.left - parentRect.left;
    this.moveStartTop = rect.top - parentRect.top;
    // Switch from bottom/right to top/left positioning on first drag
    this.wrapper.style.bottom = "auto";
    this.wrapper.style.right = "auto";
    this.wrapper.style.left = this.moveStartLeft + "px";
    this.wrapper.style.top = this.moveStartTop + "px";
  };

  private onHandleMove = (e: MouseEvent) => {
    if (!this.isMoving) return;
    e.preventDefault();
    const dx = e.clientX - this.moveStartX;
    const dy = e.clientY - this.moveStartY;
    const parentRect = this.wrapper.parentElement!.getBoundingClientRect();
    const wrapRect = this.wrapper.getBoundingClientRect();
    let newLeft = this.moveStartLeft + dx;
    let newTop = this.moveStartTop + dy;
    // Clamp within parent
    newLeft = Math.max(0, Math.min(newLeft, parentRect.width - wrapRect.width));
    newTop = Math.max(0, Math.min(newTop, parentRect.height - wrapRect.height));
    this.wrapper.style.left = newLeft + "px";
    this.wrapper.style.top = newTop + "px";
  };

  private panToMinimapClick(e: MouseEvent) {
    const bounds = this.bounds;
    if (!bounds) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Convert minimap coords to world coords
    if (!bounds.scale || bounds.scale < 0.001) return;
    const worldX = mx / bounds.scale + bounds.minX;
    const worldY = my / bounds.scale + bounds.minY;
    // Center viewport on this world position
    const wt = this.host.getWorldTransform();
    const vp = this.host.getViewportSize();
    this.host.setWorldPosition(
      vp.width / 2 - worldX * wt.scaleX,
      vp.height / 2 - worldY * wt.scaleY,
    );
    this.host.wakeRenderLoop();
  }

  destroy() {
    // Remove all listeners to prevent memory leaks
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener("mousedown", this.onMouseDown);
      canvas.removeEventListener("mousemove", this.onMouseMove);
    }
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onHandleMove);
    this.wrapper.remove();
  }
}
