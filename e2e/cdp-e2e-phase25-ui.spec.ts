/**
 * E2E test: Phase 25 — Zoom indicator & fullscreen toggle
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

test.describe("Phase 25 — Zoom indicator & fullscreen", () => {
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

  test("25-1: zoom indicator element exists with percentage text", async () => {
    const result = await evaluate(ws, `(() => {
      const el = document.querySelector('.gi-zoom-indicator');
      if (!el) return { error: 'no zoom indicator' };
      return {
        exists: true,
        text: el.textContent,
        hasPercent: el.textContent.includes('%'),
      };
    })()`);
    console.log("25-1:", JSON.stringify(result));
    expect(result.exists).toBe(true);
    expect(result.hasPercent).toBe(true);
  });

  test("25-2: zoom indicator has proper CSS styling", async () => {
    const result = await evaluate(ws, `(() => {
      const el = document.querySelector('.gi-zoom-indicator');
      if (!el) return { error: 'no zoom indicator' };
      const style = getComputedStyle(el);
      return {
        textAlign: style.textAlign,
        userSelect: style.userSelect,
        minWidth: style.minWidth,
      };
    })()`);
    console.log("25-2:", JSON.stringify(result));
    expect(result.textAlign).toBe("center");
    expect(result.minWidth).toBe("36px");
  });

  test("25-3: fullscreen button exists", async () => {
    const result = await evaluate(ws, `(() => {
      const btn = document.querySelector('.gi-fullscreen-btn');
      if (!btn) return { error: 'no fullscreen button' };
      return {
        exists: true,
        tagName: btn.tagName,
        hasIcon: btn.querySelector('svg') !== null,
      };
    })()`);
    console.log("25-3:", JSON.stringify(result));
    expect(result.exists).toBe(true);
  });

  test("25-4: fullscreen toggle adds gi-fullscreen class", async () => {
    // Click fullscreen button
    await evaluate(ws, `(() => {
      const btn = document.querySelector('.gi-fullscreen-btn');
      if (btn) btn.click();
    })()`);
    await sleep(300);

    const result = await evaluate(ws, `(() => {
      const container = document.querySelector('.graph-container');
      if (!container) return { error: 'no container' };
      return {
        isFullscreen: container.classList.contains('gi-fullscreen'),
      };
    })()`);
    console.log("25-4:", JSON.stringify(result));
    expect(result.isFullscreen).toBe(true);

    // Toggle back off
    await evaluate(ws, `(() => {
      const btn = document.querySelector('.gi-fullscreen-btn');
      if (btn) btn.click();
    })()`);
    await sleep(300);

    const result2 = await evaluate(ws, `(() => {
      const container = document.querySelector('.graph-container');
      return { isFullscreen: container?.classList.contains('gi-fullscreen') ?? false };
    })()`);
    console.log("25-4 (after toggle off):", JSON.stringify(result2));
    expect(result2.isFullscreen).toBe(false);
  });

  test("screenshot: Phase 25 zoom indicator", async () => {
    await screenshot(ws, "phase25-zoom-indicator.png");
  });
});
