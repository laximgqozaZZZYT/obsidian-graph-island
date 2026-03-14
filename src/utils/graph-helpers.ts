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
    return parseInt(css.slice(1), 16);
  }
  const m = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) {
    return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
  }
  return 0x6366f1;
}

/**
 * Shift the hue of a 0xRRGGBB color by `degrees` (0–360).
 * Used to generate enclosure colors that are visually distinct from node colors.
 */
export function shiftHue(hex: number, degrees: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (d > 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  h = ((h * 360 + degrees) % 360) / 360;
  if (h < 0) h += 1;

  // HSV to RGB
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let ro: number, go: number, bo: number;
  switch (i % 6) {
    case 0: ro = v; go = t; bo = p; break;
    case 1: ro = q; go = v; bo = p; break;
    case 2: ro = p; go = v; bo = t; break;
    case 3: ro = p; go = q; bo = v; break;
    case 4: ro = t; go = p; bo = v; break;
    default: ro = v; go = p; bo = q; break;
  }

  return ((Math.round(ro * 255) << 16) | (Math.round(go * 255) << 8) | Math.round(bo * 255));
}

/**
 * Convert HSL values to a 0xRRGGBB hex color.
 * h: 0–360, s: 0–1, l: 0–1.
 */
export function hslToHex(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else               { r = c; b = x; }
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

/**
 * Deterministic hash of a string to a number in [0, range).
 * Uses djb2 algorithm for fast, well-distributed hashing.
 */
export function stringHash(str: string, range: number): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return ((hash % range) + range) % range;
}
