// ---------------------------------------------------------------------------
// CDP E2E — Auto-fit spacing feature validation
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const CDP_URL = "http://localhost:9222";
const SAMPLES_DIR = path.resolve(__dirname, "..", "samples");

let browser: Browser;
let page: Page;

async function prepareGraphView(p: Page) {
  await p.evaluate(() => {
    const app = (window as any).app;
    if (app.setting?.close) app.setting.close();
    document.querySelectorAll(".modal-container .modal-close-button")
      .forEach(b => (b as HTMLElement).click());
  });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);

  await p.evaluate(() => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (leaf) {
      app.workspace.setActiveLeaf(leaf, { focus: true });
      app.workspace.revealLeaf(leaf);
    }
  });
  await p.waitForTimeout(300);

  await p.evaluate(() => {
    const btn = document.querySelector(".graph-settings-btn.is-active");
    if (btn) (btn as HTMLElement).click();
  });
  await p.waitForTimeout(200);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(3000);
  await prepareGraphView(page);
});

// Test presets with many groups — good candidates for auto-fit
const autoFitPresets = [
  "07-tag-taxonomy",
  "18-folder-compare",
];

test.describe("Auto-fit Spacing", () => {
  for (const name of autoFitPresets) {
    test(`autoFit ON: ${name}`, async () => {
      const jsonPath = path.join(SAMPLES_DIR, `${name}.json`);
      const presetJson = fs.readFileSync(jsonPath, "utf-8");
      const preset = JSON.parse(presetJson);

      await prepareGraphView(page);

      // Apply preset with autoFit enabled
      const result = await page.evaluate(async (presetObj: any) => {
        const app = (window as any).app;
        const leaf = app.workspace.getLeavesOfType("graph-view")[0];
        if (!leaf) throw new Error("No graph-view found");
        const view = leaf.view;
        const current = view.getState();

        const { layout, ...panelFields } = presetObj;
        const newState = {
          ...current,
          layout: layout || current.layout,
          panel: {
            ...current.panel,
            ...panelFields,
            autoFit: true,
            collapsedGroups: [],
          },
        };
        await view.setState(newState, {});

        // Wait for layout to compute
        await new Promise(r => setTimeout(r, 5000));

        // Read back the computed spacing values
        const st = view.getState();
        return {
          autoFit: st?.panel?.autoFit,
          nodeSpacing: st?.panel?.clusterNodeSpacing,
          groupScale: st?.panel?.clusterGroupScale,
          groupSpacing: st?.panel?.clusterGroupSpacing,
          status: document.querySelector(".graph-status")?.textContent?.trim() ?? "",
        };
      }, preset);

      console.log(`  ${name} autoFit result:`, JSON.stringify(result));

      // autoFit should be ON
      expect(result.autoFit).toBe(true);
      // Spacing values should be positive numbers
      expect(result.nodeSpacing).toBeGreaterThan(0);
      expect(result.groupScale).toBeGreaterThan(0);
      expect(result.groupSpacing).toBeGreaterThan(0);
    });
  }

  test("autoFit OFF preserves computed values", async () => {
    const jsonPath = path.join(SAMPLES_DIR, "07-tag-taxonomy.json");
    const presetJson = fs.readFileSync(jsonPath, "utf-8");
    const preset = JSON.parse(presetJson);

    await prepareGraphView(page);

    // Apply preset with autoFit ON, then turn OFF and check values persist
    const result = await page.evaluate(async (presetObj: any) => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) throw new Error("No graph-view found");
      const view = leaf.view;
      const current = view.getState();

      const { layout, ...panelFields } = presetObj;

      // Step 1: apply with autoFit ON
      let newState = {
        ...current,
        layout: layout || current.layout,
        panel: {
          ...current.panel,
          ...panelFields,
          autoFit: true,
          collapsedGroups: [],
        },
      };
      await view.setState(newState, {});
      await new Promise(r => setTimeout(r, 5000));

      // Read computed values
      const afterOn = view.getState();
      const computedNodeSpacing = afterOn?.panel?.clusterNodeSpacing;
      const computedGroupScale = afterOn?.panel?.clusterGroupScale;
      const computedGroupSpacing = afterOn?.panel?.clusterGroupSpacing;

      // Step 2: turn autoFit OFF
      const current2 = view.getState();
      const newState2 = {
        ...current2,
        panel: { ...current2.panel, autoFit: false },
      };
      await view.setState(newState2, {});
      await new Promise(r => setTimeout(r, 2000));

      const afterOff = view.getState();

      return {
        computedNodeSpacing,
        computedGroupScale,
        computedGroupSpacing,
        afterOffNodeSpacing: afterOff?.panel?.clusterNodeSpacing,
        afterOffGroupScale: afterOff?.panel?.clusterGroupScale,
        afterOffGroupSpacing: afterOff?.panel?.clusterGroupSpacing,
        autoFitAfterOff: afterOff?.panel?.autoFit,
      };
    }, preset);

    console.log("  autoFit OFF result:", JSON.stringify(result));

    // autoFit should be OFF
    expect(result.autoFitAfterOff).toBe(false);

    // Values computed by autoFit should persist after turning OFF
    expect(result.afterOffNodeSpacing).toBe(result.computedNodeSpacing);
    expect(result.afterOffGroupScale).toBe(result.computedGroupScale);
    expect(result.afterOffGroupSpacing).toBe(result.computedGroupSpacing);
  });

  test("default autoFit is false", async () => {
    const result = await page.evaluate(() => {
      const app = (window as any).app;
      const leaf = app.workspace.getLeavesOfType("graph-view")[0];
      if (!leaf) return null;
      const view = leaf.view;
      const st = view.getState();
      return { autoFit: st?.panel?.autoFit ?? false };
    });

    // Default should be false (not auto-fitting)
    expect(result?.autoFit).toBeFalsy();
  });
});
