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

/**
 * Group nodes by their tags. Each tag produces one group containing all nodes
 * that have that tag. A node with multiple tags appears in the group of its
 * first tag only (to avoid duplication).
 */
export function groupNodesByTag(nodes: GraphNode[]): GroupSpec[] {
  const tagMap = new Map<string, string[]>();
  const assigned = new Set<string>();

  for (const n of nodes) {
    if (n.isTag || !n.tags || n.tags.length === 0) continue;
    // Assign to first tag only to avoid duplication
    const tag = n.tags[0];
    if (assigned.has(n.id)) continue;
    assigned.add(n.id);
    if (!tagMap.has(tag)) tagMap.set(tag, []);
    tagMap.get(tag)!.push(n.id);
  }

  const groups: GroupSpec[] = [];
  for (const [tag, memberIds] of tagMap) {
    if (memberIds.length < 2) continue; // don't group singletons
    groups.push({
      key: `tag:${tag}`,
      label: tag,
      memberIds,
    });
  }
  return groups;
}

/**
 * Group nodes by their category field. Each unique category value produces
 * one group.
 */
export function groupNodesByCategory(nodes: GraphNode[]): GroupSpec[] {
  const catMap = new Map<string, string[]>();

  for (const n of nodes) {
    if (n.isTag || !n.category) continue;
    if (!catMap.has(n.category)) catMap.set(n.category, []);
    catMap.get(n.category)!.push(n.id);
  }

  const groups: GroupSpec[] = [];
  for (const [cat, memberIds] of catMap) {
    if (memberIds.length < 2) continue;
    groups.push({
      key: `category:${cat}`,
      label: cat,
      memberIds,
    });
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
