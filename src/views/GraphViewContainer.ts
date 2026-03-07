import { ItemView, WorkspaceLeaf } from "obsidian";
import * as d3 from "d3";
import type NovelGraphViewsPlugin from "../main";
import type { GraphData, GraphNode, LayoutType } from "../types";
import { DEFAULT_COLORS } from "../types";
import { buildGraphFromVault, assignNodeColors, buildSunburstData } from "../parsers/metadata-parser";
import { applyForceDirectedLayout } from "../layouts/force";
import { applyConcentricLayout } from "../layouts/concentric";
import { applyTreeLayout } from "../layouts/tree";
import { applyArcLayout } from "../layouts/arc";
import { computeSunburstArcs } from "../layouts/sunburst";

export const VIEW_TYPE_NOVEL_GRAPH = "novel-graph-view";

export class GraphViewContainer extends ItemView {
  plugin: NovelGraphViewsPlugin;
  private currentLayout: LayoutType;
  private graphData: GraphData | null = null;
  private svgEl: SVGSVGElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: NovelGraphViewsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentLayout = plugin.settings.defaultLayout;
  }

  getViewType(): string {
    return VIEW_TYPE_NOVEL_GRAPH;
  }

  getDisplayText(): string {
    return "Novel Graph Views";
  }

  getIcon(): string {
    return "git-fork";
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("novel-graph-container");

    // Toolbar
    const toolbar = container.createDiv({ cls: "novel-graph-toolbar" });
    const layouts: { type: LayoutType; label: string }[] = [
      { type: "force", label: "Force" },
      { type: "concentric", label: "Concentric" },
      { type: "tree", label: "Tree" },
      { type: "arc", label: "Arc" },
      { type: "sunburst", label: "Sunburst" },
    ];

    for (const layout of layouts) {
      const btn = toolbar.createEl("button", { text: layout.label });
      if (layout.type === this.currentLayout) btn.addClass("is-active");
      btn.addEventListener("click", () => {
        this.currentLayout = layout.type;
        toolbar.querySelectorAll("button").forEach((b) => b.removeClass("is-active"));
        btn.addClass("is-active");
        this.renderGraph();
      });
    }

    // Refresh button
    const refreshBtn = toolbar.createEl("button", { text: "Refresh" });
    refreshBtn.addEventListener("click", () => {
      this.graphData = null;
      this.renderGraph();
    });

    // SVG container
    const svgContainer = container.createDiv();
    svgContainer.style.width = "100%";
    svgContainer.style.height = "calc(100% - 32px)";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svgContainer.appendChild(svg);
    this.svgEl = svg;

    this.renderGraph();
  }

  async onClose() {
    this.svgEl = null;
  }

  private renderGraph() {
    if (!this.svgEl) return;

    const svg = d3.select(this.svgEl);
    svg.selectAll("*").remove();

    const rect = this.svgEl.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 400;
    const centerX = width / 2;
    const centerY = height / 2;

    // Build graph data if not cached
    if (!this.graphData) {
      this.graphData = buildGraphFromVault(this.app, this.plugin.settings);
    }

    if (this.currentLayout === "sunburst") {
      this.renderSunburst(svg, width, height);
      return;
    }

    // Apply layout
    let layoutData: GraphData;
    switch (this.currentLayout) {
      case "concentric":
        layoutData = applyConcentricLayout(this.graphData, { centerX, centerY });
        break;
      case "tree":
        layoutData = applyTreeLayout(this.graphData, { startX: centerX, startY: 40 });
        break;
      case "arc":
        layoutData = applyArcLayout(this.graphData, {
          centerX,
          centerY,
          radius: Math.min(width, height) * 0.4,
        });
        break;
      case "force":
      default:
        layoutData = applyForceDirectedLayout(this.graphData, {
          centerX,
          centerY,
          gravity: 0.02,
        });
        break;
    }

    const colorMap = assignNodeColors(layoutData.nodes, this.plugin.settings.colorField);
    const nodeMap = new Map(layoutData.nodes.map((n) => [n.id, n]));

    // Zoom group
    const g = svg.append("g");
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Draw edges
    const edgeGroup = g.append("g").attr("class", "edges");
    for (const edge of layoutData.edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      if (this.currentLayout === "arc") {
        // Arc edges: curved paths
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curvature = dist * 0.3;
        const cx = midX - (dy / dist) * curvature;
        const cy = midY + (dx / dist) * curvature;

        edgeGroup
          .append("path")
          .attr("class", "novel-graph-edge")
          .attr("d", `M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`);
      } else {
        edgeGroup
          .append("line")
          .attr("class", "novel-graph-edge")
          .attr("x1", source.x)
          .attr("y1", source.y)
          .attr("x2", target.x)
          .attr("y2", target.y);
      }
    }

    // Draw nodes
    const nodeSize = this.plugin.settings.nodeSize;
    const showLabels = this.plugin.settings.showLabels;
    const nodeGroup = g.append("g").attr("class", "nodes");

    for (const node of layoutData.nodes) {
      const color = node.category
        ? colorMap.get(node.category) || DEFAULT_COLORS[0]
        : DEFAULT_COLORS[0];

      const ng = nodeGroup
        .append("g")
        .attr("class", "novel-graph-node")
        .attr("transform", `translate(${node.x},${node.y})`)
        .style("cursor", "pointer")
        .on("click", () => {
          if (node.filePath) {
            this.app.workspace.openLinkText(node.filePath, "", false);
          }
        });

      ng.append("circle").attr("r", nodeSize).attr("fill", color);

      if (showLabels) {
        ng.append("text")
          .attr("dx", nodeSize + 3)
          .attr("dy", 4)
          .text(node.label);
      }
    }
  }

  private renderSunburst(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    width: number,
    height: number
  ) {
    const root = buildSunburstData(this.app, this.plugin.settings.groupField);
    const arcs = computeSunburstArcs(root, width, height);
    const cx = width / 2;
    const cy = height / 2;

    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on("zoom", (event) => {
        g.attr("transform", `translate(${cx},${cy}) ${event.transform}`);
      });
    svg.call(zoom);

    const arcGen = d3.arc<{ x0: number; x1: number; y0: number; y1: number }>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1);

    for (let i = 0; i < arcs.length; i++) {
      const arc = arcs[i];
      if (arc.depth === 0) continue; // Skip root

      const color = DEFAULT_COLORS[i % DEFAULT_COLORS.length];

      g.append("path")
        .attr("d", arcGen(arc))
        .attr("fill", color)
        .attr("stroke", "var(--background-primary)")
        .attr("stroke-width", 1)
        .style("cursor", arc.filePath ? "pointer" : "default")
        .on("click", () => {
          if (arc.filePath) {
            this.app.workspace.openLinkText(arc.filePath, "", false);
          }
        })
        .append("title")
        .text(`${arc.name} (${arc.value})`);
    }
  }
}
