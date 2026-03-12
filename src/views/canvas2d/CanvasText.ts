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

  /** Optional pill-shaped background behind the text (hex color number). */
  bgColor: number | null = null;
  /** Alpha for the pill background (0–1). Defaults to 0.55. */
  bgAlpha = 0.55;
  /** Extra horizontal padding inside the pill (each side). */
  bgPadX = 6;
  /** Extra vertical padding inside the pill (top & bottom). */
  bgPadY = 2;

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

    // Draw pill-shaped background behind the text
    if (this.bgColor !== null && this.bgAlpha > 0) {
      const pw = metrics.width + this.bgPadX * 2;
      const ph = fontSize + this.bgPadY * 2;
      const px = tx - this.bgPadX;
      const py = ty - fontSize - this.bgPadY;
      const radius = ph / 2;
      ctx.save();
      ctx.fillStyle = hexToRgba(this.bgColor, effAlpha * this.bgAlpha);
      ctx.beginPath();
      // roundRect with pill radius
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(px, py, pw, ph, radius);
      } else {
        // Fallback for older engines
        ctx.moveTo(px + radius, py);
        ctx.arcTo(px + pw, py, px + pw, py + ph, radius);
        ctx.arcTo(px + pw, py + ph, px, py + ph, radius);
        ctx.arcTo(px, py + ph, px, py, radius);
        ctx.arcTo(px, py, px + pw, py, radius);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
    }

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
