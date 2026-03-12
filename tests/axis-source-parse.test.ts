import { describe, it, expect } from "vitest";
// Import the parse/stringify functions
// They are exported from PanelBuilder — we re-export for testability
import { parseAxisSourceString, axisSourceToString } from "../src/views/PanelBuilder";

describe("parseAxisSourceString", () => {
  it("parses 'index'", () => {
    expect(parseAxisSourceString("index")).toEqual({ kind: "index" });
  });

  it("parses metric names", () => {
    expect(parseAxisSourceString("degree")).toEqual({ kind: "metric", metric: "degree" });
    expect(parseAxisSourceString("in-degree")).toEqual({ kind: "metric", metric: "in-degree" });
    expect(parseAxisSourceString("out-degree")).toEqual({ kind: "metric", metric: "out-degree" });
    expect(parseAxisSourceString("bfs-depth")).toEqual({ kind: "metric", metric: "bfs-depth" });
    expect(parseAxisSourceString("sibling-rank")).toEqual({ kind: "metric", metric: "sibling-rank" });
  });

  it("parses 'random' and 'random:seed'", () => {
    expect(parseAxisSourceString("random")).toEqual({ kind: "random", seed: 42 });
    expect(parseAxisSourceString("random:123")).toEqual({ kind: "random", seed: 123 });
  });

  it("parses 'const' and 'const:value'", () => {
    expect(parseAxisSourceString("const")).toEqual({ kind: "const", value: 1 });
    expect(parseAxisSourceString("const:3.5")).toEqual({ kind: "const", value: 3.5 });
  });

  it("parses 'hop:from' and 'hop:from:maxDepth'", () => {
    expect(parseAxisSourceString("hop:alice")).toEqual({ kind: "hop", from: "alice" });
    expect(parseAxisSourceString("hop:alice:5")).toEqual({ kind: "hop", from: "alice", maxDepth: 5 });
    expect(parseAxisSourceString("hop")).toEqual({ kind: "hop", from: "" });
  });

  it("parses built-in field names", () => {
    expect(parseAxisSourceString("path")).toEqual({ kind: "field", field: "path" });
    expect(parseAxisSourceString("file")).toEqual({ kind: "field", field: "file" });
    expect(parseAxisSourceString("folder")).toEqual({ kind: "field", field: "folder" });
    expect(parseAxisSourceString("tag")).toEqual({ kind: "field", field: "tag" });
    expect(parseAxisSourceString("category")).toEqual({ kind: "field", field: "category" });
    expect(parseAxisSourceString("id")).toEqual({ kind: "field", field: "id" });
    expect(parseAxisSourceString("isTag")).toEqual({ kind: "field", field: "isTag" });
  });

  it("parses arbitrary frontmatter field names", () => {
    expect(parseAxisSourceString("story_order")).toEqual({ kind: "field", field: "story_order" });
    expect(parseAxisSourceString("start-date")).toEqual({ kind: "field", field: "start-date" });
  });

  it("strips trailing :? or :* from field patterns", () => {
    expect(parseAxisSourceString("tag:?")).toEqual({ kind: "field", field: "tag" });
    expect(parseAxisSourceString("category:*")).toEqual({ kind: "field", field: "category" });
  });

  it("returns null for empty string", () => {
    expect(parseAxisSourceString("")).toBeNull();
    expect(parseAxisSourceString("  ")).toBeNull();
  });
});

describe("axisSourceToString", () => {
  it("serializes index", () => {
    expect(axisSourceToString({ kind: "index" })).toBe("index");
  });

  it("serializes metrics", () => {
    expect(axisSourceToString({ kind: "metric", metric: "degree" })).toBe("degree");
    expect(axisSourceToString({ kind: "metric", metric: "bfs-depth" })).toBe("bfs-depth");
  });

  it("serializes random", () => {
    expect(axisSourceToString({ kind: "random", seed: 42 })).toBe("random");
    expect(axisSourceToString({ kind: "random", seed: 7 })).toBe("random:7");
  });

  it("serializes const", () => {
    expect(axisSourceToString({ kind: "const", value: 1 })).toBe("const");
    expect(axisSourceToString({ kind: "const", value: 5 })).toBe("const:5");
  });

  it("serializes hop", () => {
    expect(axisSourceToString({ kind: "hop", from: "alice" })).toBe("hop:alice");
    expect(axisSourceToString({ kind: "hop", from: "alice", maxDepth: 3 })).toBe("hop:alice:3");
  });

  it("serializes field", () => {
    expect(axisSourceToString({ kind: "field", field: "folder" })).toBe("folder");
    expect(axisSourceToString({ kind: "field", field: "tag" })).toBe("tag");
  });

  it("serializes property (legacy)", () => {
    expect(axisSourceToString({ kind: "property", key: "date" })).toBe("date");
  });

  it("roundtrips correctly", () => {
    const sources = [
      "index", "degree", "in-degree", "random", "random:99",
      "const", "const:2.5", "hop:bob", "hop:bob:10",
      "folder", "tag", "story_order",
    ];
    for (const s of sources) {
      const parsed = parseAxisSourceString(s);
      expect(parsed).not.toBeNull();
      expect(axisSourceToString(parsed!)).toBe(s);
    }
  });
});
