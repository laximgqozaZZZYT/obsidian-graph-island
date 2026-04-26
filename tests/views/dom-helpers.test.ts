import { describe, it, expect } from "vitest";
import {
	setSymbolText,
	setNumericText,
	setUserDataText,
	setStyleSheetText,
} from "../../src/views/dom-helpers";

function makeEl() {
	return { textContent: "" } as unknown as HTMLElement;
}
function makeStyleEl() {
	return { textContent: "" } as unknown as HTMLStyleElement;
}

describe("setSymbolText", () => {
	it("assigns the glyph as-is", () => {
		const el = makeEl();
		setSymbolText(el, "×");
		expect(el.textContent).toBe("×");
	});

	it("overwrites previous content", () => {
		const el = makeEl();
		el.textContent = "old";
		setSymbolText(el, "✓");
		expect(el.textContent).toBe("✓");
	});
});

describe("setNumericText", () => {
	it("stringifies a number", () => {
		const el = makeEl();
		setNumericText(el, 42);
		expect(el.textContent).toBe("42");
	});

	it("passes a string through unchanged", () => {
		const el = makeEl();
		setNumericText(el, "3.14");
		expect(el.textContent).toBe("3.14");
	});
});

describe("setUserDataText", () => {
	it("assigns user-supplied text verbatim", () => {
		const el = makeEl();
		setUserDataText(el, "node:Alice");
		expect(el.textContent).toBe("node:Alice");
	});

	it("handles empty string", () => {
		const el = makeEl();
		el.textContent = "stale";
		setUserDataText(el, "");
		expect(el.textContent).toBe("");
	});
});

describe("setStyleSheetText", () => {
	it("assigns CSS to a <style> element", () => {
		const el = makeStyleEl();
		setStyleSheetText(el, ".gi-x { color: red; }");
		expect(el.textContent).toBe(".gi-x { color: red; }");
	});
});
