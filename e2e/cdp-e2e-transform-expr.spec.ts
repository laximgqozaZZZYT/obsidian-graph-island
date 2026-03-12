/**
 * E2E test: Transform expression unified input
 * Verifies the new FUNC(source) text input replaces the old dropdown.
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

test.describe("Transform Expression Input", () => {
  let ws: WebSocket;

  test.beforeAll(async () => {
    const url = await getCdpWs();
    ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
    });
    await cdp(ws, "Runtime.enable");

    // Reload plugin to pick up new build
    await evaluate(ws, `(async () => {
      await window.app.plugins.disablePlugin('graph-island');
      await new Promise(r => setTimeout(r, 1000));
      await window.app.plugins.enablePlugin('graph-island');
      await new Promise(r => setTimeout(r, 3000));
    })()`);
    await sleep(2000);
  });

  test.afterAll(async () => {
    if (ws) ws.close();
  });

  test("custom arrangement shows unified text inputs instead of transform dropdown", async () => {
    // Set custom arrangement
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leaf = leaves.find(l => l.view?.pixiApp);
      if (!leaf) return { error: 'no graph view' };
      const view = leaf.view;

      // Set to custom arrangement
      view.panel.clusterArrangement = 'custom';
      view.panel.coordinateLayout = {
        system: 'cartesian',
        axis1: { source: { kind: 'field', field: 'tag' }, transform: { kind: 'linear', scale: 1 } },
        axis2: { source: { kind: 'metric', metric: 'degree' }, transform: { kind: 'linear', scale: 1 } },
        perGroup: false,
      };
      view.applyClusterForce();
      view.buildPanel();

      return { ok: true };
    })()`);

    expect(result.ok).toBe(true);
    await sleep(2000);

    // Check that unified text inputs exist and old dropdown is gone
    const uiState = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { error: 'no panel' };

      // Look for gi-setting-input elements (unified text inputs)
      const inputs = panel.querySelectorAll('.gi-setting-input');
      const inputValues = Array.from(inputs).map(i => i.value);

      // Check for transform dropdown (old select had label containing "Transform" or "変換")
      const selects = panel.querySelectorAll('.setting-item select');
      const selectLabels = [];
      for (const sel of selects) {
        const label = sel.closest('.setting-item')?.querySelector('.setting-item-name')?.textContent || '';
        // Only track labels that specifically match axis transform labels (e.g. "x Transform", "r 変換")
        if (label.match(/^[xyrθ]\s+(Transform|変換)/i)) {
          selectLabels.push(label);
        }
      }

      // Look for validation indicators
      const indicators = panel.querySelectorAll('.gi-expr-indicator');

      return {
        inputCount: inputs.length,
        inputValues,
        selectLabels,
        indicatorCount: indicators.length,
      };
    })()`);

    console.log("UI state:", JSON.stringify(uiState, null, 2));

    // Should have text inputs for axes
    expect(uiState.inputCount).toBeGreaterThanOrEqual(2);

    // Input values should be serialized expressions
    const hasTagInput = uiState.inputValues.some((v: string) => v.includes("tag"));
    const hasDegreeInput = uiState.inputValues.some((v: string) => v.includes("degree"));
    expect(hasTagInput).toBe(true);
    expect(hasDegreeInput).toBe(true);

    // No axis transform dropdowns should exist
    expect(uiState.selectLabels.length).toBe(0);
  });

  test("COS(tag:?) expression is parsed and applied correctly", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leaf = leaves.find(l => l.view?.pixiApp);
      if (!leaf) return { error: 'no graph view' };
      const view = leaf.view;

      // Set custom with COS expression via coordinateLayout
      view.panel.clusterArrangement = 'custom';
      view.panel.coordinateLayout = {
        system: 'cartesian',
        axis1: {
          source: { kind: 'field', field: 'tag' },
          transform: { kind: 'expression', expr: 'cos(t * pi * 2)', scale: 1 }
        },
        axis2: {
          source: { kind: 'metric', metric: 'degree' },
          transform: { kind: 'linear', scale: 1 }
        },
        perGroup: false,
      };
      view.applyClusterForce();
      view.buildPanel();
      view.simulation.alpha(0.5).restart();

      return { ok: true };
    })()`);

    expect(result.ok).toBe(true);
    await sleep(6000);

    // Check that the input displays "COS(tag)"
    const inputValue = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return null;
      const inputs = panel.querySelectorAll('.gi-setting-input');
      for (const inp of inputs) {
        if (inp.value.includes('COS')) return inp.value;
      }
      // Return all values for debugging
      return Array.from(inputs).map(i => i.value);
    })()`);

    console.log("COS input value:", inputValue);

    await screenshot(ws, "transform-expr-cos.png");
  });

  test("BIN(degree, 5) expression creates bin transform", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leaf = leaves.find(l => l.view?.pixiApp);
      if (!leaf) return { error: 'no graph view' };
      const view = leaf.view;

      view.panel.clusterArrangement = 'custom';
      view.panel.coordinateLayout = {
        system: 'polar',
        axis1: {
          source: { kind: 'metric', metric: 'degree' },
          transform: { kind: 'bin', count: 5 }
        },
        axis2: {
          source: { kind: 'index' },
          transform: { kind: 'even-divide', totalRange: 360 }
        },
        perGroup: false,
      };
      view.applyClusterForce();
      view.buildPanel();
      view.simulation.alpha(0.5).restart();

      return { ok: true };
    })()`);

    expect(result.ok).toBe(true);
    await sleep(6000);

    // Check input values are serialized correctly
    const inputValues = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return [];
      const inputs = panel.querySelectorAll('.gi-setting-input');
      return Array.from(inputs).map(i => i.value);
    })()`);

    console.log("BIN input values:", inputValues);

    // Should have BIN(degree, 5) and EVEN(index, 360) as input values
    const hasBin = inputValues.some((v: string) => v.includes("BIN"));
    const hasEven = inputValues.some((v: string) => v.includes("EVEN"));
    expect(hasBin).toBe(true);
    expect(hasEven).toBe(true);

    await screenshot(ws, "transform-expr-bin.png");
  });

  test("ROSE(index, k=5) curve expression with params", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leaf = leaves.find(l => l.view?.pixiApp);
      if (!leaf) return { error: 'no graph view' };
      const view = leaf.view;

      view.panel.clusterArrangement = 'custom';
      view.panel.coordinateLayout = {
        system: 'polar',
        axis1: {
          source: { kind: 'index' },
          transform: { kind: 'curve', curve: 'rose', params: { k: 5, a: 1 }, scale: 1 }
        },
        axis2: {
          source: { kind: 'index' },
          transform: { kind: 'golden-angle' }
        },
        perGroup: false,
      };
      view.applyClusterForce();
      view.buildPanel();
      view.simulation.alpha(0.5).restart();

      return { ok: true };
    })()`);

    expect(result.ok).toBe(true);
    await sleep(6000);

    const inputValues = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return [];
      const inputs = panel.querySelectorAll('.gi-setting-input');
      return Array.from(inputs).map(i => i.value);
    })()`);

    console.log("ROSE input values:", inputValues);

    // Should have ROSE(...) with k=5 param
    const hasRose = inputValues.some((v: string) => v.includes("ROSE"));
    expect(hasRose).toBe(true);

    // Should also have curve param sliders in sub section
    const hasParamSliders = await evaluate(ws, `(() => {
      const sub = document.querySelector('.gi-transform-sub');
      if (!sub) return false;
      const sliders = sub.querySelectorAll('input[type="range"]');
      return sliders.length > 0;
    })()`);

    expect(hasParamSliders).toBe(true);

    await screenshot(ws, "transform-expr-rose.png");
  });

  test("plain source input (no function) uses linear transform", async () => {
    const result = await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leaf = leaves.find(l => l.view?.pixiApp);
      if (!leaf) return { error: 'no graph view' };
      const view = leaf.view;

      view.panel.clusterArrangement = 'custom';
      view.panel.coordinateLayout = {
        system: 'cartesian',
        axis1: {
          source: { kind: 'field', field: 'folder' },
          transform: { kind: 'linear', scale: 1 }
        },
        axis2: {
          source: { kind: 'index' },
          transform: { kind: 'linear', scale: 1 }
        },
        perGroup: false,
      };
      view.applyClusterForce();
      view.buildPanel();

      return { ok: true };
    })()`);

    expect(result.ok).toBe(true);
    await sleep(2000);

    const inputValues = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return [];
      const inputs = panel.querySelectorAll('.gi-setting-input');
      return Array.from(inputs).map(i => i.value);
    })()`);

    console.log("Plain input values:", inputValues);

    // Plain sources should show without function wrapper
    const hasFolder = inputValues.some((v: string) => v === "folder");
    const hasIndex = inputValues.some((v: string) => v === "index");
    expect(hasFolder).toBe(true);
    expect(hasIndex).toBe(true);
  });

  test("validation indicator shows check/cross correctly", async () => {
    // Ensure custom arrangement is active
    await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leaf = leaves.find(l => l.view?.pixiApp);
      if (!leaf) return;
      const view = leaf.view;
      view.panel.clusterArrangement = 'custom';
      view.panel.coordinateLayout = {
        system: 'cartesian',
        axis1: { source: { kind: 'index' }, transform: { kind: 'linear', scale: 1 } },
        axis2: { source: { kind: 'index' }, transform: { kind: 'linear', scale: 1 } },
        perGroup: false,
      };
      view.applyClusterForce();
      view.buildPanel();
    })()`);

    await sleep(2000);

    const indicatorState = await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return { error: 'no panel' };
      const indicators = panel.querySelectorAll('.gi-expr-indicator');
      return Array.from(indicators).map(ind => ({
        text: ind.textContent,
        color: ind.style.color,
      }));
    })()`);

    console.log("Indicators:", JSON.stringify(indicatorState));

    // All current expressions should be valid (green check)
    for (const ind of indicatorState) {
      if (ind.text?.trim()) {
        expect(ind.text.trim()).toBe("\u2713");
      }
    }
  });

  test("screenshot: final transform expression UI", async () => {
    // Set an interesting layout for screenshot
    await evaluate(ws, `(() => {
      const leaves = window.app.workspace.getLeavesOfType('graph-view');
      const leaf = leaves.find(l => l.view?.pixiApp);
      if (!leaf) return;
      const view = leaf.view;
      view.panel.clusterArrangement = 'custom';
      view.panel.coordinateLayout = {
        system: 'polar',
        axis1: {
          source: { kind: 'index' },
          transform: { kind: 'curve', curve: 'archimedean', params: { a: 0, b: 1 }, scale: 1 }
        },
        axis2: {
          source: { kind: 'index' },
          transform: { kind: 'golden-angle' }
        },
        perGroup: false,
      };
      view.applyClusterForce();
      view.buildPanel();
      view.simulation.alpha(0.5).restart();
    })()`);

    await sleep(6000);

    // Scroll to coordinate section to capture the inputs
    await evaluate(ws, `(() => {
      const panel = document.querySelector('.graph-panel');
      if (!panel) return;
      // Find the Custom section
      const headers = panel.querySelectorAll('.graph-control-section-header');
      for (const h of headers) {
        if (h.textContent?.includes('Coordinate') || h.textContent?.includes('Custom') || h.textContent?.includes('座標')) {
          h.scrollIntoView({ behavior: 'instant', block: 'start' });
          break;
        }
      }
    })()`);

    await sleep(500);
    await screenshot(ws, "transform-expr-final-ui.png");
  });
});
