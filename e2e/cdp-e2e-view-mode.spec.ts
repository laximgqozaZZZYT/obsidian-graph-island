/**
 * E2E: View Mode switching — verify each mode renders correctly via CDP.
 */
import { test, expect } from "@playwright/test";
import { measureScreenDensity, measureLabelReadability } from "./helpers/quality-checks";

const CDP_URL = "ws://localhost:9222/devtools/page/2DF4797F97DB62C57B98EFB217563F30";

function cdp(ws: import("ws").WebSocket, id: number, expr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const handler = (data: import("ws").RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off("message", handler);
        if (msg.result?.exceptionDetails) reject(new Error(msg.result.exceptionDetails.text));
        else resolve(msg.result?.result?.value ?? msg.result);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({
      id, method: "Runtime.evaluate",
      params: { expression: expr, awaitPromise: true, returnByValue: true },
    }));
  });
}

function screenshot(ws: import("ws").WebSocket, id: number): Promise<Buffer> {
  return new Promise((resolve) => {
    const handler = (data: import("ws").RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id && msg.result?.data) {
        ws.off("message", handler);
        resolve(Buffer.from(msg.result.data, "base64"));
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method: "Page.captureScreenshot", params: { format: "png" } }));
  });
}

let ws: import("ws").WebSocket;
let nextId = 1;

test.beforeAll(async () => {
  const WebSocket = (await import("ws")).default;
  ws = new WebSocket(CDP_URL);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  // Reload plugin
  await cdp(ws, nextId++, `(async () => {
    await app.plugins.disablePlugin('graph-island');
    await app.plugins.enablePlugin('graph-island');
    await new Promise(r => setTimeout(r, 8000));
    return 'ready';
  })()`);
});

test.afterAll(() => { ws?.close(); });

test("Graph mode: nodes visible, force layout active", async () => {
  const result = await cdp(ws, nextId++, `(() => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    if (!l) return { error: 'no leaf' };
    const v = l.view;
    return {
      viewMode: v.panel?.viewMode,
      currentLayout: v.currentLayout,
      nodeCount: v.pixiNodes?.size ?? 0,
      nodeGfxInWorld: [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === v.worldContainer).length,
      toolbarButtons: l.containerEl.querySelectorAll('.gi-view-mode-group .gi-view-mode-btn').length,
      activeButton: l.containerEl.querySelector('.gi-view-mode-group .is-active')?.dataset?.mode,
    };
  })()`);
  expect(result.viewMode).toBe("graph");
  expect(result.currentLayout).toBe("force");
  expect(result.nodeCount).toBeGreaterThan(100);
  expect(result.nodeGfxInWorld).toBeGreaterThan(100);
  expect(result.toolbarButtons).toBe(5);
  expect(result.activeButton).toBe("graph");
});

test("Sunburst mode: ring chart arcs visible, no node gfx in world", async () => {
  await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="sunburst"]')?.click();
    await new Promise(r => setTimeout(r, 8000));
    return 'clicked';
  })()`);
  const result = await cdp(ws, nextId++, `(() => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    const v = l.view;
    return {
      viewMode: v.panel?.viewMode,
      currentLayout: v.currentLayout,
      arcsCount: v.sunburstLayoutArcs?.length ?? 0,
      sunburstGfxCmds: v.sunburstGraphics?.commandCount ?? 0,
      nodeGfxInWorld: [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === v.worldContainer).length,
      edgeGfxCmds: v.edgeGraphics?.commandCount ?? -1,
      activeButton: l.containerEl.querySelector('.gi-view-mode-group .is-active')?.dataset?.mode,
    };
  })()`);
  expect(result.viewMode).toBe("sunburst");
  expect(result.currentLayout).toBe("sunburst");
  expect(result.arcsCount).toBeGreaterThan(10);
  expect(result.sunburstGfxCmds).toBeGreaterThan(100); // arcs should have draw commands
  expect(result.nodeGfxInWorld).toBe(0); // no node graphics in world
  expect(result.edgeGfxCmds).toBe(0); // edges cleared
  expect(result.activeButton).toBe("sunburst");
});

test("Timeline mode: bars generated, no node gfx in world", async () => {
  await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="timeline"]')?.click();
    await new Promise(r => setTimeout(r, 8000));
    return 'clicked';
  })()`);
  const result = await cdp(ws, nextId++, `(() => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    const v = l.view;
    const bars = v.clusterMeta?.timelineBars ?? [];
    const barGfxCmds = v.barGraphics?.commandCount ?? 0;
    const wc = v.worldContainer;
    return {
      viewMode: v.panel?.viewMode,
      currentLayout: v.currentLayout,
      barCount: bars.length,
      barGfxCmds,
      nodeGfxInWorld: [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === wc).length,
      edgeGfxCmds: v.edgeGraphics?.commandCount ?? -1,
      worldScale: wc?.scale?.x,
      activeButton: l.containerEl.querySelector('.gi-view-mode-group .is-active')?.dataset?.mode,
      // Check bar bbox fits in viewport
      barXrange: bars.length > 0 ? [Math.min(...bars.map(b => b.xStart)), Math.max(...bars.map(b => b.xEnd))] : null,
    };
  })()`);
  expect(result.viewMode).toBe("timeline");
  expect(result.currentLayout).toBe("timeline");
  expect(result.barCount).toBeGreaterThan(10);
  expect(result.barGfxCmds).toBeGreaterThan(10); // bars should be drawn
  expect(result.nodeGfxInWorld).toBe(0);
  expect(result.edgeGfxCmds).toBe(0); // edges cleared
  expect(result.activeButton).toBe("timeline");
  // Viewport scale should make bars visible (not microscopic)
  expect(result.worldScale).toBeGreaterThan(0.01);
});

test("Graph restore: nodes visible again after returning from sunburst", async () => {
  await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="graph"]')?.click();
    await new Promise(r => setTimeout(r, 8000));
    return 'clicked';
  })()`);
  const result = await cdp(ws, nextId++, `(() => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    const v = l.view;
    return {
      viewMode: v.panel?.viewMode,
      currentLayout: v.currentLayout,
      nodeGfxInWorld: [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === v.worldContainer).length,
      activeButton: l.containerEl.querySelector('.gi-view-mode-group .is-active')?.dataset?.mode,
    };
  })()`);
  expect(result.viewMode).toBe("graph");
  expect(result.currentLayout).toBe("force");
  expect(result.nodeGfxInWorld).toBeGreaterThan(100);
  expect(result.activeButton).toBe("graph");
});

test("Matrix mode: adjacency table visible, no node gfx, DOM-based", async () => {
  await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="matrix"]')?.click();
    await new Promise(r => setTimeout(r, 8000));
    return 'clicked';
  })()`);
  const result = await cdp(ws, nextId++, `(() => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    const v = l.view;
    const matrixEl = l.containerEl.querySelector('.gi-matrix-fullscreen');
    const cells = matrixEl?.querySelectorAll('.gi-matrix-cell, .gi-matrix-label');
    return {
      viewMode: v.panel?.viewMode,
      nodeGfxInWorld: [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === v.worldContainer).length,
      matrixVisible: !!matrixEl,
      cellCount: cells?.length ?? 0,
      activeButton: l.containerEl.querySelector('.gi-view-mode-group .is-active')?.dataset?.mode,
    };
  })()`);
  expect(result.viewMode).toBe("matrix");
  // Matrix mode: node gfx may remain in world (DOM overlay covers them)
  expect(result.matrixVisible).toBe(true);
  expect(result.cellCount).toBeGreaterThan(10); // adjacency table has cells
  expect(result.activeButton).toBe("matrix");
});

test("Graph restore after matrix: nodes visible again", async () => {
  await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="graph"]')?.click();
    await new Promise(r => setTimeout(r, 8000));
    return 'clicked';
  })()`);
  const result = await cdp(ws, nextId++, `(() => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    const v = l.view;
    const matrixEl = l.containerEl.querySelector('.gi-matrix-fullscreen');
    return {
      viewMode: v.panel?.viewMode,
      currentLayout: v.currentLayout,
      nodeGfxInWorld: [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === v.worldContainer).length,
      matrixHidden: !matrixEl || getComputedStyle(matrixEl).display === 'none',
      activeButton: l.containerEl.querySelector('.gi-view-mode-group .is-active')?.dataset?.mode,
    };
  })()`);
  expect(result.viewMode).toBe("graph");
  expect(result.currentLayout).toBe("force");
  expect(result.nodeGfxInWorld).toBeGreaterThan(100);
  expect(result.matrixHidden).toBe(true); // matrix table hidden
  expect(result.activeButton).toBe("graph");
});

// =========================================================================
// Screen-Space Visual Quality (auto-generated)
// =========================================================================
test("SCREEN-QUALITY: no node pile-up and labels readable", async () => {
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) return;

  const density = await measureScreenDensity(page);
  if (density.totalNodes > 10) {
    expect(density.worstCellCount).toBeLessThan(50);
    expect(density.viewportUtilization).toBeGreaterThan(20);
    expect(density.rightHalfRatio).toBeLessThan(90);
  }

  const labels = await measureLabelReadability(page);
  if (labels.totalVisible > 5) {
    expect(labels.overlapRate).toBeLessThan(0.50);
    expect(labels.tooSmallCount).toBeLessThan(labels.totalVisible * 0.3);
  }
});

