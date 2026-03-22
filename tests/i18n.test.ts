import { describe, it, expect } from "vitest";
import { t } from "../src/i18n";

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
