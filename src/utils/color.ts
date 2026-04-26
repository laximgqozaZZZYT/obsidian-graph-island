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

/** V3: Adjust brightness of a hex color by a multiplicative factor. */
export function adjustBrightness(hex: number, factor: number): number {
	const { r, g, b } = hexToRgb(hex);
	return (
		(Math.min(255, Math.round(r * factor)) << 16) |
		(Math.min(255, Math.round(g * factor)) << 8) |
		Math.min(255, Math.round(b * factor))
	);
}

/** WCAG 2.1 relative luminance (0–1 range, sRGB linearized). */
export function wcagRelativeLuminance(hex: number): number {
	const { r, g, b } = hexToRgb(hex);
	const toLinear = (c: number) => {
		const s = c / 255;
		return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG 2.1 contrast ratio between two hex colors (1:1 to 21:1). */
export function wcagContrastRatio(fg: number, bg: number): number {
	const l1 = wcagRelativeLuminance(fg);
	const l2 = wcagRelativeLuminance(bg);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

/** V6: Pick black or white for maximum WCAG contrast against the given background. */
export function contrastColor(bgHex: number): number {
	const blackRatio = wcagContrastRatio(0x000000, bgHex);
	const whiteRatio = wcagContrastRatio(0xffffff, bgHex);
	return blackRatio >= whiteRatio ? 0x000000 : 0xffffff;
}
