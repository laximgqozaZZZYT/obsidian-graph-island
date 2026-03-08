import { App, TFile } from "obsidian";
import type { GraphData, GraphNode, GraphEdge, GraphViewsSettings, SunburstData, OntologyConfig } from "../types";
import { DEFAULT_COLORS } from "../types";

/**
 * Classify a field/relation name into an ontology edge type.
 * Handles both raw names ("parent") and @-prefixed names ("@Parent").
 */
export function classifyRelation(
  name: string,
  onto: OntologyConfig
): "inheritance" | "aggregation" | "similar" | undefined {
  const clean = name.startsWith("@") ? name.slice(1).trim() : name.trim();
  const lower = clean.toLowerCase();

  if (onto.inheritanceFields.some(f => f.toLowerCase() === lower)) return "inheritance";
  if (onto.aggregationFields.some(f => f.toLowerCase() === lower)) return "aggregation";
  if (onto.similarFields.some(f => f.toLowerCase() === lower)) return "similar";
  if (onto.customMappings[clean]) return onto.customMappings[clean];

  return undefined;
}

export function buildGraphFromVault(
  app: App,
  settings: GraphViewsSettings
): GraphData {
  const files = app.vault.getMarkdownFiles();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Set<string>();

  // Create nodes from files (initial x/y set below after grouping)
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    const node: GraphNode = {
      id: file.path,
      label: file.basename,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      category: frontmatter?.[settings.colorField] as string | undefined,
      tags: extractTags(frontmatter, cache),
      filePath: file.path,
    };
    nodes.push(node);
    nodeMap.set(file.path, node);
  }

  // Place nodes at their tag-group enclosure center.
  // Each node is assigned to its SMALLEST tag group (most specific),
  // so that broad parent tags don't create giant overlapping groups.
  // Radius ∝ √(member count); groups arranged on a circle sized by
  // the sum of diameters (not max), guaranteeing no overlap.
  {
    // Pass 1: count how many nodes each tag has
    const tagCounts = new Map<string, number>();
    for (const node of nodes) {
      if (!node.tags) continue;
      for (const tag of node.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    // Pass 2: assign each node to its smallest (most specific) tag group
    const tagGroups = new Map<string, GraphNode[]>();
    const ungrouped: GraphNode[] = [];
    for (const node of nodes) {
      if (!node.tags || node.tags.length === 0) {
        ungrouped.push(node);
        continue;
      }
      let bestTag = node.tags[0];
      let bestCount = tagCounts.get(bestTag) ?? Infinity;
      for (let i = 1; i < node.tags.length; i++) {
        const count = tagCounts.get(node.tags[i]) ?? Infinity;
        if (count < bestCount) {
          bestCount = count;
          bestTag = node.tags[i];
        }
      }
      let group = tagGroups.get(bestTag);
      if (!group) { group = []; tagGroups.set(bestTag, group); }
      group.push(node);
    }

    const groupEntries = [...tagGroups.entries()];
    const totalGroups = groupEntries.length + (ungrouped.length > 0 ? 1 : 0);
    const BASE_RADIUS = 30;
    const GAP = 60;

    // Compute radii for each group
    const groupRadii = groupEntries.map(([, members]) =>
      BASE_RADIUS * Math.sqrt(members.length)
    );
    const ungroupedRadius = ungrouped.length > 0
      ? BASE_RADIUS * Math.sqrt(ungrouped.length)
      : 0;

    // Layout radius from sum of diameters so every group fits without overlap
    const allRadii = [...groupRadii, ...(ungrouped.length > 0 ? [ungroupedRadius] : [])];
    const totalCircumference = allRadii.reduce(
      (sum, r) => sum + 2 * r + GAP, 0
    );
    const layoutRadius = totalGroups <= 1
      ? 0
      : Math.max(totalCircumference / (2 * Math.PI), 200);

    // Place groups along the circle, advancing angle proportionally
    let angle = 0;
    let gi = 0;
    for (const [, members] of groupEntries) {
      const r = groupRadii[gi];
      const arcLen = 2 * r + GAP;
      const halfArc = arcLen / (2 * layoutRadius);
      angle += halfArc;

      const cx = Math.cos(angle) * layoutRadius;
      const cy = Math.sin(angle) * layoutRadius;
      for (const node of members) {
        const a = Math.random() * 2 * Math.PI;
        const d = Math.sqrt(Math.random()) * r;
        node.x = cx + Math.cos(a) * d;
        node.y = cy + Math.sin(a) * d;
      }

      angle += halfArc;
      gi++;
    }

    if (ungrouped.length > 0) {
      const r = ungroupedRadius;
      const arcLen = 2 * r + GAP;
      const halfArc = arcLen / (2 * layoutRadius);
      angle += halfArc;

      const cx = Math.cos(angle) * layoutRadius;
      const cy = Math.sin(angle) * layoutRadius;
      for (const node of ungrouped) {
        const a = Math.random() * 2 * Math.PI;
        const d = Math.sqrt(Math.random()) * r;
        node.x = cx + Math.cos(a) * d;
        node.y = cy + Math.sin(a) * d;
      }
    }
  }

  // Build edges from internal links + relation-typed edges from
  // frontmatter link properties and inline Dataview fields (Author::[[link]])
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);

    // --- Frontmatter link properties (e.g. Author: "[[Jesus]]") ---
    const fmRelations = new Map<string, string>(); // targetPath → relation
    if (cache?.frontmatterLinks) {
      for (const fml of cache.frontmatterLinks) {
        const targetFile = app.metadataCache.getFirstLinkpathDest(
          fml.link,
          file.path
        );
        if (targetFile) {
          fmRelations.set(targetFile.path, fml.key);
        }
      }
    }

    // --- Inline Dataview fields (e.g. Author::[[Jesus]], @Parent::[[Entity]]) ---
    const inlineRelations = new Map<string, InlineFieldResult>();
    const content = app.vault.cachedRead(file);
    if (content instanceof Promise) {
      // cachedRead may return string synchronously if cached
    } else {
      parseInlineFields(content as unknown as string, file.path, app).forEach(
        (result, tPath) => inlineRelations.set(tPath, result)
      );
    }

    // --- Regular links ---
    if (cache?.links) {
      for (const link of cache.links) {
        const targetFile = app.metadataCache.getFirstLinkpathDest(
          link.link,
          file.path
        );
        if (!targetFile || !nodeMap.has(targetFile.path)) continue;

        const edgeId = `${file.path}->${targetFile.path}`;
        if (edgeSet.has(edgeId)) continue;
        edgeSet.add(edgeId);

        const inlineResult = inlineRelations.get(targetFile.path);
        const fmRel = fmRelations.get(targetFile.path);
        const relation = fmRel ?? inlineResult?.relation;
        const isOntologyInline = inlineResult?.isOntology ?? false;

        let edgeType: GraphEdge["type"] = relation ? "semantic" : "link";
        if (relation) {
          const ontoType = classifyRelation(
            isOntologyInline ? `@${relation}` : relation,
            settings.ontology
          );
          if (ontoType) edgeType = ontoType;
        }

        edges.push({
          id: edgeId,
          source: file.path,
          target: targetFile.path,
          type: edgeType,
          relation,
        });
      }
    }

    // Frontmatter links not captured by cache.links (array properties etc.)
    for (const [targetPath, relation] of fmRelations) {
      if (!nodeMap.has(targetPath)) continue;
      const edgeId = `${file.path}->${targetPath}`;
      if (edgeSet.has(edgeId)) continue;
      edgeSet.add(edgeId);

      const ontoType = classifyRelation(relation, settings.ontology);

      edges.push({
        id: edgeId,
        source: file.path,
        target: targetPath,
        type: ontoType ?? "semantic",
        relation,
      });
    }
  }

  // Build edges from shared metadata values
  // Cap per-group to avoid O(N²) explosion (e.g. 50 nodes sharing a tag → 1,225 edges)
  const SHARED_EDGE_CAP = 1500;
  let sharedEdgeCount = 0;

  for (const field of settings.edgeFields) {
    if (sharedEdgeCount >= SHARED_EDGE_CAP) break;

    const valueToNodes = new Map<string, string[]>();

    for (const node of nodes) {
      const cache = app.metadataCache.getFileCache(
        app.vault.getAbstractFileByPath(node.id) as TFile
      );
      const frontmatter = cache?.frontmatter;
      if (!frontmatter?.[field]) continue;

      const values = Array.isArray(frontmatter[field])
        ? frontmatter[field]
        : [frontmatter[field]];

      for (const val of values) {
        const key = `${field}:${String(val)}`;
        if (!valueToNodes.has(key)) valueToNodes.set(key, []);
        valueToNodes.get(key)!.push(node.id);
      }
    }

    // Sort by group size ascending so smaller (more meaningful) groups are kept first
    const groups = [...valueToNodes.values()]
      .filter(ids => ids.length >= 2 && ids.length <= 50)
      .sort((a, b) => a.length - b.length);

    for (const nodeIds of groups) {
      if (sharedEdgeCount >= SHARED_EDGE_CAP) break;
      for (let i = 0; i < nodeIds.length; i++) {
        if (sharedEdgeCount >= SHARED_EDGE_CAP) break;
        for (let j = i + 1; j < nodeIds.length; j++) {
          if (sharedEdgeCount >= SHARED_EDGE_CAP) break;
          const edgeId = `${field}:${nodeIds[i]}->${nodeIds[j]}`;
          if (edgeSet.has(edgeId)) continue;
          edgeSet.add(edgeId);

          edges.push({
            id: edgeId,
            source: nodeIds[i],
            target: nodeIds[j],
            type: field === "tags" ? "tag" : "category",
            label: field,
          });
          sharedEdgeCount++;
        }
      }
    }
  }

  // Build tag virtual nodes + tag hierarchy edges + note-to-tag edges
  const tagResult = buildTagNodesAndEdges(nodes, nodeMap, edgeSet, settings);
  nodes.push(...tagResult.nodes);
  for (const tn of tagResult.nodes) nodeMap.set(tn.id, tn);
  edges.push(...tagResult.edges);

  return { nodes, edges };
}

/**
 * Build virtual tag nodes, tag-to-tag inheritance edges (from nested tags),
 * and note-to-tag (has-tag) edges.
 *
 * Tag nodes get id "tag:<tagName>" and isTag=true.
 * Nested tags like "entity/character" produce:
 *   tag:entity/character  ──inheritance──→  tag:entity
 * Notes produce:
 *   note.md  ──has-tag──→  tag:entity
 */
function buildTagNodesAndEdges(
  fileNodes: GraphNode[],
  nodeMap: Map<string, GraphNode>,
  edgeSet: Set<string>,
  settings: GraphViewsSettings
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Collect all unique tags across all file nodes
  const allTags = new Set<string>();
  for (const node of fileNodes) {
    if (!node.tags) continue;
    for (const tag of node.tags) {
      allTags.add(tag);
      // Also add ancestor tags for hierarchy completeness
      // e.g. "a/b/c" → also ensure "a/b" and "a" exist
      const parts = tag.split("/");
      for (let i = 1; i < parts.length; i++) {
        allTags.add(parts.slice(0, i).join("/"));
      }
    }
  }

  // Create virtual tag nodes
  for (const tag of allTags) {
    const tagId = `tag:${tag}`;
    if (nodeMap.has(tagId)) continue;
    const tagNode: GraphNode = {
      id: tagId,
      label: `#${tag}`,
      x: Math.random() * 800 - 400,
      y: Math.random() * 600 - 300,
      vx: 0,
      vy: 0,
      isTag: true,
      tags: [tag],
    };
    nodes.push(tagNode);
    nodeMap.set(tagId, tagNode);
  }

  // Tag-to-tag inheritance from nested hierarchy (B方式)
  if (settings.ontology.useTagHierarchy) {
    for (const tag of allTags) {
      const slashIdx = tag.lastIndexOf("/");
      if (slashIdx === -1) continue;
      const parentTag = tag.substring(0, slashIdx);
      if (!allTags.has(parentTag)) continue;

      const edgeId = `tag-hierarchy:tag:${tag}->tag:${parentTag}`;
      if (edgeSet.has(edgeId)) continue;
      edgeSet.add(edgeId);

      edges.push({
        id: edgeId,
        source: `tag:${tag}`,
        target: `tag:${parentTag}`,
        type: "inheritance",
        relation: `#${tag} extends #${parentTag}`,
      });
    }
  }

  // Note-to-tag edges (has-tag)
  for (const node of fileNodes) {
    if (!node.tags) continue;
    for (const tag of node.tags) {
      const tagId = `tag:${tag}`;
      const edgeId = `has-tag:${node.id}->${tagId}`;
      if (edgeSet.has(edgeId)) continue;
      edgeSet.add(edgeId);

      edges.push({
        id: edgeId,
        source: node.id,
        target: tagId,
        type: "has-tag",
      });
    }
  }

  return { nodes, edges };
}

export function buildSunburstData(
  app: App,
  groupField: string
): SunburstData {
  const files = app.vault.getMarkdownFiles();
  const groups = new Map<string, SunburstData[]>();

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    const group = (frontmatter?.[groupField] as string) ?? "Uncategorized";

    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push({
      name: file.basename,
      value: 1,
      filePath: file.path,
    });
  }

  const children: SunburstData[] = [];
  for (const [name, items] of groups) {
    children.push({ name, children: items });
  }

  return { name: "Vault", children };
}

/**
 * Build a unified color map for categories and tags.
 * Keys: category names and "tag:<tagName>" for tag-based coloring.
 * Tag nodes (isTag) are colored by their tag name.
 * File nodes are colored by category first, then by first tag.
 */
export function assignNodeColors(
  nodes: GraphNode[],
  colorField: string
): Map<string, string> {
  const colorMap = new Map<string, string>();
  const categories = new Set<string>();
  const tags = new Set<string>();

  for (const node of nodes) {
    if (node.category) categories.add(node.category);
    if (node.tags) {
      for (const t of node.tags) tags.add(t);
    }
  }

  let i = 0;
  // Assign colors to categories first
  for (const cat of [...categories].sort()) {
    colorMap.set(cat, DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
    i++;
  }
  // Assign colors to tags (prefixed to avoid collision with category names)
  for (const tag of [...tags].sort()) {
    const key = `tag:${tag}`;
    if (!colorMap.has(key)) {
      colorMap.set(key, DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
      i++;
    }
  }

  return colorMap;
}

interface InlineFieldResult {
  relation: string;
  isOntology: boolean;
}

/**
 * Parse inline Dataview fields like `Author::[[Jesus]]` and
 * ontology fields like `@Parent::[[Entity]]` from file content.
 */
function parseInlineFields(
  content: string,
  sourcePath: string,
  app: App
): Map<string, InlineFieldResult> {
  const result = new Map<string, InlineFieldResult>();
  const fieldRe = /^(@?[\w][\w\s-]*)::\s*(.+)$/gm;
  const linkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;

  while ((m = fieldRe.exec(content)) !== null) {
    const rawName = m[1].trim();
    const isOntology = rawName.startsWith("@");
    const relation = isOntology ? rawName.slice(1).trim() : rawName;
    const value = m[2];
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(value)) !== null) {
      const targetFile = app.metadataCache.getFirstLinkpathDest(
        lm[1],
        sourcePath
      );
      if (targetFile) {
        result.set(targetFile.path, { relation, isOntology });
      }
    }
  }
  return result;
}

/**
 * Build a deterministic color map for relation names.
 * Same relation always gets the same color.
 */
export function buildRelationColorMap(edges: GraphEdge[]): Map<string, string> {
  const relations = new Set<string>();
  for (const e of edges) {
    if (e.relation) relations.add(e.relation);
  }
  const colorMap = new Map<string, string>();
  let i = 0;
  for (const rel of [...relations].sort()) {
    colorMap.set(rel, DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
    i++;
  }
  return colorMap;
}

function extractTags(
  frontmatter: Record<string, unknown> | undefined,
  cache: ReturnType<App["metadataCache"]["getFileCache"]>
): string[] {
  const tags: string[] = [];

  if (frontmatter?.tags) {
    const fm = frontmatter.tags;
    if (Array.isArray(fm)) {
      tags.push(...fm.map(String));
    } else if (typeof fm === "string") {
      tags.push(...fm.split(",").map((t) => t.trim()));
    }
  }

  if (cache?.tags) {
    for (const t of cache.tags) {
      const tag = t.tag.replace(/^#/, "");
      if (!tags.includes(tag)) tags.push(tag);
    }
  }

  return tags;
}
