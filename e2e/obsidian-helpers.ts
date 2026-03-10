// ---------------------------------------------------------------------------
// Obsidian E2E Test Helpers
// ---------------------------------------------------------------------------
// Utilities for launching Obsidian as an Electron app via Playwright,
// installing the plugin, and interacting with the vault.
// ---------------------------------------------------------------------------

import { _electron, type ElectronApplication, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const OBSIDIAN_BIN = "/opt/Obsidian/obsidian";
const PLUGIN_ID = "graph-island";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEST_VAULT_TEMPLATE = path.resolve(__dirname, "test-vault");
const OBSIDIAN_CONFIG_DIR = path.join(
  process.env.HOME ?? "/home/ubuntu",
  ".config",
  "obsidian",
);

/**
 * Copy the test vault template to a temporary working directory so each test
 * run starts with a clean vault.  Also install the latest plugin build.
 */
export function prepareTestVault(workDir: string): string {
  const vaultDir = path.join(workDir, "vault");

  // Copy template vault recursively
  fs.cpSync(TEST_VAULT_TEMPLATE, vaultDir, { recursive: true });

  // Install latest plugin build
  const pluginDir = path.join(vaultDir, ".obsidian", "plugins", PLUGIN_ID);
  fs.mkdirSync(pluginDir, { recursive: true });

  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    const src = path.join(PROJECT_ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(pluginDir, file));
    }
  }

  return vaultDir;
}

/**
 * Register the test vault in Obsidian's global config so it can be opened.
 * Returns the vault ID hash.
 */
export function registerVaultInObsidian(vaultPath: string): string {
  const configPath = path.join(OBSIDIAN_CONFIG_DIR, "obsidian.json");
  let config: any = {};

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }

  if (!config.vaults) config.vaults = {};

  // Generate a deterministic hash ID for the vault
  const vaultId = crypto
    .createHash("md5")
    .update(vaultPath)
    .digest("hex")
    .slice(0, 16);

  config.vaults[vaultId] = {
    path: vaultPath,
    ts: Date.now(),
    open: true,
  };

  // Mark all other vaults as not open
  for (const [id, vault] of Object.entries(config.vaults)) {
    if (id !== vaultId) {
      (vault as any).open = false;
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");

  // Also create the vault-specific config file
  const vaultConfigPath = path.join(OBSIDIAN_CONFIG_DIR, `${vaultId}.json`);
  if (!fs.existsSync(vaultConfigPath)) {
    fs.writeFileSync(
      vaultConfigPath,
      JSON.stringify({ x: 0, y: 0, width: 1200, height: 800, isMaximized: false, devTools: false, zoom: 0 }),
      "utf-8",
    );
  }

  return vaultId;
}

/**
 * Unregister the test vault from Obsidian's global config.
 */
export function unregisterVault(vaultId: string): void {
  const configPath = path.join(OBSIDIAN_CONFIG_DIR, "obsidian.json");
  if (!fs.existsSync(configPath)) return;

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  if (config.vaults && config.vaults[vaultId]) {
    delete config.vaults[vaultId];
    fs.writeFileSync(configPath, JSON.stringify(config), "utf-8");
  }

  // Clean up vault config file
  const vaultConfigPath = path.join(OBSIDIAN_CONFIG_DIR, `${vaultId}.json`);
  if (fs.existsSync(vaultConfigPath)) {
    fs.unlinkSync(vaultConfigPath);
  }
}

/** Saved state for restoring obsidian.json after tests */
let savedObsidianConfig: string | null = null;

export function backupObsidianConfig(): void {
  const configPath = path.join(OBSIDIAN_CONFIG_DIR, "obsidian.json");
  if (fs.existsSync(configPath)) {
    savedObsidianConfig = fs.readFileSync(configPath, "utf-8");
  }
}

export function restoreObsidianConfig(): void {
  if (savedObsidianConfig !== null) {
    const configPath = path.join(OBSIDIAN_CONFIG_DIR, "obsidian.json");
    fs.writeFileSync(configPath, savedObsidianConfig, "utf-8");
    savedObsidianConfig = null;
  }
}

/**
 * Launch Obsidian pointing at the given vault directory.
 * Returns the ElectronApplication and the main window Page.
 */
export async function launchObsidian(
  vaultPath: string,
): Promise<{ app: ElectronApplication; page: Page; vaultId: string }> {
  // Backup existing config
  backupObsidianConfig();

  // Register the test vault so Obsidian opens it
  const vaultId = registerVaultInObsidian(vaultPath);

  const app = await _electron.launch({
    executablePath: OBSIDIAN_BIN,
    args: [
      "--no-sandbox",
      "--disable-gpu-sandbox",
      "--disable-setuid-sandbox",
      "--remote-debugging-port=0",
    ],
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: "1",
      OBSIDIAN_DISABLE_GPU: "1",
    },
    timeout: 30_000,
  });

  // Wait for the main window to appear
  const page = await app.firstWindow();
  // Wait for Obsidian to finish loading
  await page.waitForLoadState("domcontentloaded");

  return { app, page, vaultId };
}

/**
 * Wait for Obsidian's workspace to be fully ready.
 */
export async function waitForObsidianReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = (window as any).app;
      return app && app.workspace && app.workspace.layoutReady;
    },
    { timeout: 30_000 },
  );
  // Extra settle time for plugins to load
  await page.waitForTimeout(2000);
}

/**
 * Open a command by name via the command palette (Ctrl+P).
 */
export async function runCommand(page: Page, commandName: string): Promise<void> {
  await page.keyboard.press("Control+p");
  await page.waitForTimeout(300);
  await page.keyboard.type(commandName, { delay: 30 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
}

/**
 * Open Graph Island view via command palette.
 */
export async function openGraphIsland(page: Page): Promise<void> {
  await runCommand(page, "Graph Island");
  await page.waitForTimeout(2000);
}

/**
 * Write content to a file in the vault directory on disk.
 */
export function writeVaultFile(vaultPath: string, fileName: string, content: string): void {
  const filePath = path.join(vaultPath, fileName);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Read a file from the vault directory.
 */
export function readVaultFile(vaultPath: string, fileName: string): string {
  return fs.readFileSync(path.join(vaultPath, fileName), "utf-8");
}

/**
 * Delete a file from the vault directory.
 */
export function deleteVaultFile(vaultPath: string, fileName: string): void {
  const filePath = path.join(vaultPath, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Trigger Obsidian to re-index the vault after file changes.
 */
export async function refreshVault(page: Page): Promise<void> {
  await page.bringToFront();
  await page.waitForTimeout(1500);
}

/**
 * Close Obsidian gracefully and restore config.
 */
export async function closeObsidian(app: ElectronApplication, vaultId?: string): Promise<void> {
  await app.close();
  if (vaultId) {
    unregisterVault(vaultId);
  }
  restoreObsidianConfig();
}
