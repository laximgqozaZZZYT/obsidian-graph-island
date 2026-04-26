import { describe, it, expect } from "vitest";
import { CanvasContainer } from "../src/views/canvas2d/CanvasContainer";
import { CanvasGraphics } from "../src/views/canvas2d/CanvasGraphics";
import { CanvasText } from "../src/views/canvas2d/CanvasText";

// ---------------------------------------------------------------------------
// addChild / addChildAt
// ---------------------------------------------------------------------------

describe("CanvasContainer.addChild", () => {
	it("adds a child and sets parent", () => {
		const parent = new CanvasContainer();
		const child = new CanvasGraphics();
		parent.addChild(child);
		expect(parent.children.length).toBe(1);
		expect(child.parent).toBe(parent);
	});

	it("does not duplicate when adding the same child twice", () => {
		const parent = new CanvasContainer();
		const child = new CanvasGraphics();
		parent.addChild(child);
		parent.addChild(child);
		expect(parent.children.length).toBe(1);
	});

	it("supports mixed child types (Graphics + Text + Container)", () => {
		const parent = new CanvasContainer();
		const g = new CanvasGraphics();
		const t = new CanvasText("hello");
		const c = new CanvasContainer();
		parent.addChild(g);
		parent.addChild(t);
		parent.addChild(c);
		expect(parent.children.length).toBe(3);
		expect(parent.children[0]).toBe(g);
		expect(parent.children[1]).toBe(t);
		expect(parent.children[2]).toBe(c);
	});
});

describe("CanvasContainer.addChildAt", () => {
	it("inserts at specified index", () => {
		const parent = new CanvasContainer();
		const a = new CanvasGraphics();
		const b = new CanvasGraphics();
		const c = new CanvasGraphics();
		parent.addChild(a);
		parent.addChild(c);
		parent.addChildAt(b, 1);
		expect(parent.children[0]).toBe(a);
		expect(parent.children[1]).toBe(b);
		expect(parent.children[2]).toBe(c);
	});

	it("clamps negative index to 0", () => {
		const parent = new CanvasContainer();
		const a = new CanvasGraphics();
		const b = new CanvasGraphics();
		parent.addChild(a);
		parent.addChildAt(b, -5);
		expect(parent.children[0]).toBe(b);
		expect(parent.children[1]).toBe(a);
	});

	it("clamps index beyond length to end", () => {
		const parent = new CanvasContainer();
		const a = new CanvasGraphics();
		const b = new CanvasGraphics();
		parent.addChild(a);
		parent.addChildAt(b, 999);
		expect(parent.children[parent.children.length - 1]).toBe(b);
	});
});

// ---------------------------------------------------------------------------
// removeChild / removeChildren
// ---------------------------------------------------------------------------

describe("CanvasContainer.removeChild", () => {
	it("removes child and nullifies parent", () => {
		const parent = new CanvasContainer();
		const child = new CanvasGraphics();
		parent.addChild(child);
		parent.removeChild(child);
		expect(parent.children.length).toBe(0);
		expect(child.parent).toBeNull();
	});

	it("no-op when removing a non-existent child", () => {
		const parent = new CanvasContainer();
		const orphan = new CanvasGraphics();
		parent.removeChild(orphan);
		expect(parent.children.length).toBe(0);
	});
});

describe("CanvasContainer.removeChildren", () => {
	it("removes all children and returns them", () => {
		const parent = new CanvasContainer();
		const a = new CanvasGraphics();
		const b = new CanvasText("x");
		parent.addChild(a);
		parent.addChild(b);
		const removed = parent.removeChildren();
		expect(removed.length).toBe(2);
		expect(parent.children.length).toBe(0);
		expect(a.parent).toBeNull();
		expect(b.parent).toBeNull();
	});

	it("returns empty array when no children", () => {
		const parent = new CanvasContainer();
		const removed = parent.removeChildren();
		expect(removed).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// toGlobal / toLocal
// ---------------------------------------------------------------------------

describe("CanvasContainer.toGlobal", () => {
	it("identity when no offset or scale", () => {
		const c = new CanvasContainer();
		const result = c.toGlobal({ x: 10, y: 20 });
		expect(result.x).toBe(10);
		expect(result.y).toBe(20);
	});

	it("applies translation", () => {
		const c = new CanvasContainer();
		c.x = 100;
		c.y = 200;
		const result = c.toGlobal({ x: 5, y: 10 });
		expect(result.x).toBe(105);
		expect(result.y).toBe(210);
	});

	it("applies scale", () => {
		const c = new CanvasContainer();
		c.scale.set(2);
		const result = c.toGlobal({ x: 10, y: 20 });
		expect(result.x).toBe(20);
		expect(result.y).toBe(40);
	});

	it("chains through parent hierarchy", () => {
		const root = new CanvasContainer();
		root.x = 50;
		root.y = 50;
		const child = new CanvasContainer();
		child.x = 10;
		child.y = 10;
		root.addChild(child);
		// child.toGlobal({0,0}) should be root.x + child.x = 60
		const result = child.toGlobal({ x: 0, y: 0 });
		expect(result.x).toBe(60);
		expect(result.y).toBe(60);
	});
});

describe("CanvasContainer.toLocal", () => {
	it("identity for root container with no transform", () => {
		const c = new CanvasContainer();
		const result = c.toLocal({ x: 30, y: 40 });
		expect(result.x).toBe(30);
		expect(result.y).toBe(40);
	});

	it("inverts translation", () => {
		const c = new CanvasContainer();
		c.x = 100;
		c.y = 200;
		const result = c.toLocal({ x: 150, y: 250 });
		expect(result.x).toBe(50);
		expect(result.y).toBe(50);
	});

	it("inverts scale", () => {
		const c = new CanvasContainer();
		c.scale.set(2);
		const result = c.toLocal({ x: 20, y: 40 });
		expect(result.x).toBe(10);
		expect(result.y).toBe(20);
	});
});

// ---------------------------------------------------------------------------
// destroy
// ---------------------------------------------------------------------------

describe("CanvasContainer.destroy", () => {
	it("destroys all children recursively", () => {
		const parent = new CanvasContainer();
		const g = new CanvasGraphics();
		g.drawCircle(0, 0, 10);
		parent.addChild(g);
		parent.destroy();
		expect(parent.children.length).toBe(0);
		// CanvasGraphics.destroy clears commands
		expect(g.commandCount).toBe(0);
	});
});
