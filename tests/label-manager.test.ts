import { describe, it, expect } from "vitest";
import { extractInitials } from "../src/views/LabelManager";

// ---------------------------------------------------------------------------
// extractInitials — 2-character initials from label text
// ---------------------------------------------------------------------------
describe("extractInitials", () => {
  it("extracts initials from path-separated segments", () => {
    expect(extractInitials("classic-othello/characters")).toBe("OC");
  });

  it("extracts from hyphenated segments", () => {
    expect(extractInitials("dark-fantasy")).toBe("DF");
  });

  it("extracts from underscore-separated segments", () => {
    expect(extractInitials("node_type")).toBe("NT");
  });

  it("extracts from space-separated segments", () => {
    expect(extractInitials("hello world")).toBe("HW");
  });

  it("uses first two chars for single word", () => {
    expect(extractInitials("mythology")).toBe("MY");
  });

  it("strips group suffix like (15)", () => {
    expect(extractInitials("fantasy (15)")).toBe("FA");
  });

  it("strips group suffix with multi-digit count", () => {
    expect(extractInitials("action/heroes (123)")).toBe("AH");
  });

  it("handles multi-segment path — uses last two", () => {
    expect(extractInitials("a/b/c/deep/leaf")).toBe("DL");
  });

  it("uppercases results", () => {
    expect(extractInitials("hello-world")).toBe("HW");
    expect(extractInitials("Hello-World")).toBe("HW");
  });

  it("handles single character input", () => {
    expect(extractInitials("x")).toBe("X");
  });

  it("handles empty string", () => {
    expect(extractInitials("")).toBe("");
  });

  it("handles Japanese text (single segment)", () => {
    expect(extractInitials("神話")).toBe("神話");
  });

  it("handles Japanese path-separated segments", () => {
    expect(extractInitials("歴史/人物")).toBe("歴人");
  });

  it("handles mixed separators", () => {
    expect(extractInitials("a-b/c_d")).toBe("CD");
  });

  it("ignores leading/trailing whitespace in segments", () => {
    expect(extractInitials("  alpha  beta  ")).toBe("AB");
  });
});
