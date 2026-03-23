import { hexToRgb } from "../../utils/color";

type DrawCmd =
  | { t: "lineStyle"; width: number; color: number; alpha: number; native?: boolean }
  | { t: "beginFill"; color: number; alpha: number }
  | { t: "beginRadialFill"; cx: number; cy: number; r: number; innerColor: number; outerColor: number; innerAlpha: number; outerAlpha: number }
  | { t: "endFill" }
  | { t: "moveTo"; x: number; y: number }
  | { t: "lineTo"; x: number; y: number }
  | { t: "drawCircle"; x: number; y: number; r: number }
  | { t: "drawRect"; x: number; y: number; w: number; h: number }
  | { t: "quadraticCurveTo"; cx: number; cy: number; x: number; y: number }
  | { t: "closePath" }
  | { t: "arc"; cx: number; cy: number; r: number; start: number; end: number; ccw: boolean }
  | { t: "setLineDash"; segments: number[] }
  | { t: "roundedRect"; x: number; y: number; w: number; h: number; r: number }
  | { t: "bezierCurveTo"; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  | { t: "setLineCap"; cap: CanvasLineCap }
  | { t: "setLineJoin"; join: CanvasLineJoin };

const _rgbaCache = new Map<number, string>();
const _RGBA_CACHE_MAX = 512;

export function hexToRgba(hex: number, alpha: number): string {
  // Pack hex (24-bit) + quantized alpha (8-bit) into a single key
  const aQ = (alpha * 255 + 0.5) | 0;
  const key = (hex << 8) | aQ;
  let result = _rgbaCache.get(key);
  if (result !== undefined) return result;
  const { r, g, b } = hexToRgb(hex);
  result = `rgba(${r},${g},${b},${aQ / 255})`;
  if (_rgbaCache.size >= _RGBA_CACHE_MAX) _rgbaCache.clear();
  _rgbaCache.set(key, result);
  return result;
}

export class CanvasGraphics {
  x = 0;
  y = 0;
  alpha = 1;
  visible = true;
  parent: import("./CanvasContainer").CanvasContainer | null = null;

  private commands: DrawCmd[] = [];

  get commandCount(): number { return this.commands.length; }

  clear() {
    this.commands.length = 0;
  }

  lineStyle(
    widthOrObj: number | { width: number; color?: number; alpha?: number; native?: boolean },
    color?: number,
    alpha?: number,
  ) {
    if (typeof widthOrObj === "object") {
      this.commands.push({
        t: "lineStyle",
        width: widthOrObj.width,
        color: widthOrObj.color ?? 0x000000,
        alpha: widthOrObj.alpha ?? 1,
        native: widthOrObj.native ?? false,
      });
    } else {
      this.commands.push({
        t: "lineStyle",
        width: widthOrObj,
        color: color ?? 0x000000,
        alpha: alpha ?? 1,
      });
    }
  }

  beginFill(color: number, alpha = 1) {
    this.commands.push({ t: "beginFill", color, alpha });
  }

  beginRadialFill(cx: number, cy: number, r: number, innerColor: number, outerColor: number, innerAlpha = 1, outerAlpha = 1) {
    this.commands.push({ t: "beginRadialFill", cx, cy, r, innerColor, outerColor, innerAlpha, outerAlpha });
  }

  setLineDash(segments: number[]) {
    this.commands.push({ t: "setLineDash", segments });
  }

  endFill() {
    this.commands.push({ t: "endFill" });
  }

  moveTo(x: number, y: number) {
    this.commands.push({ t: "moveTo", x, y });
  }

  lineTo(x: number, y: number) {
    this.commands.push({ t: "lineTo", x, y });
  }

  drawCircle(x: number, y: number, r: number) {
    this.commands.push({ t: "drawCircle", x, y, r: Math.max(0, r) });
  }

  drawRect(x: number, y: number, w: number, h: number) {
    this.commands.push({ t: "drawRect", x, y, w, h });
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    this.commands.push({ t: "quadraticCurveTo", cx, cy, x, y });
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
    this.commands.push({ t: "bezierCurveTo", cp1x, cp1y, cp2x, cp2y, x, y });
  }

  setLineCap(cap: CanvasLineCap) {
    this.commands.push({ t: "setLineCap", cap });
  }

  setLineJoin(join: CanvasLineJoin) {
    this.commands.push({ t: "setLineJoin", join });
  }

  closePath() {
    this.commands.push({ t: "closePath" });
  }

  arc(cx: number, cy: number, r: number, start: number, end: number, ccw = false) {
    this.commands.push({ t: "arc", cx, cy, r, start, end, ccw });
  }

  drawRoundedRect(x: number, y: number, w: number, h: number, r: number) {
    // Guard: Canvas2D arcTo throws if radius is negative
    const aw = Math.abs(w);
    const ah = Math.abs(h);
    const ar = Math.max(0, r);
    this.commands.push({ t: "roundedRect", x, y, w: aw, h: ah, r: ar });
  }

  destroy() {
    this.commands.length = 0;
  }

  _flush(ctx: CanvasRenderingContext2D, parentAlpha: number) {
    if (!this.visible || this.commands.length === 0) return;
    const effAlpha = parentAlpha * this.alpha;

    ctx.save();
    if (this.x !== 0 || this.y !== 0) ctx.translate(this.x, this.y);

    let fillColor = 0x000000;
    let fillAlpha = 1;
    let strokeWidth = 0;
    let strokeColor = 0x000000;
    let strokeAlpha = 1;
    let strokeNative = false;
    let inPath = false;
    let hasFill = false;
    let radialGradient: CanvasGradient | null = null;

    const beginNewPath = () => {
      if (!inPath) { ctx.beginPath(); inPath = true; }
    };

    const flushShape = () => {
      if (!inPath) return;
      if (hasFill) {
        if (radialGradient) {
          ctx.fillStyle = radialGradient;
        } else {
          ctx.fillStyle = hexToRgba(fillColor, fillAlpha * effAlpha);
        }
        ctx.fill();
      }
      if (strokeWidth > 0 && strokeAlpha > 0) {
        ctx.strokeStyle = hexToRgba(strokeColor, strokeAlpha * effAlpha);
        if (strokeNative) {
          // native: line width in screen pixels, independent of zoom
          const t = ctx.getTransform();
          const ctmScale = Math.sqrt(t.a * t.a + t.b * t.b);
          ctx.lineWidth = ctmScale > 0 ? strokeWidth / ctmScale : strokeWidth;
        } else {
          ctx.lineWidth = strokeWidth;
        }
        ctx.stroke();
      }
      inPath = false;
    };

    for (const cmd of this.commands) {
      switch (cmd.t) {
        case "lineStyle":
          // Flush any open path before changing stroke style so that the
          // already-accumulated segments are stroked with the current style
          // rather than the new one.
          flushShape();
          strokeWidth = cmd.width;
          strokeColor = cmd.color;
          strokeAlpha = cmd.alpha;
          strokeNative = cmd.native ?? false;
          break;
        case "beginFill":
          flushShape();
          fillColor = cmd.color;
          fillAlpha = cmd.alpha;
          hasFill = true;
          radialGradient = null;
          beginNewPath();
          break;
        case "beginRadialFill": {
          flushShape();
          // Guard: createRadialGradient throws if r <= 0, NaN, or Infinity
          const safeR = (cmd.r > 0 && isFinite(cmd.r)) ? cmd.r : 1;
          const grad = ctx.createRadialGradient(cmd.cx, cmd.cy, 0, cmd.cx, cmd.cy, safeR);
          grad.addColorStop(0, hexToRgba(cmd.innerColor, cmd.innerAlpha * effAlpha));
          grad.addColorStop(1, hexToRgba(cmd.outerColor, cmd.outerAlpha * effAlpha));
          radialGradient = grad;
          hasFill = true;
          beginNewPath();
          break;
        }
        case "endFill":
          flushShape();
          hasFill = false;
          radialGradient = null;
          break;
        case "setLineDash":
          flushShape();
          ctx.setLineDash(cmd.segments);
          break;
        case "moveTo":
          beginNewPath();
          ctx.moveTo(cmd.x, cmd.y);
          break;
        case "lineTo":
          beginNewPath();
          ctx.lineTo(cmd.x, cmd.y);
          break;
        case "drawCircle":
          beginNewPath();
          ctx.moveTo(cmd.x + cmd.r, cmd.y);
          ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
          break;
        case "drawRect":
          beginNewPath();
          ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
          break;
        case "quadraticCurveTo":
          beginNewPath();
          ctx.quadraticCurveTo(cmd.cx, cmd.cy, cmd.x, cmd.y);
          break;
        case "closePath":
          if (inPath) ctx.closePath();
          break;
        case "arc":
          beginNewPath();
          ctx.arc(cmd.cx, cmd.cy, cmd.r, cmd.start, cmd.end, cmd.ccw);
          break;
        case "bezierCurveTo":
          beginNewPath();
          ctx.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
          break;
        case "setLineCap":
          flushShape();
          ctx.lineCap = cmd.cap;
          break;
        case "setLineJoin":
          flushShape();
          ctx.lineJoin = cmd.join;
          break;
        case "roundedRect": {
          beginNewPath();
          const rr = Math.max(0, Math.min(cmd.r, cmd.w / 2, cmd.h / 2));
          ctx.moveTo(cmd.x + rr, cmd.y);
          ctx.lineTo(cmd.x + cmd.w - rr, cmd.y);
          ctx.arcTo(cmd.x + cmd.w, cmd.y, cmd.x + cmd.w, cmd.y + rr, rr);
          ctx.lineTo(cmd.x + cmd.w, cmd.y + cmd.h - rr);
          ctx.arcTo(cmd.x + cmd.w, cmd.y + cmd.h, cmd.x + cmd.w - rr, cmd.y + cmd.h, rr);
          ctx.lineTo(cmd.x + rr, cmd.y + cmd.h);
          ctx.arcTo(cmd.x, cmd.y + cmd.h, cmd.x, cmd.y + cmd.h - rr, rr);
          ctx.lineTo(cmd.x, cmd.y + rr);
          ctx.arcTo(cmd.x, cmd.y, cmd.x + rr, cmd.y, rr);
          ctx.closePath();
          break;
        }
      }
    }
    flushShape();
    ctx.restore();
  }
}
