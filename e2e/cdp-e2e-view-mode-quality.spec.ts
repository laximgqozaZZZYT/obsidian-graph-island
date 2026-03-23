/**
 * E2E Quality: View Mode rendering quality verification.
 * Checks that each mode produces VISIBLE content at the right scale.
 */
import { test, expect } from "@playwright/test";
import { createCdpWs, cdpEval } from "./helpers/cdp-helpers";

let ws: import("ws").WebSocket;
let nextId = 100;

test.beforeAll(async () => {
  ws = await createCdpWs();
  // Force fresh plugin load
  await cdpEval(ws, nextId++, `(async () => {
    await app.plugins.disablePlugin('graph-island');
    await new Promise(r => setTimeout(r, 2000));
    await app.plugins.enablePlugin('graph-island');
    await new Promise(r => setTimeout(r, 10000));
    return 'ready';
  })()`);
});

test.afterAll(() => { ws?.close(); });

test("Sunburst quality: arcs fill viewport, labels present", async () => {
  const result = await cdpEval(ws, nextId++, `(async () => {
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
    const center = v.sunburstCenter ?? { x: 0, y: 0 };
    let maxRadius = 0;
    for (const a of arcs) { if (a.y1 > maxRadius) maxRadius = a.y1; }
    const screenDiameter = maxRadius * 2 * scale;
    const screenCenterX = center.x * scale + (wc?.x ?? 0);
    const screenCenterY = center.y * scale + (wc?.y ?? 0);
    const labelContainer = v.sunburstLabelContainer;
    const labelCount = labelContainer?.children?.length ?? 0;
    const nodeGfxInWorld = [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === wc).length;
    const edgeCmds = v.edgeGraphics?.commandCount ?? -1;
    return {
      arcsCount: arcs.length,
      gfxCmds: gfx?.commandCount ?? 0,
      scale, screenDiameter, screenCenterX, screenCenterY,
      canvasW: W, canvasH: H, labelCount, nodeGfxInWorld, edgeCmds,
      fillsViewport: screenDiameter > Math.min(W, H) * 0.5,
      centerInView: screenCenterX > 0 && screenCenterX < W && screenCenterY > 0 && screenCenterY < H,
    };
  })()`);

  expect(result.arcsCount).toBeGreaterThan(10);
  expect(result.gfxCmds).toBeGreaterThan(100);
  expect(result.fillsViewport).toBe(true);
  expect(result.centerInView).toBe(true);
  expect(result.nodeGfxInWorld).toBe(0);
  expect(result.edgeCmds).toBe(0);
  expect(result.labelCount).toBeGreaterThan(0);
});

test("Timeline quality: bars visible at screen scale", async () => {
  const result = await cdpEval(ws, nextId++, `(async () => {
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
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of bars) {
      if (b.xStart < minX) minX = b.xStart;
      if (b.xEnd > maxX) maxX = b.xEnd;
      if (b.yCenter - b.barHeight/2 < minY) minY = b.yCenter - b.barHeight/2;
      if (b.yCenter + b.barHeight/2 > maxY) maxY = b.yCenter + b.barHeight/2;
    }
    const barScreenWidth = (maxX - minX) * scale;
    const avgBarScreenHeight = bars.length > 0 ? bars[0].barHeight * scale : 0;
    const nodeGfxInWorld = [...v.pixiNodes.values()].filter(pn => pn.gfx.parent === wc).length;
    const edgeCmds = v.edgeGraphics?.commandCount ?? -1;
    return {
      barCount: bars.length, barGfxCmds, scale, canvasW: W, canvasH: H,
      avgBarScreenHeight, nodeGfxInWorld, edgeCmds,
      barsVisible: avgBarScreenHeight >= 2,
      barsFitInView: barScreenWidth <= W * 3,
    };
  })()`);

  expect(result.barCount).toBeGreaterThan(10);
  expect(result.barGfxCmds).toBeGreaterThan(10);
  expect(result.barsVisible).toBe(true);
  expect(result.barsFitInView).toBe(true);
  expect(result.nodeGfxInWorld).toBe(0);
  expect(result.edgeCmds).toBe(0);
});

test("Graph restore quality: nodes restored with proper scale", async () => {
  const result = await cdpEval(ws, nextId++, `(async () => {
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
  const result = await cdpEval(ws, nextId++, `(() => {
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

  expect(result.buttonCount).toBe(5);
  expect(result.groupWidth).toBeGreaterThan(100);
  for (const btn of result.buttons) {
    expect(btn.hasLabel).toBe(true);
    expect(btn.hasIcon).toBe(true);
    expect(btn.labelText.length).toBeGreaterThan(0);
    expect(btn.width).toBeGreaterThan(30);
    expect(btn.height).toBeGreaterThan(20);
  }
});
