import { describe, it, expect } from "vitest";
import {
  isOntologyEdge,
  classifyEdgePort,
  portLaneKey,
} from "../src/views/EdgeRenderer";
import type { GraphEdge } from "../src/types";

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return { source: "a", target: "b", type: "link", ...overrides } as GraphEdge;
}

describe("isOntologyEdge", () => {
  it("inheritance → true", () => {
    expect(isOntologyEdge(makeEdge({ type: "inheritance" }))).toBe(true);
  });

  it("aggregation → true", () => {
    expect(isOntologyEdge(makeEdge({ type: "aggregation" }))).toBe(true);
  });

  it("sequence → true", () => {
    expect(isOntologyEdge(makeEdge({ type: "sequence" }))).toBe(true);
  });

  it("link → false", () => {
    expect(isOntologyEdge(makeEdge({ type: "link" }))).toBe(false);
  });

  it("tag → false", () => {
    expect(isOntologyEdge(makeEdge({ type: "tag" }))).toBe(false);
  });

  it("similar → false", () => {
    expect(isOntologyEdge(makeEdge({ type: "similar" }))).toBe(false);
  });

  it("sibling → false", () => {
    expect(isOntologyEdge(makeEdge({ type: "sibling" }))).toBe(false);
  });

  it("has-tag → false", () => {
    expect(isOntologyEdge(makeEdge({ type: "has-tag" }))).toBe(false);
  });
});

describe("classifyEdgePort", () => {
  it("non-ontology source → N (outgoing link)", () => {
    expect(classifyEdgePort(makeEdge({ type: "link" }), "a")).toBe("N");
  });

  it("non-ontology target → S (backlink)", () => {
    expect(classifyEdgePort(makeEdge({ type: "link" }), "b")).toBe("S");
  });

  it("ontology source → E (arrow out)", () => {
    expect(classifyEdgePort(makeEdge({ type: "inheritance" }), "a")).toBe("E");
  });

  it("ontology target → W (arrow in)", () => {
    expect(classifyEdgePort(makeEdge({ type: "inheritance" }), "b")).toBe("W");
  });

  it("sequence source → E", () => {
    expect(classifyEdgePort(makeEdge({ type: "sequence" }), "a")).toBe("E");
  });

  it("tag edge source → N (non-ontology)", () => {
    expect(classifyEdgePort(makeEdge({ type: "tag" }), "a")).toBe("N");
  });
});

describe("portLaneKey", () => {
  it("formats as groupKey|dir", () => {
    expect(portLaneKey("cluster-1", "N")).toBe("cluster-1|N");
  });

  it("handles empty group key", () => {
    expect(portLaneKey("", "S")).toBe("|S");
  });

  it("all four directions produce distinct keys", () => {
    const keys = new Set(["N", "S", "E", "W"].map(d => portLaneKey("g1", d as any)));
    expect(keys.size).toBe(4);
  });
});
