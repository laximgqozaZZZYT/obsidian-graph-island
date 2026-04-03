import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock obsidian with enough structure for settings tab
vi.mock("obsidian", () => {
  const settingInstance = {
    setName: vi.fn().mockReturnThis(),
    setDesc: vi.fn().mockReturnThis(),
    addButton: vi.fn(function(this: any, cb: any) {
      const btn = {
        setButtonText: vi.fn().mockReturnThis(),
        setCta: vi.fn().mockReturnThis(),
        onClick: vi.fn().mockReturnThis(),
      };
      cb(btn);
      return this;
    }),
    addText: vi.fn(function(this: any, cb: any) {
      const text = {
        setPlaceholder: vi.fn().mockReturnThis(),
        setValue: vi.fn().mockReturnThis(),
        onChange: vi.fn().mockReturnThis(),
      };
      cb(text);
      return this;
    }),
    addToggle: vi.fn(function(this: any, cb: any) {
      const toggle = {
        setValue: vi.fn().mockReturnThis(),
        onChange: vi.fn().mockReturnThis(),
      };
      cb(toggle);
      return this;
    }),
    addSlider: vi.fn(function(this: any, cb: any) {
      const slider = {
        setLimits: vi.fn().mockReturnThis(),
        setValue: vi.fn().mockReturnThis(),
        setDynamicTooltip: vi.fn().mockReturnThis(),
        onChange: vi.fn().mockReturnThis(),
      };
      cb(slider);
      return this;
    }),
  };

  return {
    App: class {},
    Modal: class {
      contentEl = {
        createEl: vi.fn(() => ({ textContent: "" })),
        empty: vi.fn(),
      };
      open() {}
      onOpen() {}
      onClose() {}
    },
    Notice: class {
      constructor(public msg: string, public duration?: number) {}
    },
    PluginSettingTab: class {
      app: any;
      plugin: any;
      containerEl = {
        empty: vi.fn(),
        createEl: vi.fn(() => ({
          readOnly: false,
          value: "",
        })),
        createDiv: vi.fn(() => ({
          empty: vi.fn(),
          createDiv: vi.fn(() => ({
            createEl: vi.fn(() => ({
              value: "",
              addEventListener: vi.fn(),
              createEl: vi.fn(() => ({ selected: false })),
            })),
            addEventListener: vi.fn(),
          })),
          createEl: vi.fn(() => ({ addEventListener: vi.fn() })),
        })),
      };
      constructor(app: any, plugin: any) {
        this.app = app;
        this.plugin = plugin;
      }
    },
    Setting: class {
      constructor(_el: any) {
        return settingInstance;
      }
    },
    setIcon: vi.fn(),
  };
});

// Mock i18n
vi.mock("../src/i18n", () => ({
  t: (key: string) => key,
}));

import { HELP, HelpModal, GraphViewsSettingTab } from "../src/settings";
import type { HelpEntry } from "../src/settings";
import { DEFAULT_SETTINGS } from "../src/types";

// ---------------------------------------------------------------------------
// HELP record validation (extends existing settings-help.test.ts)
// ---------------------------------------------------------------------------
describe("HELP entries — extended", () => {
  it("every entry body has at least 50 characters", () => {
    for (const [key, entry] of Object.entries(HELP) as [string, HelpEntry][]) {
      expect(entry.body.length, `HELP.${key}.body should be descriptive`).toBeGreaterThanOrEqual(50);
    }
  });

  it("no entry title exceeds 40 characters", () => {
    for (const [key, entry] of Object.entries(HELP) as [string, HelpEntry][]) {
      expect(entry.title.length, `HELP.${key}.title`).toBeLessThanOrEqual(40);
    }
  });

  it("directionalGravity entry mentions direction", () => {
    expect(HELP.directionalGravity.body).toContain("direction");
  });

  it("nodeRules entry mentions spacingMultiplier", () => {
    expect(HELP.nodeRules.body).toContain("spacingMultiplier");
  });

  it("enclosure entry mentions ratio or percentage", () => {
    const body = HELP.enclosure.body.toLowerCase();
    expect(body.includes("ratio") || body.includes("%")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HelpModal
// ---------------------------------------------------------------------------
describe("HelpModal", () => {
  it("can be instantiated with an entry", () => {
    const app = {} as any;
    const entry: HelpEntry = { title: "Test", body: "Test body content here" };
    const modal = new HelpModal(app, entry);
    expect(modal).toBeDefined();
  });

  it("onOpen sets title and body", () => {
    const app = {} as any;
    const entry: HelpEntry = { title: "My Title", body: "My body text" };
    const modal = new HelpModal(app, entry);
    modal.onOpen();

    // Verify createEl was called (via mock)
    const contentEl = (modal as any).contentEl;
    expect(contentEl.createEl).toHaveBeenCalledWith("h2", { text: "My Title" });
    expect(contentEl.createEl).toHaveBeenCalledWith("div", { cls: "gi-help-body" });
  });

  it("onClose empties contentEl", () => {
    const app = {} as any;
    const entry: HelpEntry = { title: "T", body: "B" };
    const modal = new HelpModal(app, entry);
    modal.onClose();
    expect((modal as any).contentEl.empty).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GraphViewsSettingTab
// ---------------------------------------------------------------------------
describe("GraphViewsSettingTab", () => {
  function createMockPlugin() {
    return {
      settings: {
        ...DEFAULT_SETTINGS,
        settingsJsonPath: "settings/graph-island.json",
        autoSnapshotIntervalMin: 5,
      },
      saveSettings: vi.fn(async () => {}),
    };
  }

  it("can be constructed", () => {
    const app = {} as any;
    const plugin = createMockPlugin() as any;
    const tab = new GraphViewsSettingTab(app, plugin);
    expect(tab).toBeDefined();
    expect(tab.plugin).toBe(plugin);
  });

  it("display() does not throw", () => {
    const app = { vault: { getFolderByPath: vi.fn() } } as any;
    const plugin = createMockPlugin() as any;
    const tab = new GraphViewsSettingTab(app, plugin);
    expect(() => tab.display()).not.toThrow();
  });

  it("display() calls containerEl.empty()", () => {
    const app = { vault: { getFolderByPath: vi.fn() } } as any;
    const plugin = createMockPlugin() as any;
    const tab = new GraphViewsSettingTab(app, plugin);
    tab.display();
    expect((tab as any).containerEl.empty).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS shape validation
// ---------------------------------------------------------------------------
describe("DEFAULT_SETTINGS shape", () => {
  it("has required top-level fields", () => {
    expect(DEFAULT_SETTINGS).toHaveProperty("nodeSize");
    expect(DEFAULT_SETTINGS).toHaveProperty("metadataFields");
    expect(DEFAULT_SETTINGS).toHaveProperty("ontology");
    expect(DEFAULT_SETTINGS).toHaveProperty("snapshots");
    expect(DEFAULT_SETTINGS).toHaveProperty("templates");
  });

  it("nodeSize is a positive number", () => {
    expect(DEFAULT_SETTINGS.nodeSize).toBeGreaterThan(0);
  });

  it("metadataFields is a non-empty array of strings", () => {
    expect(Array.isArray(DEFAULT_SETTINGS.metadataFields)).toBe(true);
    expect(DEFAULT_SETTINGS.metadataFields.length).toBeGreaterThan(0);
    for (const f of DEFAULT_SETTINGS.metadataFields) {
      expect(typeof f).toBe("string");
    }
  });

  it("ontology has required sub-fields", () => {
    const o = DEFAULT_SETTINGS.ontology;
    expect(o).toHaveProperty("inheritanceFields");
    expect(o).toHaveProperty("aggregationFields");
    expect(o).toHaveProperty("similarFields");
    expect(o).toHaveProperty("useTagHierarchy");
  });

  it("snapshots defaults to empty array", () => {
    expect(DEFAULT_SETTINGS.snapshots).toEqual([]);
  });

  it("templates defaults to empty array", () => {
    expect(DEFAULT_SETTINGS.templates).toEqual([]);
  });

  it("settingsJsonPath defaults to empty string", () => {
    expect(DEFAULT_SETTINGS.settingsJsonPath).toBe("");
  });

  it("enclosureMinRatio is between 0 and 1", () => {
    expect(DEFAULT_SETTINGS.enclosureMinRatio).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.enclosureMinRatio).toBeLessThanOrEqual(1);
  });

  it("defaultClusterGroupRules is a non-empty array", () => {
    expect(DEFAULT_SETTINGS.defaultClusterGroupRules.length).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.defaultClusterGroupRules[0]).toHaveProperty("groupBy");
  });

  it("showSimilar defaults to true", () => {
    expect(DEFAULT_SETTINGS.showSimilar).toBe(true);
  });
});
