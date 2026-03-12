/**
 * Minimap — a small overview of the full graph shown as a 2D canvas overlay.
 * Shows all node positions as dots and a viewport rectangle.
 * Click or drag on the minimap to pan the main view.
 */

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

/** When node count exceeds this threshold, draw every Nth node */
const THIN_THRESHOLD = 800;
const THIN_STEP = 3;

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

  // --- Drag-to-move state ---
  private isMoving = false;
  private moveStartX = 0;
  private moveStartY = 0;
  private moveStartLeft = 0;
  private moveStartTop = 0;

  // --- Theme colors (read from CSS variables) ---
  private colorBg = "rgba(15,15,25,0.65)";
  private colorDot = "rgba(140,170,255,0.9)";
  private colorViewport = "rgba(255,255,255,0.85)";

  constructor(host: MinimapHost, parentEl: HTMLElement) {
    this.host = host;

    // Wrapper div for positioning
    this.wrapper = document.createElement("div");
    this.wrapper.className = "gi-minimap-wrap";
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
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    const pad = 50;
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
    const step = nodes.length > THIN_THRESHOLD ? THIN_STEP : 1;
    const dotR = nodes.length > 2000 ? 1.5 : nodes.length > 500 ? 2 : 2.5;
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
    if (rw > 2 && rh > 2 && (rw < MINIMAP_WIDTH - 2 || rh < MINIMAP_HEIGHT - 2)) {
      ctx.strokeStyle = this.colorViewport;
      ctx.lineWidth = 1.5;
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
    this.wrapper.remove();
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onHandleMove);
  }
}
