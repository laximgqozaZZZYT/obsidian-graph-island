import type { GraphNode, DirectionalGravityRule } from "../types";
import { parseQueryExpr, evaluateExpr } from "../utils/query-expr";

/**
 * Convert a direction preset or radian value to radians.
 */
export function resolveDirection(dir: DirectionalGravityRule["direction"]): number {
  if (typeof dir === "number") return dir;
  switch (dir) {
    case "top": return -Math.PI / 2;
    case "bottom": return Math.PI / 2;
    case "left": return Math.PI;
    case "right": return 0;
  }
}

/**
 * Check whether a node matches a directional gravity filter string.
 * Supported filters:
 *   "*"              - all nodes
 *   "tag:<name>"     - nodes with a specific tag
 *   "category:<name>"- nodes with a specific category
 *   "label:<substr>" - nodes whose label contains the substring
 *   "isTag"          - virtual tag nodes
 *   "<other>"        - treated as a tag name
 */
export function matchesFilter(node: GraphNode, filter: string): boolean {
  if (filter === "*") return true;
  const expr = parseQueryExpr(filter);
  if (!expr) return true; // empty filter matches all
  return evaluateExpr(expr, node);
}
