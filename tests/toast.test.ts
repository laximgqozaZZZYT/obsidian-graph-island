/**
 * Tests for src/utils/toast.ts
 *
 * Verifies that showToast delegates to Obsidian's Notice with the
 * correct message and duration arguments.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({
  Notice: vi.fn(),
}));

import { showToast } from "../src/utils/toast";
import { Notice } from "obsidian";

const MockNotice = Notice as unknown as ReturnType<typeof vi.fn>;

describe("showToast", () => {
  beforeEach(() => {
    MockNotice.mockClear();
  });

  it("creates a Notice with the given message and default duration", () => {
    showToast("Hello, world!");
    expect(MockNotice).toHaveBeenCalledTimes(1);
    expect(MockNotice).toHaveBeenCalledWith("Hello, world!", 3000);
  });

  it("uses a custom duration when provided", () => {
    showToast("Custom duration", 5000);
    expect(MockNotice).toHaveBeenCalledWith("Custom duration", 5000);
  });

  it("passes an empty string message", () => {
    showToast("");
    expect(MockNotice).toHaveBeenCalledWith("", 3000);
  });

  it("duration 0 is forwarded as-is", () => {
    showToast("Flash", 0);
    expect(MockNotice).toHaveBeenCalledWith("Flash", 0);
  });

  it("does not call Notice more than once per showToast call", () => {
    showToast("once");
    expect(MockNotice).toHaveBeenCalledTimes(1);
  });
});
