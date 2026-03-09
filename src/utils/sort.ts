import type { GraphNode, SortRule } from "../types";

export interface SortMetrics {
  degrees?: Map<string, number>;
  inDegrees?: Map<string, number>;
  importance?: Map<string, number>;
}

/**
 * Build a multi-rule tiebreaker comparator.
 *
 * Each rule is evaluated in order; the first non-zero comparison wins.
 * All `compareByKey` helpers return ascending order; the sign is flipped
 * when `order === "desc"`.
 */
export function buildMultiSortComparator(
  rules: SortRule[],
  metrics: SortMetrics,
): (a: GraphNode, b: GraphNode) => number {
  if (rules.length === 0) return () => 0;

  const comparators = rules.map((rule) => {
    const cmp = comparatorForKey(rule.key, metrics);
    return rule.order === "desc" ? (a: GraphNode, b: GraphNode) => -cmp(a, b) : cmp;
  });

  return (a: GraphNode, b: GraphNode) => {
    for (const cmp of comparators) {
      const diff = cmp(a, b);
      if (diff !== 0) return diff;
    }
    return 0;
  };
}

function comparatorForKey(
  key: SortRule["key"],
  m: SortMetrics,
): (a: GraphNode, b: GraphNode) => number {
  switch (key) {
    case "degree":
      return (a, b) => (m.degrees?.get(a.id) ?? 0) - (m.degrees?.get(b.id) ?? 0);
    case "in-degree":
      return (a, b) => (m.inDegrees?.get(a.id) ?? 0) - (m.inDegrees?.get(b.id) ?? 0);
    case "importance":
      return (a, b) => (m.importance?.get(a.id) ?? 0) - (m.importance?.get(b.id) ?? 0);
    case "tag":
      return (a, b) => {
        const ta = a.tags?.[0] ?? "";
        const tb = b.tags?.[0] ?? "";
        return ta.localeCompare(tb);
      };
    case "category":
      return (a, b) => (a.category ?? "").localeCompare(b.category ?? "");
    case "label":
      return (a, b) => a.label.localeCompare(b.label);
    default:
      return () => 0;
  }
}
