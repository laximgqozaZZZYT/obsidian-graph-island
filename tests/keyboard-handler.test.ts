import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({ TFile: class {} }));

import { handleShortcutKey, type KeyboardHost } from "../src/views/KeyboardHandler";

// Minimal DOM stub (no jsdom required)
function stubEl(): any {
  const classList = new Set<string>();
  return {
    classList: {
      toggle: (cls: string) => { if (classList.has(cls)) classList.delete(cls); else classList.add(cls); },
      remove: (cls: string) => classList.delete(cls),
      contains: (cls: string) => classList.has(cls),
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: () => {},
    focus: () => {},
  };
}

function mockHost(overrides?: Partial<KeyboardHost>): KeyboardHost {
  return {
    panelEl: stubEl(),
    containerEl: stubEl(),
    worldContainer: { x: 0, y: 0 },
    highlightedNodeId: null,
    isKeyboardFocused: false,
    panel: { showLegend: false, showMinimap: false, showDotGrid: false, hoverHops: 2 },
    compareNodeIds: [],
    pixiNodes: new Map(),
    app: {} as any,
    autoFitView: vi.fn(),
    zoomBy: vi.fn(),
    setZoom: vi.fn(),
    markDirty: vi.fn(),
    applyHover: vi.fn(),
    updateLegend: vi.fn(),
    requestSave: vi.fn(),
    copyGraphToClipboard: vi.fn(),
    cycleFocusNode: vi.fn(),
    focusZoomToNode: vi.fn(),
    navigateNeighbor: vi.fn(),
    announceA11y: vi.fn(),
    announceZoomLevel: vi.fn(),
    toggleHelpOverlay: vi.fn(),
    toggleMultiSelect: vi.fn(),
    addCompareNode: vi.fn(),
    setPathfinderNode: vi.fn(),
    openFile: vi.fn(),
    ...overrides,
  };
}

function makeEvent(key: string, mods?: { ctrl?: boolean; shift?: boolean; meta?: boolean }): any {
  return {
    key,
    ctrlKey: mods?.ctrl ?? false,
    shiftKey: mods?.shift ?? false,
    metaKey: mods?.meta ?? false,
    altKey: false,
    preventDefault: vi.fn(),
  };
}

describe("handleShortcutKey", () => {
  it("Space triggers autoFitView", () => {
    const wrap = { clientWidth: 800, clientHeight: 600 };
    const host = mockHost();
    (host.containerEl as any).querySelector = (sel: string) => sel.includes("graph-svg-wrap") ? wrap : null;

    const handled = handleShortcutKey(host, " ", makeEvent(" "));
    expect(handled).toBe(true);
    expect(host.autoFitView).toHaveBeenCalledWith(800, 600);
  });

  it("L toggles legend", () => {
    const host = mockHost();
    host.panel.showLegend = false;
    handleShortcutKey(host, "l", makeEvent("l"));
    expect(host.panel.showLegend).toBe(true);
    expect(host.updateLegend).toHaveBeenCalled();
    expect(host.requestSave).toHaveBeenCalled();
  });

  it("M toggles minimap", () => {
    const host = mockHost();
    host.panel.showMinimap = false;
    handleShortcutKey(host, "m", makeEvent("m"));
    expect(host.panel.showMinimap).toBe(true);
    expect(host.markDirty).toHaveBeenCalledWith(true);
  });

  it("G toggles grid", () => {
    const host = mockHost();
    host.panel.showDotGrid = false;
    handleShortcutKey(host, "g", makeEvent("g"));
    expect(host.panel.showDotGrid).toBe(true);
  });

  it("+ zooms in", () => {
    const host = mockHost();
    handleShortcutKey(host, "+", makeEvent("+"));
    expect(host.zoomBy).toHaveBeenCalledWith(1.2);
    expect(host.announceZoomLevel).toHaveBeenCalled();
  });

  it("- zooms out", () => {
    const host = mockHost();
    handleShortcutKey(host, "-", makeEvent("-"));
    expect(host.zoomBy).toHaveBeenCalledWith(1 / 1.2);
  });

  it("[ decreases hoverHops", () => {
    const host = mockHost();
    host.panel.hoverHops = 3;
    handleShortcutKey(host, "[", makeEvent("["));
    expect(host.panel.hoverHops).toBe(2);
    expect(host.applyHover).toHaveBeenCalled();
  });

  it("] increases hoverHops", () => {
    const host = mockHost();
    host.panel.hoverHops = 3;
    handleShortcutKey(host, "]", makeEvent("]"));
    expect(host.panel.hoverHops).toBe(4);
  });

  it("[ clamps hoverHops at 0", () => {
    const host = mockHost();
    host.panel.hoverHops = 0;
    handleShortcutKey(host, "[", makeEvent("["));
    expect(host.panel.hoverHops).toBe(0);
  });

  it("] clamps hoverHops at 10", () => {
    const host = mockHost();
    host.panel.hoverHops = 10;
    handleShortcutKey(host, "]", makeEvent("]"));
    expect(host.panel.hoverHops).toBe(10);
  });

  it("Tab calls cycleFocusNode(1)", () => {
    const host = mockHost();
    handleShortcutKey(host, "Tab", makeEvent("Tab"));
    expect(host.cycleFocusNode).toHaveBeenCalledWith(1);
  });

  it("Shift+Tab calls cycleFocusNode(-1)", () => {
    const host = mockHost();
    handleShortcutKey(host, "Tab", makeEvent("Tab", { shift: true }));
    expect(host.cycleFocusNode).toHaveBeenCalledWith(-1);
  });

  it("? toggles help overlay", () => {
    const host = mockHost();
    handleShortcutKey(host, "?", makeEvent("?"));
    expect(host.toggleHelpOverlay).toHaveBeenCalled();
  });

  it("Ctrl+Shift+C copies graph", () => {
    const host = mockHost();
    handleShortcutKey(host, "C", makeEvent("C", { ctrl: true, shift: true }));
    expect(host.copyGraphToClipboard).toHaveBeenCalled();
  });

  it("Arrow keys pan when no focus", () => {
    const host = mockHost();
    handleShortcutKey(host, "ArrowUp", makeEvent("ArrowUp"));
    expect(host.worldContainer!.y).toBe(50);
    handleShortcutKey(host, "ArrowDown", makeEvent("ArrowDown"));
    expect(host.worldContainer!.y).toBe(0);
  });

  it("Arrow keys navigate neighbors when focused", () => {
    const host = mockHost({ isKeyboardFocused: true, highlightedNodeId: "node1" });
    handleShortcutKey(host, "ArrowRight", makeEvent("ArrowRight"));
    expect(host.navigateNeighbor).toHaveBeenCalledWith("ArrowRight");
  });

  it("P toggles panel visibility", () => {
    const host = mockHost();
    handleShortcutKey(host, "p", makeEvent("p"));
    // After first toggle, is-hidden should be set
    expect((host.panelEl as any).classList.contains("is-hidden")).toBe(true);
    handleShortcutKey(host, "p", makeEvent("p"));
    expect((host.panelEl as any).classList.contains("is-hidden")).toBe(false);
  });

  it("returns false for unhandled keys", () => {
    const host = mockHost();
    const result = handleShortcutKey(host, "x", makeEvent("x"));
    expect(result).toBe(false);
  });
});
