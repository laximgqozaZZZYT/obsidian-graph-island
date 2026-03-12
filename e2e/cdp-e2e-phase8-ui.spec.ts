/**
 * E2E test: Phase 8 — Layout Morphing Animation
 * Verifies that layout transition is wired into the render pipeline.
 */
import { test, expect } from "@playwright/test";

const CDP_URL = "http://localhost:9222/json";

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

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

test.describe("Phase 8 — Layout Morphing Animation", () => {
  let ws: WebSocket;

  test.beforeAll(async () => {
    const wsUrl = await getCdpWs();
    ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", (e) => reject(e));
    });
    await cdp(ws, "Runtime.enable");
  });

  test.afterAll(async () => {
    ws?.close();
  });

  test("layoutTransition object exists on GraphViewContainer", async () => {
    const exists = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return false;
      const view = leaf.view;
      return view.layoutTransition != null && typeof view.layoutTransition.tick === "function";
    })()`);
    expect(exists).toBe(true);
  });

  test("tickLayoutTransition method exists on view", async () => {
    const exists = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return false;
      const view = leaf.view;
      return typeof view.tickLayoutTransition === "function";
    })()`);
    expect(exists).toBe(true);
  });

  test("tickLayoutTransition returns boolean when called", async () => {
    const result = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return null;
      const view = leaf.view;
      const val = view.tickLayoutTransition();
      return typeof val === "boolean";
    })()`);
    expect(result).toBe(true);
  });

  test("renderPipeline is connected to view", async () => {
    const connected = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return false;
      const view = leaf.view;
      return view.renderPipeline != null && typeof view.renderPipeline.markDirty === "function";
    })()`);
    expect(connected).toBe(true);
  });

  test("savedPositions map exists", async () => {
    const exists = await evaluate(ws, `(() => {
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return false;
      const view = leaf.view;
      return view.savedPositions instanceof Map;
    })()`);
    expect(exists).toBe(true);
  });
});
