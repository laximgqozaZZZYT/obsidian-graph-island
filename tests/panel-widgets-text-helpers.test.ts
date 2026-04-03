/**
 * Tests for panel-widgets text manipulation helpers.
 * These functions are exported with underscore prefix for testability.
 */
import { describe, it, expect, vi } from "vitest";
import {
  _insertTextAtCursor,
  _replaceTokenAtPosition,
  _updateHintSelection,
} from "../src/views/panel-widgets";

// ---------------------------------------------------------------------------
// Mock HTMLInputElement
// ---------------------------------------------------------------------------
function makeInput(value: string, selectionStart?: number): any {
  const el = {
    value,
    selectionStart: selectionStart ?? value.length,
    selectionEnd: selectionStart ?? value.length,
    focus: vi.fn(),
    setSelectionRange: vi.fn((start: number, end: number) => {
      el.selectionStart = start;
      el.selectionEnd = end;
    }),
    dispatchEvent: vi.fn(),
  };
  return el;
}

// ---------------------------------------------------------------------------
// _insertTextAtCursor
// ---------------------------------------------------------------------------
describe("_insertTextAtCursor", () => {
  it("inserts text at empty input", () => {
    const input = makeInput("");
    _insertTextAtCursor(input, "hello");
    expect(input.value).toBe("hello");
    expect(input.focus).toHaveBeenCalled();
  });

  it("inserts text at end of non-empty input with space", () => {
    const input = makeInput("existing", 8);
    _insertTextAtCursor(input, "new");
    expect(input.value).toBe("existing new");
  });

  it("inserts text at beginning (cursor at 0)", () => {
    const input = makeInput("world", 0);
    _insertTextAtCursor(input, "hello");
    expect(input.value).toBe("helloworld");
  });

  it("inserts text in middle", () => {
    const input = makeInput("helloworld", 5);
    _insertTextAtCursor(input, "X");
    expect(input.value).toBe("hello Xworld");
  });

  it("does not add space when previous char is a space", () => {
    const input = makeInput("hello ", 6);
    _insertTextAtCursor(input, "world");
    expect(input.value).toBe("hello world");
  });

  it("dispatches input event", () => {
    const input = makeInput("");
    _insertTextAtCursor(input, "test");
    expect(input.dispatchEvent).toHaveBeenCalled();
  });

  it("sets cursor position after inserted text", () => {
    const input = makeInput("ab", 1);
    _insertTextAtCursor(input, "XY");
    // "a" + " " + "XY" + "b" = cursor at 4
    expect(input.setSelectionRange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// _replaceTokenAtPosition
// ---------------------------------------------------------------------------
describe("_replaceTokenAtPosition", () => {
  it("replaces token at beginning", () => {
    const input = makeInput("old rest");
    _replaceTokenAtPosition(input, 0, "new");
    expect(input.value).toBe("new rest");
  });

  it("replaces token at end", () => {
    const input = makeInput("start old");
    _replaceTokenAtPosition(input, 6, "new");
    expect(input.value).toBe("start new");
  });

  it("replaces token when no space after", () => {
    const input = makeInput("onlytoken");
    _replaceTokenAtPosition(input, 0, "replaced");
    expect(input.value).toBe("replaced");
  });

  it("replaces token in middle", () => {
    const input = makeInput("a bc d");
    _replaceTokenAtPosition(input, 2, "XY");
    expect(input.value).toBe("a XY d");
  });

  it("dispatches input event", () => {
    const input = makeInput("test");
    _replaceTokenAtPosition(input, 0, "new");
    expect(input.dispatchEvent).toHaveBeenCalled();
  });

  it("focuses the input", () => {
    const input = makeInput("test");
    _replaceTokenAtPosition(input, 0, "new");
    expect(input.focus).toHaveBeenCalled();
  });

  it("sets cursor after replaced text", () => {
    const input = makeInput("old");
    _replaceTokenAtPosition(input, 0, "newvalue");
    // "newvalue" is 8 chars, tokenStart=0, so cursor at 8
    expect(input.setSelectionRange).toHaveBeenCalledWith(8, 8);
  });
});

// ---------------------------------------------------------------------------
// _updateHintSelection
// ---------------------------------------------------------------------------
describe("_updateHintSelection", () => {
  function makeContainer(itemCount: number): any {
    const items: any[] = [];
    for (let i = 0; i < itemCount; i++) {
      items.push({
        tag: "div",
        classList: {
          _classes: new Set<string>(["search-suggest-item"]),
          contains(c: string) { return this._classes.has(c); },
          toggle(c: string, force: boolean) {
            if (force) this._classes.add(c);
            else this._classes.delete(c);
          },
        },
      });
    }
    // Add a group item (should be excluded from selection)
    const groupItem = {
      tag: "div",
      classList: {
        _classes: new Set<string>(["search-suggest-item", "mod-group"]),
        contains(c: string) { return this._classes.has(c); },
        toggle(c: string, force: boolean) {
          if (force) this._classes.add(c);
          else this._classes.delete(c);
        },
      },
    };

    return {
      querySelectorAll(sel: string) {
        if (sel === ".search-suggest-item:not(.mod-group)") {
          return items;
        }
        return [...items, groupItem];
      },
    };
  }

  it("selects the item at the given index", () => {
    const container = makeContainer(3);
    _updateHintSelection(container, 1);

    const items = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    expect(items[0].classList._classes.has("is-selected")).toBe(false);
    expect(items[1].classList._classes.has("is-selected")).toBe(true);
    expect(items[2].classList._classes.has("is-selected")).toBe(false);
  });

  it("selects first item when index is 0", () => {
    const container = makeContainer(3);
    _updateHintSelection(container, 0);

    const items = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    expect(items[0].classList._classes.has("is-selected")).toBe(true);
    expect(items[1].classList._classes.has("is-selected")).toBe(false);
  });

  it("deselects all when index is -1", () => {
    const container = makeContainer(3);
    _updateHintSelection(container, -1);

    const items = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    for (const item of items) {
      expect(item.classList._classes.has("is-selected")).toBe(false);
    }
  });

  it("handles empty container", () => {
    const container = makeContainer(0);
    expect(() => _updateHintSelection(container, 0)).not.toThrow();
  });

  it("handles out-of-range index", () => {
    const container = makeContainer(2);
    expect(() => _updateHintSelection(container, 99)).not.toThrow();
    // No item should be selected
    const items = container.querySelectorAll(".search-suggest-item:not(.mod-group)");
    for (const item of items) {
      expect(item.classList._classes.has("is-selected")).toBe(false);
    }
  });
});
