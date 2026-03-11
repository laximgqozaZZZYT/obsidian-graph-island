// ---------------------------------------------------------------------------
// CDP E2E Preset Screenshots — Apply each sample/*.json and capture
// ---------------------------------------------------------------------------

import { test, expect, chromium, type Page, type Browser } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const CDP_URL = "http://localhost:9222";
const SAMPLES_DIR = path.resolve(__dirname, "..", "samples");

let browser: Browser;
let page: Page;

/** Dismiss modals + close settings panel + activate graph leaf */
async function prepareGraphView(p: Page) {
  await p.evaluate(() => {
    const app = (window as any).app;
    // Close Obsidian settings modal
    if (app.setting?.close) app.setting.close();
    // Close any modal
    document.querySelectorAll(".modal-container .modal-close-button")
      .forEach(b => (b as HTMLElement).click());
  });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);

  // Activate graph-view leaf
  await p.evaluate(() => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType("graph-view")[0];
    if (leaf) {
      app.workspace.setActiveLeaf(leaf, { focus: true });
      app.workspace.revealLeaf(leaf);
    }
  });
  await p.waitForTimeout(300);

  // Close the graph settings panel if open
  await p.evaluate(() => {
    const btn = document.querySelector(".graph-settings-btn.is-active");
    if (btn) (btn as HTMLElement).click();
  });
  await p.waitForTimeout(200);
}

/** Click the "Fit All / 全体俯瞰" toolbar button */
async function fitToView(p: Page) {
  await p.evaluate(() => {
    const btns = document.querySelectorAll(".graph-toolbar-btn");
    for (const btn of btns) {
      const label = btn.getAttribute("aria-label") ?? "";
      if (label.includes("全体俯瞰") || label.includes("Fit All") || label.includes("Fit")) {
        (btn as HTMLElement).click();
        return;
      }
    }
    // Fallback: find maximize icon button
    for (const btn of btns) {
      const svg = btn.querySelector("svg.lucide-maximize");
      if (svg) { (btn as HTMLElement).click(); return; }
    }
  });
  await p.waitForTimeout(1500);
}

test.beforeAll(async () => {
  browser = await chromium.connectOverCDP(CDP_URL);
  const pages = browser.contexts()[0].pages();
  page = pages.find(p => p.url().includes("index.html")) ?? pages[0];
  await page.bringToFront();

  // Ensure graph-view leaf exists
  await page.evaluate(async () => {
    const app = (window as any).app;
    if (app.workspace.getLeavesOfType("graph-view").length === 0) {
      app.commands.executeCommandById("graph-island:open-graph-view");
    }
  });
  await page.waitForTimeout(3000);

  await prepareGraphView(page);
});

const presets = [
  "01-panorama-overview",
  "02-dense-cluster",
  "03-character-network",
  "04-shakespeare-compare",
  "05-mythology-pantheon",
  "06-sangokushi-factions",
  "07-tag-taxonomy",
  "08-sequence-tracker",
  "09-minimalist",
  "10-maximalist",
  "11-bible-scholar",
  "12-genji-reader",
  "13-battle-analyzer",
  "14-dialogue-theater",
  "15-orphan-hunter",
  "16-edge-bundle-art",
  "17-ontology-mapper",
  "18-folder-compare",
  "19-hub-discovery",
  "20-arabian-nights",
  "test-timeline",
  "test-arc",
  "test-tree",
  "test-concentric-layout",
  "test-sunburst-layout",
];

test.describe("Preset Screenshots", () => {
  for (const name of presets) {
    test(`screenshot: ${name}`, async () => {
      const jsonPath = path.join(SAMPLES_DIR, `${name}.json`);
      const presetJson = fs.readFileSync(jsonPath, "utf-8");
      const preset = JSON.parse(presetJson);

      await prepareGraphView(page);

      // Apply preset: layout → top-level, everything else → state.panel
      await page.evaluate(async (presetObj: any) => {
        const app = (window as any).app;
        const leaf = app.workspace.getLeavesOfType("graph-view")[0];
        if (!leaf) throw new Error("No graph-view found");
        const view = leaf.view;
        const current = view.getState();

        const { layout, ...panelFields } = presetObj;
        // Force-clear collapsedGroups to prevent state leaking between presets
        if (current.panel?.collapsedGroups instanceof Set) {
          current.panel.collapsedGroups.clear();
        }
        const newState = {
          ...current,
          layout: layout || current.layout,
          panel: { ...current.panel, ...panelFields, collapsedGroups: [] },
        };
        await view.setState(newState, {});
      }, preset);

      // Wait for layout simulation to settle
      await page.waitForTimeout(10000);

      // Re-activate graph + fit to view
      await prepareGraphView(page);
      await fitToView(page);
      await page.waitForTimeout(1500);

      // Get the graph container bounds for clipping
      const clip = await page.evaluate(() => {
        const leaf = (window as any).app.workspace.getLeavesOfType("graph-view")[0];
        if (!leaf) return null;
        const el = leaf.view.containerEl as HTMLElement;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });

      const outPath = `e2e/screenshot-preset-${name}.png`;

      if (clip && clip.width > 200 && clip.height > 200) {
        await page.screenshot({
          path: outPath,
          clip: {
            x: Math.max(0, Math.floor(clip.x)),
            y: Math.max(0, Math.floor(clip.y)),
            width: Math.floor(clip.width),
            height: Math.floor(clip.height),
          },
        });
      } else {
        // Fallback: full viewport
        await page.screenshot({ path: outPath });
      }

      // Info dump
      const info = await page.evaluate(() => {
        const view = (window as any).app.workspace.getLeavesOfType("graph-view")[0]?.view;
        if (!view) return null;
        const st = view.getState();
        return {
          layout: st?.layout,
          searchQuery: st?.panel?.searchQuery ?? "",
          status: document.querySelector(".graph-status")?.textContent?.trim() ?? "",
          canvasCount: document.querySelectorAll("canvas").length,
          containerSize: (() => {
            const el = view.containerEl as HTMLElement;
            return { w: el.clientWidth, h: el.clientHeight };
          })(),
        };
      });
      console.log(`  ${name}: ${JSON.stringify(info)}`);

      expect(info).not.toBeNull();
      // PixiJS canvas may not be queryable via DOM; check containerSize instead
      expect(info!.containerSize.w).toBeGreaterThan(100);
    });
  }
});
