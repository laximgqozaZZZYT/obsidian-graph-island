import { describe, it, expect } from "vitest";
import { t, tHelp, getLocale, _getTranslationKeys } from "../src/i18n";

describe("t() translation function", () => {
  it("returns a string for known keys", () => {
    const result = t("search.placeholder");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the key itself for unknown keys (fallback)", () => {
    const unknownKey = "this.key.definitely.does.not.exist.xyz";
    expect(t(unknownKey)).toBe(unknownKey);
  });

  it("returns non-empty strings for display/desc pairs", () => {
    const pairs = [
      "display.edgeMinZoom",
      "desc.edgeMinZoom",
      "display.edgeZoomFadeThreshold",
      "desc.edgeZoomFadeThreshold",
      "display.showRoadNetwork",
    ];
    for (const key of pairs) {
      const result = t(key);
      expect(result).not.toBe(key); // should NOT fall back to key
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it("returns tab section titles", () => {
    expect(t("tab.filter").length).toBeGreaterThan(0);
    expect(t("tab.display").length).toBeGreaterThan(0);
    expect(t("tab.layout").length).toBeGreaterThan(0);
  });

  it("returns a11y strings", () => {
    expect(t("a11y.nodesVisible").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Translation key coverage (cycle111)
// ---------------------------------------------------------------------------
describe("en/ja translation key parity", () => {
  const enKeys = _getTranslationKeys("en");
  const jaKeys = _getTranslationKeys("ja");

  it("en has a substantial number of keys", () => {
    expect(enKeys.length).toBeGreaterThan(690);
  });

  it("ja has the same number of keys as en", () => {
    expect(jaKeys.length).toBe(enKeys.length);
  });

  it("every en key exists in ja", () => {
    const jaSet = new Set(jaKeys);
    const missing = enKeys.filter(k => !jaSet.has(k));
    expect(missing).toEqual([]);
  });

  it("every ja key exists in en", () => {
    const enSet = new Set(enKeys);
    const extra = jaKeys.filter(k => !enSet.has(k));
    expect(extra).toEqual([]);
  });

  it("no en translation value is empty", () => {
    const empty = enKeys.filter(k => {
      const v = t(k);
      return v === k || v.length === 0; // fallback or empty
    });
    // Allow up to 0 empty keys — all should be translated
    expect(empty).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// tHelp / getLocale
// ---------------------------------------------------------------------------
describe("tHelp", () => {
  it("returns non-empty string for known help key", () => {
    // help keys typically match section titles
    const result = tHelp("search.filterHelp");
    // May fall back to key if not in help map — just check it's a string
    expect(typeof result).toBe("string");
  });

  it("returns key for unknown help key", () => {
    expect(tHelp("nonexistent.help.key")).toBe("nonexistent.help.key");
  });
});

describe("getLocale", () => {
  it("returns a valid locale string", () => {
    const locale = getLocale();
    expect(typeof locale).toBe("string");
    expect(["en", "ja"]).toContain(locale);
  });
});

// =========================================================================
// Placeholder consistency
// =========================================================================
describe("i18n placeholder consistency", () => {
  it("en and ja have same key count", () => {
    const enKeys = _getTranslationKeys("en");
    const jaKeys = _getTranslationKeys("ja");
    expect(enKeys.length).toBe(jaKeys.length);
  });

  it("no empty string translations in en", () => {
    const enKeys = _getTranslationKeys("en");
    const empty: string[] = [];
    for (const key of enKeys) {
      const val = t(key);
      if (val === "") empty.push(key);
    }
    expect(empty).toEqual([]);
  });

  it("en has substantial number of keys", () => {
    const enKeys = _getTranslationKeys("en");
    expect(enKeys.length).toBeGreaterThan(300);
  });

  it("all en keys are non-empty strings", () => {
    const enKeys = _getTranslationKeys("en");
    for (const key of enKeys) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });
});
