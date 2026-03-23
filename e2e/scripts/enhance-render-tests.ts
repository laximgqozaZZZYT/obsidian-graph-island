/**
 * Script to enhance individual tests in satellite E2E spec files.
 *
 * Strategy: Find test() blocks that:
 *   1. Call doRender() or rawData = null (triggering re-render)
 *   2. Only assert `ok: true` or `expect(result.ok).toBe(true)`
 *   3. Don't already have quality assertions
 *
 * For each such test, AFTER the `expect(result.ok).toBe(true)` line,
 * insert a quality check using measureNodeOverlap + measureSpread.
 *
 * Usage: npx tsx e2e/scripts/enhance-render-tests.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const E2E_DIR = path.resolve(__dirname, "..");
const MAIN_SPEC = "cdp-e2e.spec.ts";

// Quality assertion block to insert after weak assertions in render tests
const QUALITY_INLINE = `
    // === Display Quality: post-render sanity ===
    const _spread = await measureSpread(page);
    expect(_spread.nanCount).toBe(0);
    expect(_spread.infCount).toBe(0);`;

function processFile(filePath: string): { modified: boolean; insertions: number; reason: string } {
  const basename = path.basename(filePath);
  if (basename === MAIN_SPEC) return { modified: false, insertions: 0, reason: "main spec" };
  if (!basename.endsWith(".spec.ts")) return { modified: false, insertions: 0, reason: "not spec" };

  let content = fs.readFileSync(filePath, "utf-8");

  // Must already have quality-checks import
  if (!content.includes("quality-checks")) {
    return { modified: false, insertions: 0, reason: "no quality-checks import" };
  }

  // Must have measureSpread in import (add if only has measureNodeOverlap)
  if (!content.includes("measureSpread")) {
    content = content.replace(
      /import\s*\{([^}]*)\}\s*from\s*["']\.\/helpers\/quality-checks["'];?/,
      (match, imports) => {
        const fns = imports.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (!fns.includes("measureSpread")) fns.push("measureSpread");
        return `import { ${fns.join(", ")} } from "./helpers/quality-checks";`;
      }
    );
  }

  const lines = content.split("\n");
  const insertions: number[] = []; // line indices to insert after

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Pattern: expect(result.ok).toBe(true); or expect(result.ok).toBe(true)
    // ONLY if preceded by doRender/rawData within the same test block
    if (
      (line === "expect(result.ok).toBe(true);" || line === "expect(result.ok).toBe(true)") &&
      !isAlreadyEnhanced(lines, i)
    ) {
      // Look backwards to see if this test block does rendering
      if (hasRenderInTestBlock(lines, i)) {
        insertions.push(i);
      }
    }
  }

  if (insertions.length === 0) {
    return { modified: false, insertions: 0, reason: "no weak render tests found" };
  }

  // Insert quality checks (reverse order to preserve line numbers)
  for (let idx = insertions.length - 1; idx >= 0; idx--) {
    const lineIdx = insertions[idx];
    const indent = lines[lineIdx].match(/^(\s*)/)?.[1] ?? "  ";
    // Adjust indent for the quality block
    const block = QUALITY_INLINE.split("\n")
      .map(l => l.trim() ? indent + l.trim() : "")
      .join("\n");
    lines.splice(lineIdx + 1, 0, block);
  }

  const newContent = lines.join("\n");
  if (!DRY_RUN) {
    fs.writeFileSync(filePath, newContent, "utf-8");
  }

  return { modified: true, insertions: insertions.length, reason: "enhanced" };
}

function isAlreadyEnhanced(lines: string[], idx: number): boolean {
  // Check next 5 lines for existing quality check
  for (let j = idx + 1; j < Math.min(idx + 6, lines.length); j++) {
    if (lines[j].includes("Display Quality") || lines[j].includes("measureSpread") || lines[j].includes("measureNodeOverlap") || lines[j].includes("nanCount")) {
      return true;
    }
  }
  return false;
}

function hasRenderInTestBlock(lines: string[], expectIdx: number): boolean {
  // Look backwards up to 50 lines for doRender or rawData = null
  for (let j = expectIdx - 1; j >= Math.max(0, expectIdx - 50); j--) {
    const line = lines[j];
    if (line.includes("doRender") || line.includes("rawData = null") || line.includes("rawData=null")) {
      return true;
    }
    // Stop if we hit the test() declaration
    if (/^\s*test\(/.test(line) || /^\s*test\.describe\(/.test(line)) {
      break;
    }
  }
  return false;
}

// -- Main --
const files = fs.readdirSync(E2E_DIR)
  .filter(f => f.startsWith("cdp-e2e") && f.endsWith(".spec.ts"))
  .map(f => path.join(E2E_DIR, f))
  .sort();

let totalInsertions = 0;
let modifiedCount = 0;

for (const f of files) {
  const { modified, insertions, reason } = processFile(f);
  if (modified) {
    modifiedCount++;
    totalInsertions += insertions;
    console.log(`  ENHANCED ${path.basename(f)}: +${insertions} quality checks`);
  }
}

console.log(`\n${"=".repeat(60)}`);
console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Inline quality enhancement complete`);
console.log(`  Files enhanced: ${modifiedCount}`);
console.log(`  Total insertions: ${totalInsertions}`);
console.log(`${"=".repeat(60)}`);
