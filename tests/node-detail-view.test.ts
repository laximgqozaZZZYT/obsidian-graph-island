import { describe, it, expect } from "vitest";
import { VIEW_TYPE_NODE_DETAIL } from "../src/views/NodeDetailView";

// ---------------------------------------------------------------------------
// VIEW_TYPE_NODE_DETAIL constant
// ---------------------------------------------------------------------------
describe("VIEW_TYPE_NODE_DETAIL", () => {
  it("is a non-empty string", () => {
    expect(typeof VIEW_TYPE_NODE_DETAIL).toBe("string");
    expect(VIEW_TYPE_NODE_DETAIL.length).toBeGreaterThan(0);
  });

  it("equals 'graph-node-detail'", () => {
    expect(VIEW_TYPE_NODE_DETAIL).toBe("graph-node-detail");
  });

  it("is kebab-case (no uppercase, no underscores)", () => {
    expect(VIEW_TYPE_NODE_DETAIL).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});
