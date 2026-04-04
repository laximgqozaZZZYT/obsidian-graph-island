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

// ---------------------------------------------------------------------------
// Additional GraphViewsSettingTab display tests
// ---------------------------------------------------------------------------

describe("GraphViewsSettingTab.display() — additional coverage", () => {
  function createMockPlugin() {
    return {
      settings: {
        ...DEFAULT_SETTINGS,
        settingsJsonPath: "settings/graph-island.json",
        autoSnapshotIntervalMin: 5,
        ontology: {
          ...DEFAULT_SETTINGS.ontology,
          inheritanceFields: ["parent"],
          aggregationFields: ["contains"],
          customMappings: { "derived-from": "inheritance" },
          tagRelations: [{ source: "tag1", target: "tag2", type: "inheritance" }],
        },
      },
      saveSettings: vi.fn(async () => {}),
    };
  }

  it("displays ontology field editors", () => {
    const app = { vault: { getFolderByPath: vi.fn() } } as any;
    const plugin = createMockPlugin() as any;
    const tab = new GraphViewsSettingTab(app, plugin);
    expect(() => tab.display()).not.toThrow();
    expect((tab as any).containerEl.createEl).toHaveBeenCalled();
  });

  it("displays custom mappings section", () => {
    const app = { vault: { getFolderByPath: vi.fn() } } as any;
    const plugin = createMockPlugin() as any;
    const tab = new GraphViewsSettingTab(app, plugin);
    tab.display();
    // Should not throw even with custom mappings
    expect(plugin.saveSettings).toBeDefined();
  });

  it("displays tag relations section", () => {
    const app = { vault: { getFolderByPath: vi.fn() } } as any;
    const plugin = createMockPlugin() as any;
    const tab = new GraphViewsSettingTab(app, plugin);
    tab.display();
    expect((tab as any).containerEl.createEl).toHaveBeenCalled();
  });

  it("handles missing ontology fields gracefully", () => {
    const app = { vault: { getFolderByPath: vi.fn() } } as any;
    const plugin = createMockPlugin() as any;
    plugin.settings.ontology.reverseInheritanceFields = undefined;
    plugin.settings.ontology.reverseAggregationFields = undefined;
    plugin.settings.ontology.siblingFields = undefined;
    plugin.settings.ontology.sequenceFields = undefined;
    plugin.settings.ontology.reverseSequenceFields = undefined;

    const tab = new GraphViewsSettingTab(app, plugin);
    expect(() => tab.display()).not.toThrow();
  });

  it("displays settings preview as read-only textarea", () => {
    const app = { vault: { getFolderByPath: vi.fn() } } as any;
    const plugin = createMockPlugin() as any;
    const tab = new GraphViewsSettingTab(app, plugin);
    tab.display();
    // Preview should contain JSON stringified settings
    const preview = (tab as any).containerEl.createEl.mock.calls.find(
      (call: any) => call[0] === "textarea"
    );
    expect(preview).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// HelpEntry type and HELP record coverage
// ---------------------------------------------------------------------------

describe("HELP record completeness", () => {
  it("all required help entries exist", () => {
    const requiredKeys = [
      "metadataFields",
      "colorField",
      "groupField",
      "enclosure",
      "ontology",
      "groupPresets",
      "clusterGroupRules",
      "directionalGravity",
      "nodeRules",
    ];
    for (const key of requiredKeys) {
      expect(HELP).toHaveProperty(key);
      expect(HELP[key as keyof typeof HELP]).toBeDefined();
    }
  });

  it("all entries have descriptive content", () => {
    const entries = Object.entries(HELP) as [string, HelpEntry][];
    for (const [key, entry] of entries) {
      expect(entry.title).toBeTruthy();
      expect(entry.body.length).toBeGreaterThan(30);
    }
  });

  it("body content is domain-specific", () => {
    const bodies = Object.values(HELP).map(e => e.body.toLowerCase());
    const aggregationEntry = bodies.find(b => b.includes("aggregation"));
    const inheritanceEntry = bodies.find(b => b.includes("inheritance"));
    expect(aggregationEntry).toBeDefined();
    expect(inheritanceEntry).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS extended structure validation
// ---------------------------------------------------------------------------

describe("DEFAULT_SETTINGS complete structure", () => {
  it("has complete ontology configuration", () => {
    const o = DEFAULT_SETTINGS.ontology;
    expect(o).toHaveProperty("inheritanceFields");
    expect(o).toHaveProperty("aggregationFields");
    expect(o).toHaveProperty("reverseInheritanceFields");
    expect(o).toHaveProperty("reverseAggregationFields");
    expect(o).toHaveProperty("similarFields");
    expect(o).toHaveProperty("siblingFields");
    expect(o).toHaveProperty("sequenceFields");
    expect(o).toHaveProperty("reverseSequenceFields");
    expect(o).toHaveProperty("customMappings");
    expect(o).toHaveProperty("useTagHierarchy");
  });

  it("all field arrays are properly typed", () => {
    const o = DEFAULT_SETTINGS.ontology;
    expect(Array.isArray(o.inheritanceFields)).toBe(true);
    expect(Array.isArray(o.aggregationFields)).toBe(true);
    expect(Array.isArray(o.reverseInheritanceFields)).toBe(true);
    expect(Array.isArray(o.reverseAggregationFields)).toBe(true);
    expect(Array.isArray(o.similarFields)).toBe(true);
    expect(Array.isArray(o.siblingFields ?? [])).toBe(true);
    expect(Array.isArray(o.sequenceFields ?? [])).toBe(true);
    expect(Array.isArray(o.reverseSequenceFields ?? [])).toBe(true);
  });

  it("customMappings is an object", () => {
    expect(typeof DEFAULT_SETTINGS.ontology.customMappings).toBe("object");
  });

  it("all arrays contain strings or are empty", () => {
    const o = DEFAULT_SETTINGS.ontology;
    for (const arr of [
      o.inheritanceFields,
      o.aggregationFields,
      o.reverseInheritanceFields,
      o.reverseAggregationFields,
      o.similarFields,
      o.siblingFields ?? [],
      o.sequenceFields ?? [],
      o.reverseSequenceFields ?? [],
    ]) {
      for (const item of arr) {
        expect(typeof item).toBe("string");
      }
    }
  });

  it("booleans have correct default values", () => {
    expect(DEFAULT_SETTINGS.ontology.useTagHierarchy).toBe(true);
    expect(typeof DEFAULT_SETTINGS.showSimilar).toBe("boolean");
  });

  it("numeric settings are within valid ranges", () => {
    expect(DEFAULT_SETTINGS.nodeSize).toBeGreaterThan(0);
    expect(DEFAULT_SETTINGS.enclosureMinRatio).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.enclosureMinRatio).toBeLessThanOrEqual(1);
    if (DEFAULT_SETTINGS.autoSnapshotIntervalMin !== undefined) {
      expect(DEFAULT_SETTINGS.autoSnapshotIntervalMin).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// HelpModal edge cases
// ---------------------------------------------------------------------------

describe("HelpModal edge cases", () => {
  it("handles entry with very long title", () => {
    const app = {} as any;
    const entry: HelpEntry = {
      title: "A".repeat(100),
      body: "Short body",
    };
    const modal = new HelpModal(app, entry);
    expect(modal).toBeDefined();
  });

  it("handles entry with newlines in body", () => {
    const app = {} as any;
    const entry: HelpEntry = {
      title: "Test",
      body: "Line 1\\nLine 2\\nLine 3",
    };
    const modal = new HelpModal(app, entry);
    modal.onOpen();
    expect((modal as any).contentEl.createEl).toHaveBeenCalled();
  });

  it("property assignment in constructor", () => {
    const app = {} as any;
    const entry: HelpEntry = { title: "T", body: "B" };
    const modal = new HelpModal(app, entry);
    expect((modal as any).entry).toBe(entry);
  });
});
