import { hexToRgba } from "./CanvasGraphics";

export interface TextStyle {
  fontSize?: number;
  fill?: number | string;
  fontFamily?: string;
  fontWeight?: string;
  align?: string;
}

export class CanvasText {
  x = 0;
  y = 0;
  alpha = 1;
  visible = true;
  resolution = 1;
  rotation = 0;
  parent: any = null;

  text: string;
  style: TextStyle;

  anchor = { x: 0, y: 0, set(ax: number, ay: number) { this.x = ax; this.y = ay; } };
  scale = { x: 1, y: 1, set(v: number) { this.x = v; this.y = v; } };

  private _measuredWidth = 0;
  get width(): number { return this._measuredWidth * this.scale.x; }
  get height(): number { return (this.style.fontSize ?? 11) * this.scale.y; }

  constructor(text: string, style: TextStyle = {}) {
    this.text = text;
    this.style = style;
  }

  destroy() {
    // No GPU resources to free
  }

  _flush(ctx: CanvasRenderingContext2D, parentAlpha: number) {
    if (!this.visible || this.alpha <= 0 || !this.text) return;
    const effAlpha = parentAlpha * this.alpha;

    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.scale.x !== 1 || this.scale.y !== 1) ctx.scale(this.scale.x, this.scale.y);
    if (this.rotation !== 0) ctx.rotate(this.rotation);

    const fontSize = this.style.fontSize ?? 11;
    const fontWeight = this.style.fontWeight ?? "normal";
    const fontFamily = this.style.fontFamily ?? "-apple-system, BlinkMacSystemFont, sans-serif";
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    const metrics = ctx.measureText(this.text);
    this._measuredWidth = metrics.width;

    const tx = -this.anchor.x * metrics.width;
    const ty = this.anchor.y * fontSize;

    const fill = this.style.fill;
    if (typeof fill === "number") {
      ctx.fillStyle = hexToRgba(fill, effAlpha);
    } else if (typeof fill === "string") {
      ctx.globalAlpha = effAlpha;
      ctx.fillStyle = fill;
    } else {
      ctx.fillStyle = hexToRgba(0xffffff, effAlpha);
    }

    ctx.fillText(this.text, tx, ty);
    ctx.restore();
  }
}
