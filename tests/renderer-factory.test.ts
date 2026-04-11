import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectBackend } from "../src/views/renderer-factory";

describe("detectBackend", () => {
  it('returns "canvas2d" when document is not available (Node env)', () => {
    // In Node test env, document.createElement("canvas").getContext("webgl2")
    // is not available, so the catch block fires and returns "canvas2d"
    const result = detectBackend();
    expect(result).toBe("canvas2d");
  });

  it('returns "canvas2d" when WebGL2 context is null', () => {
    // Temporarily provide a document mock that returns null for webgl2
    const origDoc = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        getContext: () => null,
      }),
    } as any;
    try {
      expect(detectBackend()).toBe("canvas2d");
    } finally {
      globalThis.document = origDoc;
    }
  });

  it('returns "webgl" when WebGL2 context is available', () => {
    const origDoc = globalThis.document;
    const mockGl = {
      getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
    };
    globalThis.document = {
      createElement: () => ({
        getContext: (type: string) => (type === "webgl2" ? mockGl : null),
      }),
    } as any;
    try {
      expect(detectBackend()).toBe("webgl");
      expect(mockGl.getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    } finally {
      globalThis.document = origDoc;
    }
  });
});

describe("createApp", () => {
  let origDoc: typeof globalThis.document;
  let origWindow: typeof globalThis.window;

  beforeEach(() => {
    origDoc = globalThis.document;
    origWindow = globalThis.window;
  });
  afterEach(() => {
    globalThis.document = origDoc;
    globalThis.window = origWindow;
    if (origWindow?.requestAnimationFrame) {
      globalThis.requestAnimationFrame = origWindow.requestAnimationFrame;
      globalThis.cancelAnimationFrame = origWindow.cancelAnimationFrame;
    } else {
      delete (globalThis as any).requestAnimationFrame;
      delete (globalThis as any).cancelAnimationFrame;
    }
  });

  it("returns an IApp-compatible object when forced to canvas2d backend", async () => {
    // Mock minimal DOM environment for CanvasApp constructor
    const mockCtx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      setTransform: vi.fn(),
      fillStyle: "",
    };
    const mockCanvas = {
      getContext: vi.fn(() => mockCtx),
      width: 0,
      height: 0,
      style: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    globalThis.document = {
      createElement: vi.fn(() => mockCanvas),
    } as any;
    globalThis.window = {
      devicePixelRatio: 1,
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
    } as any;
    // Ticker uses bare requestAnimationFrame (not window.requestAnimationFrame)
    globalThis.requestAnimationFrame = vi.fn(() => 1) as any;
    globalThis.cancelAnimationFrame = vi.fn() as any;

    // Dynamic import to pick up the mocked globals
    const { createApp } = await import("../src/views/renderer-factory");
    const app = createApp({ width: 100, height: 100 }, "canvas2d");

    expect(app).toBeDefined();
    expect(typeof app.destroy).toBe("function");
    expect(typeof app.resize).toBe("function");
    expect(typeof app.markNeedsRender).toBe("function");
    expect(typeof app.setBackgroundColor).toBe("function");
    expect(typeof app.getContext).toBe("function");
    expect(app.renderer.width).toBe(100);
    expect(app.renderer.height).toBe(100);
    expect(app.stage).toBeDefined();
    expect(app.ticker).toBeDefined();
    expect(app.supportsAnimation).toBe(true);

    app.destroy();
  });
});
