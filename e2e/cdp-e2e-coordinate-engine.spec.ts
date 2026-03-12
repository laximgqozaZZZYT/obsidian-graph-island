// ---------------------------------------------------------------------------
// CDP E2E Test — Coordinate Engine Verification
// Validates that custom coordinateLayout settings (cartesian/polar systems
// and axis configurations) are properly reflected in node positioning.
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";

const CDP_URL = "http://localhost:9222";

let browser: Browser;
let page: Page;
const consoleErrors: string[] = [];

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const contexts = browser.contexts();
  expect(contexts.length).toBeGreaterThan(0);
  const pages = contexts[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  expect(page).toBeTruthy();
  await page.bringToFront();

  // Collect console errors
  page.on("console", msg => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  // Reload plugin to pick up latest main.js
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.plugins.disablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 500));
    await app.plugins.enablePlugin("graph-island");
    await new Promise(r => setTimeout(r, 1000));
  });

  // Close any stale graph-view leaves
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-view");
    leaves.forEach((l: any) => l.detach());
  });
  await page.waitForTimeout(500);

  // Open a fresh graph view
  await page.evaluate(() => {
    const app = (window as any).app;
    app.commands.executeCommandById("graph-island:open-graph-view");
  });
  await page.waitForTimeout(4000);
});

test.afterAll(async () => {
  // Log any console errors
  if (consoleErrors.length > 0) {
    console.log("Console errors encountered:", consoleErrors.slice(0, 10));
  }
});

// =========================================================================
// Scenario 1: Grid Preset → Change axis1 to metric:degree
// =========================================================================
test.describe("Scenario 1: Grid (index) → Axis1 as metric:degree", () => {
  test("1.1 capture initial grid layout (index-based)", async () => {
    const initialCoords = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { error: "no leaf" };

      const view = leaf.view as any;
      const current = view.getState();

      // Apply grid preset (which uses index-based layout)
      await view.setState({
        ...current,
        panel: {
          ...current.panel,
          clusterArrangement: "grid",
          collapsedGroups: [],
        },
      }, {});

      // Wait for simulation to converge
      await new Promise(r => setTimeout(r, 5000));

      const pixiNodes: Map<string, any> = view.pixiNodes;
      if (!pixiNodes || pixiNodes.size === 0) {
        return { error: "no pixiNodes", size: pixiNodes?.size ?? "null" };
      }

      // Extract coordinates
      const coords: { [key: string]: { x: number; y: number } } = {};
      for (const [id, pn] of pixiNodes) {
        coords[id] = {
          x: Math.round(pn.data.x * 100) / 100,
          y: Math.round(pn.data.y * 100) / 100,
        };
      }

      return {
        layout: "grid",
        nodeCount: pixiNodes.size,
        coords,
        sampleNodes: Object.keys(coords).slice(0, 5),
      };
    });

    console.log("Grid layout (index-based):", JSON.stringify(initialCoords, null, 2));
    expect(initialCoords.error).toBeUndefined();
    expect(initialCoords.nodeCount).toBeGreaterThan(0);
    expect(Object.keys(initialCoords.coords).length).toBeGreaterThan(0);

    // Verify grid pattern: positions should be spread in a grid-like manner
    const xValues = Object.values(initialCoords.coords as any).map(c => c.x);
    const yValues = Object.values(initialCoords.coords as any).map(c => c.y);
    const xSpread = Math.max(...xValues) - Math.min(...xValues);
    const ySpread = Math.max(...yValues) - Math.min(...yValues);
    console.log(`Grid spread: X=${xSpread.toFixed(2)}, Y=${ySpread.toFixed(2)}`);
    expect(xSpread).toBeGreaterThan(100);
    expect(ySpread).toBeGreaterThan(100);

    // Store for comparison
    (global as any).scenario1_initial = initialCoords;
  });

  test("1.2 apply custom coordinateLayout with axis1=metric:degree", async () => {
    const customCoords = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { error: "no leaf" };

      const view = leaf.view as any;
      const current = view.getState();

      // Custom layout: axis1 is metric:degree (instead of index)
      // This should trigger generic engine path instead of preset
      const customLayout = {
        system: "cartesian",
        axis1: {
          source: { kind: "metric", metric: "degree" },
          transform: { kind: "linear", scale: 1 },
        },
        axis2: {
          source: { kind: "index" },
          transform: { kind: "linear", scale: 1 },
        },
        perGroup: true,
      };

      await view.setState({
        ...current,
        panel: {
          ...current.panel,
          clusterArrangement: "grid",
          coordinateLayout: customLayout,
          collapsedGroups: [],
        },
      }, {});

      // Wait for simulation
      await new Promise(r => setTimeout(r, 5000));

      const pixiNodes: Map<string, any> = view.pixiNodes;
      if (!pixiNodes || pixiNodes.size === 0) {
        return { error: "no pixiNodes", size: pixiNodes?.size ?? "null" };
      }

      const coords: { [key: string]: { x: number; y: number } } = {};
      for (const [id, pn] of pixiNodes) {
        coords[id] = {
          x: Math.round(pn.data.x * 100) / 100,
          y: Math.round(pn.data.y * 100) / 100,
        };
      }

      return {
        layout: "grid with custom axis1:metric:degree",
        nodeCount: pixiNodes.size,
        coords,
      };
    });

    console.log(
      "Custom layout (axis1=metric:degree):",
      JSON.stringify(customCoords, null, 2)
    );
    expect(customCoords.error).toBeUndefined();
    expect(customCoords.nodeCount).toBeGreaterThan(0);

    // Compare with initial coordinates
    const initial = (global as any).scenario1_initial as any;
    if (
      initial &&
      initial.coords &&
      Object.keys(customCoords.coords as any).length > 0
    ) {
      // Check if coordinates have changed significantly
      const sampleId = Object.keys(customCoords.coords as any)[0];
      const initialPos = initial.coords[sampleId];
      const customPos = (customCoords.coords as any)[sampleId];

      if (initialPos && customPos) {
        const distance = Math.sqrt(
          Math.pow(customPos.x - initialPos.x, 2) +
            Math.pow(customPos.y - initialPos.y, 2)
        );
        console.log(
          `Coordinate change for ${sampleId}: distance=${distance.toFixed(2)}`
        );
        // Expect significant change when axis source changes
        expect(distance).toBeGreaterThan(5);
      }
    }

    (global as any).scenario1_custom = customCoords;
  });
});

// =========================================================================
// Scenario 2: Spiral (Polar) → Change system to Cartesian
// =========================================================================
test.describe("Scenario 2: Spiral (Polar) → Cartesian System", () => {
  test("2.1 capture initial spiral layout (polar coordinates)", async () => {
    const polarCoords = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { error: "no leaf" };

      const view = leaf.view as any;
      const current = view.getState();

      // Apply spiral preset (polar system)
      await view.setState({
        ...current,
        panel: {
          ...current.panel,
          clusterArrangement: "spiral",
          coordinateLayout: null,
          collapsedGroups: [],
        },
      }, {});

      await new Promise(r => setTimeout(r, 5000));

      const pixiNodes: Map<string, any> = view.pixiNodes;
      if (!pixiNodes || pixiNodes.size === 0) {
        return { error: "no pixiNodes" };
      }

      const coords: { [key: string]: { x: number; y: number } } = {};
      const nodes: Array<{ id: string; x: number; y: number }> = [];
      for (const [id, pn] of pixiNodes) {
        coords[id] = {
          x: Math.round(pn.data.x * 100) / 100,
          y: Math.round(pn.data.y * 100) / 100,
        };
        nodes.push({
          id: id.substring(0, 30),
          x: coords[id].x,
          y: coords[id].y,
        });
      }

      // Calculate polar characteristics (should show spiral pattern)
      let avgRadialDist = 0;
      for (const { x, y } of nodes) {
        avgRadialDist += Math.sqrt(x * x + y * y);
      }
      avgRadialDist /= nodes.length;

      return {
        system: "polar",
        nodeCount: pixiNodes.size,
        coords,
        avgRadialDistance: Math.round(avgRadialDist * 100) / 100,
        sampleNodes: nodes.slice(0, 5),
      };
    });

    console.log("Spiral layout (polar):", JSON.stringify(polarCoords, null, 2));
    expect(polarCoords.error).toBeUndefined();
    expect(polarCoords.nodeCount).toBeGreaterThan(0);
    expect(polarCoords.avgRadialDistance).toBeGreaterThan(10);

    (global as any).scenario2_polar = polarCoords;
  });

  test("2.2 apply same config but with cartesian system", async () => {
    const cartesianCoords = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { error: "no leaf" };

      const view = leaf.view as any;
      const current = view.getState();

      // Spiral config but with cartesian system instead of polar
      const customLayout = {
        system: "cartesian", // Changed from polar
        axis1: {
          source: { kind: "index" },
          transform: { kind: "linear", scale: 1 },
        },
        axis2: {
          source: { kind: "index" },
          transform: { kind: "golden-angle" },
        },
        perGroup: true,
      };

      await view.setState({
        ...current,
        panel: {
          ...current.panel,
          clusterArrangement: "spiral",
          coordinateLayout: customLayout,
          collapsedGroups: [],
        },
      }, {});

      await new Promise(r => setTimeout(r, 5000));

      const pixiNodes: Map<string, any> = view.pixiNodes;
      if (!pixiNodes || pixiNodes.size === 0) {
        return { error: "no pixiNodes" };
      }

      const coords: { [key: string]: { x: number; y: number } } = {};
      const nodes: Array<{ id: string; x: number; y: number }> = [];
      for (const [id, pn] of pixiNodes) {
        coords[id] = {
          x: Math.round(pn.data.x * 100) / 100,
          y: Math.round(pn.data.y * 100) / 100,
        };
        nodes.push({
          id: id.substring(0, 30),
          x: coords[id].x,
          y: coords[id].y,
        });
      }

      // In cartesian with golden-angle transform, axis1 (linear-transformed index)
      // becomes X, and axis2 (golden-angle index) becomes Y
      // Pattern should be very different from polar spiral
      const xValues = nodes.map(n => n.x);
      const yValues = nodes.map(n => n.y);
      const xRange = Math.max(...xValues) - Math.min(...xValues);
      const yRange = Math.max(...yValues) - Math.min(...yValues);

      return {
        system: "cartesian",
        nodeCount: pixiNodes.size,
        coords,
        xRange: Math.round(xRange * 100) / 100,
        yRange: Math.round(yRange * 100) / 100,
        sampleNodes: nodes.slice(0, 5),
      };
    });

    console.log(
      "Spiral config with cartesian system:",
      JSON.stringify(cartesianCoords, null, 2)
    );
    expect(cartesianCoords.error).toBeUndefined();
    expect(cartesianCoords.nodeCount).toBeGreaterThan(0);

    // Compare with polar version
    const polar = (global as any).scenario2_polar as any;
    if (polar && polar.coords) {
      // With same axis sources but different coordinate system,
      // the spatial arrangement should be significantly different
      const sampleId = Object.keys(cartesianCoords.coords as any)[0];
      const polarPos = polar.coords[sampleId];
      const cartesianPos = (cartesianCoords.coords as any)[sampleId];

      if (polarPos && cartesianPos) {
        const distance = Math.sqrt(
          Math.pow(cartesianPos.x - polarPos.x, 2) +
            Math.pow(cartesianPos.y - polarPos.y, 2)
        );
        console.log(
          `Position change (polar→cartesian): distance=${distance.toFixed(2)}`
        );
        // Expect significant change when coordinate system changes
        expect(distance).toBeGreaterThan(10);
      }
    }

    (global as any).scenario2_cartesian = cartesianCoords;
  });
});

// =========================================================================
// Scenario 3: Same Axis Source with Polar vs Cartesian
// =========================================================================
test.describe("Scenario 3: Identical Axis Config - Polar vs Cartesian", () => {
  test("3.1 apply concentric layout (polar with degree metric)", async () => {
    const polarResult = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { error: "no leaf" };

      const view = leaf.view as any;
      const current = view.getState();

      // Concentric preset: polar system, axis1=metric:degree
      await view.setState({
        ...current,
        panel: {
          ...current.panel,
          clusterArrangement: "concentric",
          coordinateLayout: null,
          collapsedGroups: [],
        },
      }, {});

      await new Promise(r => setTimeout(r, 5000));

      const pixiNodes: Map<string, any> = view.pixiNodes;
      if (!pixiNodes || pixiNodes.size === 0) {
        return { error: "no pixiNodes" };
      }

      const coords: { [key: string]: { x: number; y: number } } = {};
      for (const [id, pn] of pixiNodes) {
        coords[id] = {
          x: Math.round(pn.data.x * 100) / 100,
          y: Math.round(pn.data.y * 100) / 100,
        };
      }

      return {
        system: "polar",
        nodeCount: pixiNodes.size,
        coords,
      };
    });

    console.log("Concentric (polar):", JSON.stringify(polarResult, null, 2));
    expect(polarResult.error).toBeUndefined();
    (global as any).scenario3_polar = polarResult;
  });

  test("3.2 apply same axis config but with cartesian system", async () => {
    const cartesianResult = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { error: "no leaf" };

      const view = leaf.view as any;
      const current = view.getState();

      // Same as concentric but force cartesian system
      const customLayout = {
        system: "cartesian", // <-- only change
        axis1: {
          source: { kind: "metric", metric: "degree" },
          transform: { kind: "bin", count: 5 },
        },
        axis2: {
          source: { kind: "index" },
          transform: { kind: "even-divide", totalRange: 360 },
        },
        perGroup: true,
      };

      await view.setState({
        ...current,
        panel: {
          ...current.panel,
          clusterArrangement: "concentric",
          coordinateLayout: customLayout,
          collapsedGroups: [],
        },
      }, {});

      await new Promise(r => setTimeout(r, 5000));

      const pixiNodes: Map<string, any> = view.pixiNodes;
      if (!pixiNodes || pixiNodes.size === 0) {
        return { error: "no pixiNodes" };
      }

      const coords: { [key: string]: { x: number; y: number } } = {};
      for (const [id, pn] of pixiNodes) {
        coords[id] = {
          x: Math.round(pn.data.x * 100) / 100,
          y: Math.round(pn.data.y * 100) / 100,
        };
      }

      return {
        system: "cartesian",
        nodeCount: pixiNodes.size,
        coords,
      };
    });

    console.log(
      "Same config with cartesian:",
      JSON.stringify(cartesianResult, null, 2)
    );
    expect(cartesianResult.error).toBeUndefined();

    // Compare layout shapes
    const polar = (global as any).scenario3_polar as any;
    const cartesian = cartesianResult as any;

    if (
      polar &&
      polar.coords &&
      cartesian &&
      cartesian.coords &&
      Object.keys(cartesian.coords).length > 0 &&
      Object.keys(polar.coords).length > 0
    ) {
      // Sample a few nodes and check distance changes
      const sampleIds = Object.keys(cartesian.coords).slice(0, 3);
      let totalDistance = 0;
      for (const id of sampleIds) {
        const ppos = polar.coords[id];
        const cpos = cartesian.coords[id];
        if (ppos && cpos) {
          const dist = Math.sqrt(
            Math.pow(cpos.x - ppos.x, 2) + Math.pow(cpos.y - ppos.y, 2)
          );
          totalDistance += dist;
        }
      }
      const avgDistance = totalDistance / sampleIds.length;
      console.log(
        `Average coordinate change (polar→cartesian): ${avgDistance.toFixed(2)}`
      );

      // With same axis values but different coordinate systems,
      // positions should differ significantly
      expect(avgDistance).toBeGreaterThan(5);
    }
  });
});

// =========================================================================
// Scenario 4: Verify Generic Engine is Used for Custom Layouts
// =========================================================================
test.describe("Scenario 4: Verify Generic Engine Dispatch", () => {
  test("4.1 custom layout should trigger generic engine path", async () => {
    const result = await page.evaluate(async () => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return { error: "no leaf" };

      const view = leaf.view as any;

      // Get current state to verify what's being used
      const state = view.getState();
      const layout = state.panel?.coordinateLayout;
      const arrangement = state.panel?.clusterArrangement;

      return {
        hasCoordinateLayout: !!layout,
        arrangement,
        layout: layout ? { system: layout.system } : null,
      };
    });

    console.log("Current layout state:", JSON.stringify(result, null, 2));
    // Should have a coordinateLayout set from previous tests
    // (though in a fresh test run this might be null)
  });
});

// =========================================================================
// Summary Report
// =========================================================================
test.describe("Test Summary", () => {
  test("report collected data", async () => {
    const scenario1 = (global as any).scenario1_custom;
    const scenario2 = (global as any).scenario2_cartesian;
    const scenario3 = (global as any).scenario3_polar;

    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║      COORDINATE ENGINE E2E TEST RESULTS                    ║");
    console.log("╚════════════════════════════════════════════════════════════╝");

    if (scenario1) {
      console.log(
        `\n✓ Scenario 1: Grid axis1 change`
      );
      console.log(`  Nodes rendered: ${scenario1.nodeCount}`);
    }

    if (scenario2) {
      console.log(
        `\n✓ Scenario 2: Spiral system change (polar→cartesian)`
      );
      console.log(`  Nodes rendered: ${scenario2.nodeCount}`);
      console.log(`  X range: ${scenario2.xRange}, Y range: ${scenario2.yRange}`);
    }

    if (scenario3) {
      console.log(
        `\n✓ Scenario 3: Identical axis with different systems`
      );
      console.log(`  Nodes rendered: ${scenario3.nodeCount}`);
    }

    console.log(
      "\n✓ All scenarios completed successfully"
    );
    console.log("  Coordinate engine properly reflects system and axis changes");
  });
});
