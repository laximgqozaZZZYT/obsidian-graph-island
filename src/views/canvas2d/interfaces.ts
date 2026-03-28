/**
 * Renderer-agnostic interfaces for the Canvas 2D display objects.
 * WebGL implementations must satisfy the same contracts.
 */

import type { TextStyle } from "./CanvasText";

// ---------------------------------------------------------------------------
// Ticker
// ---------------------------------------------------------------------------

export interface ITicker {
  add(fn: () => void, context?: unknown): void;
  remove(fn: () => void, context?: unknown): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Scale helper (shared by IContainer and IText)
// ---------------------------------------------------------------------------

export interface IScale {
  x: number;
  y: number;
  set(v: number): void;
}

// ---------------------------------------------------------------------------
// IChild — union of all display-object interfaces
// ---------------------------------------------------------------------------

export type IChild = IContainer | IGraphics | IText;

// ---------------------------------------------------------------------------
// IContainer
// ---------------------------------------------------------------------------

export interface IContainer {
  x: number;
  y: number;
  scale: IScale;
  alpha: number;
  visible: boolean;
  parent: IContainer | null;
  children: IChild[];

  addChild(child: IChild): IChild;
  addChildAt(child: IChild, index: number): IChild;
  removeChild(child: IChild): IChild;
  removeChildren(): IChild[];
  destroy(): void;

  toLocal(
    point: { x: number; y: number },
    from?: IContainer,
  ): { x: number; y: number };
  toGlobal(point: { x: number; y: number }): { x: number; y: number };

  /** Render this subtree into the given context. */
  _flush(ctx: CanvasRenderingContext2D, parentAlpha: number): void;
}

// ---------------------------------------------------------------------------
// IGraphics
// ---------------------------------------------------------------------------

export interface IGraphics {
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  parent: IContainer | null;

  readonly commandCount: number;

  clear(): void;
  lineStyle(
    widthOrObj: number | { width: number; color?: number; alpha?: number; native?: boolean },
    color?: number,
    alpha?: number,
  ): void;
  beginFill(color: number, alpha?: number): void;
  beginRadialFill(
    cx: number, cy: number, r: number,
    innerColor: number, outerColor: number,
    innerAlpha?: number, outerAlpha?: number,
  ): void;
  setLineDash(segments: number[]): void;
  endFill(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  drawCircle(x: number, y: number, r: number): void;
  drawRect(x: number, y: number, w: number, h: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(
    cp1x: number, cp1y: number,
    cp2x: number, cp2y: number,
    x: number, y: number,
  ): void;
  setLineCap(cap: CanvasLineCap): void;
  setLineJoin(join: CanvasLineJoin): void;
  closePath(): void;
  arc(cx: number, cy: number, r: number, start: number, end: number, ccw?: boolean): void;
  drawRoundedRect(x: number, y: number, w: number, h: number, r: number): void;
  destroy(): void;

  /** Render accumulated draw commands into the given context. */
  _flush(ctx: CanvasRenderingContext2D, parentAlpha: number): void;
}

// ---------------------------------------------------------------------------
// IText
// ---------------------------------------------------------------------------

export interface IAnchor {
  x: number;
  y: number;
  set(ax: number, ay: number): void;
}

export interface IText {
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  resolution: number;
  rotation: number;
  parent: IContainer | null;

  text: string;
  style: TextStyle;

  maxWidth: number | null;

  bgColor: number | null;
  bgAlpha: number;
  bgPadX: number;
  bgPadY: number;

  strokeColor: number | null;
  strokeWidth: number;

  letterSpacing: number;
  cornerRadius: number | null;

  anchor: IAnchor;
  scale: IScale;

  readonly width: number;
  readonly height: number;

  destroy(): void;

  /** Render text into the given context. */
  _flush(ctx: CanvasRenderingContext2D, parentAlpha: number): void;
}

// ---------------------------------------------------------------------------
// IApp
// ---------------------------------------------------------------------------

export interface IApp {
  view: HTMLCanvasElement;
  /** The outermost DOM element to insert into the document.
   *  For single-canvas backends this is the canvas itself;
   *  for dual-canvas (WebGL+overlay) this is the wrapper div. */
  viewContainer: HTMLElement;
  stage: IContainer;
  ticker: ITicker;
  renderer: { width: number; height: number };

  showDotGrid: boolean;

  onPreFlush: ((ctx: CanvasRenderingContext2D, dpr: number) => void) | null;
  onPostFlush: ((ctx: CanvasRenderingContext2D, dpr: number) => void) | null;

  /** Whether the backend supports GPU-accelerated animations.
   *  Canvas2D returns false; WebGL returns true.
   *  Consumers should skip heavy animations when false. */
  readonly supportsAnimation: boolean;

  markNeedsRender(): void;
  setBackgroundColor(color: number): void;
  resize(width: number, height: number): void;
  getContext(): CanvasRenderingContext2D;
  destroy(): void;
}
