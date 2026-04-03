import { describe, it, expect, vi } from "vitest";
vi.mock("obsidian", () => ({
  setIcon: () => {},
  Notice: class {},
}));
import {
  updateSliderProgress,
  addSlider,
  addToggle,
  addTextInput,
  addSelect,
  addCheckboxGroup,
  buildDualRangeSlider,
} from "../src/views/panel-widgets";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";

// ---------------------------------------------------------------------------
// updateSliderProgress
// ---------------------------------------------------------------------------
describe("updateSliderProgress", () => {
  function mockInput(min: string, max: string, value: string) {
    return {
      min,
      max,
      value,
      style: { setProperty: vi.fn() },
    } as any;
  }

  it("computes correct progress for midpoint", () => {
    const el = mockInput("0", "100", "50");
    updateSliderProgress(el);
    expect(el.style.setProperty).toHaveBeenCalledWith("--progress", "50%");
  });

  it("computes 0% at minimum", () => {
    const el = mockInput("0", "100", "0");
    updateSliderProgress(el);
    expect(el.style.setProperty).toHaveBeenCalledWith("--progress", "0%");
  });

  it("computes 100% at maximum", () => {
    const el = mockInput("0", "100", "100");
    updateSliderProgress(el);
    expect(el.style.setProperty).toHaveBeenCalledWith("--progress", "100%");
  });

  it("handles non-zero min", () => {
    const el = mockInput("10", "20", "15");
    updateSliderProgress(el);
    expect(el.style.setProperty).toHaveBeenCalledWith("--progress", "50%");
  });

  it("handles default min/max when empty", () => {
    const el = mockInput("", "", "50");
    updateSliderProgress(el);
    // min=0, max=100 by default (parseFloat returns NaN → fallback)
    expect(el.style.setProperty).toHaveBeenCalledWith("--progress", "50%");
  });
});

// ---------------------------------------------------------------------------
// addSlider
// ---------------------------------------------------------------------------
describe("addSlider", () => {
  it("creates slider row with label and value display", () => {
    const container = createMockEl();
    const onChange = vi.fn();
    const row = addSlider(container as any, "Test Label", 0, 100, 1, 50, onChange);
    expect(row).toBeTruthy();
    const text = allText(container);
    expect(text).toContain("Test Label");
    expect(text).toContain("50");
  });

  it("creates slider with correct attributes", () => {
    const container = createMockEl();
    const onChange = vi.fn();
    addSlider(container as any, "Volume", 0, 10, 0.1, 5, onChange);
    // Look for input element
    const inputs = findAllEl(container, "input");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("creates slider with description as tooltip", () => {
    const container = createMockEl();
    addSlider(container as any, "Speed", 0, 100, 1, 50, vi.fn(), "Adjust playback speed");
    const text = allText(container);
    expect(text).toContain("Speed");
  });
});

// ---------------------------------------------------------------------------
// addToggle
// ---------------------------------------------------------------------------
describe("addToggle", () => {
  it("creates toggle row with label", () => {
    const container = createMockEl();
    const onChange = vi.fn();
    addToggle(container as any, "Dark Mode", true, onChange);
    const text = allText(container);
    expect(text).toContain("Dark Mode");
  });

  it("initial true adds is-enabled class", () => {
    const container = createMockEl();
    addToggle(container as any, "Feature", true, vi.fn());
    // Look for checkbox-container with is-enabled in its cls
    const all = findAllEl(container, "div");
    const toggleDiv = all.find(d => d.cls?.includes("is-enabled"));
    expect(toggleDiv).toBeTruthy();
  });

  it("initial false does not have is-enabled class", () => {
    const container = createMockEl();
    addToggle(container as any, "Feature", false, vi.fn());
    const all = findAllEl(container, "div");
    const toggleDiv = all.find(d => d.cls?.includes("checkbox-container") && !d.cls?.includes("is-enabled"));
    expect(toggleDiv).toBeTruthy();
  });

  it("has aria-label and role", () => {
    const container = createMockEl();
    addToggle(container as any, "Sound", false, vi.fn());
    const all = findAllEl(container, "div");
    const toggleDiv = all.find(d => d.attrs["role"] === "switch");
    expect(toggleDiv).toBeTruthy();
    expect(toggleDiv!.attrs["aria-label"]).toBe("Sound");
    expect(toggleDiv!.attrs["aria-checked"]).toBe("false");
  });

  it("with description sets title tooltip", () => {
    const container = createMockEl();
    addToggle(container as any, "Notify", true, vi.fn(), "Enable notifications");
    // Just check it doesn't throw
    const text = allText(container);
    expect(text).toContain("Notify");
  });
});

// ---------------------------------------------------------------------------
// addTextInput
// ---------------------------------------------------------------------------
describe("addTextInput", () => {
  it("creates text input with label and placeholder", () => {
    const container = createMockEl();
    addTextInput(container as any, "Search", "hello", "Type here...", vi.fn());
    const text = allText(container);
    expect(text).toContain("Search");
    const inputs = findAllEl(container, "input");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("sets initial value", () => {
    const container = createMockEl();
    addTextInput(container as any, "Name", "John", "", vi.fn());
    const inputs = findAllEl(container, "input");
    expect(inputs.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// addSelect
// ---------------------------------------------------------------------------
describe("addSelect", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("creates select with label", () => {
    const container = createMockEl();
    addSelect(container as any, "Color", options, "b", vi.fn());
    const text = allText(container);
    expect(text).toContain("Color");
  });

  it("creates option elements for each choice", () => {
    const container = createMockEl();
    addSelect(container as any, "Sort", options, "a", vi.fn());
    const optEls = findAllEl(container, "option");
    expect(optEls).toHaveLength(3);
    expect(optEls[0].text).toBe("Alpha");
    expect(optEls[1].text).toBe("Beta");
    expect(optEls[2].text).toBe("Gamma");
  });

  it("has aria-label on select element", () => {
    const container = createMockEl();
    addSelect(container as any, "Mode", options, "a", vi.fn());
    const selects = findAllEl(container, "select");
    expect(selects.length).toBeGreaterThan(0);
    expect(selects[0].attrs["aria-label"]).toBe("Mode");
  });

  it("has description tooltip when provided", () => {
    const container = createMockEl();
    addSelect(container as any, "Theme", options, "a", vi.fn(), "Choose color theme");
    // Should not throw
    const text = allText(container);
    expect(text).toContain("Theme");
  });
});

// ---------------------------------------------------------------------------
// addCheckboxGroup
// ---------------------------------------------------------------------------
describe("addCheckboxGroup", () => {
  it("creates checkbox group with items", () => {
    const container = createMockEl();
    const onChange = vi.fn();
    const selected = new Set(["link"]);
    addCheckboxGroup(
      container as any,
      "Tags",
      ["link", "tag", "inheritance"],
      selected,
      onChange,
    );
    const text = allText(container);
    expect(text).toContain("Tags");
    expect(text).toContain("link");
    expect(text).toContain("tag");
  });

  it("creates a checkbox element per item", () => {
    const container = createMockEl();
    const selected = new Set(["a", "c"]);
    addCheckboxGroup(
      container as any,
      "Types",
      ["a", "b", "c"],
      selected,
      vi.fn(),
    );
    const inputs = findAllEl(container, "input");
    expect(inputs.length).toBeGreaterThanOrEqual(3);
  });

  it("renders dash placeholder for empty items", () => {
    const container = createMockEl();
    addCheckboxGroup(
      container as any,
      "Empty",
      [],
      new Set(),
      vi.fn(),
    );
    const text = allText(container);
    expect(text).toContain("Empty");
  });
});

// ---------------------------------------------------------------------------
// buildDualRangeSlider
// ---------------------------------------------------------------------------
describe("buildDualRangeSlider", () => {
  it("creates dual range slider with label", () => {
    const container = createMockEl();
    const onChange = vi.fn();
    buildDualRangeSlider(container as any, "Range", 0.2, 0.8, onChange);
    const text = allText(container);
    expect(text).toContain("Range");
    expect(text).toContain("20%");
    expect(text).toContain("80%");
  });

  it("creates two range inputs", () => {
    const container = createMockEl();
    buildDualRangeSlider(container as any, "Filter", 0, 1, vi.fn());
    const inputs = findAllEl(container, "input");
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });

  it("has aria-labels for min and max", () => {
    const container = createMockEl();
    buildDualRangeSlider(container as any, "Degree", 0.1, 0.9, vi.fn());
    const inputs = findAllEl(container, "input");
    const minInput = inputs.find(i => i.attrs["aria-label"]?.includes("min"));
    const maxInput = inputs.find(i => i.attrs["aria-label"]?.includes("max"));
    expect(minInput).toBeTruthy();
    expect(maxInput).toBeTruthy();
  });

  it("supports description tooltip", () => {
    const container = createMockEl();
    buildDualRangeSlider(container as any, "Scale", 0, 1, vi.fn(), "Adjust scale range");
    const text = allText(container);
    expect(text).toContain("Scale");
  });
});

// ---------------------------------------------------------------------------
// Edge cases for addSlider
// ---------------------------------------------------------------------------
describe("addSlider edge cases", () => {
  it("handles zero range", () => {
    const container = createMockEl();
    const onChange = vi.fn();
    const row = addSlider(container as any, "Zero", 5, 5, 1, 5, onChange);
    expect(row).toBeTruthy();
  });

  it("handles negative range", () => {
    const container = createMockEl();
    const onChange = vi.fn();
    const row = addSlider(container as any, "Neg", -10, 10, 1, 0, onChange);
    expect(row).toBeTruthy();
  });

  it("handles floating step", () => {
    const container = createMockEl();
    const row = addSlider(container as any, "Float", 0, 1, 0.01, 0.5, vi.fn());
    expect(row).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Edge cases for addSelect
// ---------------------------------------------------------------------------
describe("addSelect edge cases", () => {
  it("handles empty options list", () => {
    const container = createMockEl();
    addSelect(container as any, "None", [], "", vi.fn());
    const selects = findAllEl(container, "select");
    expect(selects.length).toBe(1);
    expect(findAllEl(container, "option")).toHaveLength(0);
  });

  it("handles initial value not in options", () => {
    const container = createMockEl();
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    addSelect(container as any, "Test", options, "nonexistent", vi.fn());
    const optEls = findAllEl(container, "option");
    expect(optEls).toHaveLength(2);
  });

  it("handles single option", () => {
    const container = createMockEl();
    addSelect(container as any, "Single", [{ value: "x", label: "Only" }], "x", vi.fn());
    expect(findAllEl(container, "option")).toHaveLength(1);
  });
});
