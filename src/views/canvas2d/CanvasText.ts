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

  /** Maximum display width in local units. Text exceeding this is truncated with "…". */
  maxWidth: number | null = null;

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
  private _measuredText = "";      // cached text for width measurement
  private _measuredFont = "";      // cached font string

  // Truncation cache — avoids re-computing when text/font/maxWidth unchanged
  private _truncatedDisplay = "";
  private _truncatedWidth = 0;
  private _truncCacheText = "";
  private _truncCacheFont = "";
  private _truncCacheMaxW: number | null = null;

  get width(): number { return this._measuredWidth * this.scale.x; }
  get height(): number { return (this.style.fontSize ?? 11) * this.scale.y; }

  constructor(text: string, style: TextStyle = {}) {
    this.text = text;
    this.style = style;
  }

  destroy() {
    // No GPU resources to free
  }

  /** Compute truncated text with ellipsis using binary search. */
  private _getTruncatedText(ctx: CanvasRenderingContext2D): string {
    const maxW = this.maxWidth!;
    const text = this.text;
    const font = ctx.font;

    // Check cache
    if (text === this._truncCacheText && font === this._truncCacheFont && maxW === this._truncCacheMaxW) {
      return this._truncatedDisplay;
    }

    const ellipsis = "…";
    const ellipsisW = ctx.measureText(ellipsis).width;
    const availW = maxW - ellipsisW;

    if (availW <= 0) {
      this._truncatedDisplay = ellipsis;
      this._truncatedWidth = ellipsisW;
    } else {
      // Binary search for the longest prefix that fits within availW
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid)).width <= availW) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      const truncText = text.slice(0, lo) + ellipsis;
      this._truncatedDisplay = truncText;
      this._truncatedWidth = ctx.measureText(truncText).width;
    }

    // Update cache
    this._truncCacheText = text;
    this._truncCacheFont = font;
    this._truncCacheMaxW = maxW;
    return this._truncatedDisplay;
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
    const fontStr = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.font = fontStr;

    // Cache measureText result — only re-measure when text or font changes
    if (this.text !== this._measuredText || fontStr !== this._measuredFont) {
      this._measuredWidth = ctx.measureText(this.text).width;
      this._measuredText = this.text;
      this._measuredFont = fontStr;
    }

    // Determine display text (truncated if maxWidth is set and exceeded)
    const needsTruncation = this.maxWidth !== null && this._measuredWidth > this.maxWidth;
    const displayText = needsTruncation ? this._getTruncatedText(ctx) : this.text;
    const displayWidth = needsTruncation ? this._truncatedWidth : this._measuredWidth;

    const tx = -this.anchor.x * displayWidth;
    const ty = this.anchor.y * fontSize;

    // Draw pill-shaped background behind the text
    if (this.bgColor !== null && this.bgAlpha > 0) {
      const pw = displayWidth + this.bgPadX * 2;
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

    ctx.fillText(displayText, tx, ty);
    ctx.restore();
  }
}
