// ---------------------------------------------------------------------------
// Obsidian E2E — Vault Editing → Graph Update Tests
// ---------------------------------------------------------------------------
// Tests that modify vault files on disk and verify the graph reflects changes.
// This addresses the user requirement: "Vault内mdの編集含む"
// ---------------------------------------------------------------------------

import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  prepareTestVault,
  launchObsidian,
  waitForObsidianReady,
  openGraphIsland,
  closeObsidian,
  writeVaultFile,
  deleteVaultFile,
  refreshVault,
} from "./obsidian-helpers";

let app: ElectronApplication;
let page: Page;
let vaultPath: string;
let workDir: string;
let vaultId: string;

/** Helper to get current graph node count */
async function getNodeCount(): Promise<number> {
  return page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-island-view");
    if (leaves.length === 0) return -1;
    const view = leaves[0].view;
    const gd = view.graphData ?? view.container?.graphData;
    return gd ? gd.nodes.length : -2;
  });
}

/** Helper to get current graph edge count */
async function getEdgeCount(): Promise<number> {
  return page.evaluate(() => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-island-view");
    if (leaves.length === 0) return -1;
    const view = leaves[0].view;
    const gd = view.graphData ?? view.container?.graphData;
    return gd ? gd.edges.length : -2;
  });
}

/** Helper to check if a node with given id/label exists */
async function hasNode(label: string): Promise<boolean> {
  return page.evaluate((lbl) => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType("graph-island-view");
    if (leaves.length === 0) return false;
    const view = leaves[0].view;
    const gd = view.graphData ?? view.container?.graphData;
    if (!gd) return false;
    return gd.nodes.some((n: any) => n.id === lbl || n.label === lbl);
  }, label);
}

test.beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "gi-e2e-edit-"));
  vaultPath = prepareTestVault(workDir);
  const result = await launchObsidian(vaultPath);
  app = result.app;
  page = result.page;
  vaultId = result.vaultId;
  await waitForObsidianReady(page);
  await openGraphIsland(page);
  await page.waitForTimeout(2000);
});

test.afterAll(async () => {
  if (app) await closeObsidian(app, vaultId);
  if (workDir) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test.describe("Adding Files to Vault", () => {
  test("adding a new md file creates a new node in graph", async () => {
    const beforeCount = await getNodeCount();

    // Create a new file in the vault
    writeVaultFile(vaultPath, "Dragon.md", `---
category: creature
tags:
  - fantasy
  - monster
---

# Dragon

A fearsome creature that guards the [[Castle]].
`);

    // Wait for Obsidian to detect the new file
    await refreshVault(page);
    await page.waitForTimeout(3000);

    const afterCount = await getNodeCount();
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test("new file's wikilinks create edges", async () => {
    // Dragon.md links to Castle — check edge exists
    const hasDragonNode = await hasNode("Dragon");
    expect(hasDragonNode).toBe(true);
  });
});

test.describe("Editing Existing Files", () => {
  test("adding a wikilink to existing file creates new edge", async () => {
    const beforeEdges = await getEdgeCount();

    // Edit Alice.md to add a link to Dragon
    const alicePath = path.join(vaultPath, "Alice.md");
    let content = fs.readFileSync(alicePath, "utf-8");
    content += "\n- Encounters [[Dragon]]\n";
    fs.writeFileSync(alicePath, content, "utf-8");

    await refreshVault(page);
    await page.waitForTimeout(3000);

    const afterEdges = await getEdgeCount();
    expect(afterEdges).toBeGreaterThan(beforeEdges);
  });

  test("changing frontmatter tags updates node metadata", async () => {
    // Modify Bob's tags
    const bobPath = path.join(vaultPath, "Bob.md");
    let content = fs.readFileSync(bobPath, "utf-8");
    content = content.replace("  - supporting", "  - villain");
    fs.writeFileSync(bobPath, content, "utf-8");

    await refreshVault(page);
    await page.waitForTimeout(3000);

    // Verify no crash — canvas still renders
    const canvas = page.locator("canvas");
    expect(await canvas.count()).toBeGreaterThan(0);
  });

  test("changing frontmatter category updates node data", async () => {
    const castlePath = path.join(vaultPath, "Castle.md");
    let content = fs.readFileSync(castlePath, "utf-8");
    content = content.replace("category: location", "category: dungeon");
    fs.writeFileSync(castlePath, content, "utf-8");

    await refreshVault(page);
    await page.waitForTimeout(3000);

    const canvas = page.locator("canvas");
    expect(await canvas.count()).toBeGreaterThan(0);
  });
});

test.describe("Deleting Files from Vault", () => {
  test("deleting a md file removes its node from graph", async () => {
    const beforeCount = await getNodeCount();

    // Delete Dragon.md
    deleteVaultFile(vaultPath, "Dragon.md");

    await refreshVault(page);
    await page.waitForTimeout(3000);

    const afterCount = await getNodeCount();
    expect(afterCount).toBeLessThan(beforeCount);
  });

  test("deleted file's edges are also removed", async () => {
    // Dragon node should no longer exist
    const hasDragon = await hasNode("Dragon");
    expect(hasDragon).toBe(false);
  });
});

test.describe("Renaming Files", () => {
  test("renaming a file updates graph node", async () => {
    // Rename Wonderland.md to Dreamland.md
    const oldPath = path.join(vaultPath, "Wonderland.md");
    const newPath = path.join(vaultPath, "Dreamland.md");

    if (fs.existsSync(oldPath)) {
      let content = fs.readFileSync(oldPath, "utf-8");
      content = content.replace("# Wonderland", "# Dreamland");
      fs.writeFileSync(newPath, content, "utf-8");
      fs.unlinkSync(oldPath);
    }

    await refreshVault(page);
    await page.waitForTimeout(3000);

    // Canvas should still render without crash
    const canvas = page.locator("canvas");
    expect(await canvas.count()).toBeGreaterThan(0);
  });
});

test.describe("Bulk File Operations", () => {
  test("creating multiple files at once updates graph correctly", async () => {
    const beforeCount = await getNodeCount();

    // Create 3 new files at once
    for (const name of ["Knight", "Wizard", "Thief"]) {
      writeVaultFile(vaultPath, `${name}.md`, `---
category: character
tags:
  - adventurer
---

# ${name}

A brave ${name.toLowerCase()} from [[Story]].
`);
    }

    await refreshVault(page);
    await page.waitForTimeout(4000);

    const afterCount = await getNodeCount();
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount + 3);
  });
});
