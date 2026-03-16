# Guide Data Integration Map

## Data Flow: Node Placement → Guide Creation → Cable Tray Building

```
┌────────────────────────────────────────────────────────────────────┐
│                     CLUSTER FORCE LAYOUT                           │
│              (src/layouts/cluster-force.ts)                        │
└────────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────────────────────────────────────┐
        │   For each group in groupMap:                      │
        │   computeOffsets(members, degrees, ...)            │
        └─────────────────────────────────────────────────────┘
                              ↓
        ╔═════════════════════════════════════════════════════╗
        ║   Returns: ArrangementResult                        ║
        ║   {                                                 ║
        ║     offsets: Map<nodeId, {dx, dy}>                 ║
        ║     guide?: ArrangementGuide                        ║
        ║     rings/bars/chains?: ...                         ║
        ║   }                                                 ║
        ╚═════════════════════════════════════════════════════╝
                              ↓
        ┌──────────────────────┬─────────────────┬────────────────┐
        ↓                      ↓                 ↓                ↓
   ┌─────────┐          ┌──────────┐      ┌──────────┐    ┌───────────┐
   │ Timeline │          │   Grid   │      │ Triangle │    │ Concentric│
   │ timelineGuide       │ gridGuide│      │ triangleGuide  │ concentricGuide
   │ {                   │ {        │      │ {              │ {
   │  type: "timeline"   │  type:"grid"    │  type:"triangle"│ type:"concentric"
   │  axisY: number      │  verticals: []  │  vertices: []  │ rings: []
   │  ticks: [{x,label}] │  horizontals:[] │  }             │ }
   │ }                   │  bounds: {}     │                │
   └─────────┘          │ }               └──────────────┘  └───────────┘
                        └──────────────┘

                                ↓
        ┌────────────────────────────────────────────────────────┐
        │ For each group guide, create GroupGuideEntry:          │
        │ {                                                      │
        │   guide: <one of above 5 types>,                      │
        │   centerX: world space X coordinate,                  │
        │   centerY: world space Y coordinate                   │
        │ }                                                      │
        └────────────────────────────────────────────────────────┘
                              ↓
        ┌────────────────────────────────────────────────────────┐
        │        CLUSTER METADATA (ClusterMetadata)             │
        │ {                                                      │
        │   nodeClusterMap: Map<nodeId, groupKey>,              │
        │   clusterCentroids: Map<groupKey, {x,y}>,             │
        │   groupGuides?: GroupGuideEntry[],  ← GUIDE DATA      │
        │   ...other metadata...                                │
        │ }                                                      │
        └────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                   GRAPH VIEW CONTAINER                              │
│              (src/views/GraphViewContainer.ts)                      │
│                    _buildCableTrayInner()                           │
└──────────────────────────────────────────────────────────────────────┘
        ↓
    this.clusterMeta.groupGuides
        ↓
   ┌──────────────────────────────────────────────────────┐
   │ For each GroupGuideEntry gg in groupGuides:         │
   │   dispatch on gg.guide.type                          │
   └──────────────────────────────────────────────────────┘
        ↓
   ┌────────────────────────────────────────────────────────────────┐
   │                      DISPATCH LOGIC                            │
   ├─────────────────────┬──────────────────┬─────────────────────┤
   ↓                     ↓                  ↓                     ↓
┌────────────────┐  ┌──────────────┐  ┌────────────────┐  ┌──────────┐
│  TimelineGuide │  │  GridGuide   │  │ TriangleGuide  │  │Concentric│
├────────────────┤  ├──────────────┤  ├────────────────┤  ├──────────┤
│ Extract:       │  │ Extract:     │  │ Extract:       │  │ Extract: │
│ - ticks[].x    │  │ - verticals  │  │ - vertices     │  │ - rings  │
│ - axisY        │  │ - horizontals│  │ - bounds       │  │ (and gen-│
│                │  │ - bounds     │  │ - compute rows │  │ erate    │
│ buildCableTray │  │              │  │ - compute cols │  │ spokes)  │
│ {              │  │ buildCableTray│  │               │  │          │
│  system:       │  │ {            │  │ buildCableTray │  │ buildCableTray
│  "cartesian"   │  │  system:     │  │ {              │  │ {
│  axis1Lines:   │  │  "cartesian" │  │  system:       │  │  system:
│  ticks.map(t)  │  │  axis1Lines: │  │  "cartesian"   │  │  "polar"
│  axis2Lines: [ │  │  verticals   │  │  axis1Lines:   │  │  axis1Lines:
│   {pos:axisY}] │  │  axis2Lines: │  │  verticals     │  │  rings.map(r)
│  ...           │  │  horizontals │  │  axis2Lines:   │  │  axis2Lines:
│ }              │  │  ...         │  │  horizontals   │  │  spokes[0..N]
└────────────────┘  │ }            │  │  ...           │  │  ...
                    └──────────────┘  │ }              │  │ }
                                      └────────────────┘  └──────────┘

                                    ↓
        ┌──────────────────────────────────────────────────────┐
        │       buildCableTray(...)                            │
        │   (converts guides to cable tray lines)              │
        └──────────────────────────────────────────────────────┘
                              ↓
        ┌──────────────────────────────────────────────────────┐
        │         this.cableTrayData                           │
        │   (Road network topology for routing)                │
        └──────────────────────────────────────────────────────┘
```

---

## Guide Type → Cable Tray Topology Mapping

### Timeline Guide
```
Input:  axisY: 10, ticks: [{x: -30, label: "2023"}, {x:0, label: "2024"}, {x:30, label: "2025"}]
        ↓
Output: 3 vertical roads at x ∈ {-30, 0, 30}
        1 horizontal road at y = 10
        Topology: Time-indexed grid
```

### Grid Guide
```
Input:  verticals: [-36, -12, 12, 36], horizontals: [-24, 0, 24]
        ↓
Output: 4 vertical roads + 3 horizontal roads
        Topology: 4×3 rectangular grid
```

### Triangle Guide
```
Input:  vertices: [{x:0, y:-100}, {x:-100, y:100}, {x:100, y:100}]
        ↓
Process: numRows = ceil(√(2n)), rowSpacing = height/(numRows-1)
         numCols = sqrt(n), colSpacing = width/(numCols-1)
         ↓
Output: Horizontal roads per row
        Vertical roads per column
        Topology: Triangular grid
```

### Concentric Guide
```
Input:  rings: [25.5, 51.2, 78.9, 108.4]
        ↓
Process: spokeCount = min(16, max(8, ceil(√(n/5))))
         ↓
Output: 4 concentric circles (axis1)
        8 radial spokes at angles (axis2)
        Topology: Polar grid (rings + spokes)
```

### CoordinateGuide
```
Input:  system: "cartesian"
        gridInfo: {
          axis1Lines: [{position: -50}, {position: 0}, {position: 50}],
          axis2Lines: [{position: -75}, {position: 75}],
          axis1Shape: {kind: "line"},
          axis2Shape: {kind: "line"}
        }
        ↓
Output: Dense grid lines from coordinate engine
        Topology: Custom coordinate axes
```

---

## Key Properties Summary

| Guide Type | Axis1 | Axis2 | System | Created By | Nodes Constraint |
|---|---|---|---|---|---|
| **Timeline** | Time ticks (vertical) | Time axis (horizontal) | Cartesian | timelineOffsets() | Ordered by date |
| **Grid** | Column lines | Row lines | Cartesian | gridOffsets() | √n × √n arrangement |
| **Triangle** | Column lines | Row lines | Cartesian | triangleOffsets() | Triangular pyramid |
| **Concentric** | Ring circles | Spokes (angles) | Polar | concentricOffsets() | Concentric rings |
| **Coordinate** | Dense axis1 | Dense axis2 | Cart/Polar | coordinateOffsets() | Custom functions |

---

## WorldSpace Offsets Applied By

```
Relative Guide (created at origin)
    ↓ [guide from arrangeByType]
    ↓
GroupGuideEntry { guide, centerX, centerY }
    ↓ [centerX, centerY applied in _buildCableTrayInner]
    ↓
Cable Tray (world-space coordinates)
    ↓
Road Network (rendering topology)
```

### Example: Grid Guide in Group at (100, 50)

```
Created guide:
  verticals: [-12, 12]      ← relative to origin
  horizontals: [-24, 24]    ← relative to origin

GroupGuideEntry:
  guide: {verticals: [-12, 12], horizontals: [-24, 24]}
  centerX: 100
  centerY: 50

_buildCableTrayInner applies offset:
  cable tray vertical roads: x ∈ {88, 112}     ← -12+100, 12+100
  cable tray horizontal roads: y ∈ {26, 74}    ← -24+50, 24+50
```

---

## Guide Existence Conditions

| Guide Type | Condition | Fallback |
|---|---|---|
| Timeline | arrangement === "timeline" | Yes (sparse grid) |
| Grid | arrangement === "grid" or "square" | Yes (sparse grid) |
| Triangle | arrangement === "triangle" | Yes (sparse grid) |
| Concentric | arrangement === "concentric" or "radial" | Yes (sparse rings+spokes) |
| Coordinate | layout.system defined (custom) | Yes (sparse grid) |
| **None** | No guides from metadata | Fallback grid from bounds |

---

## Constants Used in Guide Derivation

### Spacing Formula
```
spacing = nodeSize × 2 × max(nodeSpacing, groupScale)
```
- Applied uniformly in grid, timeline, triangle
- Not used in concentric (uses circumference-based capacity)

### Spoke Count (Concentric/Fallback)
```
spokeCount = min(16, max(8, ceil(√(n / 5))))
```
- For 5 nodes: ceil(√1) = 1 → max(8, 1) = 8
- For 16 nodes: ceil(√3.2) = 2 → max(8, 2) = 8
- For 100 nodes: ceil(√20) = 5 → max(8, 5) = 8
- For 400 nodes: ceil(√80) = 9 → max(8, 9) = 9
- For 2500 nodes: ceil(√500) = 23 → min(16, 23) = 16

### Ring Count (CoordinateGuide Polar)
```
ringCount = min(12, max(6, ceil(√(n / 10))))
```
- For 10 nodes: ceil(√1) = 1 → max(6, 1) = 6
- For 100 nodes: ceil(√10) = 4 → max(6, 4) = 6
- For 600 nodes: ceil(√60) = 8 → max(6, 8) = 8
- For 1200 nodes: ceil(√120) = 11 → max(6, 11) = 11
- For 2400 nodes: ceil(√240) = 16 → min(12, 16) = 12

