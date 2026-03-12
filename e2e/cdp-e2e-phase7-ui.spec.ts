/**
 * E2E test: Phase 7 — Hover Edge Highlight Improvement
 * Verifies that edge dimming is triggered when a node is hovered,
 * so non-adjacent edges fade out while adjacent edges stay opaque.
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

test.describe("Phase 7 — Hover Edge Highlight", () => {
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

    // Ensure graph view is open and fully initialized
    await evaluate(ws, `(async () => {
      // Close stale leaves first
      const oldLeaves = window.app.workspace.getLeavesOfType('graph-view');
      for (const l of oldLeaves) l.detach();
      await new Promise(r => setTimeout(r, 500));
      // Open a fresh graph view
      window.app.commands.executeCommandById('graph-island:open-graph-view');
      await new Promise(r => setTimeout(r, 5000));
    })()`);
    await sleep(3000);
  });

  test.afterAll(async () => {
    if (ws) ws.close();
  });

  test("7-1: plugin exposes prevHighlightSet on view", async () => {
    // First, find the view and debug its properties
    const debug = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leafCount = leaves.length;
      if (!leafCount) return { error: 'no graph-view leaf', leafCount: 0 };
      const leaf = leaves[0];
      const view = leaf.view;
      if (!view) return { error: 'no view', leafCount };
      // Get own keys of the view
      const ownKeys = Object.keys(view).slice(0, 30);
      // Get constructor name
      const ctorName = view.constructor?.name ?? 'unknown';
      // Check getViewType
      const viewType = typeof view.getViewType === 'function' ? view.getViewType() : 'n/a';
      return { leafCount, ctorName, viewType, ownKeys };
    })()`);
    console.log("7-1 debug keys:", JSON.stringify(debug));

    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return { error: 'no graph-view leaf' };
      const view = leaves[0].view;
      if (!view) return { error: 'no view' };
      return {
        hasPrevHighlightSet: !!view.prevHighlightSet,
        hasHighlightedNodeId: view.highlightedNodeId !== undefined,
        hasDrawEdges: typeof view.drawEdges === 'function',
        hasApplyHover: typeof view.applyHover === 'function',
        hasPixiNodes: !!view.pixiNodes,
      };
    })()`);

    console.log("7-1 highlight mechanism:", JSON.stringify(result));
    expect(result.hasPixiNodes).toBe(true);
    expect(result.hasPrevHighlightSet).toBe(true);
    expect(result.hasDrawEdges).toBe(true);
    expect(result.hasApplyHover).toBe(true);
  });

  test("7-2: setting highlightedNodeId populates highlight set", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return { error: 'no graph-view leaf' };
      const view = leaves[0].view;
      if (!view || !view.pixiNodes) return { error: 'no view or pixiNodes' };

      // Pick the first available node ID
      const nodeIds = [...view.pixiNodes.keys()];
      if (nodeIds.length === 0) return { error: 'no nodes' };
      const testId = nodeIds[0];

      // Set hover and trigger applyHover
      view.highlightedNodeId = testId;
      view.applyHover();

      const highlightSize = view.prevHighlightSet.size;
      const containsTestId = view.prevHighlightSet.has(testId);

      // Clear hover
      view.highlightedNodeId = null;
      view.applyHover();

      return {
        testId,
        highlightSize,
        containsTestId,
        clearedSize: view.prevHighlightSet.size,
      };
    })()`);

    console.log("7-2 highlight set:", JSON.stringify(result));
    expect(result.highlightSize).toBeGreaterThan(0);
    expect(result.containsTestId).toBe(true);
    expect(result.clearedSize).toBe(0);
  });

  test("7-3: applyHover triggers drawEdges (edge graphics updated)", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return { error: 'no graph-view leaf' };
      const view = leaves[0].view;
      if (!view || !view.pixiNodes) return { error: 'no view or pixiNodes' };

      // Track whether drawEdges is called by wrapping it
      let drawEdgesCalled = false;
      const origDrawEdges = view.drawEdges.bind(view);
      view.drawEdges = function() {
        drawEdgesCalled = true;
        return origDrawEdges();
      };

      // Pick a node and hover
      const nodeIds = [...view.pixiNodes.keys()];
      if (nodeIds.length === 0) return { error: 'no nodes' };
      view.highlightedNodeId = nodeIds[0];
      view.applyHover();

      const calledOnHover = drawEdgesCalled;

      // Clear
      drawEdgesCalled = false;
      view.highlightedNodeId = null;
      view.applyHover();

      const calledOnClear = drawEdgesCalled;

      // Restore
      view.drawEdges = origDrawEdges;

      return { calledOnHover, calledOnClear };
    })()`);

    console.log("7-3 drawEdges called:", JSON.stringify(result));
    expect(result.calledOnHover).toBe(true);
    expect(result.calledOnClear).toBe(true);
  });

  test("screenshot: Phase 7 hover edge highlight", async () => {
    await screenshot(ws, "phase7-hover-edges.png");
  });
});
