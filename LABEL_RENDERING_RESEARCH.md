# Label Rendering and Collision Detection Research

## Executive Summary

The obsidian-graph-island plugin uses a multi-layered approach to label rendering and collision detection:

1. **Node labels** — rendered as CanvasText objects with zone-based placement and overlap culling
2. **Tag labels** — positioned below nodes with configurable font size and alpha
3. **Group labels** (enclosures) — positioned outside hull boundaries with greedy nudge collision avoidance
4. **Collision spacing** — computed via pairwise gap formula during layout phase, independent of actual label dimensions

**Critical finding**: Label dimensions are NOT considered during layout collision calculations. The gap formula uses only node radii, not label bounding boxes.

---

## 1. Node Label Rendering

**File**: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/views/RenderPipeline.ts` (lines 883–1134)

### Creation (Lines 883–998)

Labels are created in `createSinglePixiNode()` as `CanvasText` objects:

```typescript
label = new CanvasText(n.label, {
  fontSize: scaledFontSize,      // scaled 10-14px based on degree importance
  fill: labelFill,               // 0xe0e0e0 (light gray) in dark theme, 0x222222 in light
  fontWeight: labelFontWeight,   // "500" for regular, "bold" for super nodes
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
});
label.bgColor = labelBg;         // pill background color (theme or darkened node color)
label.bgAlpha = isSuperNode ? 0.9 : rt.labelBgAlpha;  // typically 0.85 for regular nodes
label.bgPadX = isSuperNode ? 10 : 8;                  // horizontal padding
label.bgPadY = isSuperNode ? 4 : 3;                   // vertical padding
label.cornerRadius = rt.labelHaloCornerRadius ?? null; // null = full pill shape
label.strokeColor = rt.labelStrokeColor ?? null;     // text outline color
label.strokeWidth = rt.labelStrokeWidth ?? 0;
```

**Font sizing logic** (lines 924–929):
- Computed from node degree relative to max degree across graph
- Formula: `scaledFontSize = fontMin + (degree / maxDeg) * (fontMax - fontMin)`
- Range: 10–14 px (configurable via `nodeLabelFontSizeMin`/`nodeLabelFontSizeMax`)
- Super nodes use fixed size: `superFontSize` (default 13 px)

**Label threshold**: Only displayed if:
- Node is a super node (collapsed group), OR
- Node degree > `pendingLabelThreshold` (dynamically adjusted based on graph size)

### Positioning

#### Zone-Based Placement (Lines 951–962)

When `labelZonePlacement` is enabled (default):

```typescript
const placement = this.computeZonePlacement(n, r, zoneOffset);
label.x = placement.x;
label.y = placement.y;
label.anchor.set(placement.anchorX, 0);  // anchor Y=0 (top-aligned)
```

**Algorithm** (lines 1044–1134):
1. Collect angles to **linked neighbors** (adjacency-based)
2. Collect angles to **proximity neighbors** — unlinked nodes within `proximityR = (nodeRadius + offset) * proximityFactor` (factor ~8)
   - Cap at 12 nearest to limit O(n²) cost
3. Find largest angular gap among all collected neighbors
4. Scale placement distance based on gap size:
   - Narrow gap (<π/4): scale to 0.6 × (nodeRadius + offset)
   - Medium gap (<π/2): scale to 0.8 × (nodeRadius + offset)
   - Wide gap: full distance (nodeRadius + offset)
5. Place label at gap midpoint, with anchor adjusted for text direction (0=left, 0.5=center, 1=right)

**Default placement** (fallback when zone placement disabled):
```typescript
label.x = r + 2;
label.y = -(r * 0.4 + 2);  // upper-right offset
```

### Overlap Culling (Lines 1139–1327)

Executed after all node labels are created via `cullOverlappingLabels()`.

**Process**:

1. **Collect visible labels** (lines 1170–1190):
   - Screen-space AABB for each label (world position × zoom)
   - Width: `label.text.length * charW * scaleX * zoom + (bgPadX * 2 * scaleX * zoom)`
   - Height: `fontSize * scaleY * 1.3 * zoom + (bgPadY * 2 * scaleY * zoom)`
   - Capped at `maxScreenW` (500px) and `maxScreenH` (150px)

2. **Priority sorting** (lines 1197–1211):
   - Separate super nodes from regular nodes
   - Interleave: super node → `minNonSuper` (default 3) regular nodes → repeat
   - This prevents super node monopoly on label placement (AP-5 protection)

3. **Greedy placement** (lines 1213–1325):
   - For each label (priority order), check overlap with already-placed labels
   - If overlap detected, try 8 displacement offsets in screen space:
     1. Bottom-right
     2. Left
     3. Below
     4. Top-right
     5. Top-left
     6. Bottom-left
     7. Above-right
     8. Above-left
   - Displacement cap (AP-1 metric): total distance ≤ `maxDispRatio * normBase`
     - `normBase = max(nodeR + visualW * 0.3, nodeR, 1)`
     - `maxDispRatio` default 4.0

4. **Leader lines** (lines 1299–1325):
   - When label is displaced beyond threshold, draw line from node edge to label
   - Configurable via `labelLeaderLines` (enable/disable) and `labelLeaderLineWidth`

**Key settings** (RenderThresholds):
- `labelZonePlacement` — enable zone-based placement (default true)
- `labelZoneOffset` — distance from node to label (default 6 world units)
- `labelZoneProximityFactor` — proximity search radius multiplier (default 8)
- `labelOverlapCulling` — enable/disable (default true)
- `labelOverlapMargin` — margin around labels for collision detection (default varies)
- `labelMinNonSuper` — min non-super labels per super label (default 3)
- `labelLeaderLines` — draw connection lines (default true)
- `labelLeaderLineAlpha`, `labelLeaderLineWidth` — styling

### Tag Labels (Lines 965–988)

Positioned below nodes when enabled:

```typescript
tagLabel = new CanvasText(tagText, {
  fontSize: rt.tagLabelFontSize ?? 9,
  fill: accentColor,  // 0x818cf8 (indigo, configurable)
  fontWeight: "400",
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
});
tagLabel.alpha = rt.tagLabelAlpha ?? 0.65;
tagLabel.bgColor = rt.labelBgColor;
tagLabel.bgAlpha = (rt.labelBgAlpha ?? 0.85) * 0.7;
tagLabel.bgPadX = 4;
tagLabel.bgPadY = 1;
tagLabel.anchor.set(0.5, 0);  // center-aligned, top-anchored
tagLabel.x = 0;
tagLabel.y = r + (rt.tagLabelOffset ?? 4);  // below node
tagLabel.visible = false;  // initially hidden, revealed by LOD logic
```

---

## 2. Group Label Rendering (Enclosures)

**File**: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/views/EnclosureRenderer.ts` (lines 100–432)

### Creation and Positioning (Lines 281–358)

Labels are CanvasText objects created for each tag/group:

```typescript
txt = new CanvasText(`#${tag}`, {
  fontSize: glFontSize,        // default 11 px
  fill: hexStr,                // enclosure color as hex string
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  fontWeight: glFontWeight,    // default "400"
});
txt.anchor.set(0.5, 0.5);      // center-anchored
txt.resolution = 2;
txt.letterSpacing = glLetterSpacing;  // default 0.15 em
txt.strokeColor = 0x000000;
txt.strokeWidth = 2;
txt.bgColor = darkenHex(hex, 0.25);
txt.bgAlpha = glBgAlpha;       // default 0.55
txt.bgPadX = 8;
txt.bgPadY = 3;
```

**Positioning logic** (lines 320–351):

1. Find **label centroid** — average of all hull points
2. Find **farthest hull point** from centroid
3. Compute direction vector (centroid → farthest)
4. Place label: `farthestPoint + unitDirection * glHullOffset`
   - `glHullOffset` default 20 world units
5. Apply zoom-based scale:
   - Zoomed out (worldScale < 0.45): `scale = min(8, max(1.5, 1.8 / worldScale))`
   - Zoomed in: `scale = min(4, max(1, 1 / worldScale))`

### Label Collision Avoidance (Lines 360–426)

Greedy nudge algorithm for group labels:

1. **Collect visible labels** (lines 363–370)
   - Calculate bounding box: `{x, y, w, h}` in world coordinates
   - Width: `txt.width` (includes scale and padding)
   - Height: `txt.height`

2. **Sort by priority** (line 372):
   - Larger groups first (by member count)

3. **Greedy placement** (lines 396–419):
   - For each label:
     - Check overlap with all previously placed labels
     - If no overlap → place and continue
     - If overlap:
       - Try up to 6 iterations of nudging
       - Nudge direction: perpendicular to blocker (shortest escape)
       - Nudge amount: `overlap + rect.h/w * 0.15`
     - If still overlapping after 6 attempts → hide label

4. **Overlap test** (line 392):
   ```typescript
   const rectsOverlap = (a, b) =>
     a.x < b.x + b.w && a.x + a.w > b.x &&
     a.y < b.y + b.h && a.y + a.h > b.y;
   ```

---

## 3. Layout Collision & Spacing (Force Layout Pipeline)

**File**: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/layouts/cluster-force.ts`

### Node Size Determination

**effectiveRadius()** (lines 620–627):
```typescript
export function effectiveRadius(
  n: GraphNode,
  nodeSize: number,
  degree: number,
  maxNodeRadius = 60,
  minNodeRadius = 3
): number {
  const baseR = nodeRadius(nodeSize, degree, minNodeRadius);
  const cap = maxNodeRadius > 0 ? maxNodeRadius : Infinity;
  if (n.collapsedMembers && n.collapsedMembers.length > 0) {
    // Super node: inflate by sqrt of member count
    return max(min(max(baseR, baseR * (1 + sqrt(memberCount) * 0.5)), cap), minNodeRadius);
  }
  return max(baseR, minNodeRadius);
}
```

**nodeRadius()** (lines 613–615):
```typescript
export function nodeRadius(nodeSize: number, _degree: number, minNodeRadius = 3): number {
  return Math.max(nodeSize, minNodeRadius);
}
```

**Key insight**: Node size is **constant per node** (degree-independent). Super nodes get a radius boost based on member count.

### Gap Calculation

**pairwiseGap()** (lines 607–609) — the fundamental spacing formula:
```typescript
function pairwiseGap(r1: number, r2: number, spacing: number): number {
  return Math.max(r1, r2) * 2 * spacing;
}
```

**Parameters**:
- `r1`, `r2` — node/group radii
- `spacing` — multiplier (nodeSpacing or groupSpacing)
  - `nodeSpacing` default 3.0 (panel setting)
  - `groupSpacing` default 2.0
- Returns **center-to-center** minimum distance (not clear gap)

**Example**:
- Two nodes radius 6 each, nodeSpacing 3.0:
- Gap = max(6, 6) × 2 × 3.0 = 36 world units
- Clear gap = 36 - 6 - 6 = 24 units

### Inter-Node Spacing (Inside Groups)

**resolveIntraGroupGaps()** (lines 313–363):

Applied AFTER expression-based offsets are computed. Uses `minGap` (user constant `_minGap`, default 0):

```typescript
function resolveIntraGroupGaps(
  targets: Map<string, { x: number; y: number }>,
  groups: Map<string, GraphNode[]>,
  minGap: number,
  nodeSize: number,
  degrees: Map<string, number>,
) {
  // Pairwise repulsion: push apart any nodes closer than (ri + rj + minGap)
  for (const members of groups) {
    for (let iter = 0; iter < 3; iter++) {
      for (let i < j in members) {
        const dist = distance(target[i], target[j]);
        const required = ri + rj + minGap;
        if (dist < required) {
          // Push apart symmetrically
          const overlap = required - dist;
          ti.x -= (dx/dist) * overlap/2;
          ti.y -= (dy/dist) * overlap/2;
          // ... and tj in opposite direction
        }
      }
    }
  }
}
```

**Critical**: This uses **only node radii**, NOT label widths.

### Inter-Group Spacing

**resolveGroupOverlaps()** (lines 208–306):

Uses `overlapPad` (user constant `_overlapPad`, default 1.3):

```typescript
const minDist = (rA + rB) * overlapPad;
if (dist < minDist) {
  // Push groups apart weighted by size (smaller moves more)
}
```

**Example**:
- Group A radius 50, Group B radius 40
- Min distance = (50 + 40) × 1.3 = 117 world units

### Group Spacing (Absolute Target Computation)

**computeFlatTargets()** (lines 747–943) — 6-step pipeline:

1. **Node size** — via effectiveRadius()
2. **Inter-node distance** — pairwiseGap(max(ri, rj))
3. **Group radius** — measured from actual offsets + nodeSize margin
4. **Inter-group distance** — pairwiseGap(max(groupRi, groupRj), groupSpacing)
5. **Group positions** — placed via layoutGroupsCircle/layoutGroupsConcentric/layoutGroupsGrid
6. **Node positions** — groupCenter + offset

**Example layout function** (layoutGroupsCircle, lines 1481–1532):

```typescript
for (let i = 0; i < nGroups; i++) {
  const j = (i + 1) % nGroups;
  totalArcNeeded += groupR[i] + groupR[j] +
    pairwiseGap(groupR[i], groupR[j], cfg.groupSpacing);
}
const minCircleR = totalArcNeeded / (2 * π);
```

---

## 4. Critical Findings: Label Dimensions NOT Considered in Layout

### The Gap Formula

**Line 608**:
```typescript
return Math.max(r1, r2) * 2 * spacing;
```

This formula uses **only radii** — NO label width, height, or font size.

### Why This Matters

1. **Node labels** (10–14 px font) can extend 50+ world units from node center
2. **Group labels** (11 px font, scaled up to 8× when zoomed out) can reach 100+ units
3. **Gap formula** ensures nodes don't overlap **circularly**, but labels can easily overlap each other

### Example Collision Scenario

- Node A (radius 6) with label "ActivityViewContainer" (~150 px wide at zoom 1.0)
- Node B (radius 6) placed 36 units away (gap formula)
- Nodes don't collide, but labels definitely do if placed on opposite sides

### Mitigation Strategies (Currently Implemented)

1. **Overlap culling** for node labels (screen-space, post-render)
2. **Zone-based placement** to position labels in least-crowded directions
3. **Leader lines** to disambiguate displaced labels
4. **Group label nudging** for enclosure labels

---

## 5. Data Flow

```
buildClusterForce() [cluster-force.ts:365]
├── applyGroupRule() — partition nodes by field
├── computeAbsoluteTargets() — main layout pipeline
│   ├── computeFlatTargets() — per-group offsets
│   │   ├── computeOffsets() — relative positions
│   │   │   ├── effectiveRadius() — node size
│   │   │   └── pairwiseGap() — inter-node distance
│   │   └── layoutGroupsCircle/Concentric/Grid() — group positions
│   │       └── pairwiseGap() — inter-group distance
│   └── resolveGroupOverlaps() — push apart overlapping groups
└── resolveIntraGroupGaps() — push apart close nodes within groups
    └── pairwiseGap() — minimum distance

GraphViewContainer.ts [RenderPipeline]
├── createSinglePixiNode() — create label objects
│   ├── CanvasText with font size, colors, padding
│   └── zone-based placement logic
└── cullOverlappingLabels() — post-render culling
    ├── Screen-space AABB collection
    ├── Priority-based sorting
    └── Greedy displacement with leader lines

EnclosureRenderer.ts
└── drawEnclosures() — group label placement
    ├── Label positioning (farthest point from centroid)
    └── Greedy nudge collision avoidance
```

---

## 6. Configuration Parameters

### Node Label (RenderThresholds)

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `nodeLabelFontSizeMin` | 10 | Minimum font size (px) |
| `nodeLabelFontSizeMax` | 14 | Maximum font size (px) |
| `labelZonePlacement` | true | Enable zone-based placement |
| `labelZoneOffset` | 6 | Distance from node to label (world units) |
| `labelZoneProximityFactor` | 8 | Proximity search radius multiplier |
| `labelGapScaleNarrow` | 0.6 | Scale when gap < π/4 radians |
| `labelGapScaleMedium` | 0.8 | Scale when gap < π/2 radians |
| `labelOverlapCulling` | true | Enable overlap avoidance |
| `labelOverlapMargin` | varies | Margin for collision detection |
| `labelOverlapMaxScreenW` | 500 | Max label width (screen px) |
| `labelOverlapMaxScreenH` | 150 | Max label height (screen px) |
| `labelMinNonSuper` | 3 | Min regular labels per super |
| `labelLeaderLines` | true | Draw connection lines |
| `labelLeaderLineAlpha` | varies | Line opacity |
| `labelBgColor` | varies | Pill background color |
| `labelBgAlpha` | 0.85 | Pill background opacity |
| `labelStrokeColor` | null | Text outline color |
| `labelStrokeWidth` | 0 | Outline width |

### Tag Label (RenderThresholds)

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `tagLabelShow` | true | Enable tag labels |
| `tagLabelFontSize` | 9 | Font size (px) |
| `tagLabelAlpha` | 0.65 | Opacity |
| `tagLabelMaxTags` | 2 | Max tags to display |
| `tagLabelOffset` | 4 | Distance below node (world units) |

### Group Label (RenderThresholds)

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `groupLabelFontSize` | 11 | Font size (px) |
| `groupLabelFontWeight` | "400" | Font weight |
| `groupLabelLetterSpacing` | 0.15 | Letter spacing (em) |
| `groupLabelAlpha` | 0.45 | Opacity |
| `groupLabelHullOffset` | 20 | Distance outside hull (world units) |
| `groupLabelBgAlpha` | 0.55 | Pill background opacity |
| `groupLabelScaleMin` | varies | Min zoom scale |
| `groupLabelScaleMax` | varies | Max zoom scale |
| `groupLabelScalePower` | varies | Scale curve exponent |

### Cluster Force Config

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `nodeSize` | varies | Base node radius |
| `nodeSpacing` | 3.0 | Inter-node spacing multiplier |
| `groupSpacing` | 2.0 | Inter-group spacing multiplier |
| `_overlapPad` | 1.3 | Group overlap padding |
| `_minGap` | 0 | Min gap between nodes (world units) |

---

## 7. CanvasText Implementation

**File**: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/views/canvas2d/CanvasText.ts`

### Text Measurement

```typescript
private _measureWithSpacing(ctx: CanvasRenderingContext2D, text: string): number {
  if (this.letterSpacing <= 0) return ctx.measureText(text).width;
  const fontSize = this.style.fontSize ?? 11;
  const spacingPx = this.letterSpacing * fontSize;
  return ctx.measureText(text).width + spacingPx * Math.max(0, text.length - 1);
}
```

### Properties

- `width` — measured with scale applied
- `height` — fontSize × scale.y
- `anchor` — {x, y} for positioning (0–1)
- `scale` — {x, y} multipliers
- `maxWidth` — optional truncation width
- `bgColor` — pill background (hex)
- `bgAlpha` — background opacity
- `bgPadX` — horizontal padding (px)
- `bgPadY` — vertical padding (px)
- `cornerRadius` — null = full pill, else custom radius
- `strokeColor` — outline (hex)
- `strokeWidth` — outline width (px)
- `letterSpacing` — in em units

### Rendering (_flush method)

1. Save canvas state
2. Translate to text position
3. Apply scale and rotation
4. Measure text (cached if unchanged)
5. Handle truncation if maxWidth exceeded
6. Draw pill background (rounded rect)
7. Draw stroke (outline)
8. Draw fill (text)
