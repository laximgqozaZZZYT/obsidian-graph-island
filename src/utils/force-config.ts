import type { GraphEdge } from "../types";
import {
	EDGE_TYPE_INHERITANCE,
	EDGE_TYPE_AGGREGATION,
	EDGE_TYPE_SEQUENCE,
	EDGE_TYPE_SIBLING,
	EDGE_TYPE_HAS_TAG,
} from "../constants";

/**
 * Compute link distance for a given edge based on its type.
 * Ontology edges (inheritance, aggregation, sequence) are kept shorter
 * to cluster related nodes; sibling and has-tag edges are slightly shorter
 * than normal links.
 */
export function edgeLinkDistance(e: GraphEdge, baseDist: number): number {
	if (e.type === EDGE_TYPE_INHERITANCE || e.type === EDGE_TYPE_AGGREGATION) return baseDist * 0.5;
	if (e.type === EDGE_TYPE_HAS_TAG) return baseDist * 0.7;
	if (e.type === EDGE_TYPE_SIBLING) return baseDist * 0.8;
	if (e.type === EDGE_TYPE_SEQUENCE) return baseDist * 0.6;
	return baseDist;
}

/**
 * Compute link strength for a given edge based on its type.
 * Ontology edges pull harder than normal links so that related nodes
 * stay tightly grouped.
 */
export function edgeLinkStrength(e: GraphEdge, baseStrength: number): number {
	if (e.type === EDGE_TYPE_INHERITANCE || e.type === EDGE_TYPE_AGGREGATION) return baseStrength * 3;
	if (e.type === EDGE_TYPE_HAS_TAG) return baseStrength * 1.5;
	if (e.type === EDGE_TYPE_SIBLING) return baseStrength * 2;
	if (e.type === EDGE_TYPE_SEQUENCE) return baseStrength * 2.5;
	return baseStrength;
}
