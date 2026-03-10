import type { App } from "obsidian";
import type { GraphNode } from "../types";

/**
 * Check if the Dataview plugin is installed and its API is available.
 */
export function isDataviewAvailable(app: App): boolean {
  const dv = (app as any).plugins?.plugins?.["dataview"];
  return !!(dv?.api);
}

/**
 * Get the Dataview API instance, or null if unavailable.
 */
function getDataviewApi(app: App): any | null {
  const dv = (app as any).plugins?.plugins?.["dataview"];
  return dv?.api ?? null;
}

/**
 * Execute a Dataview DQL source query and return matching file paths.
 *
 * Uses the Dataview API's `dv.pages(source)` under the hood.
 * The `source` parameter accepts DQL source expressions such as:
 *   - `"folder"`   — files in a folder
 *   - `#tag`       — files with a tag
 *   - `#tag AND "folder"` — combined filters
 *
 * @param app   Obsidian App instance
 * @param query DQL source string
 * @returns Set of vault-relative file paths that match the query, or empty set on error
 */
export function queryDataviewPages(app: App, query: string): Set<string> {
  const api = getDataviewApi(app);
  if (!api) return new Set();

  try {
    // dv.pages(source) returns a DataArray of page objects with a .file.path property
    const pages = api.pages(query);
    const paths = new Set<string>();
    if (pages && typeof pages.forEach === "function") {
      pages.forEach((page: any) => {
        const p = page?.file?.path;
        if (typeof p === "string") paths.add(p);
      });
    }
    return paths;
  } catch {
    // On any error (invalid query, etc.), return empty set — caller shows all nodes
    return new Set();
  }
}

/**
 * Filter graph nodes by a set of matching file paths (from a Dataview query).
 *
 * - Nodes whose `id` (which equals file path) is in `matchingPaths` are kept.
 * - Tag nodes (`isTag === true`) are always kept when `keepTagNodes` is true,
 *   since they don't correspond to files.
 *
 * @param nodes         Array of graph nodes to filter
 * @param matchingPaths Set of file paths returned by queryDataviewPages
 * @param keepTagNodes  Whether to preserve virtual tag nodes regardless of query
 * @returns Filtered array of nodes
 */
export function filterNodesByDataview(
  nodes: GraphNode[],
  matchingPaths: Set<string>,
  keepTagNodes: boolean,
): GraphNode[] {
  return nodes.filter((n) => {
    if (keepTagNodes && n.isTag) return true;
    return matchingPaths.has(n.id);
  });
}
