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

const MINIMAP_WIDTH = 150;
const MINIMAP_HEIGHT = 100;

/** When node count exceeds this threshold, draw every Nth node */
const THIN_THRESHOLD = 1000;
const THIN_STEP = 10;

interface MinimapBounds {
  minX: number;
  minY: number;
  scale: number;
}

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private host: MinimapHost;
  private visible = true;
  private isDragging = false;
  private bounds: MinimapBounds | null = null;

  constructor(host: MinimapHost, parentEl: HTMLElement) {
    this.host = host;
    this.canvas = document.createElement("canvas");
    this.canvas.width = MINIMAP_WIDTH;
    this.canvas.height = MINIMAP_HEIGHT;
    this.canvas.className = "gi-minimap";
    this.ctx = this.canvas.getContext("2d")!;
    parentEl.appendChild(this.canvas);

    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.canvas.style.display = v ? "block" : "none";
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
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Draw nodes as dots (thin if too many)
    ctx.fillStyle = "rgba(180,180,255,0.7)";
    const step = nodes.length > THIN_THRESHOLD ? THIN_STEP : 1;
    for (let i = 0; i < nodes.length; i += step) {
      const n = nodes[i];
      ctx.fillRect(toMx(n.x) - 1, toMy(n.y) - 1, 2, 2);
    }

    // Draw viewport rectangle
    const wt = this.host.getWorldTransform();
    const vp = this.host.getViewportSize();
    // Screen rect in world coords: top-left = (-wt.x/wt.scaleX, -wt.y/wt.scaleY)
    const vpWorldX = -wt.x / wt.scaleX;
    const vpWorldY = -wt.y / wt.scaleY;
    const vpWorldW = vp.width / wt.scaleX;
    const vpWorldH = vp.height / wt.scaleY;

    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      toMx(vpWorldX), toMy(vpWorldY),
      vpWorldW * scale, vpWorldH * scale,
    );
  }

  private onMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    this.isDragging = true;
    this.panToMinimapClick(e);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isDragging) return;
    this.panToMinimapClick(e);
  };

  private onMouseUp = () => {
    this.isDragging = false;
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
    this.canvas.remove();
    document.removeEventListener("mouseup", this.onMouseUp);
  }
}
