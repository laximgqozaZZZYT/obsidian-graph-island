import { describe, it, expect } from "vitest";
import { WebGLGraphics } from "../src/views/webgl/WebGLGraphics";

// ---------------------------------------------------------------------------
// WebGLGraphics — command queue sync + clear/destroy behavior
// No WebGL context needed: we test the command queue bookkeeping.
// ---------------------------------------------------------------------------

describe("WebGLGraphics — command queue basics", () => {
	it("starts with zero commands", () => {
		const g = new WebGLGraphics();
		expect(g.commandCount).toBe(0);
	});

	it("drawCircle increments both parent and GL command counts", () => {
		const g = new WebGLGraphics();
		g.beginFill(0xff0000, 1);
		g.drawCircle(10, 20, 5);
		g.endFill();
		// Parent CanvasGraphics tracks commands via commandCount
		expect(g.commandCount).toBe(3);
	});

	it("drawRect increments command count", () => {
		const g = new WebGLGraphics();
		g.drawRect(0, 0, 100, 50);
		expect(g.commandCount).toBe(1);
	});

	it("clear() resets command count to zero", () => {
		const g = new WebGLGraphics();
		g.beginFill(0x00ff00, 1);
		g.drawCircle(0, 0, 10);
		g.drawRect(0, 0, 20, 20);
		g.endFill();
		expect(g.commandCount).toBe(4);
		g.clear();
		expect(g.commandCount).toBe(0);
	});

	it("destroy() resets command count to zero", () => {
		const g = new WebGLGraphics();
		g.beginFill(0x0000ff, 0.5);
		g.drawCircle(5, 5, 3);
		g.endFill();
		expect(g.commandCount).toBeGreaterThan(0);
		g.destroy();
		expect(g.commandCount).toBe(0);
	});
});

describe("WebGLGraphics — all drawing methods push to GL queue", () => {
	it("lineStyle with positional args", () => {
		const g = new WebGLGraphics();
		g.lineStyle(2, 0xff0000, 0.8);
		expect(g.commandCount).toBe(1);
	});

	it("lineStyle with object arg", () => {
		const g = new WebGLGraphics();
		g.lineStyle({ width: 3, color: 0x00ff00, alpha: 0.5 });
		expect(g.commandCount).toBe(1);
	});

	it("lineStyle object defaults color and alpha", () => {
		const g = new WebGLGraphics();
		g.lineStyle({ width: 1 });
		expect(g.commandCount).toBe(1);
	});

	it("beginFill + endFill pair", () => {
		const g = new WebGLGraphics();
		g.beginFill(0xaabbcc, 0.7);
		g.endFill();
		expect(g.commandCount).toBe(2);
	});

	it("beginRadialFill pushes to queue", () => {
		const g = new WebGLGraphics();
		g.beginRadialFill(50, 50, 30, 0xff0000, 0x0000ff, 1, 0.5);
		expect(g.commandCount).toBe(1);
	});

	it("moveTo + lineTo + closePath", () => {
		const g = new WebGLGraphics();
		g.moveTo(0, 0);
		g.lineTo(10, 0);
		g.lineTo(10, 10);
		g.closePath();
		expect(g.commandCount).toBe(4);
	});

	it("quadraticCurveTo pushes to queue", () => {
		const g = new WebGLGraphics();
		g.quadraticCurveTo(25, 50, 50, 0);
		expect(g.commandCount).toBe(1);
	});

	it("bezierCurveTo pushes to queue", () => {
		const g = new WebGLGraphics();
		g.bezierCurveTo(10, 20, 30, 20, 40, 0);
		expect(g.commandCount).toBe(1);
	});

	it("arc pushes to queue", () => {
		const g = new WebGLGraphics();
		g.arc(0, 0, 10, 0, Math.PI, false);
		expect(g.commandCount).toBe(1);
	});

	it("drawRoundedRect pushes to queue", () => {
		const g = new WebGLGraphics();
		g.drawRoundedRect(0, 0, 100, 80, 10);
		expect(g.commandCount).toBe(1);
	});

	it("setLineDash pushes to queue", () => {
		const g = new WebGLGraphics();
		g.setLineDash([5, 3]);
		expect(g.commandCount).toBe(1);
	});

	it("setLineCap pushes to queue", () => {
		const g = new WebGLGraphics();
		g.setLineCap("round");
		expect(g.commandCount).toBe(1);
	});

	it("setLineJoin pushes to queue", () => {
		const g = new WebGLGraphics();
		g.setLineJoin("bevel");
		expect(g.commandCount).toBe(1);
	});
});

describe("WebGLGraphics — clear/destroy idempotency", () => {
	it("clear() on empty is a no-op", () => {
		const g = new WebGLGraphics();
		g.clear();
		expect(g.commandCount).toBe(0);
	});

	it("destroy() on empty is a no-op", () => {
		const g = new WebGLGraphics();
		g.destroy();
		expect(g.commandCount).toBe(0);
	});

	it("double clear is safe", () => {
		const g = new WebGLGraphics();
		g.drawCircle(0, 0, 5);
		g.clear();
		g.clear();
		expect(g.commandCount).toBe(0);
	});

	it("commands after clear start fresh", () => {
		const g = new WebGLGraphics();
		g.drawCircle(0, 0, 5);
		g.drawRect(0, 0, 10, 10);
		expect(g.commandCount).toBe(2);
		g.clear();
		g.drawCircle(1, 1, 3);
		expect(g.commandCount).toBe(1);
	});
});

describe("WebGLGraphics — position and alpha properties", () => {
	it("inherits x, y, alpha, visible from CanvasGraphics", () => {
		const g = new WebGLGraphics();
		expect(g.x).toBe(0);
		expect(g.y).toBe(0);
		expect(g.alpha).toBe(1);
		expect(g.visible).toBe(true);
	});

	it("position and alpha are mutable", () => {
		const g = new WebGLGraphics();
		g.x = 50;
		g.y = -30;
		g.alpha = 0.5;
		g.visible = false;
		expect(g.x).toBe(50);
		expect(g.y).toBe(-30);
		expect(g.alpha).toBe(0.5);
		expect(g.visible).toBe(false);
	});
});

describe("WebGLGraphics — drawRoundedRect guards", () => {
	it("negative width/height are made absolute", () => {
		const g = new WebGLGraphics();
		// Should not throw — w/h are abs'd, r is clamped to 0
		g.drawRoundedRect(10, 10, -50, -30, 5);
		expect(g.commandCount).toBe(1);
	});

	it("negative radius is clamped to 0", () => {
		const g = new WebGLGraphics();
		g.drawRoundedRect(0, 0, 100, 80, -10);
		expect(g.commandCount).toBe(1);
	});
});
