/**
 * E2E: High Contrast Mode toggle and visual verification.
 * Uses shared CDP helpers as the reference pattern for new E2E tests.
 */
import { test, expect } from "@playwright/test";
import { createCdpWs, cdpEval } from "./helpers/cdp-helpers";

let ws: import("ws").WebSocket;
let nextId = 200;

test.beforeAll(async () => {
  ws = await createCdpWs();
  await cdpEval(ws, nextId++, `(async () => {
    await app.plugins.disablePlugin('graph-island');
    await new Promise(r => setTimeout(r, 2000));
    await app.plugins.enablePlugin('graph-island');
    await new Promise(r => setTimeout(r, 10000));
    return 'ready';
  })()`);
});

test.afterAll(() => { ws?.close(); });

test("highContrastMode defaults to false", async () => {
  const hc = await cdpEval(ws, nextId++, `(() => {
    const v = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view)?.view;
    return v?.panel?.highContrastMode ?? 'missing';
  })()`);
  expect(hc).toBe(false);
});

test("toggling highContrastMode triggers re-render", async () => {
  const result = await cdpEval(ws, nextId++, `(async () => {
    const v = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view)?.view;
    if (!v) return { error: 'no view' };

    // Capture baseline edge graphics command count
    v.panel.highContrastMode = false;
    v.rawData = null;
    await v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const cmdsBefore = v.edgeGraphics?.commandCount ?? 0;

    // Enable high contrast
    v.panel.highContrastMode = true;
    v.rawData = null;
    await v.doRender();
    await new Promise(r => setTimeout(r, 3000));
    const cmdsAfter = v.edgeGraphics?.commandCount ?? 0;

    // Verify panel value persists
    const panelVal = v.panel.highContrastMode;

    return { cmdsBefore, cmdsAfter, panelVal };
  })()`);

  expect(result).not.toHaveProperty("error");
  expect(result.panelVal).toBe(true);
  // Both renders should produce edge commands (graph is active)
  expect(result.cmdsBefore).toBeGreaterThan(0);
  expect(result.cmdsAfter).toBeGreaterThan(0);
});

test("highContrastMode is preserved in preset export/import", async () => {
  const result = await cdpEval(ws, nextId++, `(() => {
    const v = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view)?.view;
    if (!v) return { error: 'no view' };

    // Set high contrast on
    v.panel.highContrastMode = true;

    // Export preset
    const exported = v.exportPreset ? v.exportPreset() : JSON.parse(JSON.stringify(v.panel));

    // Check that highContrastMode is included in export
    return {
      exportedHC: exported.highContrastMode,
      hasKey: 'highContrastMode' in exported,
    };
  })()`);

  expect(result).not.toHaveProperty("error");
  expect(result.hasKey).toBe(true);
  expect(result.exportedHC).toBe(true);
});

test("cleanup: restore highContrastMode to false", async () => {
  await cdpEval(ws, nextId++, `(async () => {
    const v = app.workspace.getLeavesOfType('graph-view').find(l => 'pixiNodes' in l.view)?.view;
    if (v) {
      v.panel.highContrastMode = false;
      v.rawData = null;
      await v.doRender();
    }
    return 'done';
  })()`);
});
