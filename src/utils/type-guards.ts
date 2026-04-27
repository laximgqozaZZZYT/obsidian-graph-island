/**
 * type-guards.ts
 *
 * Small, reusable runtime type guards for narrowing `unknown` values
 * received from external boundaries (Obsidian metadata cache, d3-force
 * simulation, generic option objects).  Prefer these over `as`-casts.
 */

import type { GraphNode } from "../types";

/** Narrow `unknown` to `Promise<T>` via duck-typed `then` check. */
export function isPromiseLike<T>(v: unknown): v is Promise<T> {
	return (
		v !== null &&
		(typeof v === "object" || typeof v === "function") &&
		typeof (v as { then?: unknown }).then === "function"
	);
}

/**
 * Read a string-typed frontmatter field.  Returns undefined when the field
 * is missing or not a string (Obsidian frontmatter values are `unknown`).
 */
export function frontmatterString(
	frontmatter: Record<string, unknown> | undefined | null,
	key: string,
): string | undefined {
	if (!frontmatter) return undefined;
	const v = frontmatter[key];
	return typeof v === "string" ? v : undefined;
}

/**
 * Resolve a d3-force edge endpoint to its node id.  d3-force replaces the
 * original string id with the linked GraphNode reference after the first
 * tick, so callers see `string | GraphNode` at runtime even though the type
 * declares `string`.  Returns "" when the value is neither shape.
 */
export function edgeEndpointId(endpoint: unknown): string {
	if (typeof endpoint === "string") return endpoint;
	if (endpoint !== null && typeof endpoint === "object") {
		const id = (endpoint as { id?: unknown }).id;
		if (typeof id === "string") return id;
	}
	return "";
}

/** True when `v` looks like a node ref ({ id: string }) — used post-d3-force. */
export function isNodeRef(v: unknown): v is GraphNode {
	return v !== null && typeof v === "object" && typeof (v as { id?: unknown }).id === "string";
}
