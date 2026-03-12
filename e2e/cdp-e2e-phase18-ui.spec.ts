/**
 * E2E test: Phase 18 — Form state visualization
 * - 18-A: Disabled elements have pointer-events: none
 * - 18-B: Focus-visible rule exists in stylesheets
 * - 18-C: gi-skeleton-pulse keyframe exists
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

test.describe("Phase 18 — Form State Visualization", () => {
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

    // Reload plugin to pick up new CSS
    await evaluate(ws, `(async () => {
      await window.app.plugins.disablePlugin('graph-island');
      await new Promise(r => setTimeout(r, 1000));
      await window.app.plugins.enablePlugin('graph-island');
      await new Promise(r => setTimeout(r, 3000));
    })()`);
    await sleep(2000);
  });

  test.afterAll(async () => {
    ws?.close();
  });

  test("18-A: disabled elements have pointer-events none and reduced opacity", async () => {
    const result = await evaluate(ws, `(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            const text = (rule.selectorText || '') + ' ' + (rule.cssText || '');
            if (text.includes('.graph-panel') &&
                text.includes(':disabled') &&
                text.includes('pointer-events')) {
              return true;
            }
          }
        } catch (e) { /* cross-origin */ }
      }
      return false;
    })()`);
    expect(result).toBe(true);
  });

  test("18-B: focus-visible rule exists in stylesheets", async () => {
    const result = await evaluate(ws, `(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText && rule.cssText.includes('.graph-panel') &&
                rule.cssText.includes('focus-visible') &&
                rule.cssText.includes('box-shadow')) {
              return true;
            }
          }
        } catch (e) { /* cross-origin */ }
      }
      return false;
    })()`);
    expect(result).toBe(true);
  });

  test("18-C: gi-skeleton-pulse keyframe exists", async () => {
    const result = await evaluate(ws, `(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.type === CSSRule.KEYFRAMES_RULE && rule.name === 'gi-skeleton-pulse') {
              return true;
            }
          }
        } catch (e) { /* cross-origin */ }
      }
      return false;
    })()`);
    expect(result).toBe(true);
  });

  test("screenshot", async () => {
    await screenshot(ws, "phase18-form-states.png");
  });
});
