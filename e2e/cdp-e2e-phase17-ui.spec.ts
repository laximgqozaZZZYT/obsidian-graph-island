import { test, expect, type Page } from "@playwright/test";

const OBSIDIAN_URL = "http://127.0.0.1:9222";

async function connectToObsidian(): Promise<Page> {
  const resp = await fetch(`${OBSIDIAN_URL}/json/list`);
  const targets = await resp.json();
  const obsTarget = targets.find((t: any) => t.type === "page" && t.url.startsWith("app://"));
  if (!obsTarget) throw new Error("No Obsidian page found on CDP");
  const { chromium } = await import("playwright");
  const browser = await chromium.connectOverCDP(`${OBSIDIAN_URL}`);
  const contexts = browser.contexts();
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      if (page.url().startsWith("app://")) return page;
    }
  }
  throw new Error("Could not find Obsidian page");
}

test.describe("Phase 17: Section Header Enhancement", () => {
  let page: Page;

  test.beforeAll(async () => {
    page = await connectToObsidian();
  });

  test("section headers have icon elements", async () => {
    const icons = await page.$$(".graph-panel .gi-section-icon");
    expect(icons.length).toBeGreaterThan(0);
    // Each icon should contain an SVG
    for (const icon of icons) {
      const svg = await icon.$("svg");
      expect(svg).not.toBeNull();
    }
  });

  test("collapse arrow has transition CSS property", async () => {
    const arrow = await page.$(".graph-panel .graph-control-section-header .tree-item-icon");
    expect(arrow).not.toBeNull();
    const transition = await arrow!.evaluate((el) => getComputedStyle(el).transition);
    expect(transition).toContain("transform");
  });

  test("section header has separator border", async () => {
    const header = await page.$(".graph-panel .graph-control-section-header");
    expect(header).not.toBeNull();
    const borderBottom = await header!.evaluate((el) => getComputedStyle(el).borderBottomStyle);
    expect(borderBottom).toBe("solid");
  });

  test("collapsed section hides separator", async () => {
    const collapsedHeader = await page.$(".graph-panel .tree-item.is-collapsed .graph-control-section-header");
    if (collapsedHeader) {
      const borderColor = await collapsedHeader.evaluate((el) => getComputedStyle(el).borderBottomColor);
      // transparent or rgba(0,0,0,0)
      expect(borderColor).toMatch(/transparent|rgba\(0,\s*0,\s*0,\s*0\)/);
    }
  });

  test("screenshot", async () => {
    const panel = await page.$(".graph-panel");
    if (panel) {
      await panel.screenshot({ path: "e2e/images/phase17-section-headers.png" });
    } else {
      await page.screenshot({ path: "e2e/images/phase17-section-headers.png" });
    }
  });
});
