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

  private _render() {
    const ctx = this.ctx;
    const w = this.view.width;
    const h = this.view.height;

    const r = (this.bgColor >> 16) & 0xff;
    const g = (this.bgColor >> 8) & 0xff;
    const b = this.bgColor & 0xff;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, w, h);

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
