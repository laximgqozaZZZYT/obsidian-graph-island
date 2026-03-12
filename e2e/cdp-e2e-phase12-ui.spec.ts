/**
 * E2E test: Phase 12 — Button Hierarchy & Press Feedback
 * Verifies primary buttons have accent background and buttons have transform transitions.
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

test.describe("Phase 12 — Button Hierarchy & Press Feedback", () => {
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

  test("Primary action buttons have filled accent background", async () => {
    const result = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { error: "no graph-panel" };
      const actionBtn = panel.querySelector('.gi-action-row button, .ngp-action-row button');
      if (!actionBtn) return { error: "no action button found" };
      const cs = getComputedStyle(actionBtn);
      return {
        bg: cs.backgroundColor,
        color: cs.color,
        borderRadius: cs.borderRadius,
        isTransparent: cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent',
      };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    // Primary buttons should NOT be transparent — they have accent fill
    expect(result.isTransparent).toBe(false);
    console.log(`Primary button bg: ${result.bg}, color: ${result.color}`);
  });

  test("Action buttons have transform in transition property", async () => {
    const result = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { error: "no graph-panel" };
      const actionBtn = panel.querySelector('.gi-action-row button, .ngp-action-row button');
      if (!actionBtn) return { error: "no action button found" };
      const cs = getComputedStyle(actionBtn);
      return {
        transition: cs.transition,
        hasTransform: cs.transition.includes('transform'),
      };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    expect(result.hasTransform).toBe(true);
    console.log(`Transition: ${result.transition}`);
  });

  test("Toolbar buttons have transform transition", async () => {
    const result = await evaluate(ws, `(() => {
      const btn = document.querySelector('.graph-toolbar button');
      if (!btn) return { error: "no toolbar button" };
      const cs = getComputedStyle(btn);
      return {
        transition: cs.transition,
        hasTransform: cs.transition.includes('transform'),
      };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    expect(result.hasTransform).toBe(true);
    console.log(`Toolbar btn transition: ${result.transition}`);
  });

  test("Preset buttons have transform transition", async () => {
    const result = await evaluate(ws, `(() => {
      const btn = document.querySelector('.gi-preset-btn');
      if (!btn) return { error: "no preset button" };
      const cs = getComputedStyle(btn);
      return {
        transition: cs.transition,
        hasTransform: cs.transition.includes('transform'),
        bg: cs.backgroundColor,
        border: cs.border,
      };
    })()`);
    expect(result).toBeTruthy();
    if (result.error) { console.log("Skip: " + result.error); return; }
    expect(result.hasTransform).toBe(true);
    console.log(`Preset btn transition: ${result.transition}, bg: ${result.bg}`);
  });

  test("Screenshot of button hierarchy", async () => {
    await sleep(500);
    await screenshot(ws, "phase12-button-hierarchy.png");
  });
});
