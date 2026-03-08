/**
 * Take screenshots of all 4 cluster arrangements using Playwright.
 * Serves the HTML test page and captures each pattern.
 * Supports groupBy param: pass --groupBy=none to test single-group mode.
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFileSync } from "fs";
import { resolve, extname } from "path";

const PORT = 9876;
const E2E_DIR = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const groupBy = process.argv.find(a => a.startsWith("--groupBy="))?.split("=")[1] || "tag";

// Simple static file server
const server = createServer((req, res) => {
  const urlPath = req.url.split("?")[0]; // strip query params
  const filePath = resolve(E2E_DIR, urlPath === "/" ? "cluster-visual.html" : urlPath.slice(1));
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    const ct = ext === ".html" ? "text/html" : ext === ".js" ? "application/javascript" : "text/plain";
    res.writeHead(200, { "Content-Type": ct });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(PORT, async () => {
  const browser = await chromium.launch();
  const arrangements = ["spiral", "concentric", "tree", "grid"];

  for (const arr of arrangements) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`http://localhost:${PORT}/?arrangement=${arr}&nodes=200&groupBy=${groupBy}`);
    // Wait for canvas to render
    await page.waitForSelector("#main-canvas");
    await page.waitForTimeout(500);

    const suffix = groupBy !== "tag" ? `-${groupBy}` : "";
    const screenshotPath = resolve(E2E_DIR, `screenshot-${arr}${suffix}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`✓ ${arr} (groupBy=${groupBy}): ${screenshotPath}`);

    // Get group centroids for analysis
    const data = await page.evaluate(() => (window).__clusterData);
    if (data?.groupCentroids) {
      console.log(`  Centroids:`);
      for (const [tag, c] of Object.entries(data.groupCentroids)) {
        console.log(`    ${tag}: (${Math.round(c.x)}, ${Math.round(c.y)}) [${c.count} nodes]`);
      }
    }

    await page.close();
  }

  await browser.close();
  server.close();
  console.log("\nDone! Check screenshots in tests/e2e/");
});
