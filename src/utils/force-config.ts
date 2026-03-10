import type { GraphEdge } from "../types";

/**
 * Compute link distance for a given edge based on its type.
 * Ontology edges (inheritance, aggregation, sequence) are kept shorter
 * to cluster related nodes; sibling and has-tag edges are slightly shorter
 * than normal links.
 */
export function edgeLinkDistance(e: GraphEdge, baseDist: number): number {
  if (e.type === "inheritance" || e.type === "aggregation") return baseDist * 0.5;
  if (e.type === "has-tag") return baseDist * 0.7;
  if (e.type === "sibling") return baseDist * 0.8;
  if (e.type === "sequence") return baseDist * 0.6;
  return baseDist;
}

/**
 * Compute link strength for a given edge based on its type.
 * Ontology edges pull harder than normal links so that related nodes
 * stay tightly grouped.
 */
export function edgeLinkStrength(e: GraphEdge, baseStrength: number): number {
  if (e.type === "inheritance" || e.type === "aggregation") return baseStrength * 3;
  if (e.type === "has-tag") return baseStrength * 1.5;
  if (e.type === "sibling") return baseStrength * 2;
  if (e.type === "sequence") return baseStrength * 2.5;
  return baseStrength;
}
