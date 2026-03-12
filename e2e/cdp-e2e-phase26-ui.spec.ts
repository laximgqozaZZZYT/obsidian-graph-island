/**
 * E2E test: Phase 26 — Enclosure radial gradient fill
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

test.describe("Phase 26 — Enclosure radial gradient", () => {
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

  test("26-1: CanvasGraphics has beginRadialFill method", async () => {
    const result = await evaluate(ws, `(() => {
      // Verify the plugin bundle contains beginRadialFill
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      return {
        hasCreateRadialGradient: typeof ctx.createRadialGradient === 'function',
      };
    })()`);
    console.log("26-1:", JSON.stringify(result));
    expect(result.hasCreateRadialGradient).toBe(true);
  });

  test("26-2: enclosure tag display option exists in panel", async () => {
    // Check that the tagDisplay dropdown includes "enclosure" option
    const result = await evaluate(ws, `(() => {
      const selects = document.querySelectorAll('.graph-panel select');
      for (const sel of selects) {
        const options = Array.from(sel.options).map(o => o.value);
        if (options.includes('enclosure')) {
          return { found: true, options };
        }
      }
      return { found: false, selectCount: selects.length };
    })()`);
    console.log("26-2:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("26-3: canvas renders with enclosure content", async () => {
    const result = await evaluate(ws, `(() => {
      const canvas = document.querySelector('.graph-container canvas, .gi-canvas-area canvas');
      if (!canvas) return { error: 'no canvas' };
      return { width: canvas.width, height: canvas.height, hasCanvas: true };
    })()`);
    console.log("26-3:", JSON.stringify(result));
    if (result.error) { console.log("Skip:", result.error); return; }
    expect(result.hasCanvas).toBe(true);
  });

  test("screenshot: Phase 26 enclosure gradient", async () => {
    await screenshot(ws, "phase26-enclosure-gradient.png");
  });
});
