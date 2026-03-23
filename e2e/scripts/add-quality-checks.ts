/**
 * Script to add display quality check tests to all satellite E2E spec files.
 *
 * Strategy:
 * - Add import for quality-checks helper
 * - Append a quality gate test at the end of each file (before the last line)
 * - The quality gate test runs overlap, spread, and contrast checks
 * - No existing test code is modified or deleted
 *
 * Usage: npx tsx e2e/scripts/add-quality-checks.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const E2E_DIR = path.resolve(__dirname, "..");
const MAIN_SPEC = "cdp-e2e.spec.ts"; // already handled manually

const IMPORT_LINE = `import { measureNodeOverlap, measureSpread, measureContrast } from "./helpers/quality-checks";`;

// The quality gate test to append — uses `page` variable available in all files
const QUALITY_GATE_TEST = `
// =========================================================================
// Display Quality Gate (auto-generated)
// =========================================================================
test("QUALITY: node overlap, coordinate sanity, and color contrast", async () => {
  // Wait for any pending render to settle
  await page.waitForTimeout(2000);

  const hasView = await page.evaluate(() => {
    const v = (window as any).app.workspace.getLeavesOfType("graph-view")
      .find((l: any) => "pixiNodes" in l.view)?.view;
    return !!(v && v.pixiNodes && v.pixiNodes.size > 0);
  });
  if (!hasView) {
    console.log("QUALITY: no graph view active, skipping quality gate");
    return;
  }

  // 1. Node overlap
  const overlap = await measureNodeOverlap(page);
  if (overlap.totalNodes > 10) {
    expect(overlap.overlapRatio).toBeLessThan(0.10);
  }

  // 2. Coordinate sanity
  const spread = await measureSpread(page);
  expect(spread.nanCount).toBe(0);
  expect(spread.infCount).toBe(0);
  if (overlap.totalNodes > 10) {
    expect(spread.bboxWidth).toBeGreaterThan(0);
    expect(spread.bboxHeight).toBeGreaterThan(0);
  }

  // 3. Color contrast
  const contrast = await measureContrast(page, 50);
  if (contrast.checkedCount > 0) {
    expect(contrast.failCount).toBeLessThan(contrast.checkedCount * 0.5);
  }
});
`;

function processFile(filePath: string): { modified: boolean; reason: string } {
  const basename = path.basename(filePath);

  // Skip main spec (already handled) and this script's output
  if (basename === MAIN_SPEC) return { modified: false, reason: "main spec (already handled)" };
  if (!basename.startsWith("cdp-e2e")) return { modified: false, reason: "not a CDP E2E file" };
  if (!basename.endsWith(".spec.ts")) return { modified: false, reason: "not a spec file" };

  const content = fs.readFileSync(filePath, "utf-8");

  // Skip if already has quality checks
  if (content.includes("quality-checks") || content.includes("QUALITY:")) {
    return { modified: false, reason: "already has quality checks" };
  }

  // Skip if no `page` variable (can't run quality checks)
  if (!content.includes("let page") && !content.includes("const page")) {
    return { modified: false, reason: "no page variable" };
  }

  // Skip if no test() calls
  if (!content.includes("test(")) {
    return { modified: false, reason: "no test() calls" };
  }

  // Skip if file doesn't do any rendering (pure settings/data tests)
  const hasRendering = content.includes("doRender") || content.includes("pixiNodes") || content.includes("renderWith");
  if (!hasRendering) {
    return { modified: false, reason: "no rendering (settings-only tests)" };
  }

  let modified = content;

  // 1. Add import line after the @playwright/test import
  if (!modified.includes("quality-checks")) {
    const playwrightImportMatch = modified.match(/import\s+\{[^}]+\}\s+from\s+["']@playwright\/test["'];?\n/);
    if (playwrightImportMatch) {
      const insertPos = (playwrightImportMatch.index ?? 0) + playwrightImportMatch[0].length;
      modified = modified.slice(0, insertPos) + IMPORT_LINE + "\n" + modified.slice(insertPos);
    } else {
      // Fallback: add at top
      modified = IMPORT_LINE + "\n" + modified;
    }
  }

  // 2. Append quality gate test before the final empty lines
  // Find where to insert: before the last closing of the file
  const trimmed = modified.trimEnd();
  modified = trimmed + "\n" + QUALITY_GATE_TEST + "\n";

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, modified, "utf-8");
  }
  return { modified: true, reason: "added quality gate" };
}

// -- Main --
const files = fs.readdirSync(E2E_DIR)
  .filter(f => f.startsWith("cdp-e2e") && f.endsWith(".spec.ts"))
  .map(f => path.join(E2E_DIR, f))
  .sort();

let addedCount = 0;
let skippedCount = 0;
const results: { file: string; result: string }[] = [];

for (const f of files) {
  const { modified, reason } = processFile(f);
  if (modified) {
    addedCount++;
    results.push({ file: path.basename(f), result: `ADDED` });
  } else {
    skippedCount++;
    results.push({ file: path.basename(f), result: `SKIP: ${reason}` });
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Quality gate injection complete`);
console.log(`  Added: ${addedCount}`);
console.log(`  Skipped: ${skippedCount}`);
console.log(`  Total: ${files.length}`);
console.log(`${"=".repeat(60)}\n`);

// Show skipped files
const skipped = results.filter(r => r.result.startsWith("SKIP"));
if (skipped.length > 0) {
  console.log("Skipped files:");
  for (const s of skipped) {
    console.log(`  ${s.file}: ${s.result}`);
  }
}
