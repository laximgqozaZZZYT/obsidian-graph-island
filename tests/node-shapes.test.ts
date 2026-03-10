import { describe, it, expect, vi } from "vitest";
import { drawShape, drawShapeAt, getNodeShape, type ShapeRule } from "../src/utils/node-shapes";
import type { GraphNode } from "../src/types";

// Mock PIXI.Graphics using the same Proxy pattern as edge-renderer.test.ts
function createMockGraphics() {
  const calls: { method: string; args: any[] }[] = [];
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      return (...args: any[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return { g: proxy, calls };
}

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: "test",
    label: "Test",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ...overrides,
  };
}

const DEFAULT_RULES: ShapeRule[] = [
  { match: "isTag", shape: "triangle" },
  { match: "default", shape: "circle" },
];

// ---------------------------------------------------------------------------
// drawShape tests
// ---------------------------------------------------------------------------
describe("drawShape", () => {
  it("draws a circle shape", () => {
    const { g, calls } = createMockGraphics();
    drawShape(g, "circle", 10, 0xff0000, 1);
    expect(calls.find(c => c.method === "beginFill")).toBeDefined();
    expect(calls.find(c => c.method === "drawCircle")).toBeDefined();
    expect(calls.find(c => c.method === "endFill")).toBeDefined();
  });

  it("draws a triangle shape with moveTo/lineTo/closePath", () => {
    const { g, calls } = createMockGraphics();
    drawShape(g, "triangle", 10, 0xff0000, 1);
    expect(calls.filter(c => c.method === "moveTo")).toHaveLength(1);
    expect(calls.filter(c => c.method === "lineTo")).toHaveLength(2);
    expect(calls.find(c => c.method === "closePath")).toBeDefined();
  });

  it("draws a diamond shape with 4 vertices", () => {
    const { g, calls } = createMockGraphics();
    drawShape(g, "diamond", 10, 0xff0000, 1);
    expect(calls.filter(c => c.method === "moveTo")).toHaveLength(1);
    expect(calls.filter(c => c.method === "lineTo")).toHaveLength(3);
    expect(calls.find(c => c.method === "closePath")).toBeDefined();
  });

  it("draws a hexagon shape with 6 vertices", () => {
    const { g, calls } = createMockGraphics();
    drawShape(g, "hexagon", 10, 0xff0000, 1);
    expect(calls.filter(c => c.method === "moveTo")).toHaveLength(1);
    expect(calls.filter(c => c.method === "lineTo")).toHaveLength(5);
    expect(calls.find(c => c.method === "closePath")).toBeDefined();
  });

  it("draws a square shape using drawRect", () => {
    const { g, calls } = createMockGraphics();
    drawShape(g, "square", 10, 0xff0000, 1);
    expect(calls.find(c => c.method === "drawRect")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// drawShapeAt tests
// ---------------------------------------------------------------------------
describe("drawShapeAt", () => {
  it("draws shape at specified center coordinates", () => {
    const { g, calls } = createMockGraphics();
    drawShapeAt(g, "circle", 50, 100, 10);
    const dc = calls.find(c => c.method === "drawCircle");
    expect(dc).toBeDefined();
    expect(dc!.args[0]).toBe(50);
    expect(dc!.args[1]).toBe(100);
  });

  it("does not call beginFill or endFill", () => {
    const { g, calls } = createMockGraphics();
    drawShapeAt(g, "triangle", 0, 0, 10);
    expect(calls.find(c => c.method === "beginFill")).toBeUndefined();
    expect(calls.find(c => c.method === "endFill")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getNodeShape tests
// ---------------------------------------------------------------------------
describe("getNodeShape", () => {
  it("returns triangle for isTag nodes", () => {
    const node = makeNode({ isTag: true });
    expect(getNodeShape(node, DEFAULT_RULES)).toBe("triangle");
  });

  it("returns circle for default (non-tag) nodes", () => {
    const node = makeNode();
    expect(getNodeShape(node, DEFAULT_RULES)).toBe("circle");
  });

  it("returns custom shape for category match", () => {
    const rules: ShapeRule[] = [
      { match: "category", category: "character", shape: "hexagon" },
      { match: "isTag", shape: "triangle" },
      { match: "default", shape: "circle" },
    ];
    const node = makeNode({ category: "character" });
    expect(getNodeShape(node, rules)).toBe("hexagon");
  });

  it("falls through to next rule when category does not match", () => {
    const rules: ShapeRule[] = [
      { match: "category", category: "character", shape: "hexagon" },
      { match: "default", shape: "circle" },
    ];
    const node = makeNode({ category: "location" });
    expect(getNodeShape(node, rules)).toBe("circle");
  });

  it("returns circle when no rules match and no default rule", () => {
    const rules: ShapeRule[] = [
      { match: "isTag", shape: "triangle" },
    ];
    const node = makeNode();
    expect(getNodeShape(node, rules)).toBe("circle");
  });

  it("returns circle for empty rules array", () => {
    const node = makeNode();
    expect(getNodeShape(node, [])).toBe("circle");
  });

  it("isTag rule takes priority when listed first", () => {
    const rules: ShapeRule[] = [
      { match: "isTag", shape: "diamond" },
      { match: "category", category: "character", shape: "hexagon" },
      { match: "default", shape: "circle" },
    ];
    const node = makeNode({ isTag: true, category: "character" });
    expect(getNodeShape(node, rules)).toBe("diamond");
  });
});
