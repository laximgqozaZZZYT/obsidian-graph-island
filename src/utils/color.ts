/** Extract RGB components from a hex color number (0xRRGGBB). */
export function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: (hex >> 16) & 0xff,
    g: (hex >> 8) & 0xff,
    b: hex & 0xff,
  };
}

/** BT.601 perceived brightness (0–255). */
export function getLuminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/** Convenience: hex number → perceived brightness (0–255). */
export function hexBrightness(hex: number): number {
  const { r, g, b } = hexToRgb(hex);
  return getLuminance(r, g, b);
}
