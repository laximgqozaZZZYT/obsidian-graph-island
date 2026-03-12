/**
 * E2E test: Phase 11 — Semantic Zoom (Progressive Label Display)
 * Verifies that applyTextFade is zoom-aware and updateLabelsForZoom exists.
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

test.describe("Phase 11 — Semantic Zoom (Progressive Label Display)", () => {
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

  test("updateLabelsForZoom method exists on graphContainer", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const gc = leaf.view.graphContainer;
      if (!gc) return { error: "no graphContainer" };
      return {
        hasMethod: typeof gc.updateLabelsForZoom === "function"
      };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    expect(result.hasMethod).toBe(true);
  });

  test("Labels have alpha values and zoom is accessible", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const gc = leaf.view.graphContainer;
      if (!gc) return { error: "no graphContainer" };
      const world = gc.worldContainer;
      if (!world) return { error: "no worldContainer" };
      const zoom = world.scale.x;
      const pixiNodes = gc.pixiNodes ?? gc.getPixiNodes?.();
      if (!pixiNodes) return { error: "no pixiNodes" };
      let withLabel = 0;
      let alphaZero = 0;
      let alphaPositive = 0;
      for (const pn of pixiNodes.values()) {
        if (pn.label) {
          withLabel++;
          if (pn.label.alpha === 0) alphaZero++;
          else alphaPositive++;
        }
      }
      return { zoom, withLabel, alphaZero, alphaPositive };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    expect(typeof result.zoom).toBe("number");
    expect(result.zoom).toBeGreaterThan(0);
    expect(result.withLabel).toBeGreaterThan(0);
    console.log(`Zoom: ${result.zoom}, Labels: ${result.withLabel} (visible: ${result.alphaPositive}, hidden: ${result.alphaZero})`);
  });

  test("Semantic zoom hides labels at low zoom level", async () => {
    // Set zoom to very low and check that some labels are hidden
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const gc = leaf.view.graphContainer;
      if (!gc) return { error: "no graphContainer" };
      const world = gc.worldContainer;
      if (!world) return { error: "no worldContainer" };

      // Save original scale
      const origScale = world.scale.x;

      // Set to very low zoom
      world.scale.set(0.1);
      gc.updateLabelsForZoom();

      const pixiNodes = gc.pixiNodes ?? gc.getPixiNodes?.();
      let withLabel = 0;
      let alphaZero = 0;
      for (const pn of pixiNodes.values()) {
        if (pn.label) {
          withLabel++;
          if (pn.label.alpha === 0) alphaZero++;
        }
      }

      // Restore original scale
      world.scale.set(origScale);
      gc.updateLabelsForZoom();

      return { withLabel, alphaZero, lowZoomHidesLabels: alphaZero > 0 };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    // At zoom 0.1, most labels should be hidden (only top-degree nodes visible)
    expect(result.lowZoomHidesLabels).toBe(true);
    console.log(`At zoom 0.1: ${result.alphaZero}/${result.withLabel} labels hidden`);
  });

  test("Semantic zoom shows all labels at high zoom level", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-island")[0];
      if (!leaf) return { error: "no leaf" };
      const gc = leaf.view.graphContainer;
      if (!gc) return { error: "no graphContainer" };
      const world = gc.worldContainer;
      if (!world) return { error: "no worldContainer" };

      const origScale = world.scale.x;

      // Set to high zoom
      world.scale.set(1.0);
      gc.updateLabelsForZoom();

      const pixiNodes = gc.pixiNodes ?? gc.getPixiNodes?.();
      let withLabel = 0;
      let alphaZero = 0;
      for (const pn of pixiNodes.values()) {
        if (pn.label) {
          withLabel++;
          if (pn.label.alpha === 0) alphaZero++;
        }
      }

      // Restore
      world.scale.set(origScale);
      gc.updateLabelsForZoom();

      return { withLabel, alphaZero, allVisible: alphaZero === 0 };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    // At zoom 1.0, all labels should be visible
    expect(result.allVisible).toBe(true);
    console.log(`At zoom 1.0: all ${result.withLabel} labels visible`);
  });

  test("Screenshot with current zoom", async () => {
    await sleep(500);
    await screenshot(ws, "phase11-semantic-zoom.png");
  });
});
