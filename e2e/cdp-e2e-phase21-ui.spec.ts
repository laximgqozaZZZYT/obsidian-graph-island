/**
 * E2E test: Phase 21 — Label ellipsis + tooltips
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

test.describe("Phase 21 — Label ellipsis + tooltips", () => {
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

  test("21-1: setting-item-name has text-overflow ellipsis CSS", async () => {
    const result = await evaluate(ws, `(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes('setting-item-name') &&
                rule.style && rule.style.textOverflow === 'ellipsis') {
              return { found: true, selector: rule.selectorText };
            }
          }
        } catch(e) {}
      }
      return { found: false };
    })()`);
    console.log("21-1:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("21-2: setting-item-name elements have title attributes", async () => {
    const result = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { error: 'no panel' };
      const names = panel.querySelectorAll('.setting-item-name');
      const total = names.length;
      let withTitle = 0;
      for (const el of names) {
        if (el.title && el.title.length > 0) withTitle++;
      }
      return { total, withTitle, ratio: total > 0 ? withTitle / total : 0 };
    })()`);
    console.log("21-2:", JSON.stringify(result));
    expect(result.total).toBeGreaterThan(0);
    // At least 80% of labels should have title
    expect(result.ratio).toBeGreaterThanOrEqual(0.8);
  });

  test("21-3: setting-item-name computed style has overflow hidden", async () => {
    const result = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { error: 'no panel' };
      const name = panel.querySelector('.setting-item-name');
      if (!name) return { error: 'no name element' };
      const cs = getComputedStyle(name);
      return {
        overflow: cs.overflow,
        textOverflow: cs.textOverflow,
        whiteSpace: cs.whiteSpace,
      };
    })()`);
    console.log("21-3:", JSON.stringify(result));
    expect(result.overflow).toBe("hidden");
    expect(result.textOverflow).toBe("ellipsis");
  });

  test("screenshot: Phase 21", async () => {
    await screenshot(ws, "phase21-label-ellipsis.png");
  });
});
