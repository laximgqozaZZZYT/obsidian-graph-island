# Guide Data — Code Examples & Usage Patterns

## 1. TimelineGuide Creation Example

**Source: `cluster-force.ts`, lines 2486-2557**

```typescript
// Simplified flow from timelineOffsets()

function timelineOffsets(p: ArrangementParams): ArrangementResult {
  const { members, nodeSpacing, groupScale, nodeSize } = p;
  const n = members.length;
  
  // Step 1: Partition nodes into timed/untimed
  const { timed, untimed } = timelinePartitionNodes(members, cfg);
  
  // Step 2: Sort timed nodes and build time steps
  const { sortedTimed, uniqueTimes, timeIndexMap } = timelineSortAndBuildSteps(timed);
  
  // Step 3: Compute effective spacing
  const spacing = pairwiseGap(nodeSize, nodeSize, Math.max(nodeSpacing, groupScale));
  const effectiveSpacing = spacing;  // Simplified
  
  // Step 4-6: Place nodes and center offsets
  const offsets = new Map<string, { dx: number; dy: number }>();
  // ... place timed nodes at (x, y) based on time column and stack ...
  // ... place untimed nodes in compact grid below ...
  
  const { xCenter, yCenter } = timelineCenterOffsets(offsets);
  
  // --- Build timeline guide (axis + ticks) ---
  const ticks: { x: number; label: string }[] = [];
  for (const tv of uniqueTimes) {
    if (tv.startsWith("__")) continue;
    const idx = timeIndexMap.get(tv)!;
    ticks.push({ 
      x: idx * effectiveSpacing - xCenter,  // World-space X (centered)
      label: tv 
    });
  }
  const guide: TimelineGuide = {
    type: "timeline",
    axisY: -yCenter,  // World-space Y (centered)
    ticks,
  };
  
  return { offsets, guide };
}
```

**What this produces:**
```typescript
// Example output for 8 nodes with 2 dates
guide: {
  type: "timeline",
  axisY: 15,                // Horizontal timeline baseline at Y=15
  ticks: [
    { x: -40, label: "2023-01-15" },
    { x: 40,  label: "2023-12-25" }
  ]
}
```

---

## 2. GridGuide Creation Example

**Source: `cluster-force.ts`, lines 2370-2406**

```typescript
function gridOffsets(p: ArrangementParams): ArrangementResult {
  const { members, nodeSpacing, groupScale, maxGroupNodeR: nodeSize } = p;
  const sorted = [...members].sort(p.cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const n = sorted.length;
  
  // Compute uniform grid spacing
  const spacing = Math.max(
    pairwiseGap(nodeSize, nodeSize, Math.max(nodeSpacing, groupScale)),
    nodeSize
  );
  
  // Determine grid dimensions: √n columns, ceil(n/c) rows
  const c = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / c);
  const totalW = (c - 1) * spacing;
  const totalH = (rows - 1) * spacing;
  
  // Place nodes in grid
  for (let i = 0; i < n; i++) {
    const col = i % c;
    const row = Math.floor(i / c);
    const ns = getSpacing(sorted[i].id, nodeSpacingMap);
    offsets.set(sorted[i].id, {
      dx: col * spacing * ns - totalW / 2,  // Centered X
      dy: row * spacing * ns - totalH / 2,  // Centered Y
    });
  }
  
  // Build grid guide lines
  const verticals: number[] = [];
  const horizontals: number[] = [];
  for (let col = 0; col < c; col++) {
    verticals.push(col * spacing - totalW / 2);  // Vertical line at this X
  }
  for (let row = 0; row < rows; row++) {
    horizontals.push(row * spacing - totalH / 2);  // Horizontal line at this Y
  }
  
  const guide: GridGuide = {
    type: "grid",
    verticals,      // Array of vertical line X-coordinates
    horizontals,    // Array of horizontal line Y-coordinates
    bounds: {
      xMin: -totalW / 2 - spacing / 2,
      yMin: -totalH / 2 - spacing / 2,
      xMax: totalW / 2 + spacing / 2,
      yMax: totalH / 2 + spacing / 2
    },
  };
  
  return { offsets, guide };
}
```

**What this produces:**
```typescript
// Example output for 12 nodes (4 cols × 3 rows, spacing=24)
// totalW = 3 × 24 = 72, totalH = 2 × 24 = 48
guide: {
  type: "grid",
  verticals: [-36, -12, 12, 36],      // 4 vertical lines
  horizontals: [-24, 0, 24],          // 3 horizontal lines
  bounds: {
    xMin: -48, yMin: -36, xMax: 48, yMax: 36
  }
}
```

---

## 3. ConcentricGuide Creation Example

**Source: `cluster-force.ts`, lines 2262-2324**

```typescript
function concentricOffsets(p: ArrangementParams): ArrangementResult {
  const { members, degrees, nodeSpacing, groupScale, nodeSize, cmp, cfg } = p;
  const sorted = [...members].sort(cmp);
  const offsets = new Map<string, { dx: number; dy: number }>();
  const ringRadii: number[] = [];
  const n = sorted.length;
  
  // Place center node at origin
  offsets.set(sorted[0].id, { dx: 0, dy: 0 });
  
  let idx = 1;
  let ringR = 0;      // Current ring radius
  let ringIdx = 0;    // Ring index for angular offset
  
  while (idx < n) {
    // Step 1: Calculate next ring radius using pairwise gap
    const prevR = ringR === 0 ? nodeSize : nodeSize;  // Simplified
    const minGap = pairwiseGap(prevR, nodeSize, groupScale);
    ringR = Math.max(ringR + minGap, ringR + nodeSize * 2 * groupScale);
    ringRadii.push(ringR);
    ringIdx++;
    
    // Step 2: Fit nodes on this ring
    // Capacity based on circumference and node diameter
    const circumference = 2 * Math.PI * ringR;
    let cap = 0;
    let totalDiam = 0;
    while (cap < n - idx) {
      const d = nodeSize * 2 * nodeSpacing * getSpacing(sorted[idx + cap].id, nodeSpacingMap);
      if (cap > 0 && totalDiam + d > circumference) break;
      totalDiam += d;
      cap++;
    }
    cap = Math.max(1, cap);
    
    // Step 3: Place nodes on ring with angular offset
    const angleOffset = (ringIdx % 2 === 0) ? 0 : Math.PI / cap;  // Avoid spoke alignment
    for (let j = 0; j < cap && idx < n; j++, idx++) {
      const angle = (j / cap) * Math.PI * 2 + angleOffset;
      offsets.set(sorted[idx].id, {
        dx: ringR * Math.cos(angle),
        dy: ringR * Math.sin(angle),
      });
    }
  }
  
  return {
    offsets,
    guide: {
      type: "concentric",
      rings: ringRadii  // Sorted array of ring radii
    }
  };
}
```

**What this produces:**
```typescript
// Example output for 16 nodes (center + ~4 rings)
guide: {
  type: "concentric",
  rings: [22.5, 48.3, 75.6, 105.2]  // 4 ring radii in ascending order
}
```

---

## 4. CoordinateGuide Creation Example

**Source: `coordinate-engine.ts`, lines 876-956**

```typescript
export function coordinateOffsets(
  members: GraphNode[],
  degrees: Map<string, number>,
  edges: GraphEdge[],
  layout: CoordinateLayout,
  ctx: CoordinateContext,
): ArrangementResult {
  if (members.length === 0) return { offsets: new Map() };
  
  // Compute spacing
  const spacing = ctx.nodeSize * 2 * Math.max(ctx.nodeSpacing, ctx.groupScale);
  const isPolar = layout.system === "polar";
  const axis2Spacing = isPolar ? 1 : spacing;
  
  // User constants (e.g., _spokeCount, _ringSize)
  const userConsts: Record<string, number> = { ...layout.constants };
  if (ctx.totalNodeCount != null) userConsts.N = ctx.totalNodeCount;
  userConsts.S = ctx.nodeSize;
  
  // --- Phase 1: Resolve raw values for both axes ---
  const raw1 = resolveAxisValues(members, layout.axis1.source, ctx);
  const raw2 = resolveAxisValues(members, layout.axis2.source, ctx);
  
  // --- Phase 2: Apply transforms ---
  // For example: linear, bin, date-index, golden spiral, stacking, etc.
  const t1 = applyTransform(raw1, layout.axis1.transform, spacing, undefined, userConsts);
  const axis2NeedsOther = layout.axis2.transform.kind === "stack-avoid" 
    || layout.axis2.transform.kind === "even-divide";
  const t2 = axis2NeedsOther
    ? applyTransform(raw2, layout.axis2.transform, axis2Spacing, t1, userConsts)
    : applyTransform(raw2, layout.axis2.transform, axis2Spacing, undefined, userConsts);
  
  // --- Phase 3: Convert to Cartesian ---
  const offsets = toCartesian(t1, t2, layout.system);
  
  // --- Build bounds ---
  let bxMin = Infinity, byMin = Infinity, bxMax = -Infinity, byMax = -Infinity;
  let maxR = 0;
  for (const { dx, dy } of offsets.values()) {
    bxMin = Math.min(bxMin, dx);
    byMin = Math.min(byMin, dy);
    bxMax = Math.max(bxMax, dx);
    byMax = Math.max(byMax, dy);
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > maxR) maxR = r;
  }
  
  const guide: CoordinateGuide = {
    type: "coordinate",
    system: layout.system,
    axis1Label: describeAxis(layout.axis1),
    axis2Label: describeAxis(layout.axis2),
    bounds: offsets.size > 0
      ? { xMin: bxMin, yMin: byMin, xMax: bxMax, yMax: byMax,
          ...(layout.system === "polar" ? { maxR } : {}) }
      : undefined,
  };
  
  // --- Resolve grid info (axis lines, labels, shapes) ---
  if (offsets.size > 0) {
    resolveCoordinateGrid(
      layout, members, ctx, t1, t2, spacing, offsets, guide,
    );
  }
  
  return { offsets, guide };
}
```

**What this produces:**
```typescript
// Example: custom cartesian layout with user functions
// layout.axis1 = { source: { kind: "expression", expr: "x" }, transform: { kind: "linear" } }
// layout.axis2 = { source: { kind: "expression", expr: "y" }, transform: { kind: "linear" } }

guide: {
  type: "coordinate",
  system: "cartesian",
  axis1Label: "custom_x_axis",
  axis2Label: "custom_y_axis",
  bounds: { xMin: -100, yMin: -80, xMax: 100, yMax: 80 },
  gridInfo: {
    axis1Lines: [
      { position: -100, label: "0" },
      { position: -50, label: "0.25" },
      { position: 0, label: "0.5" },
      { position: 50, label: "0.75" },
      { position: 100, label: "1" }
    ],
    axis2Lines: [
      { position: -80, label: "0" },
      { position: 0, label: "0.5" },
      { position: 80, label: "1" }
    ],
    axis1Shape: { kind: "line" },
    axis2Shape: { kind: "line" },
    style: "lines",
    cellShading: false
  }
}
```

---

## 5. Guide Collection in computeFlatTargets

**Source: `cluster-force.ts`, lines 966-1004**

```typescript
function computeFlatTargets(
  groups: Map<string, GraphNode[]>,
  edges: GraphEdge[],
  degrees: Map<string, number>,
  cfg: ClusterForceConfig,
): FlatTargetResult {
  const targets = new Map<string, { x: number; y: number }>();
  const allBars: TimelineBarInfo[] = [];
  let groupKeys = [...groups.keys()];
  
  // ... [Steps 1-5: compute offsets per group] ...
  
  // Step 6: Node position (absolute = group center + offset)
  const groupGuides: GroupGuideEntry[] = [];  // ← Initialize guide collection
  
  for (const key of groupKeys) {
    const members = groups.get(key)!;
    const center = groupCenters.get(key)!;          // Group center in world space
    const result = groupResults.get(key)!;          // Result from *Offsets() function
    
    // Place absolute node positions
    for (const n of members) {
      const off = result.offsets.get(n.id);
      targets.set(n.id, {
        x: center.x + (off?.dx ?? 0),
        y: center.y + (off?.dy ?? 0),
      });
    }
    
    // Collect bar data (timeline only)
    if (result.bars) {
      for (const bar of result.bars) {
        allBars.push({
          ...bar,
          xStart: bar.xStart + center.x,
          xEnd: bar.xEnd + center.x,
          yCenter: bar.yCenter + center.y,
        });
      }
    }
    
    // Collect sequence edges (timeline only)
    if (result.sequenceEdges) {
      allSeqEdges.push(...result.sequenceEdges);
    }
    
    // *** COLLECT GUIDE DATA FOR CABLE TRAYS ***
    if (result.guide) {
      groupGuides.push({
        guide: result.guide,            // TimelineGuide | GridGuide | ...
        centerX: center.x,              // Group center X
        centerY: center.y,              // Group center Y
      });
    }
  }
  
  return {
    targets,
    allBars,
    groupGuides: groupGuides.length > 0 ? groupGuides : undefined,
  };
}
```

---

## 6. Guide Usage in _buildCableTrayInner

**Source: `GraphViewContainer.ts`, lines 2442-2550**

```typescript
private _buildCableTrayInner() {
  const meta = this.clusterMeta;
  if (!meta) return;
  
  // Collect positioned nodes
  const allNodes: GraphNode[] = [];
  for (const pn of this.pixiNodes.values()) {
    if (Math.abs(pn.data.x) > 1 || Math.abs(pn.data.y) > 1) {
      allNodes.push(pn.data);
    }
  }
  if (allNodes.length === 0) return;
  
  // *** GET GUIDES FROM METADATA ***
  const guides = meta.groupGuides;
  
  if (guides && guides.length > 0) {
    // Dispatch on guide type
    for (const gg of guides) {
      const g = gg.guide;
      if (!g) continue;
      
      // --- ConcentricGuide ---
      if (g.type === "concentric") {
        const cg = g as { type: "concentric"; rings: number[] };
        if (cg.rings.length > 0) {
          // Generate spokes based on node count
          const spokeCount = Math.min(16, Math.max(8, Math.ceil(Math.sqrt(allNodes.length / 5))));
          const maxRing = Math.max(...cg.rings);
          const sortedRings = [...cg.rings].sort((a, b) => a - b);
          
          this.cableTrayData = buildCableTray({
            system: "polar",
            axis1Lines: sortedRings.map(r => ({ position: r })),        // Rings
            axis2Lines: Array.from({ length: spokeCount }, (_, i) => ({
              position: (i / spokeCount) * Math.PI * 2,                  // Spoke angles
            })),
            axis1Shape: "circle",
            axis2Shape: "radial",
            cx: gg.centerX,           // Apply group center offset
            cy: gg.centerY,
            bounds: { xMin: -maxRing, yMin: -maxRing, xMax: maxRing, yMax: maxRing, maxR: maxRing },
            nodes: allNodes,
          });
          this._finishCableTray(allNodes);
          return;
        }
      }
      
      // --- GridGuide ---
      if (g.type === "grid") {
        const gg2 = g as { type: "grid"; verticals: number[]; horizontals: number[]; bounds: {...} };
        const verts = (gg2.verticals ?? []).sort((a, b) => a - b);
        const horiz = (gg2.horizontals ?? []).sort((a, b) => a - b);
        
        this.cableTrayData = buildCableTray({
          system: "cartesian",
          axis1Lines: verts.map(v => ({ position: v })),                // Vertical lines
          axis2Lines: horiz.map(h => ({ position: h })),                // Horizontal lines
          axis1Shape: "line",
          axis2Shape: "line",
          cx: 0,
          cy: 0,
          bounds: gg2.bounds ?? this.computeNodeBounds(allNodes),
          nodes: allNodes,
        });
        this._finishCableTray(allNodes);
        return;
      }
      
      // --- TimelineGuide ---
      if (g.type === "timeline") {
        const tl = g as { type: "timeline"; axisY: number; ticks: {...}[] };
        
        this.cableTrayData = buildCableTray({
          system: "cartesian",
          axis1Lines: (tl.ticks ?? []).map((t: { x: number }) => ({ position: t.x })),  // Ticks
          axis2Lines: [{ position: tl.axisY ?? 0 }],                    // Baseline
          axis1Shape: "line",
          axis2Shape: "line",
          cx: 0,
          cy: 0,
          bounds: this.computeNodeBounds(allNodes),
          nodes: allNodes,
        });
        this._finishCableTray(allNodes);
        return;
      }
      
      // ... (TriangleGuide, CoordinateGuide similar) ...
    }
  }
  
  // Fallback: no guides
  const bounds = this.computeNodeBounds(allNodes);
  // ... generate sparse grid from bounds ...
}
```

---

## 7. Complete Example: Grid Group to Cable Tray

```typescript
// ========== INPUT ==========
// ClusterForceConfig:
// - arrangement: "grid"
// - nodeSize: 10
// - nodeSpacing: 1.5
// - groupScale: 1.0
// 
// Group members: 12 nodes at (100, 200) cluster center

// ========== LAYOUT PHASE ==========
// computeOffsets() called for grid arrangement
// spacing = 10 × 2 × max(1.5, 1.0) = 30
// c = ceil(√12) = 4 columns
// rows = ceil(12/4) = 3 rows
// totalW = 3 × 30 = 90, totalH = 2 × 30 = 60

// Node positions (relative to origin):
// Row 0: (-45, -30), (-15, -30), (15, -30), (45, -30)
// Row 1: (-45, 0), (-15, 0), (15, 0), (45, 0)
// Row 2: (-45, 30), (-15, 30), (15, 30), (45, 30)

// Guide created:
// {
//   type: "grid",
//   verticals: [-45, -15, 15, 45],
//   horizontals: [-30, 0, 30],
//   bounds: {xMin: -60, yMin: -45, xMax: 60, yMax: 45}
// }

// ========== COLLECTION PHASE ==========
// In computeFlatTargets():
// groupGuides.push({
//   guide: { type: "grid", verticals: [...], horizontals: [...], bounds: {...} },
//   centerX: 100,  // ← Group center
//   centerY: 200,
// })

// ========== CABLE TRAY BUILDING PHASE ==========
// In _buildCableTrayInner():
// for (const gg of guides) {
//   if (gg.guide.type === "grid") {
//     buildCableTray({
//       system: "cartesian",
//       axis1Lines: [
//         { position: -45 },   // ← Relative
//         { position: -15 },
//         { position: 15 },
//         { position: 45 }
//       ],
//       axis2Lines: [
//         { position: -30 },   // ← Relative
//         { position: 0 },
//         { position: 30 }
//       ],
//       axis1Shape: "line",
//       axis2Shape: "line",
//       cx: 0,  // Note: Grid uses cx=0, cy=0
//       cy: 0,
//       bounds: {...},
//       nodes: allNodes,
//     });
//   }
// }

// ========== FINAL OUTPUT ==========
// Cable tray roads (in world space):
// Vertical: x ∈ {55, 85, 115, 145}  ← 100-45, 100-15, 100+15, 100+45
// Horizontal: y ∈ {170, 200, 230}   ← 200-30, 200+0, 200+30
```

---

## 8. Type Definitions Quick Reference

```typescript
// From cluster-force.ts
interface TimelineGuide {
  type: "timeline";
  axisY: number;
  ticks: { x: number; label: string }[];
}

interface GridGuide {
  type: "grid";
  verticals: number[];
  horizontals: number[];
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number };
}

interface TriangleGuide {
  type: "triangle";
  vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
}

interface ConcentricGuide {
  type: "concentric";
  rings: number[];
}

// From coordinate-engine.ts
interface CoordinateGuide {
  type: "coordinate";
  system: CoordinateSystem;  // "cartesian" or "polar"
  axis1Label: string;
  axis2Label: string;
  bounds?: { xMin: number; yMin: number; xMax: number; yMax: number; maxR?: number };
  gridInfo?: ResolvedGridInfo;
}

// Union type
type ArrangementGuide = TimelineGuide | GridGuide | TriangleGuide | ConcentricGuide | CoordinateGuide;

// From ArrangementResult
interface ArrangementResult {
  offsets: Map<string, { dx: number; dy: number }>;
  guide?: ArrangementGuide;
  bars?: TimelineBarInfo[];
  sequenceEdges?: GraphEdge[];
  ringAssignments?: Map<string, number>;
  nodeChains?: string[][];
}

// Group guide entry
interface GroupGuideEntry {
  guide: ArrangementGuide;
  centerX: number;
  centerY: number;
}

// In ClusterMetadata
interface ClusterMetadata {
  nodeClusterMap: Map<string, string>;
  clusterCentroids: Map<string, { x: number; y: number }>;
  clusterRadii: Map<string, number>;
  groupGuides?: GroupGuideEntry[];  // ← THIS IS WHERE GUIDES ARE STORED
  // ... other metadata ...
}
```

