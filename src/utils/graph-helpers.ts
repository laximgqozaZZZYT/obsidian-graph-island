import type { GraphData } from "../types";

export function yieldFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export function buildAdj(gd: GraphData): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of gd.nodes) adj.set(n.id, new Set());
  for (const e of gd.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }
  return adj;
}

export function cssColorToHex(css: string): number {
  if (css.startsWith("#")) {
    const hex = css.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      // Expand short hex: #abc → #aabbcc (ignore alpha digit if present)
      return parseInt(hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2], 16);
    }
    // 8-digit hex (#rrggbbaa): ignore alpha, parse first 6
    return parseInt(hex.slice(0, 6), 16);
  }
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
  }
  return 0x6366f1;
}
