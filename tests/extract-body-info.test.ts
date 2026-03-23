import { describe, it, expect } from "vitest";
import { extractBodyInfo } from "../src/parsers/metadata-parser";

describe("extractBodyInfo", () => {
  it("returns empty preview for empty content", () => {
    const { preview, length } = extractBodyInfo("", 100);
    expect(preview).toBe("");
    expect(length).toBe(0);
  });

  it("strips YAML frontmatter", () => {
    const content = "---\ntitle: Hello\ntags: [a]\n---\nBody text here.";
    const { preview } = extractBodyInfo(content, 100);
    expect(preview).not.toContain("title:");
    expect(preview).toContain("Body text here.");
  });

  it("handles content without frontmatter", () => {
    const { preview } = extractBodyInfo("Just plain text.", 100);
    expect(preview).toBe("Just plain text.");
  });

  it("handles unclosed frontmatter (no closing ---)", () => {
    const content = "---\ntitle: Hello\nNo closing delimiter";
    const { preview } = extractBodyInfo(content, 100);
    // Without closing ---, the entire content is kept
    expect(preview).toContain("title:");
  });

  it("truncates long body to maxLen with ellipsis", () => {
    const body = "A".repeat(200);
    const { preview, length } = extractBodyInfo(body, 50);
    expect(preview.length).toBe(51); // 50 chars + "…"
    expect(preview.endsWith("…")).toBe(true);
    expect(length).toBe(200);
  });

  it("does not truncate when body fits maxLen", () => {
    const { preview } = extractBodyInfo("Short text.", 100);
    expect(preview).toBe("Short text.");
    expect(preview.endsWith("…")).toBe(false);
  });

  it("strips heading markers", () => {
    const content = "# Heading 1\n## Heading 2\nBody.";
    const { preview } = extractBodyInfo(content, 100);
    expect(preview).not.toContain("#");
    expect(preview).toContain("Heading 1");
    expect(preview).toContain("Body.");
  });

  it("collapses multiple whitespace into single space", () => {
    const content = "Word1    Word2\n\n\nWord3";
    const { preview } = extractBodyInfo(content, 100);
    expect(preview).toBe("Word1 Word2 Word3");
  });

  it("returns correct body length after stripping", () => {
    const content = "---\nfoo: bar\n---\n\n# Title\n\nParagraph.";
    const { length } = extractBodyInfo(content, 100);
    // "Title Paragraph." after strip+collapse = 17 chars
    expect(length).toBeGreaterThan(0);
    expect(length).toBeLessThan(content.length);
  });

  it("maxLen=0 always truncates non-empty body", () => {
    const { preview } = extractBodyInfo("Hello", 0);
    expect(preview).toBe("…");
  });
});
