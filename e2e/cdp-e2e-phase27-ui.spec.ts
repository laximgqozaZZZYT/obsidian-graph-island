/**
 * E2E test: Phase 27 — Panel width drag resize
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

test.describe("Phase 27 — Panel drag resize", () => {
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

  test("27-1: resize handle element exists", async () => {
    // First make sure panel is visible
    await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (panel && panel.classList.contains('is-hidden')) {
        panel.classList.remove('is-hidden');
      }
    })()`);
    await sleep(200);

    const result = await evaluate(ws, `(() => {
      const handle = document.querySelector('.gi-panel-resize-handle');
      if (!handle) return { error: 'no resize handle' };
      const style = getComputedStyle(handle);
      return {
        exists: true,
        cursor: style.cursor,
        position: style.position,
        width: style.width,
      };
    })()`);
    console.log("27-1:", JSON.stringify(result));
    expect(result.exists).toBe(true);
    expect(result.cursor).toBe("col-resize");
  });

  test("27-2: resize handle is flex sibling of panel", async () => {
    const result = await evaluate(ws, `(() => {
      const handle = document.querySelector('.gi-panel-resize-handle');
      if (!handle) return { error: 'no handle' };
      const style = getComputedStyle(handle);
      const nextSib = handle.nextElementSibling;
      return {
        width: style.width,
        flexShrink: style.flexShrink,
        nextSibIsPanel: nextSib?.classList.contains('graph-panel') ?? false,
      };
    })()`);
    console.log("27-2:", JSON.stringify(result));
    expect(result.width).toBe("4px");
    expect(result.nextSibIsPanel).toBe(true);
  });

  test("27-3: resize handle has pointerdown event listener", async () => {
    // Verify the handle responds to pointer events by checking cursor style
    const result = await evaluate(ws, `(() => {
      const handle = document.querySelector('.gi-panel-resize-handle');
      if (!handle) return { error: 'no handle' };
      // The handle has an event listener — dispatch pointerdown and check is-dragging class
      handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 100 }));
      const hasDragging = handle.classList.contains('is-dragging');
      // Clean up by dispatching pointerup
      document.dispatchEvent(new PointerEvent('pointerup'));
      return { hasDragging, cursorStyle: getComputedStyle(handle).cursor };
    })()`);
    console.log("27-3:", JSON.stringify(result));
    expect(result.hasDragging).toBe(true);
    expect(result.cursorStyle).toBe("col-resize");
  });

  test("screenshot: Phase 27 panel resize handle", async () => {
    await screenshot(ws, "phase27-panel-resize.png");
  });
});
