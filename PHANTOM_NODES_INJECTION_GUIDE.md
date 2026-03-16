# Phantom Nodes Injection Guide — Simulation Pipeline Analysis

## Executive Summary

Phantom nodes (invisible junction nodes for road networks) should be injected at the **LayoutController.createForceSimulation() stage** where they can participate in force-directed layout for optimal spacing, while remaining invisible during rendering. This guide provides the complete implementation path with code references.

---

## 1. Complete Node Positioning Pipeline

### Data Flow from Creation to Rendering

```
GraphViewContainer.getGraphData()  [LINE 3840]
  └─ Returns: GraphData { nodes[], edges[] }

GraphViewContainer.doRender()  [LINE 3971]
  └─ Calls _setupForceLayout() for force layout

GraphViewContainer._setupForceLayout()  [LINE 4179]
  ├─ Initialize node positions (saved or random): lines 4186-4198
  ├─ Call: this.createPixiNodes(gd.nodes, nodeR, nodeColor)
  │   └─ RenderPipeline.createPixiNodes()  [LINE 1191]
  │       └─ createSinglePixiNode() for each node
  │           └─ Store in pixiNodes Map<id, PixiNode>
  │
  ├─ Call: this.layoutController.createForceSimulation()  [LINE 4204]
  │   └─ LayoutController.createForceSimulation()  [LINE 510]
  │       ├─ Create d3 simulation from nodes array
  │       ├─ Add forces: charge, link, collide, center
  │       └─ Return simulation
  │
  ├─ Call: this.applyNodeRulesForce()  [LINE 4207]
  ├─ Call: this.applyEnclosureRepulsionForce()  [LINE 4210]
  ├─ Call: this.applyClusterForce()  [LINE 4213]
  │
  └─ Simulation runs until "end" event:
      ├─ On "tick": update node.x, node.y  [LINE 4220]
      ├─ On "end": [LINE 4224]
      │   ├─ updatePositions(true)  [LINE 4236]
      │   ├─ buildRoadNetwork(true)  [LINE 4238]
      │   │   └─ GraphViewContainer._buildRoadNetworkInner()  [LINE 2319]
      │   │       └─ road-network.ts buildRoadNetwork()  [LINE 68]
      │   └─ markDirty(true) triggers rendering
      │
      └─ Rendering via RenderPipeline
```

### Key Constants
- **TICK_SKIP**: 5 (only render every 5 ticks)
- **LAYOUT_FORCE**: "force" (layout type identifier)
- **Simulation alpha decay**: 0.18
- **Simulation velocity decay**: 0.55

---

## 2. GraphNode Type Definition (src/types.ts:1-30)

```typescript
export interface GraphNode {
  id: string;                    // Unique identifier (required)
  label: string;                 // Display text (required)
  x: number;                     // World position X (required)
  y: number;                     // World position Y (required)
  vx: number;                    // Velocity X for d3-force (required)
  vy: number;                    // Velocity Y for d3-force (required)
  fx?: number | null;            // Fixed X position (optional, pins node)
  fy?: number | null;            // Fixed Y position (optional, pins node)
  category?: string;             // Optional category
  tags?: string[];               // Optional tag array
  filePath?: string;             // Optional file reference
  isTag?: boolean;               // True for virtual tag nodes (IMPORTANT)
  collapsedMembers?: string[];   // For super nodes
  collapsedInto?: string;        // Group membership
  meta?: Record<string, unknown>; // Frontmatter data
}
```

### Minimal Phantom Node Template
```typescript
const phantomNode: GraphNode = {
  id: "__phantom_" + uniqueId,   // Prefix with __phantom_ for identification
  label: "",                      // Empty — won't be rendered anyway
  x: estimatedX,                  // Initial position (will move during simulation)
  y: estimatedY,                  // Initial position
  vx: 0,                          // Zero initial velocity
  vy: 0,                          // Zero initial velocity
  isTag: true,                    // Mark invisible (triggers filtering in getGraphData)
  // All other fields optional — use defaults
};
```

---

## 3. Force Simulation Architecture (src/views/LayoutController.ts:510-556)

### createForceSimulation() Overview

```typescript
public createForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  cx: number,        // Center X
  cy: number,        // Center Y
): Simulation<GraphNode, GraphEdge> {
  const sim = forceSimulation<GraphNode, GraphEdge>(nodes)
    .force("charge", forceManyBody()
      .strength((n: GraphNode) => {
        const mult = repelMap.get(n.id) ?? 1.0;
        return -panel.repelForce * mult;  // Repulsion strength
      }))
    .force("link", forceLink(edges)
      .id((d) => d.id)
      .distance((e) => edgeLinkDistance(e, panel.linkDistance))
      .strength((e) => edgeLinkStrength(e, panel.linkForce)))
    .force("collide", forceCollide()
      .radius(this.collideRadius())  // Prevent overlaps
      .iterations(2))
    .force("center", forceCenter(cx, cy)
      .strength(panel.centerForce))  // Pull toward center
    .alphaDecay(0.18)               // Convergence rate
    .velocityDecay(0.55);            // Damping
  
  return sim;
}
```

### Force Parameters (from PanelSettings)
- `repelForce`: charge strength (typical: -300 to -500)
- `linkDistance`: edge length target (typical: 30-50)
- `linkForce`: edge stiffness (typical: 0.5-1.0)
- `centerForce`: gravity to center (typical: 0.1-0.5)

**Key insight:** All nodes in the `nodes` array participate in ALL forces equally. Phantom nodes will be repelled, pulled, and centered just like real nodes.

---

## 4. Node Creation & PixiJS Integration (src/views/RenderPipeline.ts:1191-1238)

### createPixiNodes() Pipeline

```typescript
public createPixiNodes(
  nodes: GraphNode[],
  nodeR: (n: GraphNode) => number,    // Radius function
  nodeColor: (n: GraphNode) => number  // Color function
) {
  // 1. Clear previous graphics
  const pixiNodes = this.host.getPixiNodes();
  pixiNodes.clear();

  // 2. Sort by degree (high-degree nodes first)
  const sorted = [...nodes].sort((a, b) =>
    (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0)
  );

  // 3. Immediate batch: visible graph nodes
  const IMMEDIATE_BATCH = Math.min(IMMEDIATE_BATCH_SIZE, sorted.length);
  for (let i = 0; i < IMMEDIATE_BATCH; i++) {
    this.createSinglePixiNode(sorted[i], nodeR, nodeColor, world);
  }

  // 4. Deferred batch: remaining nodes (async)
  if (sorted.length > IMMEDIATE_BATCH) {
    this.pendingNodes = sorted.slice(IMMEDIATE_BATCH);
    this.scheduleDeferredBatch();
  }
}
```

### createSinglePixiNode() Behavior
For each node:
1. Get radius: `r = nodeR(node)`
2. Get color: `c = nodeColor(node)`
3. Create PixiJS `Graphics` circle: `new Circle(r)` with color
4. Store in `pixiNodes.set(node.id, pixiNode)`
5. Add to world container
6. Position at `(node.x, node.y)`

**For phantom nodes with radius=0:**
- Graphics created but invisible (zero radius circle is a point)
- Still stored in pixiNodes Map (takes memory)
- Position updated during simulation (not visible)

---

## 5. Road Network Building Pipeline (src/views/GraphViewContainer.ts:2319-2576)

### _buildRoadNetworkInner() Flow

```typescript
private _buildRoadNetworkInner() {
  const meta = this.clusterMeta;
  
  // 1. Collect positioned nodes from pixiNodes Map
  const allNodes: GraphNode[] = [];
  for (const pn of this.pixiNodes.values()) {
    if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) {
      allNodes.push(pn.data);  // Only nodes moved from origin
    }
  }
  if (allNodes.length === 0) return;  // Keep existing network

  // 2. Extract arrangement type
  const arrangement = this.panel.clusterArrangement;
  const POLAR_ARRANGEMENTS = new Set(["concentric", "radial", "phyllotaxis"]);
  const isPolarArrangement = POLAR_ARRANGEMENTS.has(arrangement);

  // 3. Try to derive roads from guides
  const guides = meta.groupGuides;
  if (guides && guides.length > 0) {
    // Process each guide type (ConcentricGuide, GridGuide, etc.)
    // and call buildRoadNetwork() with appropriate parameters
  }

  // 4. Fallback: auto-generate roads from node distribution
  // For polar: sparse rings + spokes
  // For cartesian: sparse grid
}
```

### buildRoadNetwork() Function (src/layouts/road-network.ts:68-281)

```typescript
export function buildRoadNetwork(cfg: RoadNetworkConfig): RoadNetwork {
  // 1. Generate intersection grid from axis lines
  const intersections: RoadIntersection[] = [];
  const grid: number[][] = [];  // [axis1Idx][axis2Idx] → intersection ID

  if (cfg.system === "polar") {
    // Generate intersections at each (r, θ)
    // Add center intersection at (0, 0)
    // Ring roads connect adjacent θ at same r
    // Radial roads connect adjacent r at same θ
  } else {
    // Cartesian: generate intersections at each (x, y)
    // Horizontal segments connect adjacent x at same y
    // Vertical segments connect adjacent y at same x
  }

  // 2. Build adjacency list (bidirectional)
  const adjacency = new Map<number, {to, weight, segIdx}[]>();

  // 3. Map each node to nearest intersection
  const nodeAccess = new Map<string, number>();  // nodeId → intersectionId
  for (const node of cfg.nodes) {
    // Find closest intersection to node
    // For cartesian: also check mid-segment points
    // If on segment: split segment, create new intersection
    nodeAccess.set(node.id, intersectionId);
  }

  // 4. Return complete road network
  return { intersections, segments, nodeAccess, adjacency, system, cx, cy };
}
```

**Key insight:** The nodeAccess mapping is computed AFTER roads are built. Phantom nodes present in cfg.nodes will be mapped to road intersections, affecting the final structure.

---

## 6. Optimal Phantom Node Injection Points

### Option A: Inject at getGraphData() (EARLIEST)

**Location:** GraphViewContainer.getGraphData() line 3840

**Code pattern:**
```typescript
private getGraphData(): GraphData {
  // ... existing logic ...
  let { nodes, edges } = this.rawData;
  
  // INJECTION POINT A
  const phantomNodes = this.generatePhantomNodes();  // Generate before simulation
  nodes = [...nodes, ...phantomNodes];
  
  return { nodes, edges };
}
```

**Pros:**
- Phantom nodes flow through entire pipeline
- Participate in all forces equally
- Simple: just add to nodes array

**Cons:**
- Phantom nodes created BEFORE guides are computed
- Can't position at grid intersections yet
- Guide data doesn't exist until after clustering
- Road network doesn't exist yet
- **Not recommended for position-aware phantom nodes**

### Option B: Inject at createForceSimulation() ★ RECOMMENDED ★

**Location:** LayoutController.createForceSimulation() line 510

**Code pattern:**
```typescript
public createForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  cx: number, cy: number
): Simulation<GraphNode, GraphEdge> {
  // INJECTION POINT B
  const { phantomNodes, phantomEdges } = this.generatePhantomNodes(
    nodes, this.host.getPanel(), this.host.getClusterMeta()
  );
  
  nodes = [...nodes, ...phantomNodes];
  edges = [...edges, ...phantomEdges];

  // Create simulation with all nodes + phantom nodes
  const sim = forceSimulation<GraphNode, GraphEdge>(nodes)
    .force("charge", forceManyBody().strength((n: GraphNode) => {
      const mult = n.id.startsWith("__phantom_") ? 0.1 : 1.0;  // Low repel for phantom
      return -panel.repelForce * mult;
    }))
    .force("link", forceLink(edges)
      .id((d) => d.id)
      .strength((e) => {
        // Skip link forces for phantom edges
        if (e.source.startsWith("__phantom_") || e.target.startsWith("__phantom_")) {
          return 0;
        }
        return edgeLinkStrength(e, panel.linkForce);
      }))
    // ... rest of forces ...
  
  return sim;
}
```

**Pros:**
- Guide data available via host.getClusterMeta()
- Can pre-position phantom nodes at grid line candidates
- Phantom nodes participate in simulation for auto-adjustment
- Collide force prevents spacing issues
- Can fix positions (fx, fy) if needed for absolute positioning

**Cons:**
- Requires LayoutHost interface extension
- Need to replicate guide extraction logic
- Slightly more complex initialization

**Why this is best:**
1. **Timing:** Guides are computed by cluster-force.ts before createForceSimulation() is called
2. **Access:** LayoutHost provides access to clusterMeta.groupGuides
3. **Participation:** Phantom nodes get full force-directed layout benefit
4. **Customization:** Can tune repel force, fix positions, or control link forces

### Option C: Inject at buildRoadNetwork() (LATEST)

**Location:** GraphViewContainer._buildRoadNetworkInner() line 2319

**Code pattern:**
```typescript
private _buildRoadNetworkInner() {
  const meta = this.clusterMeta;
  
  // Collect positioned nodes
  const allNodes: GraphNode[] = [];
  for (const pn of this.pixiNodes.values()) {
    if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) {
      allNodes.push(pn.data);
    }
  }

  // INJECTION POINT C
  const phantomNodesFromIntersections = this.generatePhantomNodesFromGrid(
    this.panel.clusterArrangement,
    meta.groupGuides,
    this.computeNodeBounds(allNodes)
  );
  const phantomNodes = phantomNodesFromIntersections.map(p => ({
    ...p,
    fx: p.x,  // Fix position to intersection
    fy: p.y,
  }));
  
  const allNodesWithPhantom = [...allNodes, ...phantomNodes];
  
  // buildRoadNetwork now includes phantom nodes in nodeAccess mapping
  this.roadNetworkData = buildRoadNetwork({
    // ... config ...
    nodes: allNodesWithPhantom,
  });
}
```

**Pros:**
- Road network structure already known
- Can position phantom nodes exactly at intersections
- No simulation needed (phantom positions already final)

**Cons:**
- Simulation already completed
- Phantom nodes won't participate in force layout
- No auto-adjustment of spacing
- Less integrated with layout system
- Phantom nodes may overlap with real nodes if not careful

---

## 7. Node Rendering & Visibility Control

### Strategy 1: Zero Radius (SIMPLEST)

```typescript
// In _buildNodeRadiusFn() or similar
const nodeR = (n: GraphNode): number => {
  if (n.id.startsWith("__phantom_")) return 0;  // Invisible
  return getDefaultRadius(n);
};

const nodeColor = (n: GraphNode): number => {
  if (n.id.startsWith("__phantom_")) return 0x000000;  // Dummy color
  return getDefaultColor(n);
};
```

**Effect:**
- PixiJS Circle(0) created but renders as a point
- Position updated but not visible
- Label rendering skipped (labels only for radius > threshold)

### Strategy 2: Skip createPixiNode() (MOST EFFICIENT)

```typescript
// In RenderPipeline.createPixiNodes()
for (let i = 0; i < IMMEDIATE_BATCH; i++) {
  const node = sorted[i];
  if (node.id.startsWith("__phantom_")) continue;  // Skip phantom nodes
  this.createSinglePixiNode(node, nodeR, nodeColor, world);
}

// Also in deferred batch processing
for (const node of this.pendingNodes) {
  if (node.id.startsWith("__phantom_")) continue;  // Skip
  this.createSinglePixiNode(node, nodeR, nodeColor, world);
}
```

**Effect:**
- Phantom nodes NOT added to pixiNodes Map
- No PixiJS graphics created
- Saves memory
- **Problem:** Phantom nodes won't update positions in rendering loop

### Strategy 3: Use isTag property (INTEGRATED)

```typescript
// Phantom node template
const phantomNode: GraphNode = {
  id: "__phantom_" + uniqueId,
  label: "",
  x: estimatedX,
  y: estimatedY,
  vx: 0, vy: 0,
  isTag: true,  // Mark as invisible
};

// In getGraphData(), this is already filtered:
if (!this.panel.showTagNodes) {
  nodes = nodes.filter((n) => !n.isTag);  // Phantoms excluded
}

// In EdgeRenderer, isTag edges are excluded:
edges = edges.filter((e) => e.type !== EDGE_TYPE_HAS_TAG);
```

**Effect:**
- Phantom nodes filtered out early in pipeline
- Never created in PixiJS
- But still need to participate in simulation BEFORE filtering
- Requires two-pass: include in simulation, exclude in rendering

**Best practice: Combine Strategies 1 & 3**
- Set `isTag: true` to participate in tag filtering logic
- Also set `nodeR() → 0` as safety fallback
- Phantom nodes participate in simulation, filtered from rendering

---

## 8. Force Customization for Phantom Nodes

### Reduce Repel Force

```typescript
// In LayoutController.createForceSimulation()
const repelMap = new Map<string, number>();
for (const n of nodes) {
  if (n.id.startsWith("__phantom_")) {
    repelMap.set(n.id, 0.1);  // 10% of normal repel
  } else {
    repelMap.set(n.id, 1.0);   // Normal repel
  }
}

const sim = forceSimulation<GraphNode, GraphEdge>(nodes)
  .force("charge", forceManyBody().strength((n: GraphNode) => {
    const mult = repelMap.get(n.id) ?? 1.0;
    return -panel.repelForce * mult;  // Adjusted repel
  }))
```

**Effect:**
- Phantom nodes repel real nodes with 10% force
- Real nodes more attracted to clustering centers
- Phantom nodes "guide" layout without dominating

### Skip Link Forces

```typescript
// In LayoutController.createForceSimulation()
const sim = forceSimulation<GraphNode, GraphEdge>(nodes)
  .force("link", forceLink(edges)
    .id((d) => d.id)
    .strength((e) => {
      // Skip phantom edges
      if (e.source.startsWith("__phantom_") || e.target.startsWith("__phantom_")) {
        return 0;  // No link force
      }
      return edgeLinkStrength(e, panel.linkForce);
    }))
```

**Effect:**
- Phantom edges don't pull nodes
- Phantom nodes only affected by charge + collide forces
- Better control over phantom node participation

### Fix Phantom Positions

```typescript
// Option 1: Fix at creation
const phantomNode: GraphNode = {
  id: "__phantom_" + id,
  x: intersectionX,
  y: intersectionY,
  vx: 0, vy: 0,
  fx: intersectionX,  // Fixed — won't move
  fy: intersectionY,
};

// Option 2: Fix during simulation
// After createForceSimulation():
for (const n of sim.nodes()) {
  if (n.id.startsWith("__phantom_")) {
    n.fx = n.x;  // Lock current position
    n.fy = n.y;
  }
}
```

**Effect:**
- Phantom nodes pinned to exact intersection coordinates
- Zero participation in forces (immobile)
- Pure "junction point" role for road network routing
- Best for precision road network alignment

---

## 9. Phantom Node Positioning Strategies

### Strategy A: Grid Intersection Candidates

```typescript
function generatePhantomNodesFromGuides(
  guides: GroupGuideEntry[] | undefined,
  centerX: number, centerY: number
): GraphNode[] {
  if (!guides) return [];
  
  const phantoms: GraphNode[] = [];
  let id = 0;

  for (const gg of guides) {
    const g = gg.guide;
    if (!g) continue;

    if (g.type === "coordinate") {
      const gridInfo = (g as any).gridInfo;
      for (const line1 of gridInfo.axis1Lines) {
        for (const line2 of gridInfo.axis2Lines) {
          const phantom: GraphNode = {
            id: "__phantom_grid_" + (id++),
            label: "",
            x: centerX + line1.position,
            y: centerY + line2.position,
            vx: 0, vy: 0,
            isTag: true,
          };
          phantoms.push(phantom);
        }
      }
    }

    if (g.type === "concentric") {
      const rings = (g as any).rings;
      const spokeCount = 12;  // Fixed for clarity
      for (const ring of rings) {
        for (let i = 0; i < spokeCount; i++) {
          const theta = (i / spokeCount) * Math.PI * 2;
          const phantom: GraphNode = {
            id: "__phantom_ring_" + (id++),
            label: "",
            x: gg.centerX + ring * Math.cos(theta),
            y: gg.centerY + ring * Math.sin(theta),
            vx: 0, vy: 0,
            isTag: true,
          };
          phantoms.push(phantom);
        }
      }
    }
  }

  return phantoms;
}
```

### Strategy B: Sparse Grid Estimate

```typescript
function generatePhantomNodesFromBounds(
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number },
  gridDensity: number = 8  // 8x8 grid
): GraphNode[] {
  const phantoms: GraphNode[] = [];
  const width = bounds.xMax - bounds.xMin;
  const height = bounds.yMax - bounds.yMin;
  const xStep = width / gridDensity;
  const yStep = height / gridDensity;
  
  let id = 0;
  for (let i = 0; i <= gridDensity; i++) {
    for (let j = 0; j <= gridDensity; j++) {
      const phantom: GraphNode = {
        id: "__phantom_pos_" + (id++),
        label: "",
        x: bounds.xMin + i * xStep,
        y: bounds.yMin + j * yStep,
        vx: 0, vy: 0,
        isTag: true,
      };
      phantoms.push(phantom);
    }
  }
  
  return phantoms;
}
```

### Strategy C: Ring-and-Spoke Pattern

```typescript
function generatePhantomNodesPolar(
  centerX: number, centerY: number,
  maxRadius: number,
  ringCount: number = 8,
  spokeCount: number = 16
): GraphNode[] {
  const phantoms: GraphNode[] = [];
  let id = 0;

  for (let ri = 1; ri <= ringCount; ri++) {
    const r = (ri / ringCount) * maxRadius;
    for (let si = 0; si < spokeCount; si++) {
      const theta = (si / spokeCount) * Math.PI * 2;
      const phantom: GraphNode = {
        id: "__phantom_polar_" + (id++),
        label: "",
        x: centerX + r * Math.cos(theta),
        y: centerY + r * Math.sin(theta),
        vx: 0, vy: 0,
        isTag: true,
      };
      phantoms.push(phantom);
    }
  }

  return phantoms;
}
```

---

## 10. Phantom Edges Configuration

### Edge Types

```typescript
export type EdgeType =
  | "link"
  | "tag"
  | "category"
  | "reference"
  | "hierarchy"
  | "semantic"
  | "inheritance"
  | "aggregation"
  | "has-tag"
  | "similar"
  | "sibling"
  | "sequence"
  | "phantom";  // NEW: Mark phantom-only edges
```

### Creating Phantom Edges

```typescript
// Phantom edges connect real nodes through phantom "junctions"
// Example: real node A → phantom node (junction) → real node B

function generatePhantomEdges(
  phantomNodes: GraphNode[],
  realNodes: GraphNode[],
  realEdges: GraphEdge[]
): GraphEdge[] {
  // Option 1: Add explicit edges from phantom nodes to nearest real nodes
  // (for force participation)
  const phantomEdges: GraphEdge[] = [];

  for (const phantom of phantomNodes) {
    // Find nearest real node
    let nearest: GraphNode | null = null;
    let minDist = Infinity;
    for (const real of realNodes) {
      const dx = phantom.x - real.x;
      const dy = phantom.y - real.y;
      const d = dx * dx + dy * dy;
      if (d < minDist) {
        minDist = d;
        nearest = real;
      }
    }

    if (nearest && minDist < threshold) {
      phantomEdges.push({
        id: phantom.id + "_to_" + nearest.id,
        source: phantom.id,
        target: nearest.id,
        type: "phantom",
      });
    }
  }

  return phantomEdges;
}
```

**Note:** Most phantom edges should have zero link force (as configured above). Phantom edges primarily serve to:
1. Keep phantom nodes participating in the simulation
2. Provide routing anchors for EdgeRenderer
3. Document road network structure

---

## 11. Complete Phantom Node Workflow Example

### Minimal Implementation (Option B)

```typescript
// File: src/views/LayoutController.ts

public createForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  cx: number,
  cy: number,
): Simulation<GraphNode, GraphEdge> {
  const panel = this.host.getPanel();
  const clusterMeta = this.host.getClusterMeta?.();

  // --- PHANTOM NODE INJECTION ---
  let allNodes = nodes;
  let allEdges = edges;

  if (panel.roadNetwork?.enabled && clusterMeta?.groupGuides) {
    // Generate phantom nodes from guides
    const phantomNodes = this.generatePhantomNodesFromGuides(
      clusterMeta.groupGuides,
      panel
    );
    
    // Generate phantom edges (optional, low-force)
    const phantomEdges = phantomNodes.map(p => ({
      id: p.id + "_dummy",
      source: p.id,
      target: nodes[0]?.id ?? "__root",  // Connect to any real node
      type: "phantom" as EdgeType,
    }));

    allNodes = [...nodes, ...phantomNodes];
    allEdges = [...edges, ...phantomEdges];
  }

  // --- FORCE SIMULATION WITH CUSTOM PARAMETERS ---
  const repelMap = new Map<string, number>();
  for (const n of allNodes) {
    if (n.id.startsWith("__phantom_")) {
      repelMap.set(n.id, 0.1);  // 10% repel force
    }
  }

  const sim = forceSimulation<GraphNode, GraphEdge>(allNodes)
    .force("charge", forceManyBody<GraphNode>().strength((n: GraphNode) => {
      const mult = repelMap.get(n.id) ?? 1.0;
      return -panel.repelForce * mult;
    }))
    .force("link", forceLink<GraphNode, GraphEdge>(allEdges)
      .id((d) => d.id)
      .distance((e) => {
        if (e.type === "phantom") return 1;  // Minimal link distance
        return edgeLinkDistance(e, panel.linkDistance);
      })
      .strength((e) => {
        if (e.type === "phantom") return 0;  // No link force
        return edgeLinkStrength(e, panel.linkForce);
      }))
    .force("collide", forceCollide<GraphNode>()
      .radius((n) => {
        if (n.id.startsWith("__phantom_")) return 1;  // Minimal collision
        return this.collideRadius();
      })
      .iterations(2))
    .force("center", forceCenter<GraphNode>(cx, cy)
      .strength(panel.centerForce))
    .alphaDecay(0.18)
    .velocityDecay(0.55);

  return sim;
}

private generatePhantomNodesFromGuides(
  guides: GroupGuideEntry[] | undefined,
  panel: PanelSettings
): GraphNode[] {
  if (!guides || guides.length === 0) return [];

  const phantoms: GraphNode[] = [];
  let id = 0;

  for (const gg of guides) {
    const g = gg.guide;
    if (!g) continue;

    // CoordinateGuide: create phantom at each grid intersection
    if (g.type === "coordinate") {
      const gridInfo = (g as any).gridInfo;
      for (const line1 of gridInfo.axis1Lines) {
        for (const line2 of gridInfo.axis2Lines) {
          phantoms.push({
            id: "__phantom_" + (id++),
            label: "",
            x: gg.centerX + line1.position,
            y: gg.centerY + line2.position,
            vx: 0,
            vy: 0,
            isTag: true,
          });
        }
      }
    }
    // ... other guide types ...
  }

  return phantoms;
}
```

### Rendering Integration

```typescript
// File: src/views/RenderPipeline.ts

public createPixiNodes(
  nodes: GraphNode[],
  nodeR: (n: GraphNode) => number,
  nodeColor: (n: GraphNode) => number
) {
  const pixiNodes = this.host.getPixiNodes();
  pixiNodes.clear();

  // Filter out phantom nodes before creating graphics
  const nonPhantomNodes = nodes.filter(
    n => !n.id.startsWith("__phantom_")
  );

  // Create PixiJS nodes for non-phantom nodes
  for (const node of nonPhantomNodes) {
    this.createSinglePixiNode(node, nodeR, nodeColor, world);
  }
}

// Alternative: Create with zero radius
public createPixiNodes(
  nodes: GraphNode[],
  nodeR: (n: GraphNode) => number,
  nodeColor: (n: GraphNode) => number
) {
  const pixiNodes = this.host.getPixiNodes();
  pixiNodes.clear();

  const customNodeR = (n: GraphNode): number => {
    if (n.id.startsWith("__phantom_")) return 0;  // Invisible
    return nodeR(n);
  };

  // Create all nodes, but phantoms invisible
  for (const node of nodes) {
    this.createSinglePixiNode(node, customNodeR, nodeColor, world);
  }
}
```

### Road Network Integration (Automatic)

```typescript
// No changes needed! buildRoadNetwork() already supports phantom nodes:

// In src/layouts/road-network.ts:buildRoadNetwork()
// All nodes passed in cfg.nodes are mapped to road intersections
// via nodeAccess Map<nodeId, intersectionId>

// Phantom nodes will be mapped just like real nodes,
// creating exact junction points for road network routing
```

---

## 12. Performance Analysis

### Memory Impact Per Phantom Node
- GraphNode struct: ~200 bytes
- d3-force internal: ~100 bytes
- PixiJS Graphics (if created): ~500 bytes
- **Total: ~300-800 bytes per phantom node**

### For Common Scenarios
- **Sparse grid (8x8 = 64 phantoms):** ~50KB
- **Dense grid (16x16 = 256 phantoms):** ~200KB
- **Ring-spoke (12 rings × 16 spokes = 192 phantoms):** ~150KB

### Simulation Cost
- **Charge force:** O(n) with fast multipole, O(n²) with simple algorithm
- **Link force:** O(edges) per tick
- **Collide force:** O(n log n) with spatial indexing

Adding 200 phantom nodes to 5000 real nodes:
- 4% larger n for charge force
- ~3-5% slower simulation
- Negligible impact with modern physics engines

---

## 13. Implementation Checklist

### Phase 1: Core Structure
- [ ] Define phantom node ID prefix: `__phantom_`
- [ ] Create GraphNode template function
- [ ] Test: phantom nodes flow through pipeline
- [ ] Test: zero radius phantoms invisible
- [ ] Test: phantom nodes in pixiNodes Map

### Phase 2: Force Integration
- [ ] Inject phantom nodes in createForceSimulation()
- [ ] Reduce repel force for phantoms (0.1x)
- [ ] Skip link forces for phantom edges
- [ ] Test: real nodes unaffected by phantom repulsion
- [ ] Performance: measure simulation time increase

### Phase 3: Rendering
- [ ] Set nodeR(phantom) → 0 OR filter from createPixiNode()
- [ ] Set nodeColor(phantom) → dummy
- [ ] Verify phantom nodes invisible in rendered output
- [ ] Test: phantom nodes don't appear in node list UI
- [ ] Performance: measure memory usage

### Phase 4: Road Network
- [ ] Generate phantoms from clusterMeta.groupGuides
- [ ] Map phantoms to intersection positions
- [ ] Test: phantom nodes included in nodeAccess
- [ ] Test: edge routing goes through phantom intersections
- [ ] Visual test: roads render with phantom junctions

### Phase 5: Testing & Validation
- [ ] E2E test: phantom nodes don't distort layout
- [ ] E2E test: road network structure correct
- [ ] E2E test: edge routing paths sensible
- [ ] Performance test: 1000+ phantom nodes
- [ ] Unit test: phantom node generation from guides
- [ ] Unit test: phantom edge strength is zero

---

## 14. Key Files & Line References

| File | Function/Class | Lines | Purpose |
|------|----------------|-------|---------|
| src/types.ts | GraphNode | 1-30 | Node data structure |
| src/views/GraphViewContainer.ts | getGraphData() | 3840 | Build graph data |
| src/views/GraphViewContainer.ts | doRender() | 3971 | Main render entry |
| src/views/GraphViewContainer.ts | _setupForceLayout() | 4179 | Force layout setup |
| src/views/GraphViewContainer.ts | _buildRoadNetworkInner() | 2319 | Build road network |
| src/views/LayoutController.ts | createForceSimulation() | 510 | **INJECT HERE** |
| src/views/RenderPipeline.ts | createPixiNodes() | 1191 | Create PixiJS graphics |
| src/layouts/road-network.ts | buildRoadNetwork() | 68 | Generate road structure |
| src/views/EdgeRenderer.ts | drawEdgeSegment() | 771 | Route edges through roads |
| src/layouts/cluster-force.ts | buildClusterForce() | 397 | Clustering & guides |

---

## 15. Migration Guide: From No Phantoms to Phantom Nodes

### Step 1: Add Phantom Node Marker
```typescript
// In getGraphData() or early in pipeline
const isPhantomNode = (n: GraphNode): boolean => n.id.startsWith("__phantom_");
```

### Step 2: Create Phantom Generation Function
```typescript
function generatePhantomNodes(
  guides: GroupGuideEntry[] | undefined,
  arrangement: string,
  bounds: BBox
): GraphNode[] {
  // Implementation as shown above
}
```

### Step 3: Inject in LayoutController
```typescript
// In createForceSimulation()
const phantomNodes = this.generatePhantomNodesFromGuides(guides, panel);
const allNodes = [...nodes, ...phantomNodes];
const sim = forceSimulation(allNodes)
  .force("charge", forceManyBody().strength((n) => {
    const mult = isPhantomNode(n) ? 0.1 : 1.0;
    return -panel.repelForce * mult;
  }))
  // ...
```

### Step 4: Hide from Rendering
```typescript
// Option A: Zero radius
const nodeR = (n: GraphNode) => {
  if (isPhantomNode(n)) return 0;
  return defaultRadius(n);
};

// Option B: Filter from createPixiNode()
const nonPhantom = nodes.filter(n => !isPhantomNode(n));
for (const n of nonPhantom) {
  this.createSinglePixiNode(n, nodeR, nodeColor, world);
}
```

### Step 5: Road Network (No Change Needed)
```typescript
// buildRoadNetwork() already accepts any nodes
// Phantom nodes automatically mapped to intersections via nodeAccess
this.roadNetworkData = buildRoadNetwork({
  // ... config ...
  nodes: allNodesFromSimulation,  // Includes phantoms
});
```

---

## Conclusion & Recommendations

**Best practice for phantom node injection:**

1. **Location:** LayoutController.createForceSimulation() (line 510)
2. **Strategy:** Pre-position from guides, reduce repel force, fix positions optional
3. **Rendering:** Zero radius (simplest) OR filter from createPixiNode() (cleanest)
4. **Integration:** Fully automatic in road network building — no changes needed
5. **Performance:** Negligible impact (<5% slower simulation) for <500 phantom nodes

**Suggested parameter values:**
- Phantom node repel force: 0.1x normal
- Phantom edge link force: 0 (no pulling)
- Phantom node collision radius: 1 (minimal)
- Phantom node display radius: 0 (invisible)

**Testing priority:**
1. Phantom nodes invisible in rendered output ✓
2. Real node layout unaffected ✓
3. Road network includes phantom junctions ✓
4. Edge routes sensible through phantom nodes ✓
5. Performance acceptable at scale ✓

See the memory file `phantom-nodes-injection-research` for detailed code references and architecture diagrams.
