// ---------------------------------------------------------------------------
// Node Grouping — collapse/expand nodes by tag or category into super nodes
// ---------------------------------------------------------------------------
import type { GraphNode, GraphEdge, GraphData } from "../types";

/** Specification for a group of nodes */
export interface GroupSpec {
  /** Unique key for the group (e.g. "tag:programming", "category:character") */
  key: string;
  /** Display label for the super node */
  label: string;
  /** IDs of member nodes */
  memberIds: string[];
}

/** Options controlling grouping behavior */
export interface GroupOptions {
  /** Minimum number of members to form a group (default 2) */
  minSize?: number;
  /** Comma-separated filter patterns — only matching group keys are created (empty = all) */
  filter?: string;
}

/** Parse comma-separated filter string into lowercase trimmed tokens */
function parseFilter(filter?: string): string[] {
  if (!filter || !filter.trim()) return [];
  return filter.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Check if a group label matches any of the filter tokens (substring match) */
function matchesFilter(label: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const lower = label.toLowerCase();
  return tokens.some(tok => lower.includes(tok));
}

/** Group nodes by their tags (delegates to groupNodesByField). */
export function groupNodesByTag(nodes: GraphNode[], opts?: GroupOptions): GroupSpec[] {
  return groupNodesByField(nodes, "tag", opts);
}

/** Group nodes by their category field (delegates to groupNodesByField). */
export function groupNodesByCategory(nodes: GraphNode[], opts?: GroupOptions): GroupSpec[] {
  return groupNodesByField(nodes, "category", opts);
}

/** Group nodes by their folder path (delegates to groupNodesByField). */
export function groupNodesByFolder(nodes: GraphNode[], opts?: GroupOptions): GroupSpec[] {
  return groupNodesByField(nodes, "folder", opts);
}

/**
 * Extract the grouping value(s) for a node given a field name.
 * Built-in fields: tag, category, folder, path, file, id, isTag.
 * Anything else looks up node.meta[field].
 * Returns an array because some fields (e.g. tag) can have multiple values.
 */
export function getNodeFieldValues(n: GraphNode, field: string): string[] {
  switch (field) {
    case "tag":
      return n.isTag ? [] : (n.tags ?? []);
    case "category":
      return n.category ? [n.category] : [];
    case "folder": {
      if (!n.filePath) return [];
      const lastSlash = n.filePath.lastIndexOf("/");
      return [lastSlash > 0 ? n.filePath.substring(0, lastSlash) : "/"];
    }
    case "path":
      return n.filePath ? [n.filePath] : [];
    case "file": {
      if (!n.filePath) return [];
      return [n.filePath.replace(/^.*\//, "").replace(/\.md$/, "")];
    }
    case "id":
      return [n.id];
    case "isTag":
      return n.isTag ? ["true"] : ["false"];
    default: {
      // Frontmatter property (including nested: "a.b.c")
      if (!n.meta) return [];
      const parts = field.split(".");
      let val: unknown = n.meta;
      for (const p of parts) {
        if (val == null || typeof val !== "object") return [];
        val = (val as Record<string, unknown>)[p];
      }
      if (val == null) return [];
      if (Array.isArray(val)) return val.map(String);
      return [String(val)];
    }
  }
}

/**
 * Generic grouping: group nodes by any field name.
 * For multi-value fields (e.g. tag), each node is assigned to its largest group
 * (same dedup logic as groupNodesByTag).
 */
export function groupNodesByField(nodes: GraphNode[], field: string, opts?: GroupOptions): GroupSpec[] {
  if (!field || field === "none") return [];
  const minSize = opts?.minSize ?? 2;
  const filterTokens = parseFilter(opts?.filter);

  // Pass 1: count members per value
  const valueCounts = new Map<string, number>();
  for (const n of nodes) {
    if (n.isTag) continue;
    for (const v of getNodeFieldValues(n, field)) {
      valueCounts.set(v, (valueCounts.get(v) || 0) + 1);
    }
  }

  // Pass 2: assign each node to its largest-valued group (dedup)
  const groupMap = new Map<string, string[]>();
  const assigned = new Set<string>();
  for (const n of nodes) {
    if (n.isTag) continue;
    if (assigned.has(n.id)) continue;
    const vals = getNodeFieldValues(n, field);
    if (vals.length === 0) continue;
    // Pick the value with the most members
    let bestVal = vals[0];
    let bestCount = valueCounts.get(bestVal) || 0;
    for (let i = 1; i < vals.length; i++) {
      const cnt = valueCounts.get(vals[i]) || 0;
      if (cnt > bestCount) { bestVal = vals[i]; bestCount = cnt; }
    }
    assigned.add(n.id);
    if (!groupMap.has(bestVal)) groupMap.set(bestVal, []);
    groupMap.get(bestVal)!.push(n.id);
  }

  const groups: GroupSpec[] = [];
  for (const [val, memberIds] of groupMap) {
    if (memberIds.length < minSize) continue;
    if (!matchesFilter(val, filterTokens)) continue;
    groups.push({ key: `${field}:${val}`, label: val, memberIds });
  }
  return groups;
}

/**
 * Collapse a group: hide member nodes and create a super node.
 * Edges to/from members are re-routed to the super node.
 * Returns a new GraphData (does not mutate the input).
 */
export function collapseGroup(
  data: GraphData,
  group: GroupSpec
): GraphData {
  const memberSet = new Set(group.memberIds);
  const superNodeId = `__super__${group.key}`;

  // Compute position of super node as centroid of members
  let sumX = 0, sumY = 0, count = 0;
  for (const n of data.nodes) {
    if (memberSet.has(n.id)) {
      sumX += n.x;
      sumY += n.y;
      count++;
    }
  }
  const cx = count > 0 ? sumX / count : 0;
  const cy = count > 0 ? sumY / count : 0;

  // Collect tags/category from members for the super node
  const allTags = new Set<string>();
  let firstCategory: string | undefined;
  for (const n of data.nodes) {
    if (memberSet.has(n.id)) {
      if (n.tags) n.tags.forEach(t => allTags.add(t));
      if (n.category && !firstCategory) firstCategory = n.category;
    }
  }

  const superNode: GraphNode = {
    id: superNodeId,
    label: `${group.label} (${group.memberIds.length})`,
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    tags: [...allTags],
    category: firstCategory,
    collapsedMembers: [...group.memberIds],
  };

  // Filter out member nodes, mark them as collapsed
  const newNodes: GraphNode[] = [];
  for (const n of data.nodes) {
    if (memberSet.has(n.id)) {
      // Keep the node data but mark it as collapsed (for expandGroup to restore)
      continue; // remove from active graph
    }
    newNodes.push(n);
  }
  newNodes.push(superNode);

  // Re-route edges: edges between members become internal (removed),
  // edges from/to members become edges from/to super node
  const newEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();
  for (const e of data.edges) {
    const srcMember = memberSet.has(e.source);
    const tgtMember = memberSet.has(e.target);

    if (srcMember && tgtMember) {
      // Internal edge — drop it
      continue;
    }

    let newSource = e.source;
    let newTarget = e.target;
    if (srcMember) newSource = superNodeId;
    if (tgtMember) newTarget = superNodeId;

    // Deduplicate edges to/from super node
    const edgeKey = `${newSource}->${newTarget}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    newEdges.push({
      ...e,
      id: srcMember || tgtMember ? `${e.id}__rerouted` : e.id,
      source: newSource,
      target: newTarget,
    });
  }

  return { nodes: newNodes, edges: newEdges };
}

/**
 * Expand a super node: restore its member nodes and edges from originalData.
 * Returns a new GraphData (does not mutate the input).
 */
export function expandGroup(
  data: GraphData,
  superNodeId: string,
  originalData: GraphData
): GraphData {
  const superNode = data.nodes.find(n => n.id === superNodeId);
  if (!superNode?.collapsedMembers) return data;

  const memberIds = new Set(superNode.collapsedMembers);
  const originalNodeMap = new Map<string, GraphNode>();
  for (const n of originalData.nodes) {
    originalNodeMap.set(n.id, n);
  }

  // Remove super node, add back members
  const newNodes: GraphNode[] = [];
  for (const n of data.nodes) {
    if (n.id === superNodeId) continue;
    newNodes.push(n);
  }

  // Restore member nodes from original data, positioned around super node location
  const memberCount = memberIds.size;
  let idx = 0;
  for (const mid of memberIds) {
    const orig = originalNodeMap.get(mid);
    if (orig) {
      // Position members in a circle around the super node's position
      const angle = (2 * Math.PI * idx) / memberCount;
      const spreadRadius = Math.sqrt(memberCount) * 20;
      newNodes.push({
        ...orig,
        x: superNode.x + Math.cos(angle) * spreadRadius,
        y: superNode.y + Math.sin(angle) * spreadRadius,
        collapsedInto: undefined,
      });
    }
    idx++;
  }

  // Rebuild edges: remove rerouted edges, restore original edges for members
  const activeNodeIds = new Set(newNodes.map(n => n.id));
  const newEdges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  // First, add non-rerouted edges from current data (skip super-node edges)
  for (const e of data.edges) {
    if (e.source === superNodeId || e.target === superNodeId) continue;
    const key = `${e.source}->${e.target}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      newEdges.push(e);
    }
  }

  // Restore original edges involving member nodes
  for (const e of originalData.edges) {
    const src = typeof e.source === "string" ? e.source : (e.source as any).id;
    const tgt = typeof e.target === "string" ? e.target : (e.target as any).id;
    if (!activeNodeIds.has(src) || !activeNodeIds.has(tgt)) continue;
    const key = `${src}->${tgt}`;
    if (!seenEdges.has(key)) {
      seenEdges.add(key);
      newEdges.push({ ...e, source: src, target: tgt });
    }
  }

  return { nodes: newNodes, edges: newEdges };
}
