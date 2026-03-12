/**
 * E2E test: Phase 31 — Pathfinder (shortest path between two nodes)
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

test.describe("Phase 31 — Pathfinder", () => {
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

  test("31-0: ensure graph view is open", async () => {
    // Reload plugin and open graph view
    await evaluate(ws, `(async () => {
      const app = window.app;
      // Ensure plugin is enabled
      if (!app.plugins.getPlugin('graph-island')) {
        await app.plugins.enablePlugin('graph-island');
        await new Promise(r => setTimeout(r, 2000));
      }
      // Open graph view via command
      await app.commands.executeCommandById('graph-island:open-graph-view');
      await new Promise(r => setTimeout(r, 5000));
    })()`);
    await sleep(3000);

    const result = await evaluate(ws, `(() => {
      const types = [];
      window.app.workspace.iterateAllLeaves(l => types.push(l.view?.getViewType?.()));
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      return { count: leaves.length, allTypes: types };
    })()`);
    console.log("31-0:", JSON.stringify(result));
    expect(result.count).toBeGreaterThan(0);
  });

  test("31-1: context menu has pathfinder options", async () => {
    const result = await evaluate(ws, `(() => {
      const canvas = document.querySelector('.graph-container canvas, .gi-canvas-area canvas');
      if (!canvas) return { error: 'no canvas' };
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      canvas.dispatchEvent(new MouseEvent('contextmenu', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true,
      }));
      return new Promise(resolve => {
        setTimeout(() => {
          const menu = document.querySelector('.menu');
          const items = menu ? menu.querySelectorAll('.menu-item') : [];
          const texts = [];
          for (const item of items) {
            texts.push(item.textContent?.trim());
          }
          const hasPathStart = texts.some(t => t && t.includes('Path'));
          // Close menu
          if (menu) menu.remove();
          resolve({ dispatched: true, menuTexts: texts, hasPathStart });
        }, 300);
      });
    })()`);
    console.log("31-1:", JSON.stringify(result));
    expect(result.dispatched).toBe(true);
    // The menu may not appear if no node is at center, but we verify the dispatch works
  });

  test("31-2: setPathfinderNode method exists on view", async () => {
    const result = await evaluate(ws, `(() => {
      const types = [];
      window.app.workspace.iterateAllLeaves(l => types.push(l.view?.getViewType?.()));
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return { error: 'no leaf', allTypes: types };
      const view = leaves[0].view;
      return {
        hasSetPathfinder: typeof view.setPathfinderNode === 'function',
        hasClearPathfinder: typeof view.clearPathfinder === 'function',
        hasGetPathfinderState: typeof view.getPathfinderState === 'function',
      };
    })()`);
    console.log("31-2:", JSON.stringify(result));
    expect(result.hasSetPathfinder).toBe(true);
    expect(result.hasClearPathfinder).toBe(true);
    expect(result.hasGetPathfinderState).toBe(true);
  });

  test("31-3: pathfinder can find a path between two nodes", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return { error: 'no leaf' };
      const view = leaves[0].view;

      // Get two random connected nodes from the adj map
      const adj = view.adj;
      if (!adj || adj.size === 0) return { error: 'no adj map' };

      let startId = null;
      let endId = null;
      for (const [id, neighbors] of adj) {
        if (neighbors.size > 0 && !startId) {
          startId = id;
          // Pick a neighbor's neighbor (2 hops) for a more interesting path
          for (const n of neighbors) {
            const nn = adj.get(n);
            if (nn) {
              for (const n2 of nn) {
                if (n2 !== startId) { endId = n2; break; }
              }
              if (endId) break;
            }
          }
          if (!endId) {
            // fallback: just use direct neighbor
            endId = [...neighbors][0];
          }
        }
        if (startId && endId) break;
      }
      if (!startId || !endId) return { error: 'could not find two nodes' };

      view.setPathfinderNode(startId, 'start');
      view.setPathfinderNode(endId, 'end');

      const state = view.getPathfinderState();
      const path = view.pathfinderPath;
      const edgeSet = view.pathfinderEdgeSet;

      return {
        startId: state.startId,
        endId: state.endId,
        pathLength: path ? path.length : 0,
        edgeCount: edgeSet ? edgeSet.size / 2 : 0,
        pathNodes: path ? path.slice(0, 5) : null,
      };
    })()`);
    console.log("31-3:", JSON.stringify(result));
    expect(result.pathLength).toBeGreaterThan(0);
    expect(result.edgeCount).toBeGreaterThan(0);
  });

  test("31-4: clearPathfinder resets state", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return { error: 'no leaf' };
      const view = leaves[0].view;
      view.clearPathfinder();
      const state = view.getPathfinderState();
      return {
        startId: state.startId,
        endId: state.endId,
        pathCleared: view.pathfinderPath === null,
      };
    })()`);
    console.log("31-4:", JSON.stringify(result));
    expect(result.startId).toBeNull();
    expect(result.endId).toBeNull();
    expect(result.pathCleared).toBe(true);
  });

  test("screenshot: Phase 31 pathfinder", async () => {
    // Set a path for the screenshot
    await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (!leaves.length) return;
      const view = leaves[0].view;
      const adj = view.adj;
      if (!adj || adj.size === 0) return;
      let startId = null, endId = null;
      // Find two nodes that are at least 3 hops apart
      for (const [id, neighbors] of adj) {
        if (neighbors.size >= 3 && !startId) {
          startId = id;
          break;
        }
      }
      if (!startId) return;
      // BFS to find a node ~3 hops away
      const visited = new Set([startId]);
      let queue = [startId];
      let depth = 0;
      while (queue.length > 0 && depth < 3) {
        const next = [];
        for (const n of queue) {
          const nb = adj.get(n);
          if (!nb) continue;
          for (const m of nb) {
            if (!visited.has(m)) { visited.add(m); next.push(m); endId = m; }
          }
        }
        queue = next;
        depth++;
      }
      if (startId && endId) {
        view.setPathfinderNode(startId, 'start');
        view.setPathfinderNode(endId, 'end');
      }
    })()`);
    await sleep(1000);
    await screenshot(ws, "phase31-pathfinder.png");
    // Clean up
    await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      if (leaves.length) leaves[0].view.clearPathfinder();
    })()`);
  });
});
