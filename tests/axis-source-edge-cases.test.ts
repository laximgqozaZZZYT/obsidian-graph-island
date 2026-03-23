import { describe, it, expect } from "vitest";
import { parseAxisSourceString, axisSourceToString } from "../src/views/PanelBuilder";

// ---------------------------------------------------------------------------
// parseAxisSourceString — edge cases not covered by axis-source-parse.test.ts
// ---------------------------------------------------------------------------
describe("parseAxisSourceString edge cases", () => {
  it("random:NaN falls back to seed 42", () => {
    expect(parseAxisSourceString("random:abc")).toEqual({ kind: "random", seed: 42 });
  });

  it("const:NaN falls back to value 1", () => {
    expect(parseAxisSourceString("const:abc")).toEqual({ kind: "const", value: 1 });
  });

  it("const:0 parses correctly (falsy value)", () => {
    expect(parseAxisSourceString("const:0")).toEqual({ kind: "const", value: 0 });
  });

  it("const:negative parses correctly", () => {
    expect(parseAxisSourceString("const:-5.5")).toEqual({ kind: "const", value: -5.5 });
  });

  it("hop:from:NaN ignores invalid maxDepth", () => {
    const result = parseAxisSourceString("hop:alice:xyz");
    expect(result).toEqual({ kind: "hop", from: "alice" });
    // maxDepth should not be present
    expect(result).not.toHaveProperty("maxDepth");
  });

  it("hop: with empty from", () => {
    expect(parseAxisSourceString("hop:")).toEqual({ kind: "hop", from: "" });
  });

  it("whitespace-padded input is trimmed", () => {
    expect(parseAxisSourceString("  index  ")).toEqual({ kind: "index" });
    expect(parseAxisSourceString("  degree  ")).toEqual({ kind: "metric", metric: "degree" });
  });

  it("random:0 parses seed 0 correctly", () => {
    expect(parseAxisSourceString("random:0")).toEqual({ kind: "random", seed: 0 });
  });

  it("hop:from:0 parses maxDepth 0 correctly", () => {
    expect(parseAxisSourceString("hop:node:0")).toEqual({ kind: "hop", from: "node", maxDepth: 0 });
  });
});

// ---------------------------------------------------------------------------
// axisSourceToString — edge cases
// ---------------------------------------------------------------------------
describe("axisSourceToString edge cases", () => {
  it("unknown kind falls back to 'index'", () => {
    expect(axisSourceToString({ kind: "totally-unknown" } as any)).toBe("index");
  });

  it("hop with maxDepth=0 includes it", () => {
    expect(axisSourceToString({ kind: "hop", from: "x", maxDepth: 0 })).toBe("hop:x:0");
  });

  it("hop with empty from", () => {
    expect(axisSourceToString({ kind: "hop", from: "" })).toBe("hop:");
  });

  it("const with value=0", () => {
    expect(axisSourceToString({ kind: "const", value: 0 })).toBe("const:0");
  });

  it("random with seed=0", () => {
    expect(axisSourceToString({ kind: "random", seed: 0 })).toBe("random:0");
  });

  it("const with negative value", () => {
    expect(axisSourceToString({ kind: "const", value: -3 })).toBe("const:-3");
  });
});
