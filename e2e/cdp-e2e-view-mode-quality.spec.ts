/**
 * E2E Quality: View Mode rendering quality verification.
 * Checks that each mode produces VISIBLE content at the right scale.
 */
import { test, expect } from "@playwright/test";

const CDP_URL = "ws://localhost:9222/devtools/page/BCA71922CD8CECD42810A1290471C7B8";

function cdp(ws: import("ws").WebSocket, id: number, expr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout for id ${id}`)), 30000);
    const handler = (data: import("ws").RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.off("message", handler);
        if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
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

let ws: import("ws").WebSocket;
let nextId = 100;

test.beforeAll(async () => {
  const WebSocket = (await import("ws")).default;
  ws = new WebSocket(CDP_URL);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  // Force fresh plugin load
  await cdp(ws, nextId++, `(async () => {
    await app.plugins.disablePlugin('graph-island');
    await new Promise(r => setTimeout(r, 2000));
    await app.plugins.enablePlugin('graph-island');
    await new Promise(r => setTimeout(r, 10000));
    return 'ready';
  })()`);
});

test.afterAll(() => { ws?.close(); });

test("Sunburst quality: arcs fill viewport, labels present", async () => {
  const result = await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    if (!l) return { error: 'no leaf' };
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="sunburst"]')?.click();
    await new Promise(r => setTimeout(r, 10000));
    const v = l.view;
    const arcs = v.sunburstLayoutArcs ?? [];
    const gfx = v.sunburstGraphics;
    const wc = v.worldContainer;
    const W = v.canvasWrap?.clientWidth ?? 0;
    const H = v.canvasWrap?.clientHeight ?? 0;
    const scale = wc?.scale?.x ?? 0;

    // Compute arc bounding box in screen space
    const center = v.sunburstCenter ?? { x: 0, y: 0 };
    let maxRadius = 0;
    for (const a of arcs) { if (a.y1 > maxRadius) maxRadius = a.y1; }
    const screenDiameter = maxRadius * 2 * scale;
    const screenCenterX = center.x * scale + (wc?.x ?? 0);
    const screenCenterY = center.y * scale + (wc?.y ?? 0);

    // Check labels
    const labelContainer = v.sunburstLabelContainer;
    const labelCount = labelContainer?.children?.length ?? 0;

    // Check no node gfx in world
    const nodeGfxInWorld = [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === wc).length;

    // Check edge graphics cleared
    const edgeCmds = v.edgeGraphics?.commandCount ?? -1;

    return {
      arcsCount: arcs.length,
      gfxCmds: gfx?.commandCount ?? 0,
      scale,
      screenDiameter,
      screenCenterX,
      screenCenterY,
      canvasW: W, canvasH: H,
      labelCount,
      nodeGfxInWorld,
      edgeCmds,
      // Quality metrics
      fillsViewport: screenDiameter > Math.min(W, H) * 0.5,
      centerInView: screenCenterX > 0 && screenCenterX < W && screenCenterY > 0 && screenCenterY < H,
    };
  })()`);

  // Data existence
  expect(result.arcsCount).toBeGreaterThan(10);
  expect(result.gfxCmds).toBeGreaterThan(100);

  // Quality: sunburst fills at least 50% of the smaller canvas dimension
  expect(result.fillsViewport).toBe(true);

  // Quality: sunburst center is within the visible canvas
  expect(result.centerInView).toBe(true);

  // No nodes or edges
  expect(result.nodeGfxInWorld).toBe(0);
  expect(result.edgeCmds).toBe(0);

  // Labels exist
  expect(result.labelCount).toBeGreaterThan(0);
});

test("Timeline quality: bars visible at screen scale", async () => {
  const result = await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    if (!l) return { error: 'no leaf' };
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="timeline"]')?.click();
    await new Promise(r => setTimeout(r, 10000));
    const v = l.view;
    const bars = v.clusterMeta?.timelineBars ?? [];
    const wc = v.worldContainer;
    const scale = wc?.scale?.x ?? 0;
    const W = v.canvasWrap?.clientWidth ?? 0;
    const H = v.canvasWrap?.clientHeight ?? 0;
    const barGfxCmds = v.barGraphics?.commandCount ?? 0;

    // Compute bar bbox in world coords
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of bars) {
      if (b.xStart < minX) minX = b.xStart;
      if (b.xEnd > maxX) maxX = b.xEnd;
      if (b.yCenter - b.barHeight/2 < minY) minY = b.yCenter - b.barHeight/2;
      if (b.yCenter + b.barHeight/2 > maxY) maxY = b.yCenter + b.barHeight/2;
    }

    // Screen-space metrics
    const barScreenWidth = (maxX - minX) * scale;
    const barScreenHeight = (maxY - minY) * scale;
    const avgBarScreenHeight = bars.length > 0 ? bars[0].barHeight * scale : 0;

    // No nodes or edges
    const nodeGfxInWorld = [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === wc).length;
    const edgeCmds = v.edgeGraphics?.commandCount ?? -1;

    return {
      barCount: bars.length,
      barGfxCmds,
      scale,
      canvasW: W, canvasH: H,
      barWorldBbox: { minX, maxX, minY, maxY },
      barScreenWidth,
      barScreenHeight,
      avgBarScreenHeight,
      nodeGfxInWorld,
      edgeCmds,
      // Quality metrics
      barsVisible: avgBarScreenHeight >= 2, // bars are at least 2px tall on screen
      barsFitInView: barScreenWidth <= W * 3, // bars don't extend more than 3x canvas width
    };
  })()`);

  // Data existence
  expect(result.barCount).toBeGreaterThan(10);
  expect(result.barGfxCmds).toBeGreaterThan(10);

  // Quality: individual bars are at least 2px tall on screen
  expect(result.barsVisible).toBe(true);

  // Quality: bars fit reasonably within viewport
  expect(result.barsFitInView).toBe(true);

  // No nodes or edges
  expect(result.nodeGfxInWorld).toBe(0);
  expect(result.edgeCmds).toBe(0);
});

test("Graph restore quality: nodes restored with proper scale", async () => {
  const result = await cdp(ws, nextId++, `(async () => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    if (!l) return { error: 'no leaf' };
    l.containerEl.querySelector('.gi-view-mode-btn[data-mode="graph"]')?.click();
    await new Promise(r => setTimeout(r, 10000));
    const v = l.view;
    const wc = v.worldContainer;
    const nodeGfxInWorld = [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === wc).length;
    return {
      viewMode: v.panel?.viewMode,
      currentLayout: v.currentLayout,
      nodeGfxInWorld,
      totalNodes: v.pixiNodes?.size ?? 0,
      scale: wc?.scale?.x ?? 0,
    };
  })()`);

  expect(result.viewMode).toBe("graph");
  expect(result.currentLayout).toBe("force");
  expect(result.nodeGfxInWorld).toBeGreaterThan(100);
  expect(result.nodeGfxInWorld).toBe(result.totalNodes);
});

test("UI quality: toolbar buttons have text labels", async () => {
  const result = await cdp(ws, nextId++, `(() => {
    const l = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view);
    if (!l) return { error: 'no leaf' };
    const group = l.containerEl.querySelector('.gi-view-mode-group');
    if (!group) return { error: 'no mode group' };
    const btns = group.querySelectorAll('.gi-view-mode-btn');
    const info = [];
    btns.forEach(btn => {
      const label = btn.querySelector('.gi-vm-label');
      const icon = btn.querySelector('.gi-vm-icon');
      info.push({
        mode: btn.dataset.mode,
        hasLabel: !!label && label.textContent.length > 0,
        hasIcon: !!icon,
        labelText: label?.textContent ?? '',
        width: btn.offsetWidth,
        height: btn.offsetHeight,
      });
    });
    return {
      buttonCount: btns.length,
      groupWidth: group.offsetWidth,
      groupHeight: group.offsetHeight,
      buttons: info,
    };
  })()`);

  expect(result.buttonCount).toBe(4);
  expect(result.groupWidth).toBeGreaterThan(100); // group should be wide enough for 4 labeled buttons

  for (const btn of result.buttons) {
    expect(btn.hasLabel).toBe(true);
    expect(btn.hasIcon).toBe(true);
    expect(btn.labelText.length).toBeGreaterThan(0);
    expect(btn.width).toBeGreaterThan(30); // each button wide enough to read
    expect(btn.height).toBeGreaterThan(20); // clickable height
  }
});
