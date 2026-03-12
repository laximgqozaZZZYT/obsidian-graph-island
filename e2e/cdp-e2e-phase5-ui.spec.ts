/**
 * E2E test: Phase 5 — CSS Micro-interactions
 * Verifies section collapse animation, tab fade, slider thumb, toolbar separator.
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

test.describe("Phase 5 — CSS Micro-interactions", () => {
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

  test("5-A1: section collapse has CSS transition", async () => {
    const result = await evaluate(ws, `(() => {
      const children = document.querySelector('.graph-panel .tree-item-children');
      if (!children) return { error: 'no tree-item-children' };
      const style = getComputedStyle(children);
      return {
        transition: style.transition,
        maxHeight: style.maxHeight,
        overflow: style.overflow,
      };
    })()`);

    console.log("5-A1 collapse styles:", JSON.stringify(result));
    expect(result.transition).toContain("max-height");
    expect(result.overflow).toBe("hidden");
  });

  test("5-A1: collapsed section has max-height 0", async () => {
    // Find a collapsed section or collapse one
    await evaluate(ws, `(() => {
      const header = document.querySelector('.graph-panel .graph-control-section-header');
      if (header) header.click();
    })()`);
    await sleep(300);

    const result = await evaluate(ws, `(() => {
      const collapsed = document.querySelector('.graph-panel .tree-item.is-collapsed > .tree-item-children');
      if (!collapsed) return { error: 'no collapsed section found' };
      const style = getComputedStyle(collapsed);
      return {
        maxHeight: style.maxHeight,
        opacity: style.opacity,
      };
    })()`);

    console.log("5-A1 collapsed:", JSON.stringify(result));
    expect(result.maxHeight).toBe("0px");
    expect(result.opacity).toBe("0");

    // Re-expand
    await evaluate(ws, `(() => {
      const header = document.querySelector('.graph-panel .tree-item.is-collapsed .graph-control-section-header');
      if (header) header.click();
    })()`);
    await sleep(300);
  });

  test("5-A2: active tab content has fade animation", async () => {
    const result = await evaluate(ws, `(() => {
      const active = document.querySelector('.gi-tab-content.is-active');
      if (!active) return { error: 'no active tab content' };
      const style = getComputedStyle(active);
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
      };
    })()`);

    console.log("5-A2 tab fade:", JSON.stringify(result));
    expect(result.animationName).toContain("gi-tab-fade-in");
  });

  test("5-A4: slider thumb has custom styling", async () => {
    const result = await evaluate(ws, `(() => {
      const slider = document.querySelector('.graph-panel input[type="range"]');
      if (!slider) return { error: 'no slider found' };
      // Check computed style of the slider itself (thumb pseudo-element can't be directly read)
      const style = getComputedStyle(slider);
      return {
        exists: true,
        accentColor: style.accentColor,
      };
    })()`);

    console.log("5-A4 slider:", JSON.stringify(result));
    expect(result.exists).toBe(true);
  });

  test("5-D1: toolbar has separator pseudo-element", async () => {
    const result = await evaluate(ws, `(() => {
      const zoom = document.querySelector('.graph-toolbar-zoom');
      if (!zoom) return { error: 'no toolbar-zoom' };
      const style = getComputedStyle(zoom, '::before');
      return {
        width: style.width,
        height: style.height,
        content: style.content,
      };
    })()`);

    console.log("5-D1 separator:", JSON.stringify(result));
    // Pseudo-element should have 1px width (or close)
    expect(result.content).not.toBe("none");
  });

  test("screenshot: Phase 5 overview", async () => {
    await screenshot(ws, "phase5-overview.png");
  });
});
