/**
 * Centralized `textContent` setters.
 *
 * Callers should use these helpers instead of writing `el.textContent = ...`
 * directly so the i18n detector (`grep "\.textContent\s*="`) only flags
 * accidental hardcoded user-facing strings, not symbols / numerics / data.
 */

/** Symbol glyphs (×, ✓, ✗, ▸, ▾, →, etc.). Not user-facing copy. */
export function setSymbolText(el: HTMLElement, symbol: string): void {
	el.textContent = symbol;
}

/** Numeric values (slider readouts, counts). */
export function setNumericText(el: HTMLElement, value: number | string): void {
	el.textContent = String(value);
}

/** User-supplied data (node id, label, query, file body). Not translated. */
export function setUserDataText(el: HTMLElement, text: string): void {
	el.textContent = text;
}

/** Inline CSS for `<style>` elements. */
export function setStyleSheetText(styleEl: HTMLStyleElement, css: string): void {
	styleEl.textContent = css;
}
