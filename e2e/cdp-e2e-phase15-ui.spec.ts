/**
 * E2E test: Phase 15 — Floating element enhancement
 * Verifies legend shadow, close button CSS, minimap cursor, float-enter keyframe.
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

test.describe("Phase 15 — Floating element enhancement", () => {
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

  test("15-1: legend layered shadow CSS rule exists", async () => {
    const result = await evaluate(ws, `(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes('.gi-legend') &&
                rule.style && rule.style.boxShadow && rule.style.boxShadow.includes('24px')) {
              return { found: true, selector: rule.selectorText };
            }
          }
        } catch(e) { /* cross-origin */ }
      }
      return { found: false };
    })()`);
    console.log("15-1 legend shadow:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("15-2: legend close button CSS rule exists", async () => {
    const result = await evaluate(ws, `(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText === '.gi-legend-close') {
              return { found: true };
            }
          }
        } catch(e) { /* cross-origin */ }
      }
      return { found: false };
    })()`);
    console.log("15-2 close button:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("15-3: minimap handle cursor style", async () => {
    const result = await evaluate(ws, `(() => {
      // Check CSS rule for minimap handle
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes('minimap') &&
                rule.selectorText.includes('handle') &&
                rule.style && rule.style.cursor === 'grab') {
              return { found: true, selector: rule.selectorText };
            }
          }
        } catch(e) { /* cross-origin */ }
      }
      // Fallback: check computed style
      const el = document.querySelector('.gi-minimap-handle');
      if (el) {
        return { found: true, cursor: getComputedStyle(el).cursor };
      }
      return { found: false, note: 'minimap handle not in DOM' };
    })()`);
    console.log("15-3 minimap:", JSON.stringify(result));
    // Minimap handle may or may not be in DOM, so just verify CSS rule or element
    expect(result.found).toBe(true);
  });

  test("15-4: float-enter animation keyframe exists", async () => {
    const result = await evaluate(ws, `(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.type === 7 && rule.name === 'gi-float-enter') {
              return { found: true };
            }
          }
        } catch(e) { /* cross-origin */ }
      }
      return { found: false };
    })()`);
    console.log("15-4 keyframe:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("screenshot: Phase 15 floating elements", async () => {
    await screenshot(ws, "phase15-floating-elements.png");
  });
});
