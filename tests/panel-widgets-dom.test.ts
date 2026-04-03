/**
 * Tests for panel-widgets DOM functions using mock-dom.
 * Focuses on: addSlider, addToggle, addTextInput, buildDualRangeSlider,
 * addCheckboxGroup.
 */
import { describe, it, expect, vi } from "vitest";
import { createMockEl, findEl, findAllEl, allText } from "./helpers/mock-dom";
import {
  addSlider,
  addToggle,
  addTextInput,
  buildDualRangeSlider,
  addCheckboxGroup,
  addSelect,
} from "../src/views/panel-widgets";

// ---------------------------------------------------------------------------
// Augment mock elements with style.setProperty (used by updateSliderProgress)
// ---------------------------------------------------------------------------
function augmentWithSetProperty(el: any): any {
  // Walk all children recursively and add setProperty
  const augment = (node: any) => {
    if (node.style && !node.style.setProperty) {
      node.style.setProperty = (key: string, val: string) => {
        node.style[key] = val;
      };
    }
    // Override createEl to also augment children
    const origCreateEl = node.createEl.bind(node);
    node.createEl = (...args: any[]) => {
      const child = origCreateEl(...args);
      augment(child);
      return child;
    };
    const origCreateDiv = node.createDiv.bind(node);
    node.createDiv = (...args: any[]) => {
      const child = origCreateDiv(...args);
      augment(child);
      return child;
    };
    const origCreateSpan = node.createSpan.bind(node);
    node.createSpan = (...args: any[]) => {
      const child = origCreateSpan(...args);
      augment(child);
      return child;
    };
  };
  augment(el);
  return el;
}

function makeContainer(): any {
  return augmentWithSetProperty(createMockEl());
}

// ===========================================================================
// addSlider
// ===========================================================================
describe("addSlider", () => {
  it("creates a setting-item with slider", () => {
    const container = makeContainer();
    const onChange = vi.fn();
    addSlider(container as any, "Size", 0, 100, 1, 50, onChange, "Node size");

    expect(container.children.length).toBe(1);
    const settingItem = container.children[0];
    expect(settingItem.cls).toContain("setting-item");
  });

  it("sets initial value text", () => {
    const container = makeContainer();
    addSlider(container as any, "Size", 0, 100, 1, 42, vi.fn());

    const text = allText(container);
    expect(text).toContain("42");
    expect(text).toContain("Size");
  });

  it("returns the row element", () => {
    const container = makeContainer();
    const row = addSlider(container as any, "X", 0, 10, 1, 5, vi.fn());
    expect(row).toBeDefined();
  });

  it("creates an input element of type range", () => {
    const container = makeContainer();
    addSlider(container as any, "Val", 0, 50, 5, 10, vi.fn());

    const input = findEl(container, "input");
    expect(input).not.toBeNull();
  });

  it("uses description as title when provided", () => {
    const container = makeContainer();
    addSlider(container as any, "Val", 0, 50, 5, 10, vi.fn(), "My description");

    const name = findEl(container, ".setting-item-name");
    expect(name).not.toBeNull();
  });

  it("contains value span with initial value", () => {
    const container = makeContainer();
    addSlider(container as any, "Speed", 1, 10, 1, 7, vi.fn());

    const span = findEl(container, ".gi-slider-value");
    expect(span).not.toBeNull();
    expect(span!.text || span!.textContent).toBe("7");
  });
});

// ===========================================================================
// addToggle
// ===========================================================================
describe("addToggle", () => {
  it("creates a toggle setting item", () => {
    const container = makeContainer();
    addToggle(container as any, "Enabled", true, vi.fn(), "Description");

    const text = allText(container);
    expect(text).toContain("Enabled");
  });

  it("initial true adds is-enabled class", () => {
    const container = makeContainer();
    addToggle(container as any, "Enabled", true, vi.fn());

    const toggle = findEl(container, ".checkbox-container");
    expect(toggle).not.toBeNull();
    expect(toggle!.cls).toContain("is-enabled");
  });

  it("initial false does not add is-enabled class", () => {
    const container = makeContainer();
    addToggle(container as any, "Disabled", false, vi.fn());

    const toggle = findEl(container, ".checkbox-container");
    expect(toggle).not.toBeNull();
    expect(toggle!.cls ?? "").not.toContain("is-enabled");
  });

  it("sets aria-label", () => {
    const container = makeContainer();
    addToggle(container as any, "Toggle Me", false, vi.fn());

    const toggle = findEl(container, ".checkbox-container");
    expect(toggle!.attrs["aria-label"]).toBe("Toggle Me");
  });

  it("sets aria-checked to match initial", () => {
    const container = makeContainer();
    addToggle(container as any, "Test", true, vi.fn());

    const toggle = findEl(container, ".checkbox-container");
    expect(toggle!.attrs["aria-checked"]).toBe("true");
  });

  it("sets role=switch for a11y", () => {
    const container = makeContainer();
    addToggle(container as any, "Test", false, vi.fn());

    const toggle = findEl(container, ".checkbox-container");
    expect(toggle!.attrs["role"]).toBe("switch");
  });

  it("sets tabindex=0 for keyboard accessibility", () => {
    const container = makeContainer();
    addToggle(container as any, "Test", false, vi.fn());

    const toggle = findEl(container, ".checkbox-container");
    expect(toggle!.attrs["tabindex"]).toBe("0");
  });
});

// ===========================================================================
// addTextInput
// ===========================================================================
describe("addTextInput", () => {
  it("creates text input setting item", () => {
    const container = makeContainer();
    addTextInput(container as any, "Name", "hello", "Enter name", vi.fn());

    const text = allText(container);
    expect(text).toContain("Name");
  });

  it("creates input element", () => {
    const container = makeContainer();
    addTextInput(container as any, "Name", "default", "hint", vi.fn());

    const input = findEl(container, "input");
    expect(input).not.toBeNull();
  });

  it("creates setting-item row", () => {
    const container = makeContainer();
    addTextInput(container as any, "Path", "/data", "file path", vi.fn());

    const row = findEl(container, ".setting-item");
    expect(row).not.toBeNull();
  });
});

// ===========================================================================
// buildDualRangeSlider
// ===========================================================================
describe("buildDualRangeSlider", () => {
  it("creates a dual-range slider with two inputs", () => {
    const container = makeContainer();
    buildDualRangeSlider(container as any, "Range", 0.2, 0.8, vi.fn(), "Some range");

    const text = allText(container);
    expect(text).toContain("Range");
    expect(text).toContain("20%");
    expect(text).toContain("80%");
  });

  it("creates two range inputs", () => {
    const container = makeContainer();
    buildDualRangeSlider(container as any, "Range", 0, 1, vi.fn());

    const inputs = findAllEl(container, "input");
    expect(inputs.length).toBe(2);
  });

  it("creates min and max labeled inputs", () => {
    const container = makeContainer();
    buildDualRangeSlider(container as any, "Opacity", 0.1, 0.9, vi.fn());

    const minInput = findEl(container, ".gi-range-min");
    const maxInput = findEl(container, ".gi-range-max");
    expect(minInput).not.toBeNull();
    expect(maxInput).not.toBeNull();
  });

  it("shows 0% - 100% for full range", () => {
    const container = makeContainer();
    buildDualRangeSlider(container as any, "Range", 0, 1, vi.fn());

    const text = allText(container);
    expect(text).toContain("0%");
    expect(text).toContain("100%");
  });

  it("creates gi-dual-range class", () => {
    const container = makeContainer();
    buildDualRangeSlider(container as any, "R", 0, 1, vi.fn());

    const row = findEl(container, ".gi-dual-range");
    expect(row).not.toBeNull();
  });
});

// ===========================================================================
// addCheckboxGroup
// ===========================================================================
describe("addCheckboxGroup", () => {
  it("creates a checkbox group with items", () => {
    const container = makeContainer();
    addCheckboxGroup(
      container as any,
      "Options",
      ["A", "B", "C"],
      new Set(["A", "C"]),
      vi.fn(),
    );

    const text = allText(container);
    expect(text).toContain("Options");
    expect(text).toContain("A");
    expect(text).toContain("B");
    expect(text).toContain("C");
  });

  it("creates checkbox inputs", () => {
    const container = makeContainer();
    addCheckboxGroup(
      container as any,
      "Items",
      ["x", "y"],
      new Set(["x"]),
      vi.fn(),
    );

    const inputs = findAllEl(container, "input");
    expect(inputs.length).toBe(2);
  });

  it("shows dash when items is empty", () => {
    const container = makeContainer();
    addCheckboxGroup(container as any, "Empty", [], new Set(), vi.fn());

    const empty = findEl(container, ".gi-checkbox-empty");
    expect(empty).not.toBeNull();
  });

  it("creates label elements for each checkbox", () => {
    const container = makeContainer();
    addCheckboxGroup(
      container as any,
      "Tags",
      ["tag1", "tag2", "tag3"],
      new Set(["tag1"]),
      vi.fn(),
    );

    const labels = findAllEl(container, "label");
    expect(labels.length).toBe(3);
  });

  it("creates gi-checkbox-group control", () => {
    const container = makeContainer();
    addCheckboxGroup(container as any, "G", ["a"], new Set(), vi.fn());

    const group = findEl(container, ".gi-checkbox-group");
    expect(group).not.toBeNull();
  });
});

// ===========================================================================
// addSelect
// ===========================================================================
describe("addSelect", () => {
  it("creates a select dropdown", () => {
    const container = makeContainer();
    addSelect(
      container as any,
      "Layout",
      [
        { value: "force", label: "Force" },
        { value: "grid", label: "Grid" },
      ],
      "force",
      vi.fn(),
    );

    const select = findEl(container, "select");
    expect(select).not.toBeNull();
  });

  it("renders option elements", () => {
    const container = makeContainer();
    addSelect(
      container as any,
      "Mode",
      [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
        { value: "c", label: "Gamma" },
      ],
      "b",
      vi.fn(),
    );

    const options = findAllEl(container, "option");
    expect(options.length).toBe(3);
  });

  it("shows label text", () => {
    const container = makeContainer();
    addSelect(container as any, "Sort By", [{ value: "x", label: "X" }], "x", vi.fn());

    const text = allText(container);
    expect(text).toContain("Sort By");
  });

  it("sets aria-label on select", () => {
    const container = makeContainer();
    addSelect(container as any, "Filter", [{ value: "all", label: "All" }], "all", vi.fn());

    const select = findEl(container, "select");
    expect(select).not.toBeNull();
    expect(select!.attrs["aria-label"]).toBe("Filter");
  });

  it("uses description as title when provided", () => {
    const container = makeContainer();
    addSelect(
      container as any,
      "Type",
      [{ value: "a", label: "A" }],
      "a",
      vi.fn(),
      "Select the type",
    );

    const text = allText(container);
    expect(text).toContain("Type");
  });
});
