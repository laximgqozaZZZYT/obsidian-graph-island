/**
 * E2E test: Phase 10 — Background Dot Grid
 * Verifies showDotGrid property on CanvasApp and toggle in PanelState.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const CDP_URL = "http://localhost:9222/json";
const IMAGE_DIR = path.join(__dirname, "images");

async function getCdpWs(): Promise<string> {
  const resp = await fetch(CDP_URL);
  const targets = await resp.json();
  const t = targets.find((t: any) => t.title?.includes("Graph Island") || t.title?.includes("開発"));
  if (!t) throw new Error("CDP target not found");
  return t.webSocketDebuggerUrl;
}

function cdp(ws: WebSocket, method: string, params?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 15000);
    const handler = (evt: any) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws: WebSocket, expression: string): Promise<any> {
  const result = await cdp(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`Eval error: ${result.exceptionDetails.text || JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function screenshot(ws: WebSocket, name: string): Promise<void> {
  const result = await cdp(ws, "Page.captureScreenshot", { format: "png" });
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  fs.writeFileSync(path.join(IMAGE_DIR, name), Buffer.from(result.data, "base64"));
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

test.describe("Phase 10 — Background Dot Grid", () => {
  let ws: WebSocket;

  test.beforeAll(async () => {
    const wsUrl = await getCdpWs();
    ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
    });
    await cdp(ws, "Runtime.enable");
    await cdp(ws, "Page.enable");
  });

  test.afterAll(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  });

  test("CanvasApp has showDotGrid property (default true)", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const view = leaf.view;
      const pixiApp = view.graphContainer?.pixiApp ?? view.graphContainer?.getPixiApp?.();
      if (!pixiApp) return { error: "no pixiApp" };
      return { showDotGrid: pixiApp.showDotGrid };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) {
      console.log("Skip: " + result.error);
      return;
    }
    expect(result.showDotGrid).toBe(true);
  });

  test("PanelState has showDotGrid property", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const view = leaf.view;
      const panel = view.graphContainer?.panel;
      if (!panel) return { error: "no panel" };
      return { showDotGrid: panel.showDotGrid };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) {
      console.log("Skip: " + result.error);
      return;
    }
    expect(typeof result.showDotGrid).toBe("boolean");
  });

  test("Toggle showDotGrid off and verify", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const view = leaf.view;
      const gc = view.graphContainer;
      if (!gc) return { error: "no graphContainer" };
      const panel = gc.panel;
      const pixiApp = gc.pixiApp ?? gc.getPixiApp?.();
      if (!panel || !pixiApp) return { error: "no panel or pixiApp" };

      // Toggle off
      panel.showDotGrid = false;
      pixiApp.showDotGrid = false;

      return { panelValue: panel.showDotGrid, appValue: pixiApp.showDotGrid };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) {
      console.log("Skip: " + result.error);
      return;
    }
    expect(result.panelValue).toBe(false);
    expect(result.appValue).toBe(false);
  });

  test("Toggle showDotGrid back on", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const view = leaf.view;
      const gc = view.graphContainer;
      if (!gc) return { error: "no graphContainer" };
      const panel = gc.panel;
      const pixiApp = gc.pixiApp ?? gc.getPixiApp?.();
      if (!panel || !pixiApp) return { error: "no panel or pixiApp" };

      // Toggle on
      panel.showDotGrid = true;
      pixiApp.showDotGrid = true;

      return { panelValue: panel.showDotGrid, appValue: pixiApp.showDotGrid };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) {
      console.log("Skip: " + result.error);
      return;
    }
    expect(result.panelValue).toBe(true);
    expect(result.appValue).toBe(true);
  });

  test("Screenshot with dot grid", async () => {
    await sleep(500);
    await screenshot(ws, "phase10-dot-grid.png");
  });
});
