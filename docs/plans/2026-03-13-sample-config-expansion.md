# Sample Config Expansion — Arrangement Showcase

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create diverse sample configs covering all arrangement types and custom coordinate expressions, then verify each via e2e test

**Architecture:** New numbered JSON samples (23–30) showcasing missing arrangement patterns and advanced coordinate expressions. A single e2e test file loads each config via CDP, renders it, captures a screenshot, and verifies node positions are within expected bounds.

**Tech Stack:** JSON sample configs, Playwright CDP e2e tests, Obsidian plugin runtime

---

## UI/UX Design Rationale

Each sample represents a distinct **visual pattern** users might want:

```
┌──────────────────────────────────────────────────┐
│  23: Random Scatter  │ 24: Baobab Sunburst       │
│  ∘ · ∘    · ∘ ·      │     ╭─╮                   │
│   ∘  ·  ∘  ·  ∘      │   ╭─┤ ├─╮                 │
│  · ∘  ∘   ·   ∘      │   ╰─┤ ├─╯                 │
│                       │     ╰─╯                   │
├───────────────────────┼───────────────────────────┤
│  25: Rose Curve (k=5) │ 26: Lissajous Figure      │
│       ╱╲              │      ∞                     │
│    ╱∘∘∘╲             │    ╱   ╲                   │
│    ╲∘∘∘╱             │    ╲   ╱                   │
│       ╲╱              │      ∞                     │
├───────────────────────┼───────────────────────────┤
│  27: Filled Pentagon  │ 28: Cardioid Heart         │
│      ╱╲               │      ♥                     │
│    ╱    ╲             │    ╱   ╲                   │
│    ──────             │    ╲   ╱                   │
│                       │      ∨                     │
├───────────────────────┼───────────────────────────┤
│  29: Concentric Rings │ 30: Mountain Ridge         │
│    ╭──────╮           │        ∧                   │
│  ╭─┤  ∘∘  ├─╮        │      ╱  ╲                  │
│  ╰─┤  ∘∘  ├─╯        │    ╱    ╲                 │
│    ╰──────╯           │  ──────────               │
└───────────────────────┴───────────────────────────┘
```

### Task 1: Create sample 23-random-scatter.json

**Files:**
- Create: `samples/23-random-scatter.json`

**Step 1: Write the sample config**

Random arrangement — shows all nodes scattered with no geometric pattern.
Uses `tag:?` grouping to color by tag.

```json
{
  "showTags": true,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": true,
  "showArrows": false,
  "textFadeThreshold": 0.5,
  "nodeSize": 5,
  "scaleByDegree": true,
  "centerForce": 0.001,
  "repelForce": 60,
  "linkForce": 0.01,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": false,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": false,
  "showAggregation": false,
  "showTagNodes": false,
  "tagDisplay": "node",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.0,
  "directionalGravityRules": [],
  "hoverHops": 1,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "tag:?", "recursive": false }],
  "clusterArrangement": "random",
  "clusterNodeSpacing": 2.0,
  "clusterGroupScale": 2.0,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": false,
  "edgeBundleStrength": 0.3,
  "sortRules": [],
  "nodeRules": [],
  "nodeShapeRules": [{ "match": "default", "shape": "circle" }],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": true,
  "groupBy": "tag:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": false,
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/23-random-scatter.json
git commit -m "feat(samples): add 23-random-scatter preset"
```

---

### Task 2: Create sample 24-baobab-sunburst.json

**Files:**
- Create: `samples/24-baobab-sunburst.json`

**Step 1: Write the sample config**

Sunburst with large center hole and thin rings (Baobab-style).
Uses the new `_hole`, `_ringW`, `_ringGap`, `_sectorGap` constants.

```json
{
  "showTags": true,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": true,
  "showArrows": false,
  "textFadeThreshold": 0.6,
  "nodeSize": 4,
  "scaleByDegree": false,
  "centerForce": 0.001,
  "repelForce": 80,
  "linkForce": 0.01,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": true,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": false,
  "showAggregation": false,
  "showTagNodes": true,
  "tagDisplay": "enclosure",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.5,
  "directionalGravityRules": [],
  "hoverHops": 1,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "folder:?", "recursive": false }],
  "clusterArrangement": "sunburst",
  "clusterNodeSpacing": 3.0,
  "clusterGroupScale": 3.0,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": false,
  "edgeBundleStrength": 0.5,
  "sortRules": [{ "key": "degree", "order": "desc" }],
  "nodeRules": [],
  "nodeShapeRules": [
    { "match": "isTag", "shape": "triangle" },
    { "match": "default", "shape": "circle" }
  ],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": true,
  "groupBy": "folder:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": false,
  "coordinateLayout": {
    "system": "polar",
    "axis1": { "source": { "kind": "const", "value": 1 }, "transform": { "kind": "linear", "scale": 1 } },
    "axis2": { "source": { "kind": "index" }, "transform": { "kind": "even-divide", "totalRange": 360 } },
    "perGroup": false,
    "constants": { "_ringW": 0.25, "_ringGap": 0.02, "_hole": 3.0, "_sectorGap": 0.015 }
  },
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/24-baobab-sunburst.json
git commit -m "feat(samples): add 24-baobab-sunburst with large center hole"
```

---

### Task 3: Create sample 25-rose-curve.json

**Files:**
- Create: `samples/25-rose-curve.json`

**Step 1: Write the sample config**

5-petal rose curve using custom polar expression `cos(k*t*tau)` where k=5.
Demonstrates advanced math expression in coordinate system.

```json
{
  "showTags": true,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": true,
  "showArrows": false,
  "textFadeThreshold": 0.5,
  "nodeSize": 5,
  "scaleByDegree": false,
  "centerForce": 0.001,
  "repelForce": 80,
  "linkForce": 0.01,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": true,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": false,
  "showAggregation": false,
  "showTagNodes": true,
  "tagDisplay": "enclosure",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.5,
  "directionalGravityRules": [],
  "hoverHops": 1,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "tag:?", "recursive": false }],
  "clusterArrangement": "custom",
  "clusterNodeSpacing": 3.0,
  "clusterGroupScale": 3.0,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": false,
  "edgeBundleStrength": 0.5,
  "sortRules": [{ "key": "degree", "order": "desc" }],
  "nodeRules": [],
  "nodeShapeRules": [
    { "match": "isTag", "shape": "triangle" },
    { "match": "default", "shape": "circle" }
  ],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": true,
  "groupBy": "tag:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": true,
  "coordinateLayout": {
    "system": "polar",
    "axis1": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "a*abs(cos(k*i/n*pi))", "scale": 1 }
    },
    "axis2": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "i/n*360", "scale": 1 }
    },
    "perGroup": true,
    "constants": { "k": 5, "a": 1.0, "_minGap": 6 }
  },
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/25-rose-curve.json
git commit -m "feat(samples): add 25-rose-curve 5-petal polar layout"
```

---

### Task 4: Create sample 26-lissajous-figure.json

**Files:**
- Create: `samples/26-lissajous-figure.json`

**Step 1: Write the sample config**

Lissajous figure using custom cartesian expression.
X = sin(a*t + delta), Y = sin(b*t), creating figure-8 or infinity patterns.

```json
{
  "showTags": false,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": true,
  "showArrows": false,
  "textFadeThreshold": 0.5,
  "nodeSize": 5,
  "scaleByDegree": true,
  "centerForce": 0.001,
  "repelForce": 80,
  "linkForce": 0.01,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": true,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": false,
  "showAggregation": false,
  "showTagNodes": false,
  "tagDisplay": "node",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.0,
  "directionalGravityRules": [],
  "hoverHops": 1,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "folder:?", "recursive": false }],
  "clusterArrangement": "custom",
  "clusterNodeSpacing": 3.0,
  "clusterGroupScale": 3.0,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": false,
  "edgeBundleStrength": 0.5,
  "sortRules": [],
  "nodeRules": [],
  "nodeShapeRules": [{ "match": "default", "shape": "circle" }],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": true,
  "groupBy": "folder:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": true,
  "coordinateLayout": {
    "system": "cartesian",
    "axis1": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "sin(a*i/n*2*pi+d)", "scale": 1 }
    },
    "axis2": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "sin(b*i/n*2*pi)", "scale": 1 }
    },
    "perGroup": true,
    "constants": { "a": 3, "b": 2, "d": 0.5, "_minGap": 6 }
  },
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/26-lissajous-figure.json
git commit -m "feat(samples): add 26-lissajous-figure cartesian layout"
```

---

### Task 5: Create sample 27-filled-pentagon.json

**Files:**
- Create: `samples/27-filled-pentagon.json`

**Step 1: Write the sample config**

Filled pentagon (k=5) — variation of the hexagon (21) pattern.

```json
{
  "showTags": true,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": true,
  "showArrows": false,
  "textFadeThreshold": 0.6,
  "nodeSize": 5,
  "scaleByDegree": false,
  "centerForce": 0.001,
  "repelForce": 80,
  "linkForce": 0.01,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": true,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": false,
  "showAggregation": false,
  "showTagNodes": true,
  "tagDisplay": "enclosure",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.5,
  "directionalGravityRules": [],
  "hoverHops": 1,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "tag:?", "recursive": false }],
  "clusterArrangement": "custom",
  "clusterNodeSpacing": 3.0,
  "clusterGroupScale": 3.0,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": false,
  "edgeBundleStrength": 0.5,
  "sortRules": [{ "key": "degree", "order": "desc" }],
  "nodeRules": [],
  "nodeShapeRules": [
    { "match": "isTag", "shape": "triangle" },
    { "match": "default", "shape": "circle" }
  ],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": true,
  "groupBy": "tag:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": true,
  "coordinateLayout": {
    "system": "cartesian",
    "axis1": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "(i/n)^d*(cos(pi/k)/cos(i*2.39996%(2*pi/k)-pi/k))*cos(i*2.39996)", "scale": 1 }
    },
    "axis2": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "(i/n)^d*(cos(pi/k)/cos(i*2.39996%(2*pi/k)-pi/k))*sin(i*2.39996)", "scale": 1 }
    },
    "perGroup": true,
    "constants": { "k": 5, "d": 0.5, "_minGap": 8 }
  },
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/27-filled-pentagon.json
git commit -m "feat(samples): add 27-filled-pentagon k=5 variant"
```

---

### Task 6: Create sample 28-cardioid-heart.json

**Files:**
- Create: `samples/28-cardioid-heart.json`

**Step 1: Write the sample config**

Cardioid (heart shape) using polar expression `a*(1+cos(t))`.

```json
{
  "showTags": false,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": true,
  "showArrows": true,
  "textFadeThreshold": 0.5,
  "nodeSize": 5,
  "scaleByDegree": false,
  "centerForce": 0.001,
  "repelForce": 80,
  "linkForce": 0.01,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": true,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": false,
  "showAggregation": false,
  "showTagNodes": false,
  "tagDisplay": "node",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.0,
  "directionalGravityRules": [],
  "hoverHops": 1,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "category:?", "recursive": false }],
  "clusterArrangement": "custom",
  "clusterNodeSpacing": 3.0,
  "clusterGroupScale": 3.0,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": false,
  "edgeBundleStrength": 0.5,
  "sortRules": [],
  "nodeRules": [],
  "nodeShapeRules": [{ "match": "default", "shape": "circle" }],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": true,
  "groupBy": "category:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": true,
  "coordinateLayout": {
    "system": "polar",
    "axis1": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "a*(1+cos(i/n*2*pi))", "scale": 1 }
    },
    "axis2": {
      "source": { "kind": "index" },
      "transform": { "kind": "expression", "expr": "i/n*360", "scale": 1 }
    },
    "perGroup": true,
    "constants": { "a": 1.0, "_minGap": 6 }
  },
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/28-cardioid-heart.json
git commit -m "feat(samples): add 28-cardioid-heart polar layout"
```

---

### Task 7: Create sample 29-concentric-degree.json

**Files:**
- Create: `samples/29-concentric-degree.json`

**Step 1: Write the sample config**

Concentric rings with nodes sorted by degree (high-degree center, low-degree periphery).
Uses the standard concentric preset with `category:?` grouping.

```json
{
  "showTags": false,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": false,
  "showArrows": true,
  "textFadeThreshold": 0.5,
  "nodeSize": 5,
  "scaleByDegree": true,
  "centerForce": 0.001,
  "repelForce": 80,
  "linkForce": 0.02,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": true,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": true,
  "showAggregation": false,
  "showTagNodes": false,
  "tagDisplay": "node",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.0,
  "directionalGravityRules": [],
  "hoverHops": 2,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "category:?", "recursive": false }],
  "clusterArrangement": "concentric",
  "clusterNodeSpacing": 2.5,
  "clusterGroupScale": 2.5,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": true,
  "edgeBundleStrength": 0.5,
  "sortRules": [{ "key": "degree", "order": "desc" }],
  "nodeRules": [],
  "nodeShapeRules": [
    { "match": "category", "category": "deity", "shape": "hexagon" },
    { "match": "default", "shape": "circle" }
  ],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": false,
  "groupBy": "category:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": false,
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/29-concentric-degree.json
git commit -m "feat(samples): add 29-concentric-degree with degree-sorted rings"
```

---

### Task 8: Create sample 30-mountain-ridge.json

**Files:**
- Create: `samples/30-mountain-ridge.json`

**Step 1: Write the sample config**

Mountain arrangement — high-degree nodes at top, low-degree at bottom.
Uses `node_type:?` grouping for variety.

```json
{
  "showTags": false,
  "showAttachments": false,
  "existingOnly": true,
  "showOrphans": true,
  "showArrows": true,
  "textFadeThreshold": 0.5,
  "nodeSize": 5,
  "scaleByDegree": true,
  "centerForce": 0.001,
  "repelForce": 80,
  "linkForce": 0.01,
  "linkDistance": 50,
  "groups": [],
  "searchQuery": "",
  "colorEdgesByRelation": true,
  "colorNodesByCategory": true,
  "heatmapMode": false,
  "showInheritance": false,
  "showAggregation": false,
  "showTagNodes": false,
  "tagDisplay": "node",
  "showSimilar": false,
  "showSibling": false,
  "showSequence": false,
  "showLinks": true,
  "showTagEdges": false,
  "showCategoryEdges": false,
  "showSemanticEdges": false,
  "enclosureSpacing": 1.0,
  "directionalGravityRules": [],
  "hoverHops": 1,
  "commonQueries": [],
  "clusterGroupRules": [{ "groupBy": "node_type:?", "recursive": false }],
  "clusterArrangement": "mountain",
  "clusterNodeSpacing": 2.5,
  "clusterGroupScale": 2.0,
  "clusterGroupSpacing": 2.0,
  "fadeEdgesByDegree": true,
  "edgeBundleStrength": 0.5,
  "sortRules": [{ "key": "degree", "order": "desc" }],
  "nodeRules": [],
  "nodeShapeRules": [
    { "match": "category", "category": "ruler", "shape": "hexagon" },
    { "match": "default", "shape": "circle" }
  ],
  "dataviewQuery": "",
  "timelineKey": "date",
  "timelineEndKey": "end-date",
  "timelineOrderFields": "",
  "showEdgeLabels": false,
  "showMinimap": true,
  "showDotGrid": false,
  "groupBy": "node_type:?",
  "groupByRules": null,
  "groupMinSize": 2,
  "groupFilter": "",
  "collapsedGroups": [],
  "activeTab": "layout",
  "autoFit": true,
  "showDurationBars": false,
  "showGuideLines": false,
  "guideLineMode": "shared",
  "showGroupGrid": false,
  "timelineRangeMin": 0,
  "timelineRangeMax": 1
}
```

**Step 2: Commit**

```bash
git add samples/30-mountain-ridge.json
git commit -m "feat(samples): add 30-mountain-ridge with degree-height mapping"
```

---

### Task 9: Create e2e test for all samples

**Files:**
- Create: `e2e/cdp-e2e-sample-showcase.spec.ts`

**Step 1: Write the e2e test**

Test loads each new sample (23–30) via CDP, applies the config, waits for rendering,
takes a screenshot, and verifies basic node positioning constraints.

**Step 2: Run the tests**

```bash
npx playwright test e2e/cdp-e2e-sample-showcase.spec.ts --reporter=list
```

**Step 3: Commit**

```bash
git add e2e/cdp-e2e-sample-showcase.spec.ts e2e/images/sample-*
git commit -m "test(e2e): add showcase test for samples 23-30"
```

---

### Task 10: Final batch commit

**Step 1: Run vitest to verify no regressions**

```bash
npx vitest run
```

Expected: All existing tests pass.

**Step 2: Run tsc**

```bash
npx tsc --noEmit
```

Expected: No new type errors.
