/**
 * Shared CDP helpers for E2E tests.
 *
 * Usage (Playwright CDP):
 *   import { connectCDP, reloadPlugin, waitStable, renderWith } from "./helpers/cdp-helpers";
 *   const { browser, page } = await connectCDP();
 *
 * Usage (Raw WebSocket):
 *   import { createCdpWs, cdpEval } from "./helpers/cdp-helpers";
 *   const ws = await createCdpWs();
 */
import { chromium, type Page, type Browser } from "@playwright/test";

const CDP_PORT = 9222;
const CDP_URL = `http://localhost:${CDP_PORT}`;

// ---------------------------------------------------------------------------
// Playwright CDP connection
// ---------------------------------------------------------------------------

/** Connect to Obsidian via Playwright CDP with retry. */
export async function connectCDP(retries = 3): Promise<{ browser: Browser; page: Page }> {
  let browser!: Browser;
  for (let i = 0; i < retries; i++) {
    try {
      browser = await chromium.connectOverCDP(CDP_URL);
      break;
    } catch {
      if (i === retries - 1) throw new Error(`CDP connection failed after ${retries} attempts`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  const pages = browser.contexts()[0].pages();
  const page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  return { browser, page };
}

/**
 * JS snippet to find the Graph Island view (not Obsidian built-in graph).
 * Use inside page.evaluate() calls.
 */
export const FIND_VIEW_EXPR = `
  app.workspace.getLeavesOfType('graph-view')
    .find(l => 'pixiNodes' in l.view)?.view
`;

/** Reload the Graph Island plugin without location.reload(). */
export async function reloadPlugin(page: Page, waitMs = 4000): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    for (const leaf of app.workspace.getLeavesOfType("markdown")) leaf.detach();
    for (const leaf of app.workspace.getLeavesOfType("graph-view")) leaf.detach();
    await app.plugins.disablePlugin("graph-island");
    await app.plugins.enablePlugin("graph-island");
  });
  await page.waitForTimeout(waitMs);
}

/** Wait for graph rendering to stabilize. Returns node count. */
export async function waitStable(page: Page, initialWaitMs = 4000, minThreshold = 200): Promise<number> {
  await page.waitForTimeout(initialWaitMs);
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 10; i++) {
    const s = await page.evaluate(() => {
      const v = (window as any).app.workspace
        .getLeavesOfType("graph-view")
        .find((l: any) => "pixiNodes" in l.view)?.view;
      return v?.pixiNodes?.size ?? -1;
    });
    if (s === last && s > minThreshold) { stable++; if (stable >= 2) return s; }
    else { last = s; stable = 0; }
    await page.waitForTimeout(500);
  }
  return last;
}

/** Set panel properties, trigger doRender, and wait for stability. */
export async function renderWith(
  page: Page,
  settings: Record<string, unknown>,
): Promise<number> {
  await page.evaluate(async ({ settings: s }) => {
    const v = (window as any).app.workspace
      .getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    if (!v) return;
    for (const [k, val] of Object.entries(s)) v.panel[k] = val;
    v.rawData = null;
    await v.doRender();
    await new Promise(r => setTimeout(r, 200));
    for (const [k, val] of Object.entries(s)) v.panel[k] = val;
  }, { settings });
  return waitStable(page, 2000);
}

// ---------------------------------------------------------------------------
// Raw WebSocket CDP connection (for tests that bypass Playwright)
// ---------------------------------------------------------------------------

/** Discover the WebSocket CDP URL for the 開発 vault page. */
export async function discoverCdpWsUrl(): Promise<string> {
  const res = await fetch(`http://localhost:${CDP_PORT}/json/list`);
  const pages = (await res.json()) as { title: string; webSocketDebuggerUrl: string }[];
  const dev = pages.find(p => p.title.includes("開発"));
  if (!dev) throw new Error("No '開発' vault page found in CDP targets");
  return dev.webSocketDebuggerUrl;
}

/** Create a WebSocket connection to the 開発 vault. */
export async function createCdpWs(): Promise<import("ws").WebSocket> {
  const WebSocket = (await import("ws")).default;
  const url = await discoverCdpWsUrl();
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  return ws;
}

/** Evaluate a JS expression via raw CDP WebSocket. */
export function cdpEval(
  ws: import("ws").WebSocket,
  id: number,
  expr: string,
  timeoutMs = 30000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`CDP timeout for id ${id}`)), timeoutMs);
    const handler = (data: import("ws").RawData) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timeout);
        ws.off("message", handler);
        if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
        else resolve(msg.result?.result?.value ?? msg.result);
      }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({
      id,
      method: "Runtime.evaluate",
      params: { expression: expr, awaitPromise: true, returnByValue: true },
    }));
  });
}
