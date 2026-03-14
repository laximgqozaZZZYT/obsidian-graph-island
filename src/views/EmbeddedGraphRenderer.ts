// ---------------------------------------------------------------------------
// EmbeddedGraphRenderer — lightweight static mini-graph for note embedding
// Renders a ``​`graph-island` code block as a Canvas 2D graph snapshot.
// ---------------------------------------------------------------------------
import type { App } from "obsidian";
import type { GraphViewsSettings, GraphNode, GraphEdge, GraphData } from "../types";
import { DEFAULT_COLORS } from "../types";
import { buildGraphFromVault, assignNodeColors } from "../parsers/metadata-parser";

interface EmbedConfig {
  center?: string;   // file path for local graph center
  hops?: number;     // BFS hop depth (default 2)
  height?: number;   // container height in px (default 300)
  layout?: string;   // "concentric" | "grid" (default "concentric")
}

function parseConfig(source: string): EmbedConfig {
  try {
    return JSON.parse(source);
  } catch {
    return {};
  }
}

/** BFS N-hop filter from a center node */
function filterLocalGraph(data: GraphData, centerPath: string, hops: number): GraphData {
  const centerId = data.nodes.find(n => n.filePath === centerPath || n.id === centerPath)?.id;
  if (!centerId) return { nodes: [], edges: [] };

  const adj = new Map<string, Set<string>>();
  for (const e of data.edges) {
    const s = typeof e.source === "object" ? (e.source as any).id : e.source;
    const t = typeof e.target === "object" ? (e.target as any).id : e.target;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  }

  const reachable = new Set<string>([centerId]);
  let frontier = [centerId];
  for (let h = 0; h < hops && frontier.length > 0; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      const nb = adj.get(id);
      if (nb) for (const n of nb) {
        if (!reachable.has(n)) { reachable.add(n); next.push(n); }
      }
    }
    frontier = next;
  }

  const nodes = data.nodes.filter(n => reachable.has(n.id));
  const edges = data.edges.filter(e => {
    const s = typeof e.source === "object" ? (e.source as any).id : e.source;
    const t = typeof e.target === "object" ? (e.target as any).id : e.target;
    return reachable.has(s) && reachable.has(t);
  });
  return { nodes, edges };
}

/** Simple concentric layout — center node in middle, others in rings */
function layoutConcentric(nodes: GraphNode[], centerPath?: string): void {
  if (nodes.length === 0) return;
  const centerIdx = centerPath
    ? nodes.findIndex(n => n.filePath === centerPath || n.id === centerPath)
    : 0;
  const center = centerIdx >= 0 ? centerIdx : 0;

  // Put center node at origin
  nodes[center].x = 0;
  nodes[center].y = 0;

  // Remaining nodes in concentric rings
  const others = nodes.filter((_, i) => i !== center);
  const ringCapacity = 8;
  let ring = 0;
  let idx = 0;
  const radiusStep = 80;

  for (const n of others) {
    const cap = ringCapacity * (ring + 1);
    const angle = (2 * Math.PI * (idx % cap)) / cap;
    const r = radiusStep * (ring + 1);
    n.x = Math.cos(angle) * r;
    n.y = Math.sin(angle) * r;
    idx++;
    if (idx >= cap) { ring++; idx = 0; }
  }
}

/** Get a CSS color from DEFAULT_COLORS by index */
function getColor(i: number): string {
  return DEFAULT_COLORS[i % DEFAULT_COLORS.length];
}

/** Render the embedded graph into a container element */
export function renderEmbeddedGraph(
  el: HTMLElement,
  source: string,
  app: App,
  settings: GraphViewsSettings,
): void {
  const config = parseConfig(source);
  const height = config.height ?? 300;

  // Create container with reserved height (prevent CLS)
  const container = el.createDiv({ cls: "gi-embed" });
  container.style.height = `${height}px`;
  container.style.position = "relative";
  container.style.cursor = "pointer";

  // Lazy render with IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.disconnect();
        doRender(container, config, app, settings);
      }
    }
  }, { threshold: 0.1 });
  observer.observe(container);
}

function doRender(
  container: HTMLElement,
  config: EmbedConfig,
  app: App,
  settings: GraphViewsSettings,
): void {
  const height = config.height ?? 300;
  const width = container.clientWidth || 400;

  // Build graph data
  let data = buildGraphFromVault(app, settings);

  // Filter out tag nodes and has-tag edges for cleaner embed
  data = {
    nodes: data.nodes.filter(n => !n.isTag),
    edges: data.edges.filter(e => e.type !== "has-tag"),
  };

  // Apply local graph filter if center is specified
  if (config.center) {
    data = filterLocalGraph(data, config.center, config.hops ?? 2);
  }

  if (data.nodes.length === 0) {
    container.createDiv({ cls: "gi-embed-empty", text: "No nodes found" });
    return;
  }

  // Layout
  layoutConcentric(data.nodes, config.center);

  // Assign colors
  const colorMap = assignNodeColors(data.nodes, settings.colorField);

  // Create canvas
  const canvas = document.createElement("canvas");
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  // Compute bounding box and fit to canvas
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of data.nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const pad = 40;
  const dataW = (maxX - minX) || 1;
  const dataH = (maxY - minY) || 1;
  const scale = Math.min((width - 2 * pad) / dataW, (height - 2 * pad) / dataH);
  const offsetX = width / 2 - ((minX + maxX) / 2) * scale;
  const offsetY = height / 2 - ((minY + maxY) / 2) * scale;

  const tx = (x: number) => x * scale + offsetX;
  const ty = (y: number) => y * scale + offsetY;

  // Draw edges
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(128, 128, 128, 0.3)";
  for (const e of data.edges) {
    const src = data.nodes.find(n => n.id === e.source);
    const tgt = data.nodes.find(n => n.id === e.target);
    if (!src || !tgt) continue;
    ctx.beginPath();
    ctx.moveTo(tx(src.x), ty(src.y));
    ctx.lineTo(tx(tgt.x), ty(tgt.y));
    ctx.stroke();
  }

  // Build node lookup for edge positions
  const nodeById = new Map(data.nodes.map(n => [n.id, n]));

  // Draw nodes
  const nodeRadius = Math.max(3, Math.min(8, 200 / Math.sqrt(data.nodes.length)));
  const categoryColors = new Map<string, string>();
  let colorIdx = 0;

  for (const n of data.nodes) {
    const cat = n.category ?? "default";
    if (!categoryColors.has(cat)) {
      categoryColors.set(cat, getColor(colorIdx++));
    }
    const color = categoryColors.get(cat)!;

    ctx.beginPath();
    ctx.arc(tx(n.x), ty(n.y), nodeRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Center node gets a ring
    if (n.filePath === config.center || n.id === config.center) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }

  // Draw labels for small graphs
  if (data.nodes.length <= 30) {
    ctx.font = `${Math.max(9, 11 - data.nodes.length / 10)}px sans-serif`;
    ctx.fillStyle = getComputedStyle(document.body).color || "#ccc";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const n of data.nodes) {
      ctx.fillText(n.label, tx(n.x), ty(n.y) + nodeRadius + 2);
    }
  }

  // Click to open full graph view
  canvas.addEventListener("click", () => {
    app.workspace.trigger("graph-island:open-view");
  });
}
