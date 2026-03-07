import { App, TFile } from "obsidian";
import type { GraphData, GraphNode, GraphEdge, NovelGraphViewsSettings, SunburstData } from "../types";
import { DEFAULT_COLORS } from "../types";

export function buildGraphFromVault(
  app: App,
  settings: NovelGraphViewsSettings
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

  // Build edges from internal links
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache?.links) continue;

    for (const link of cache.links) {
      const targetFile = app.metadataCache.getFirstLinkpathDest(
        link.link,
        file.path
      );
      if (!targetFile || !nodeMap.has(targetFile.path)) continue;

      const edgeId = `${file.path}->${targetFile.path}`;
      if (edgeSet.has(edgeId)) continue;
      edgeSet.add(edgeId);

      edges.push({
        id: edgeId,
        source: file.path,
        target: targetFile.path,
        type: "link",
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
      if (nodeIds.length < 2) continue;
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
