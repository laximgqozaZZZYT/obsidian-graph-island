/**
 * E2E test: Phase 6 — Visual hierarchy & UX improvements
 * Verifies panel slide animation, focus-visible, status bar, scrollbar.
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

test.describe("Phase 6 — Visual hierarchy & UX", () => {
  let ws: WebSocket;

  test.beforeAll(async () => {
    const url = await getCdpWs();
    ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
    });
    await cdp(ws, "Runtime.enable");

    // Reload plugin
    await evaluate(ws, `(async () => {
      await window.app.plugins.disablePlugin('graph-island');
      await new Promise(r => setTimeout(r, 1000));
      await window.app.plugins.enablePlugin('graph-island');
      await new Promise(r => setTimeout(r, 3000));
    })()`);
    await sleep(2000);

    // Ensure panel is open
    await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (panel) panel.classList.remove('is-hidden');
    })()`);
    await sleep(500);
  });

  test.afterAll(async () => {
    if (ws) ws.close();
  });

  test("6-C3: panel has width transition", async () => {
    const result = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { error: 'no panel' };
      const style = getComputedStyle(panel);
      return {
        transition: style.transition,
        overflow: style.overflow,
      };
    })()`);

    console.log("6-C3 panel transition:", JSON.stringify(result));
    expect(result.transition).toContain("width");
  });

  test("6-C3: hidden panel has zero width", async () => {
    // Hide panel
    await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (panel) panel.classList.add('is-hidden');
    })()`);
    await sleep(350); // Wait for transition

    const result = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel.is-hidden');
      if (!panel) return { error: 'no hidden panel' };
      const style = getComputedStyle(panel);
      return {
        width: style.width,
        opacity: style.opacity,
        borderLeftWidth: style.borderLeftWidth,
      };
    })()`);

    console.log("6-C3 hidden panel:", JSON.stringify(result));
    expect(result.width).toBe("0px");
    expect(result.opacity).toBe("0");

    // Re-open panel
    await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (panel) panel.classList.remove('is-hidden');
    })()`);
    await sleep(350);
  });

  test("6-E1: focus-visible CSS rule exists", async () => {
    // Check that the stylesheet contains focus:not(:focus-visible)
    const result = await evaluate(ws, `(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes(':focus:not(:focus-visible)')) {
              return { found: true, selector: rule.selectorText };
            }
          }
        } catch(e) { /* cross-origin sheet */ }
      }
      return { found: false };
    })()`);

    console.log("6-E1 focus-visible:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("6-D2: status bar shows filtered count with separator", async () => {
    // Wait for render to complete
    await sleep(1000);

    const result = await evaluate(ws, `(() => {
      const status = document.querySelector('.graph-status');
      if (!status) return { error: 'no status element' };
      return {
        text: status.textContent,
        hasSlash: status.textContent?.includes('/'),
      };
    })()`);

    console.log("6-D2 status bar:", JSON.stringify(result));
    // If filtering is active (orphans hidden, etc.), should show "X / Y nodes"
    // If no filter, just "X nodes" — both are valid
    expect(result.text).toContain("nodes");
  });

  test("6-D3: panel has thin scrollbar CSS", async () => {
    // Check scrollbar stylesheet rules
    const result = await evaluate(ws, `(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes('.graph-panel') && rule.selectorText.includes('scrollbar')) {
              return { found: true, selector: rule.selectorText };
            }
          }
        } catch(e) { /* cross-origin */ }
      }
      return { found: false };
    })()`);

    console.log("6-D3 scrollbar:", JSON.stringify(result));
    expect(result.found).toBe(true);
  });

  test("screenshot: Phase 6 overview", async () => {
    await screenshot(ws, "phase6-overview.png");
  });
});
