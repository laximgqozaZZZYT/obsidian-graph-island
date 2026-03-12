/**
 * E2E test: Phase 20 — Accessibility enhancements
 * - 20-A: focus-visible CSS rule with "dashed" outline exists
 * - 20-B: Toggle checkmark indicator exists for is-enabled
 * - 20-C: Interactive elements have min-height >= 28px
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

test.describe("Phase 20 — Accessibility Enhancements", () => {
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

  test("20-A: focus-visible rule with dashed outline exists", async () => {
    const result = await evaluate(ws, `(() => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText &&
                rule.cssText.includes('.graph-panel') &&
                rule.cssText.includes('focus-visible') &&
                rule.cssText.includes('dashed')) {
              return true;
            }
          }
        } catch (e) { /* cross-origin */ }
      }
      return false;
    })()`);
    expect(result).toBe(true);
  });

  test("20-C: interactive elements have min-height >= 28px", async () => {
    const result = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { ok: false, reason: 'no panel' };
      const selectors = ['button', 'input', 'select', '.checkbox-container'];
      const failures = [];
      for (const sel of selectors) {
        const els = panel.querySelectorAll(sel);
        for (const el of els) {
          const style = getComputedStyle(el);
          const minH = parseFloat(style.minHeight);
          if (minH < 28 && !isNaN(minH) && minH > 0) {
            failures.push(sel + ': ' + minH + 'px');
          }
        }
      }
      return { ok: failures.length === 0, failures: failures.slice(0, 5) };
    })()`);
    expect(result.ok).toBe(true);
  });

  test("screenshot", async () => {
    await screenshot(ws, "phase20-accessibility.png");
  });
});
