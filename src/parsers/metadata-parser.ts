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
): "inheritance" | "aggregation" | undefined {
  const clean = name.startsWith("@") ? name.slice(1).trim() : name.trim();
  const lower = clean.toLowerCase();

  if (onto.inheritanceFields.some(f => f.toLowerCase() === lower)) return "inheritance";
  if (onto.aggregationFields.some(f => f.toLowerCase() === lower)) return "aggregation";
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

  // Create nodes from files
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;

    const node: GraphNode = {
      id: file.path,
      label: file.basename,
      x: Math.random() * 800 - 400,
      y: Math.random() * 600 - 300,
      vx: 0,
      vy: 0,
      category: frontmatter?.[settings.colorField] as string | undefined,
      tags: extractTags(frontmatter, cache),
      filePath: file.path,
    };
    nodes.push(node);
    nodeMap.set(file.path, node);
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
  for (const field of settings.edgeFields) {
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

    for (const [, nodeIds] of valueToNodes) {
      if (nodeIds.length < 2 || nodeIds.length > 50) continue;
      for (let i = 0; i < nodeIds.length; i++) {
        for (let j = i + 1; j < nodeIds.length; j++) {
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
        }
      }
    }
  }

  // Build inheritance edges from nested tag hierarchy
  if (settings.ontology.useTagHierarchy) {
    const tagEdges = buildTagHierarchyEdges(nodes, edgeSet);
    edges.push(...tagEdges);
  }

  return { nodes, edges };
}

/**
 * Build inheritance edges from nested tags.
 * e.g. nodes tagged #entity/character inherit from nodes tagged #entity.
 */
function buildTagHierarchyEdges(
  nodes: GraphNode[],
  edgeSet: Set<string>
): GraphEdge[] {
  const edges: GraphEdge[] = [];

  const tagToNodes = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.tags) continue;
    for (const tag of node.tags) {
      if (!tagToNodes.has(tag)) tagToNodes.set(tag, []);
      tagToNodes.get(tag)!.push(node.id);
    }
  }

  for (const [tag] of tagToNodes) {
    const slashIdx = tag.lastIndexOf("/");
    if (slashIdx === -1) continue;
    const parentTag = tag.substring(0, slashIdx);
    if (!tagToNodes.has(parentTag)) continue;

    const childNodes = tagToNodes.get(tag)!;
    const parentNodes = tagToNodes.get(parentTag)!;

    for (const childId of childNodes) {
      for (const parentId of parentNodes) {
        if (childId === parentId) continue;
        const edgeId = `tag-inherit:${childId}->${parentId}`;
        if (edgeSet.has(edgeId)) continue;
        edgeSet.add(edgeId);

        edges.push({
          id: edgeId,
          source: childId,
          target: parentId,
          type: "inheritance",
          relation: `${tag} extends ${parentTag}`,
        });
      }
    }
  }

  return edges;
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

export function assignNodeColors(
  nodes: GraphNode[],
  colorField: string
): Map<string, string> {
  const colorMap = new Map<string, string>();
  const categories = new Set<string>();

  for (const node of nodes) {
    if (node.category) categories.add(node.category);
  }

  let i = 0;
  for (const cat of categories) {
    colorMap.set(cat, DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
    i++;
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
