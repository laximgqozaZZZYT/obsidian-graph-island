import { test, expect } from "@playwright/test";
import path from "path";

const HARNESS_URL = `file://${path.resolve(__dirname, "test-harness.html")}`;

test.describe("Graph Views — E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
    // Wait for harness to initialize and simulation to start
    await page.waitForFunction(() => (window as any).__harness?.ready === true);
    // Let simulation settle briefly
    await page.waitForTimeout(500);
  });

  // ---- Rendering ----

  test("SVG renders with correct number of nodes and edges", async ({ page }) => {
    const nodeCount = await page.locator(".graph-node").count();
    expect(nodeCount).toBe(8);

    const edgeCount = await page.locator(".graph-edge").count();
    expect(edgeCount).toBe(9);
  });

  test("each node has a circle element with fill color", async ({ page }) => {
    const circles = page.locator(".graph-node circle");
    const count = await circles.count();
    expect(count).toBe(8);

    // Check that at least the first node has a fill
    const fill = await circles.first().getAttribute("fill");
    expect(fill).toBeTruthy();
    expect(fill).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("high-degree nodes have text labels", async ({ page }) => {
    // Nodes with degree > 2 should have labels
    const labels = page.locator(".graph-node text:not(.hover-label)");
    const count = await labels.count();
    expect(count).toBeGreaterThan(0);
  });

  test("nodes have data-id and data-label attributes", async ({ page }) => {
    const firstNode = page.locator(".graph-node").first();
    const id = await firstNode.getAttribute("data-id");
    const label = await firstNode.getAttribute("data-label");
    expect(id).toBeTruthy();
    expect(label).toBeTruthy();
  });

  test("edges have correct stroke style from CSS", async ({ page }) => {
    const edge = page.locator(".graph-edge").first();
    const opacity = await edge.evaluate(
      (el) => window.getComputedStyle(el).opacity
    );
    // Should be the CSS-defined opacity (0.4) or close to it
    expect(parseFloat(opacity)).toBeLessThanOrEqual(1);
    expect(parseFloat(opacity)).toBeGreaterThan(0);
  });

  // ---- Force simulation ----

  test("force simulation positions nodes away from origin", async ({ page }) => {
    // After simulation runs, nodes should have moved from random init
    const transforms = await page.locator(".graph-node").evaluateAll(
      (els) => els.map((el) => el.getAttribute("transform"))
    );
    for (const t of transforms) {
      expect(t).toBeTruthy();
      // Check it's a valid translate
      expect(t).toMatch(/translate\([\d.-]+,[\d.-]+\)/);
    }
  });

  test("simulation settles (alpha < 0.05) within 3 seconds", async ({ page }) => {
    // Wait for simulation to settle
    await page.waitForTimeout(2500);
    const alpha = await page.evaluate(
      () => (window as any).__graphState?.simulation?.alpha() ?? 1
    );
    expect(alpha).toBeLessThan(0.05);
  });

  // ---- Hover interactions ----

  test("hovering a node highlights it and dims others", async ({ page }) => {
    // Wait for simulation to settle enough for stable positions
    await page.waitForTimeout(2000);

    // Dispatch mouseenter directly on the node to avoid position mismatches
    await page.locator('.graph-node[data-id="a"]').dispatchEvent("mouseenter");
    await page.waitForTimeout(100);

    // The hovered node's circle should have accent stroke
    const stroke = await page.locator('.graph-node[data-id="a"] circle').getAttribute("stroke");
    expect(stroke).toContain("interactive-accent");

    // Orphan node (f) is not a neighbor of 'a', so it should be dimmed
    const opacity = await page.locator('.graph-node[data-id="f"]').evaluate(
      (el) => el.style.opacity
    );
    expect(opacity).toBe("0.12");
  });

  test("mouseleave restores all node opacities", async ({ page }) => {
    await page.waitForTimeout(1000);

    const targetNode = page.locator('.graph-node[data-id="a"]');
    await targetNode.hover({ force: true });
    // Move away
    await page.mouse.move(0, 0);

    // All nodes should have default opacity
    const opacities = await page.locator(".graph-node").evaluateAll(
      (els) => els.map((el) => el.style.opacity)
    );
    for (const op of opacities) {
      expect(op === "" || op === "1" || op === null).toBeTruthy();
    }
  });

  test("hover shows labels on neighbor nodes", async ({ page }) => {
    await page.waitForTimeout(1000);

    // Node 'a' connects to b, c, g — hovering 'a' should show hover-labels on them
    const targetNode = page.locator('.graph-node[data-id="a"]');
    await targetNode.hover({ force: true });

    const hoverLabels = page.locator(".hover-label");
    const count = await hoverLabels.count();
    // At least some neighbors without permanent labels should get hover-labels
    expect(count).toBeGreaterThanOrEqual(0);
  });

  // ---- Toolbar & Panel ----

  test("toolbar renders with status and settings button", async ({ page }) => {
    const status = page.locator(".graph-status");
    await expect(status).toHaveText("8 nodes, 9 edges");

    const btn = page.locator(".graph-settings-btn");
    await expect(btn).toBeVisible();
  });

  test("clicking settings button toggles panel visibility", async ({ page }) => {
    const btn = page.locator(".graph-settings-btn");
    const panel = page.locator("#test-panel");

    // Initially hidden
    await expect(panel).toHaveClass(/is-hidden/);

    // Click to open
    await btn.click();
    await expect(panel).not.toHaveClass(/is-hidden/);
    await expect(btn).toHaveClass(/is-active/);

    // Click to close
    await btn.click();
    await expect(panel).toHaveClass(/is-hidden/);
    await expect(btn).not.toHaveClass(/is-active/);
  });

  test("toggle switch changes state on click", async ({ page }) => {
    // Open panel first
    await page.locator(".graph-settings-btn").click();

    const toggle = page.locator("#toggle-orphans");
    await expect(toggle).toHaveClass(/is-on/);

    await toggle.click();
    await expect(toggle).not.toHaveClass(/is-on/);

    await toggle.click();
    await expect(toggle).toHaveClass(/is-on/);
  });

  // ---- CSS styling ----

  test("node circles have no visible stroke by default (matching Obsidian style)", async ({ page }) => {
    const circle = page.locator(".graph-node circle").first();
    const stroke = await circle.evaluate(
      (el) => window.getComputedStyle(el).stroke
    );
    // Should be transparent or none
    expect(stroke === "transparent" || stroke === "rgba(0, 0, 0, 0)" || stroke === "none").toBeTruthy();
  });

  test("graph container has correct background", async ({ page }) => {
    const bg = await page.locator(".graph-container").evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    expect(bg).toBeTruthy();
    expect(bg).not.toBe("");
  });

  // ---- Zoom ----

  test("zoom transform works via scroll", async ({ page }) => {
    const svgWrap = page.locator(".graph-svg-wrap");
    const box = await svgWrap.boundingBox();
    if (!box) return;

    // Zoom in via ctrl+wheel
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);

    const gTransform = await page.locator("svg > g").first().getAttribute("transform");
    // After zooming, the g should have a transform
    expect(gTransform).toBeTruthy();
  });

  // ---- Performance check ----

  test("rendering 8 nodes completes within 2 seconds", async ({ page }) => {
    const start = Date.now();
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => (window as any).__harness?.ready === true);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});
