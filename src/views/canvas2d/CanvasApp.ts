import { CanvasContainer } from "./CanvasContainer";

type TickerCallback = () => void;

class Ticker {
  private callbacks: { fn: TickerCallback; context: any }[] = [];
  private _rafId: number | null = null;
  private _running = false;

  add(fn: TickerCallback, context?: any) {
    if (this.callbacks.some(cb => cb.fn === fn && cb.context === context)) return;
    this.callbacks.push({ fn, context });
    if (!this._running) this._start();
  }

  remove(fn: TickerCallback, context?: any) {
    this.callbacks = this.callbacks.filter(
      cb => !(cb.fn === fn && cb.context === context),
    );
    if (this.callbacks.length === 0) this._stop();
  }

  private _tick = () => {
    for (const cb of this.callbacks) {
      cb.fn.call(cb.context);
    }
    if (this._running) {
      this._rafId = requestAnimationFrame(this._tick);
    }
  };

  private _start() {
    if (this._running) return;
    this._running = true;
    this._rafId = requestAnimationFrame(this._tick);
  }

  private _stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  destroy() {
    this._stop();
    this.callbacks.length = 0;
  }
}

export interface CanvasAppOptions {
  width: number;
  height: number;
  backgroundColor?: number;
  antialias?: boolean;
  resolution?: number;
  autoDensity?: boolean;
}

export class CanvasApp {
  view: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  stage: CanvasContainer;
  ticker: Ticker;
  renderer: { width: number; height: number };

  private bgColor: number;
  private dpr: number;

  /** Whether to show the background dot grid */
  showDotGrid = true;

  constructor(opts: CanvasAppOptions) {
    this.view = document.createElement("canvas");
    this.dpr = opts.resolution ?? (window.devicePixelRatio || 1);
    this.bgColor = opts.backgroundColor ?? 0x000000;

    this.view.width = opts.width * this.dpr;
    this.view.height = opts.height * this.dpr;

    this.ctx = this.view.getContext("2d")!;

    this.stage = new CanvasContainer();
    this.ticker = new Ticker();
    this.renderer = { width: opts.width, height: opts.height };

    this.ticker.add(this._render, this);
  }

  setBackgroundColor(color: number) {
    this.bgColor = color;
  }

  resize(width: number, height: number) {
    this.view.width = width * this.dpr;
    this.view.height = height * this.dpr;
    this.renderer.width = width;
    this.renderer.height = height;
  }

  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  private _drawDotGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.showDotGrid) return;

    // Get world transform from stage's first child (the world container)
    const world = this.stage.children[0];
    if (!world) return;
    const wx = world.x * this.dpr;
    const wy = world.y * this.dpr;
    const ws = (world.scale?.x ?? 1) * this.dpr;

    const spacing = 30 * ws;          // 30 world-units between dots
    if (spacing < 4) return;           // Don't draw when too zoomed out (dots merge)

    const dotR = Math.max(0.5, ws * 0.8); // Dot radius scales with zoom

    // Determine visible grid range
    const startX = wx % spacing;
    const startY = wy % spacing;

    // Use theme-aware dot color (slightly brighter/darker than background)
    const r = (this.bgColor >> 16) & 0xff;
    const g = (this.bgColor >> 8) & 0xff;
    const b = this.bgColor & 0xff;
    const brightness = r * 0.299 + g * 0.587 + b * 0.114;
    const dotAlpha = brightness > 128 ? 0.08 : 0.12;
    const dotColor = brightness > 128
      ? `rgba(0,0,0,${dotAlpha})`
      : `rgba(255,255,255,${dotAlpha})`;

    ctx.fillStyle = dotColor;
    for (let x = startX; x < w; x += spacing) {
      for (let y = startY; y < h; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private _render() {
    const ctx = this.ctx;
    const w = this.view.width;
    const h = this.view.height;

    const r = (this.bgColor >> 16) & 0xff;
    const g = (this.bgColor >> 8) & 0xff;
    const b = this.bgColor & 0xff;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);

    this._drawDotGrid(ctx, w, h);

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    this.stage._flush(ctx, 1);

    ctx.restore();
  }

  destroy() {
    this.ticker.destroy();
    this.stage.destroy();
  }
}
