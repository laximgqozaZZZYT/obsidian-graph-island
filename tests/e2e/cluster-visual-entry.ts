/**
 * E2E visual test entry point — FULL d3-force simulation pipeline.
 *
 * This replicates the EXACT force setup from GraphViewContainer.ts:
 *   1. forceSimulation with charge(-10), velocityDecay(0.55), alphaDecay(0.08)
 *   2. center/link forces removed (null)
 *   3. clusterArrangement force registered last
 *   4. sim.alpha(0.5).restart() then ticked to completion
 *
 * Previous version called buildClusterForce directly (bypassing d3),
 * which is why it passed while Obsidian didn't work.
 */
import { forceSimulation, forceManyBody, type Simulation } from "d3-force";
import { buildClusterForce, type ClusterForceConfig } from "../../src/layouts/cluster-force";
import type { GraphNode, GraphEdge } from "../../src/types";

// ---------------------------------------------------------------------------
// Test data generation
// ---------------------------------------------------------------------------

const TAGS = ["character", "location", "event", "item", "concept"];
const CANVAS_W = 1200;
const CANVAS_H = 800;

function generateTestNodes(count: number): { nodes: GraphNode[]; edges: GraphEdge[]; degrees: Map<string, number> } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const degrees = new Map<string, number>();

  for (let i = 0; i < count; i++) {
    const tag = TAGS[i % TAGS.length];
    nodes.push({
      id: `n${i}`,
      label: `Node ${i}`,
      x: CANVAS_W / 2 + (Math.random() - 0.5) * CANVAS_W * 0.6,
      y: CANVAS_H / 2 + (Math.random() - 0.5) * CANVAS_H * 0.6,
      vx: 0,
      vy: 0,
      tags: [tag],
      category: tag,
      isTag: false,
    });
    degrees.set(`n${i}`, Math.max(0, Math.floor(20 * Math.pow(Math.random(), 2))));
  }

  // Create edges within same tag group
  for (let i = 0; i < count; i++) {
    const tag = TAGS[i % TAGS.length];
    const connections = 1 + Math.floor(Math.random() * 3);
    for (let c = 0; c < connections; c++) {
      const targetIdx = (i + TAGS.length * (1 + Math.floor(Math.random() * 5))) % count;
      if (targetIdx !== i && TAGS[targetIdx % TAGS.length] === tag) {
        edges.push({
          id: `e${i}-${targetIdx}`,
          source: `n${i}`,
          target: `n${targetIdx}`,
        });
        degrees.set(`n${i}`, (degrees.get(`n${i}`) || 0) + 1);
        degrees.set(`n${targetIdx}`, (degrees.get(`n${targetIdx}`) || 0) + 1);
      }
    }
  }

  return { nodes, edges, degrees };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const TAG_COLORS: Record<string, string> = {
  character: "#ef4444",
  location: "#22c55e",
  event: "#3b82f6",
  item: "#f59e0b",
  concept: "#a855f7",
};

function renderOnCanvas(
  canvas: HTMLCanvasElement,
  nodes: GraphNode[],
  title: string,
) {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw nodes
  for (const n of nodes) {
    const tag = n.tags?.[0] || "concept";
    const color = TAG_COLORS[tag] || "#888";
    ctx.beginPath();
    ctx.arc(n.x, n.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Draw title
  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(title, 20, 40);

  // Draw legend
  let ly = 70;
  for (const [tag, color] of Object.entries(TAG_COLORS)) {
    ctx.fillStyle = color;
    ctx.fillRect(20, ly - 10, 12, 12);
    ctx.fillStyle = "#cccccc";
    ctx.font = "14px sans-serif";
    ctx.fillText(tag, 38, ly);
    ly += 20;
  }

  // Draw group bounding circles
  const groupNodes = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const tag = n.tags?.[0] || "concept";
    if (!groupNodes.has(tag)) groupNodes.set(tag, []);
    groupNodes.get(tag)!.push(n);
  }
  for (const [tag, members] of groupNodes) {
    if (members.length < 2) continue;
    const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
    const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
    let maxR = 0;
    for (const n of members) {
      const d = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);
      if (d > maxR) maxR = d;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, maxR + 10, 0, Math.PI * 2);
    ctx.strokeStyle = (TAG_COLORS[tag] || "#888") + "40";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = (TAG_COLORS[tag] || "#888") + "aa";
    ctx.font = "12px sans-serif";
    ctx.fillText(tag, cx - 20, cy - maxR - 5);
  }
}

// ---------------------------------------------------------------------------
// Main — replicates GraphViewContainer.ts force pipeline exactly
// ---------------------------------------------------------------------------

function main() {
  const params = new URLSearchParams(window.location.search);
  const arrangement = params.get("arrangement") || "spiral";
  const nodeCount = parseInt(params.get("nodes") || "200", 10);

  document.title = `Cluster: ${arrangement}`;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.id = "main-canvas";
  document.body.style.margin = "0";
  document.body.style.background = "#111";
  document.body.appendChild(canvas);

  // Seed random for reproducibility
  let seed = 42;
  const origRandom = Math.random;
  Math.random = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  };

  const { nodes, edges, degrees } = generateTestNodes(nodeCount);

  // Restore real random
  Math.random = origRandom;

  // =========================================================================
  // FULL D3 SIMULATION — matching GraphViewContainer.ts exactly
  // =========================================================================

  const cfg: ClusterForceConfig = {
    groupBy: "tag",
    arrangement: arrangement as any,
    strength: 0.5,
    gridCols: 5,
    centerX: CANVAS_W / 2,
    centerY: CANVAS_H / 2,
    width: CANVAS_W,
    height: CANVAS_H,
  };

  // Step 1: Create simulation with SAME parameters as GraphViewContainer
  const sim: Simulation<GraphNode, GraphEdge> = forceSimulation(nodes)
    .alphaDecay(0.08)
    .velocityDecay(0.55)
    .stop(); // Don't auto-start

  // Step 2: Apply cluster force setup (same as applyClusterForce active branch)
  // Charge: minimal repulsion (-10) to prevent exact overlaps
  sim.force("charge", forceManyBody<GraphNode>().strength(-10));
  // Center: removed
  sim.force("center", null);
  // Link: removed
  sim.force("link", null);

  // Step 3: Build and register cluster force LAST (same order as GVC)
  const forceFn = buildClusterForce(nodes, edges, degrees, cfg);
  if (!forceFn) {
    renderOnCanvas(canvas, nodes, `${arrangement} — NO FORCE (free/none)`);
    return;
  }
  sim.force("clusterArrangement", forceFn as any);

  // Step 4: Restart with alpha=0.5 (same as restartSimulation call)
  sim.alpha(0.5);

  // Step 5: Run simulation ticks (enough for full convergence)
  for (let i = 0; i < 300; i++) {
    sim.tick();
  }

  renderOnCanvas(canvas, nodes, `${arrangement} (${nodeCount} nodes, d3 pipeline)`);

  // Expose data for Playwright assertions
  (window as any).__clusterData = {
    arrangement,
    nodeCount,
    nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, tag: n.tags?.[0] })),
    groupCentroids: computeGroupCentroids(nodes),
  };
}

function computeGroupCentroids(nodes: GraphNode[]): Record<string, { x: number; y: number; count: number }> {
  const groups: Record<string, { sx: number; sy: number; count: number }> = {};
  for (const n of nodes) {
    const tag = n.tags?.[0] || "other";
    if (!groups[tag]) groups[tag] = { sx: 0, sy: 0, count: 0 };
    groups[tag].sx += n.x;
    groups[tag].sy += n.y;
    groups[tag].count++;
  }
  const result: Record<string, { x: number; y: number; count: number }> = {};
  for (const [tag, g] of Object.entries(groups)) {
    result[tag] = { x: g.sx / g.count, y: g.sy / g.count, count: g.count };
  }
  return result;
}

main();
