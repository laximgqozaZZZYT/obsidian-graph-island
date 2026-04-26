import type { GraphNode } from "../types";
import { parseQueryExpr, evaluateExpr } from "./query-expr";

const _exprCache = new Map<string, ReturnType<typeof parseQueryExpr>>();
const _EXPR_CACHE_MAX = 64;

/**
 * Check whether a node matches a filter string.
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
	let expr = _exprCache.get(filter);
	if (expr === undefined) {
		expr = parseQueryExpr(filter);
		if (_exprCache.size >= _EXPR_CACHE_MAX) _exprCache.clear();
		_exprCache.set(filter, expr);
	}
	if (!expr) return true;
	return evaluateExpr(expr, node);
}
