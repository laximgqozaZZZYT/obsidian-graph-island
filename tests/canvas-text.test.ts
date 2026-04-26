import { describe, it, expect } from "vitest";
import { CanvasText } from "../src/views/canvas2d/CanvasText";

// ---------------------------------------------------------------------------
// CanvasText — constructor & property defaults
// ---------------------------------------------------------------------------
describe("CanvasText constructor", () => {
	it("stores text and empty style by default", () => {
		const t = new CanvasText("hello");
		expect(t.text).toBe("hello");
		expect(t.style).toEqual({});
	});

	it("stores custom style", () => {
		const t = new CanvasText("world", { fontSize: 16, fill: 0xff0000 });
		expect(t.style.fontSize).toBe(16);
		expect(t.style.fill).toBe(0xff0000);
	});

	it("has correct default property values", () => {
		const t = new CanvasText("test");
		expect(t.x).toBe(0);
		expect(t.y).toBe(0);
		expect(t.alpha).toBe(1);
		expect(t.visible).toBe(true);
		expect(t.resolution).toBe(1);
		expect(t.rotation).toBe(0);
		expect(t.parent).toBeNull();
		expect(t.maxWidth).toBeNull();
		expect(t.bgColor).toBeNull();
		expect(t.bgAlpha).toBe(0.55);
		expect(t.bgPadX).toBe(6);
		expect(t.bgPadY).toBe(2);
		expect(t.strokeColor).toBeNull();
		expect(t.strokeWidth).toBe(0);
		expect(t.letterSpacing).toBe(0);
		expect(t.cornerRadius).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// CanvasText — height getter (uses fontSize, no canvas needed)
// ---------------------------------------------------------------------------
describe("CanvasText height", () => {
	it("returns fontSize * scaleY", () => {
		const t = new CanvasText("abc", { fontSize: 20 });
		expect(t.height).toBe(20);
	});

	it("defaults to 11 when fontSize is undefined", () => {
		const t = new CanvasText("abc");
		expect(t.height).toBe(11);
	});

	it("scales with scaleY", () => {
		const t = new CanvasText("abc", { fontSize: 10 });
		t.scale.set(2);
		expect(t.height).toBe(20);
	});
});

// ---------------------------------------------------------------------------
// CanvasText — anchor and scale helpers
// ---------------------------------------------------------------------------
describe("CanvasText anchor/scale", () => {
	it("anchor.set updates x and y", () => {
		const t = new CanvasText("test");
		t.anchor.set(0.5, 0.5);
		expect(t.anchor.x).toBe(0.5);
		expect(t.anchor.y).toBe(0.5);
	});

	it("scale.set updates both x and y", () => {
		const t = new CanvasText("test");
		t.scale.set(3);
		expect(t.scale.x).toBe(3);
		expect(t.scale.y).toBe(3);
	});
});

// ---------------------------------------------------------------------------
// CanvasText — destroy is safe to call
// ---------------------------------------------------------------------------
describe("CanvasText destroy", () => {
	it("does not throw", () => {
		const t = new CanvasText("test");
		expect(() => t.destroy()).not.toThrow();
	});
});
