/**
 * E2E test: Phase 29 — Heatmap mode (degree-based coloring)
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

test.describe("Phase 29 — Heatmap mode", () => {
  let ws: WebSocket;

  test.beforeAll(async () => {
    const url = await getCdpWs();
    ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
    });
    await cdp(ws, "Runtime.enable");
  });

  test.afterAll(async () => {
    if (ws) ws.close();
  });

  test("29-1: heatmap toggle exists in panel", async () => {
    // Open panel first
    await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (panel && panel.classList.contains('is-hidden')) {
        const btn = document.querySelector('.graph-settings-btn');
        if (btn) btn.click();
      }
    })()`);
    await sleep(300);

    const result = await evaluate(ws, `(() => {
      // Look for heatmap toggle by searching for text content
      const items = document.querySelectorAll('.graph-panel .setting-item');
      for (const item of items) {
        const name = item.querySelector('.setting-item-name');
        if (name && name.textContent?.includes('Heatmap')) {
          const toggle = item.querySelector('.checkbox-container');
          return { found: true, label: name.textContent, hasToggle: !!toggle };
        }
      }
      return { found: false, itemCount: items.length };
    })()`);
    console.log("29-1:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("29-2: heatmap toggle can be activated", async () => {
    // Click the heatmap toggle
    const result = await evaluate(ws, `(() => {
      const items = document.querySelectorAll('.graph-panel .setting-item');
      for (const item of items) {
        const name = item.querySelector('.setting-item-name');
        if (name && name.textContent?.includes('Heatmap')) {
          const toggle = item.querySelector('.checkbox-container');
          if (toggle) {
            toggle.click();
            return { clicked: true, isChecked: toggle.classList.contains('is-enabled') };
          }
        }
      }
      return { clicked: false };
    })()`);
    console.log("29-2:", JSON.stringify(result));
    expect(result.clicked).toBe(true);
  });

  test("29-3: canvas renders with heatmap active", async () => {
    await sleep(500);
    const result = await evaluate(ws, `(() => {
      const canvas = document.querySelector('.graph-container canvas, .gi-canvas-area canvas');
      if (!canvas) return { error: 'no canvas' };
      return { hasCanvas: true, width: canvas.width, height: canvas.height };
    })()`);
    console.log("29-3:", JSON.stringify(result));
    expect(result.hasCanvas).toBe(true);
  });

  test("screenshot: Phase 29 heatmap mode", async () => {
    await screenshot(ws, "phase29-heatmap.png");
  });

  test("29-4: disable heatmap after test", async () => {
    // Turn off heatmap
    await evaluate(ws, `(() => {
      const items = document.querySelectorAll('.graph-panel .setting-item');
      for (const item of items) {
        const name = item.querySelector('.setting-item-name');
        if (name && name.textContent?.includes('Heatmap')) {
          const toggle = item.querySelector('.checkbox-container');
          if (toggle && toggle.classList.contains('is-enabled')) {
            toggle.click();
          }
        }
      }
    })()`);
    expect(true).toBe(true);
  });
});
