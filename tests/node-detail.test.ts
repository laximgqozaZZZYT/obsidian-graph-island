import { describe, it, expect } from "vitest";
import { VIEW_TYPE_NODE_DETAIL } from "../src/views/NodeDetailView";
import { VIEW_TYPE_NODE_COMPARE } from "../src/views/NodeComparisonView";

// ---------------------------------------------------------------------------
// VIEW_TYPE_NODE_DETAIL constant
// ---------------------------------------------------------------------------
describe("VIEW_TYPE_NODE_DETAIL", () => {
  it("is a non-empty string", () => {
    expect(typeof VIEW_TYPE_NODE_DETAIL).toBe("string");
    expect(VIEW_TYPE_NODE_DETAIL.length).toBeGreaterThan(0);
  });

  it("is distinct from the comparison view type", () => {
    expect(VIEW_TYPE_NODE_DETAIL).not.toBe(VIEW_TYPE_NODE_COMPARE);
  });
});
