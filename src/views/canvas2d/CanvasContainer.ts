import type { CanvasGraphics } from "./CanvasGraphics";
import type { CanvasText } from "./CanvasText";

export type CanvasChild = CanvasContainer | CanvasGraphics | CanvasText;

export class CanvasContainer {
  x = 0;
  y = 0;
  scale = { x: 1, y: 1, set(v: number) { this.x = v; this.y = v; } };
  alpha = 1;
  visible = true;
  parent: CanvasContainer | null = null;
  children: CanvasChild[] = [];

  addChild(child: CanvasChild): CanvasChild {
    (child as any).parent = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: CanvasChild): CanvasChild {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      (child as any).parent = null;
    }
    return child;
  }

  removeChildren(): CanvasChild[] {
    const removed = this.children.splice(0);
    for (const c of removed) (c as any).parent = null;
    return removed;
  }

  destroy() {
    for (const c of this.children) c.destroy();
    this.children.length = 0;
  }

  toLocal(point: { x: number; y: number }, from?: CanvasContainer): { x: number; y: number } {
    let gx = point.x;
    let gy = point.y;
    if (from) {
      const chain = this._getAncestorChain(from);
      for (const node of chain) {
        gx = node.x + gx * node.scale.x;
        gy = node.y + gy * node.scale.y;
      }
    }
    const myChain = this._getAncestorChain(this);
    for (let i = myChain.length - 1; i >= 0; i--) {
      const node = myChain[i];
      gx = (gx - node.x) / node.scale.x;
      gy = (gy - node.y) / node.scale.y;
    }
    return { x: gx, y: gy };
  }

  toGlobal(point: { x: number; y: number }): { x: number; y: number } {
    let gx = point.x;
    let gy = point.y;
    const chain = this._getAncestorChain(this);
    for (const node of chain) {
      gx = node.x + gx * node.scale.x;
      gy = node.y + gy * node.scale.y;
    }
    return { x: gx, y: gy };
  }

  private _getAncestorChain(node: CanvasContainer): CanvasContainer[] {
    const chain: CanvasContainer[] = [];
    let cur: CanvasContainer | null = node;
    while (cur) {
      chain.push(cur);
      cur = cur.parent;
    }
    return chain;
  }

  _flush(ctx: CanvasRenderingContext2D, parentAlpha: number) {
    if (!this.visible) return;

    const children = this.children;
    const len = children.length;
    if (len === 0) return;

    // Quick scan: skip save/restore if no child is visible
    let anyVisible = false;
    for (let i = 0; i < len; i++) {
      if (children[i].visible) { anyVisible = true; break; }
    }
    if (!anyVisible) return;

    const effAlpha = parentAlpha * this.alpha;
    const needsTransform = this.x !== 0 || this.y !== 0 ||
      this.scale.x !== 1 || this.scale.y !== 1;

    if (needsTransform) {
      ctx.save();
      if (this.x !== 0 || this.y !== 0) ctx.translate(this.x, this.y);
      if (this.scale.x !== 1 || this.scale.y !== 1) ctx.scale(this.scale.x, this.scale.y);
    }

    for (let i = 0; i < len; i++) {
      (children[i] as any)._flush(ctx, effAlpha);
    }

    if (needsTransform) {
      ctx.restore();
    }
  }
}
