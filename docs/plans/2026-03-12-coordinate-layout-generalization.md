# Coordinate Layout Generalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 9 fixed arrangement patterns with a generalized coordinate-system-based configuration model, where each arrangement becomes a preset that auto-fills coordinate/axis settings.

**Architecture:** Introduce `CoordinateLayout` type (system + axis1 + axis2 + perGroup) alongside existing `ClusterArrangement`. Each arrangement maps to a preset `CoordinateLayout`. The `computeOffsets` dispatcher reads from `CoordinateLayout` to call the same underlying offset functions. UI adds coordinate controls above the preset buttons. The coordinate system is independent of arrangement — any system works with any pattern.

**Tech Stack:** TypeScript, PixiJS (rendering unchanged), Obsidian API (panel UI), CDP E2E tests

**Key Constraint:** Coordinate system must NEVER depend on arrangement pattern. Polar coordinates can be used with timeline, cartesian with sunburst, etc. The arrangement is just a preset that fills in axis config.

---

## Task 1: Define CoordinateLayout Types

**Files:**
- Modify: `src/types.ts:66` (add new types after ClusterArrangement)
- Modify: `src/views/PanelBuilder.ts:55-90` (add new panel properties)
- Modify: `src/views/PanelBuilder.ts:130-158` (add defaults)

**Step 1: Add type definitions to src/types.ts**

After line 66 (`ClusterArrangement` type), add:

```typescript
/** Source of values for a coordinate axis */
export type AxisSource =
  | { kind: "index" }
  | { kind: "property"; key: string }
  | { kind: "metric"; metric: MetricKind }
  | { kind: "random"; seed: number }
  | { kind: "const"; value: number };

/** Graph-structure-derived metrics */
export type MetricKind = "degree" | "in-degree" | "out-degree" | "bfs-depth" | "sibling-rank";

/** How raw values are transformed into coordinates */
export type AxisTransform =
  | { kind: "linear"; scale: number }
  | { kind: "bin"; count: number }
  | { kind: "date-to-index" }
  | { kind: "stack-avoid" }
  | { kind: "golden-angle" }
  | { kind: "even-divide"; totalRange: number };

/** Full axis configuration */
export interface AxisConfig {
  source: AxisSource;
  transform: AxisTransform;
}

/** Coordinate system type */
export type CoordinateSystem = "cartesian" | "polar";

/** Complete coordinate layout configuration */
export interface CoordinateLayout {
  system: CoordinateSystem;
  axis1: AxisConfig;  // x (cartesian) or r (polar)
  axis2: AxisConfig;  // y (cartesian) or θ (polar)
  perGroup: boolean;
}
```

**Step 2: Add panel properties to PanelBuilder.ts PanelState**

Add after `timelineOrderFields` (line 90):

```typescript
  /** Coordinate layout override — when set, takes precedence over clusterArrangement */
  coordinateLayout: CoordinateLayout | null;
```

**Step 3: Add default to DEFAULT_PANEL**

Add after `timelineOrderFields` default (line 158):

```typescript
  coordinateLayout: null,
```

**Step 4: Run build to verify types compile**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build, no errors

**Step 5: Commit**

```bash
git add src/types.ts src/views/PanelBuilder.ts
git commit -m "feat: add CoordinateLayout type definitions and panel property"
```

---

## Task 2: Create Arrangement-to-CoordinateLayout Preset Map

**Files:**
- Create: `src/layouts/coordinate-presets.ts`

**Step 1: Create the preset mapping file**

```typescript
import type { CoordinateLayout, ClusterArrangement } from "../types";

/**
 * Maps each legacy arrangement name to its equivalent CoordinateLayout.
 * These serve as presets — selecting an arrangement fills in the coordinate config.
 * The coordinate system is NOT coupled to the arrangement; users can override freely.
 */
export const ARRANGEMENT_PRESETS: Record<ClusterArrangement, CoordinateLayout> = {
  spiral: {
    system: "polar",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "golden-angle" } },
    perGroup: true,
  },
  concentric: {
    system: "polar",
    axis1: { source: { kind: "metric", metric: "degree" }, transform: { kind: "bin", count: 5 } },
    axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
    perGroup: true,
  },
  tree: {
    system: "cartesian",
    axis1: { source: { kind: "metric", metric: "bfs-depth" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "metric", metric: "sibling-rank" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  grid: {
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  triangle: {
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  random: {
    system: "cartesian",
    axis1: { source: { kind: "random", seed: 42 }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "random", seed: 42 }, transform: { kind: "linear", scale: 1 } },
    perGroup: true,
  },
  mountain: {
    system: "cartesian",
    axis1: { source: { kind: "index" }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "metric", metric: "degree" }, transform: { kind: "linear", scale: -1 } },
    perGroup: true,
  },
  sunburst: {
    system: "polar",
    axis1: { source: { kind: "const", value: 1 }, transform: { kind: "linear", scale: 1 } },
    axis2: { source: { kind: "index" }, transform: { kind: "even-divide", totalRange: 360 } },
    perGroup: false,
  },
  timeline: {
    system: "cartesian",
    axis1: { source: { kind: "property", key: "date" }, transform: { kind: "date-to-index" } },
    axis2: { source: { kind: "index" }, transform: { kind: "stack-avoid" } },
    perGroup: true,
  },
};

/**
 * Resolve the effective CoordinateLayout for the current panel state.
 * If coordinateLayout is explicitly set, use it.
 * Otherwise, derive from clusterArrangement preset.
 */
export function resolveCoordinateLayout(
  arrangement: ClusterArrangement,
  override: CoordinateLayout | null,
): CoordinateLayout {
  return override ?? ARRANGEMENT_PRESETS[arrangement];
}

/**
 * Determine which arrangement function to call based on CoordinateLayout.
 * This maps coordinate configs back to the concrete offset function.
 *
 * The mapping uses the SOURCE types of each axis to infer the right algorithm,
 * NOT the coordinate system. This ensures polar can be used with timeline, etc.
 */
export function resolveArrangementFromLayout(layout: CoordinateLayout): ClusterArrangement {
  const s1 = layout.axis1.source.kind;
  const s2 = layout.axis2.source.kind;
  const t1 = layout.axis1.transform.kind;
  const t2 = layout.axis2.transform.kind;

  // Property + date-to-index on axis1 → timeline
  if (s1 === "property" && t1 === "date-to-index") return "timeline";

  // Random sources → random
  if (s1 === "random" || s2 === "random") return "random";

  // Metric: bfs-depth → tree
  if (s1 === "metric" && (layout.axis1.source as { metric: string }).metric === "bfs-depth") return "tree";

  // Metric: degree on axis1 with bin → concentric
  if (s1 === "metric" && (layout.axis1.source as { metric: string }).metric === "degree" && t1 === "bin") return "concentric";

  // Metric: degree on axis2 with negative scale → mountain
  if (s2 === "metric" && (layout.axis2.source as { metric: string }).metric === "degree") return "mountain";

  // Const on axis1 + even-divide → sunburst
  if (s1 === "const" && t2 === "even-divide" && !layout.perGroup) return "sunburst";

  // Golden angle transform → spiral
  if (t2 === "golden-angle") return "spiral";

  // Index + index → grid or triangle (default to grid)
  if (s1 === "index" && s2 === "index") return "grid";

  return "spiral"; // fallback
}
```

**Step 2: Run build to verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/layouts/coordinate-presets.ts
git commit -m "feat: add coordinate layout presets and resolver functions"
```

---

## Task 3: Wire CoordinateLayout into Layout Pipeline

**Files:**
- Modify: `src/layouts/cluster-force.ts:156-196` (ClusterForceConfig)
- Modify: `src/views/LayoutController.ts:311-380` (applyClusterForce)
- Modify: `src/layouts/cluster-force.ts:1409-1438` (computeOffsets)

**Step 1: Add coordinateLayout to ClusterForceConfig**

In `src/layouts/cluster-force.ts`, add to `ClusterForceConfig` interface (after line 195):

```typescript
  /** Resolved coordinate layout configuration */
  coordinateLayout?: CoordinateLayout;
```

Add import at top of file:

```typescript
import type { CoordinateLayout } from "../types";
import { resolveArrangementFromLayout } from "./coordinate-presets";
```

**Step 2: Update computeOffsets to use coordinateLayout**

Replace the switch in `computeOffsets` (lines 1427-1437) with:

```typescript
  // Resolve effective arrangement: coordinateLayout takes precedence
  const effectiveArrangement = cfg.coordinateLayout
    ? resolveArrangementFromLayout(cfg.coordinateLayout)
    : cfg.arrangement;

  switch (effectiveArrangement) {
    case "spiral": return spiralOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp, nodeSpacingMap);
    case "concentric": return { offsets: concentricOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, cmp, nodeSpacingMap) };
    case "tree": return treeOffsets(members, edges, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "grid": return gridOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "triangle": return triangleOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "random": return { offsets: randomOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, scaleByDegree, nodeSpacingMap) };
    case "mountain": return mountainOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap);
    case "timeline": return timelineOffsets(members, degrees, nodeSpacing, groupScale, nodeSize, cmp, nodeSpacingMap, cfg.timelineKey, cfg.getNodeProperty, cfg.timelineEndKey, cfg.timelineOrderFields);
    default: return { offsets: new Map() };
  }
```

**Step 3: Pass coordinateLayout from LayoutController**

In `src/views/LayoutController.ts`, add to `baseCfg` object (around line 348):

```typescript
import { resolveCoordinateLayout } from "../layouts/coordinate-presets";
```

In `applyClusterForce()`, after baseCfg construction, add:

```typescript
      coordinateLayout: resolveCoordinateLayout(clusterArrangement, panel.coordinateLayout ?? null),
```

Also, when coordinateLayout has a property source on axis1, set timelineKey from it:

```typescript
    // If coordinateLayout specifies a property source, use it as timelineKey
    const resolved = resolveCoordinateLayout(clusterArrangement, panel.coordinateLayout ?? null);
    if (resolved.axis1.source.kind === "property") {
      baseCfg.timelineKey = (resolved.axis1.source as { kind: "property"; key: string }).key;
    }
```

**Step 4: Build and verify no regressions**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build. Existing behavior unchanged (coordinateLayout defaults to null → uses arrangement preset → resolves to same arrangement).

**Step 5: Commit**

```bash
git add src/layouts/cluster-force.ts src/views/LayoutController.ts
git commit -m "feat: wire CoordinateLayout into layout pipeline with fallback to legacy arrangement"
```

---

## Task 4: Add Coordinate Layout UI to Panel

**Files:**
- Modify: `src/views/PanelBuilder.ts:426-494` (cluster arrangement section)

**Step 1: Add coordinate system controls after arrangement dropdown**

After the arrangement dropdown (line 443), before the timeline-specific section (line 445), add coordinate layout UI. The key design: arrangement dropdown becomes a "preset" selector, and below it the coordinate controls show the resolved values.

Insert after the arrangement dropdown's closing `});` (line 443):

```typescript
    // --- Coordinate Layout Controls ---
    const coordLayout = panel.coordinateLayout
      ?? ARRANGEMENT_PRESETS[panel.clusterArrangement];

    // Coordinate system selector
    addSelect(body, t("coord.system"), [
      { value: "cartesian", label: t("coord.cartesian") },
      { value: "polar", label: t("coord.polar") },
    ], coordLayout.system, (v) => {
      const base = panel.coordinateLayout
        ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
      panel.coordinateLayout = { ...base, system: v as CoordinateSystem };
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);
    });

    // Axis labels depend on coordinate system
    const axis1Label = coordLayout.system === "polar" ? "r" : "X";
    const axis2Label = coordLayout.system === "polar" ? "θ" : "Y";

    // Axis 1 source selector
    const axisSourceOptions = [
      { value: "auto", label: "auto" },
      { value: "index", label: "index" },
      { value: "property", label: t("coord.property") },
      { value: "degree", label: "degree" },
      { value: "bfs-depth", label: "BFS depth" },
      { value: "sibling-rank", label: "sibling rank" },
      { value: "random", label: "random" },
    ];

    const getSourceValue = (src: AxisSource): string => {
      if (src.kind === "metric") return src.metric;
      if (src.kind === "property") return "property";
      return src.kind;
    };

    // Axis 1 source
    addSelect(body, `${axis1Label}:`, axisSourceOptions,
      getSourceValue(coordLayout.axis1.source), (v) => {
      const base = panel.coordinateLayout
        ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
      const newSource = buildAxisSource(v, coordLayout.axis1);
      panel.coordinateLayout = {
        ...base,
        axis1: { ...base.axis1, source: newSource },
      };
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);
    });

    // If axis1 source is "property", show key input
    if (coordLayout.axis1.source.kind === "property") {
      const propRow = body.createDiv({ cls: "gi-setting-row" });
      propRow.createEl("span", { cls: "gi-setting-label", text: `${axis1Label} ${t("coord.propertyKey")}` });
      const propInput = propRow.createEl("input", { cls: "gi-setting-input", type: "text" });
      propInput.value = coordLayout.axis1.source.key;
      propInput.placeholder = "date";
      attachDatalist(propInput, ctx.frontmatterKeys);
      propInput.addEventListener("change", () => {
        const base = panel.coordinateLayout
          ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
        panel.coordinateLayout = {
          ...base,
          axis1: {
            ...base.axis1,
            source: { kind: "property", key: propInput.value.trim() || "date" },
          },
        };
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
    }

    // Axis 2 source
    addSelect(body, `${axis2Label}:`, axisSourceOptions,
      getSourceValue(coordLayout.axis2.source), (v) => {
      const base = panel.coordinateLayout
        ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
      const newSource = buildAxisSource(v, coordLayout.axis2);
      panel.coordinateLayout = {
        ...base,
        axis2: { ...base.axis2, source: newSource },
      };
      cb.applyClusterForce();
      cb.rebuildPanel();
      cb.restartSimulation(0.5);
    });

    // If axis2 source is "property", show key input
    if (coordLayout.axis2.source.kind === "property") {
      const propRow2 = body.createDiv({ cls: "gi-setting-row" });
      propRow2.createEl("span", { cls: "gi-setting-label", text: `${axis2Label} ${t("coord.propertyKey")}` });
      const propInput2 = propRow2.createEl("input", { cls: "gi-setting-input", type: "text" });
      propInput2.value = coordLayout.axis2.source.key;
      propInput2.placeholder = "end-date";
      attachDatalist(propInput2, ctx.frontmatterKeys);
      propInput2.addEventListener("change", () => {
        const base = panel.coordinateLayout
          ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
        panel.coordinateLayout = {
          ...base,
          axis2: {
            ...base.axis2,
            source: { kind: "property", key: propInput2.value.trim() || "end-date" },
          },
        };
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
    }

    // Per-group toggle
    addToggle(body, t("coord.perGroup"), coordLayout.perGroup, (v) => {
      const base = panel.coordinateLayout
        ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
      panel.coordinateLayout = { ...base, perGroup: v };
      cb.applyClusterForce();
      cb.restartSimulation(0.5);
    });

    // θ range (polar only, axis2)
    if (coordLayout.system === "polar" && coordLayout.axis2.transform.kind === "even-divide") {
      addSlider(body, `${axis2Label} ${t("coord.range")} (°)`, 30, 360, 10,
        coordLayout.axis2.transform.totalRange, (v) => {
        const base = panel.coordinateLayout
          ?? { ...ARRANGEMENT_PRESETS[panel.clusterArrangement] };
        panel.coordinateLayout = {
          ...base,
          axis2: {
            ...base.axis2,
            transform: { kind: "even-divide", totalRange: v },
          },
        };
        cb.applyClusterForce();
        cb.restartSimulation(0.5);
      });
    }
```

**Step 2: Add helper function buildAxisSource**

Add near the top of `buildPanel()` or as a module-level helper:

```typescript
function buildAxisSource(value: string, current: AxisConfig): AxisSource {
  switch (value) {
    case "index": return { kind: "index" };
    case "property": return { kind: "property", key: current.source.kind === "property" ? current.source.key : "date" };
    case "degree": return { kind: "metric", metric: "degree" };
    case "in-degree": return { kind: "metric", metric: "in-degree" };
    case "out-degree": return { kind: "metric", metric: "out-degree" };
    case "bfs-depth": return { kind: "metric", metric: "bfs-depth" };
    case "sibling-rank": return { kind: "metric", metric: "sibling-rank" };
    case "random": return { kind: "random", seed: 42 };
    default: return current.source; // "auto" = keep current
  }
}
```

**Step 3: Add i18n keys**

Add to both en and ja translation objects:

```typescript
// English
"coord.system": "Coordinate System",
"coord.cartesian": "Cartesian (X, Y)",
"coord.polar": "Polar (r, θ)",
"coord.property": "Property",
"coord.propertyKey": "field",
"coord.perGroup": "Per-group coordinates",
"coord.range": "range",

// Japanese
"coord.system": "座標形式",
"coord.cartesian": "直交座標 (X, Y)",
"coord.polar": "極座標 (r, θ)",
"coord.property": "プロパティ",
"coord.propertyKey": "フィールド",
"coord.perGroup": "グループごとに座標形成",
"coord.range": "範囲",
```

**Step 4: Add import for ARRANGEMENT_PRESETS in PanelBuilder.ts**

```typescript
import { ARRANGEMENT_PRESETS } from "../layouts/coordinate-presets";
import type { CoordinateSystem } from "../types";
```

**Step 5: Make arrangement dropdown also reset coordinateLayout**

Update arrangement dropdown onChange (line 439-443):

```typescript
    panel.clusterArrangement = v as ClusterArrangement;
    panel.coordinateLayout = null; // Reset to use preset
    cb.applyClusterForce();
    cb.rebuildPanel();
    cb.restartSimulation(0.5);
```

**Step 6: Build and verify**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build

**Step 7: Commit**

```bash
git add src/views/PanelBuilder.ts
git commit -m "feat: add coordinate layout UI controls to panel"
```

---

## Task 5: Handle Preset Serialization in Save/Load

**Files:**
- Modify: `src/views/PanelBuilder.ts` (serialization/deserialization of coordinateLayout in preset save/load)
- Modify: `src/views/GraphViewContainer.ts` (if preset loading touches panel state)

**Step 1: Ensure coordinateLayout serializes to JSON**

The `CoordinateLayout` type uses only plain objects (no Maps, Sets, classes), so `JSON.stringify` works natively. Verify that preset save/load in PanelBuilder handles the new field.

Search for preset save code and add `coordinateLayout` to the serialized fields. Search for preset load code and add deserialization.

**Step 2: Build and test preset round-trip**

Run: `npm run build 2>&1 | tail -5`
Expected: Clean build

**Step 3: Commit**

```bash
git add src/views/PanelBuilder.ts src/views/GraphViewContainer.ts
git commit -m "feat: serialize coordinateLayout in preset save/load"
```

---

## Task 6: E2E Verification — Visual Regression Test

**Files:**
- Create: `e2e/cdp-e2e-coordinate-layout.spec.ts` (or run as /tmp script)

**Step 1: Deploy and verify each arrangement still looks the same**

CDP test script to:
1. Reload plugin
2. For each arrangement (spiral, concentric, tree, grid, timeline, sunburst):
   a. Set arrangement via panel
   b. Wait for simulation convergence
   c. Verify coordinateLayout is null (uses preset)
   d. Take screenshot
   e. Compare node count (sanity check)
3. Test coordinate override:
   a. Set arrangement=spiral
   b. Override coordinateLayout to polar + index + golden-angle
   c. Verify layout matches spiral (same preset)
4. Test property axis:
   a. Set coordinateLayout with axis1 property:start-date
   b. Verify it resolves to timeline layout

**Step 2: Run CDP test**

Run: `node /tmp/cdp-coordinate-test.js`
Expected: All screenshots saved, node counts match expectations

**Step 3: Commit test**

```bash
git add e2e/cdp-e2e-coordinate-layout.spec.ts
git commit -m "test: add E2E verification for coordinate layout generalization"
```

---

## Task 7: Final Integration — Sync Timeline-Specific Fields with CoordinateLayout

**Files:**
- Modify: `src/views/PanelBuilder.ts` (timeline UI conditional)
- Modify: `src/views/LayoutController.ts` (timelineKey derivation)

**Step 1: Show timeline-specific fields when axis1 source is property (not just when arrangement=timeline)**

Replace:
```typescript
if (panel.clusterArrangement === "timeline") {
```
With:
```typescript
const effectiveLayout = panel.coordinateLayout ?? ARRANGEMENT_PRESETS[panel.clusterArrangement];
const hasPropertyAxis = effectiveLayout.axis1.source.kind === "property"
  || effectiveLayout.axis2.source.kind === "property";
if (hasPropertyAxis) {
```

This shows timeline controls (end key, duration bars, order fields) whenever ANY axis uses a property source, not just for the "timeline" arrangement.

**Step 2: Derive timelineKey from coordinateLayout in LayoutController**

In `applyClusterForce`, ensure that when coordinateLayout has a property axis, that key overrides the panel's timelineKey:

```typescript
const resolved = resolveCoordinateLayout(clusterArrangement, panel.coordinateLayout ?? null);
if (resolved.axis1.source.kind === "property") {
  baseCfg.timelineKey = resolved.axis1.source.key;
}
if (resolved.axis2.source.kind === "property") {
  baseCfg.timelineEndKey = resolved.axis2.source.key;
}
```

**Step 3: Build and deploy**

Run: `npm run build 2>&1 | tail -5 && cp main.js "/home/ubuntu/obsidian-plugins/開発/.obsidian/plugins/graph-island/main.js"`

**Step 4: Commit**

```bash
git add src/views/PanelBuilder.ts src/views/LayoutController.ts
git commit -m "feat: decouple timeline UI from arrangement — show when any axis uses property source"
```

---

## Parallel Execution Strategy

Tasks can be parallelized as follows:

```
Task 1 (types) ─────────────┐
                             ├─→ Task 3 (pipeline wiring) ─→ Task 6 (E2E)
Task 2 (presets) ────────────┘                                    │
                                                                  ↓
Task 4 (UI) ─────────────────────────────────→ Task 7 (integration)
Task 5 (serialization) ──────────────────────┘
```

- **Parallel group A**: Task 1 + Task 2 (independent type definitions)
- **Parallel group B**: Task 3 + Task 4 + Task 5 (after group A, all touch different files)
- **Sequential**: Task 6 (E2E) after all code tasks
- **Sequential**: Task 7 (integration) after Task 6 confirms no regressions
