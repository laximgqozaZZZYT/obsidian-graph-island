# Road Network EdgeRenderer 統合 — コード実装スニペット

**対象**: 実装者向け詳細コード

---

## 1. road-network.ts への追加

### 場所: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/layouts/road-network.ts` (行310以降)

### 新規関数: routeWaypoints

```typescript
/**
 * Route between two arbitrary world coordinates using the road network.
 *
 * This function is used for cable trunk routing, where start/end points
 * are computed from cluster centroids (not pre-registered nodes).
 *
 * Algorithm:
 * 1. Find nearest intersection to startPos (O(n) linear search)
 * 2. Find nearest intersection to endPos (O(n) linear search)
 * 3. Compute shortest path via Dijkstra (O(m log m))
 * 4. Convert path to waypoint coordinates
 *
 * Returns empty array if no path found.
 */
export function routeWaypoints(
  network: RoadNetwork,
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
): { x: number; y: number }[] {
  if (network.intersections.length === 0) return [];

  // Step 1: Find nearest intersection to start position
  let startIsectId = network.intersections[0]?.id ?? 0;
  let startMinDist = Infinity;
  for (const isect of network.intersections) {
    const dx = startPos.x - isect.x;
    const dy = startPos.y - isect.y;
    const dist = dx * dx + dy * dy;  // squared distance (faster)
    if (dist < startMinDist) {
      startMinDist = dist;
      startIsectId = isect.id;
    }
  }

  // Step 2: Find nearest intersection to end position
  let endIsectId = network.intersections[0]?.id ?? 0;
  let endMinDist = Infinity;
  for (const isect of network.intersections) {
    const dx = endPos.x - isect.x;
    const dy = endPos.y - isect.y;
    const dist = dx * dx + dy * dy;
    if (dist < endMinDist) {
      endMinDist = dist;
      endIsectId = isect.id;
    }
  }

  // Step 3: Compute shortest path
  const path = findShortestPath(network, startIsectId, endIsectId);

  // Step 4: Convert to waypoints
  if (path.length < 2) return [];
  return pathToWaypoints(network, path);
}
```

---

## 2. EdgeRenderer.ts への追加・修正

### 2.1 Import 追加 (行1付近)

**変更前**:
```typescript
import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { GraphEdge, EdgeCardinalityMode, Cardinality, CardinalityRule, CardinalityRenderConfig } from "../types";
// ... other imports
```

**変更後** (road-network import を追加):
```typescript
import { CanvasGraphics, CanvasContainer, CanvasText } from "./canvas2d";
import type { GraphEdge, EdgeCardinalityMode, Cardinality, CardinalityRule, CardinalityRenderConfig } from "../types";
import type { RoadNetwork } from "../layouts/road-network";
import { routeWaypoints } from "../layouts/road-network";
// ... other imports
```

### 2.2 EdgeDrawConfig 拡張 (行63-83付近)

**変更前**:
```typescript
export interface EdgeDrawConfig {
  // ... many existing fields ...
  /** Spacing between parallel cables (px) */
  cableSpacing?: number;
  /** Fan wire width (px) */
  cableFanWidth?: number;
  /** Fan wire opacity (0-1) */
  cableFanAlpha?: number;
  /** Minimum density scale floor — prevents edges vanishing at high count + low zoom */
  edgeDensityFloor?: number;
  // ... more fields ...
}
```

**変更後** (末尾に追加):
```typescript
export interface EdgeDrawConfig {
  // ... all existing fields ...

  /** Road network for waypoint-based edge routing.
   *  Only applicable if enableRoadRouting is true.
   *  null when no road network is available or routing is disabled. */
  roadNetwork?: RoadNetwork | null;

  /** Enable road network routing for edges.
   *  When true and roadNetwork is available:
   *  - Cable trunks route via intersections
   *  - Regular edges route via intersections (unless arc or bundle mode active)
   *  Disabled by default. Requires panel setting and valid roadNetwork. */
  enableRoadRouting?: boolean;
}
```

### 2.3 Module-scope キャッシュ変数 (行640-642付近に追加)

**追加位置**: `_cableCache` 定義の直後

```typescript
// Direction bundle cache (existing)
let _bundleCache: Map<string, BundleGroup> | null = null;
let _bundleDirty = true;
let _bundleFrameCount = 0;

// Cable bundling cache (existing)
let _cableCache: { cables: Cable[]; cabledEdgeIds: Set<string> } | null = null;
let _cableDirty = true;

// NEW: Road network route cache
let _roadNetworkRouteCache = new Map<string, { x: number; y: number }[]>();
```

### 2.4 invalidateBundleCache() 関数拡張 (行646-649)

**変更前**:
```typescript
export function invalidateBundleCache(): void {
  _bundleDirty = true;
  _cableDirty = true;
}
```

**変更後** (road network cache 無効化を追加):
```typescript
export function invalidateBundleCache(): void {
  _bundleDirty = true;
  _cableDirty = true;
}

/** Clear cached road network routes when road network changes. */
export function invalidateRoadNetworkCache(): void {
  _roadNetworkRouteCache.clear();
}
```

### 2.5 新規ヘルパー関数: drawEdgeViaWaypoints (行740-749付近に追加)

**追加位置**: `drawBundledSegment()` 関数の直前

```typescript
/**
 * Draw an edge as a polyline through a sequence of waypoints.
 * Used for road network routing and other multi-segment paths.
 */
function drawEdgeViaWaypoints(
  g: CanvasGraphics,
  waypoints: { x: number; y: number }[],
): void {
  if (waypoints.length === 0) return;

  g.moveTo(waypoints[0].x, waypoints[0].y);
  for (let i = 1; i < waypoints.length; i++) {
    g.lineTo(waypoints[i].x, waypoints[i].y);
  }
}
```

### 2.6 drawCables() 関数修正 (行519-629)

**変更対象**: 각 cable lane のトランク描画部分 (行555-584)

**変更前**:
```typescript
for (let li = 0; li < nLanes; li++) {
  const lane = cable.lanes[li];
  const laneSubOffset = (li - (nLanes - 1) / 2) * laneSpacing;
  const lox = offsetX + perpX * laneSubOffset;
  const loy = offsetY + perpY * laneSubOffset;

  const ts = { x: trunkStart.x + lox, y: trunkStart.y + loy };
  const te = { x: trunkEnd.x + lox, y: trunkEnd.y + loy };

  let trunkWidth = cfg.cableTrunkWidth ?? 2;
  if (cfg.edgeWeightThickness && lane.edges.length > 1) {
    trunkWidth *= Math.sqrt(lane.edges.length);
  }
  let trunkAlpha = cfg.cableTrunkAlpha ?? 0.85;

  // Highlight logic...
  if (cfg.highlightedNodeId) {
    let laneHit = false;
    for (const e of lane.edges) {
      const sid = edgeSourceId(e);
      const tid = edgeTargetId(e);
      if (cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid)) {
        laneHit = true;
        break;
      }
    }
    if (laneHit) {
      trunkAlpha = cfg.highlightEdgeAlpha ?? 1.0;
      trunkWidth = HIGHLIGHT_CABLE_TRUNK_WIDTH;
    } else {
      trunkAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;
    }
  }

  g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha * densityScale, native: true });
  g.moveTo(ts.x, ts.y);
  g.lineTo(te.x, te.y);
  // ... fan drawing continues ...
}
```

**変更後** (トランク描画ロジックを修正):
```typescript
for (let li = 0; li < nLanes; li++) {
  const lane = cable.lanes[li];
  const laneSubOffset = (li - (nLanes - 1) / 2) * laneSpacing;
  const lox = offsetX + perpX * laneSubOffset;
  const loy = offsetY + perpY * laneSubOffset;

  const ts = { x: trunkStart.x + lox, y: trunkStart.y + loy };
  const te = { x: trunkEnd.x + lox, y: trunkEnd.y + loy };

  let trunkWidth = cfg.cableTrunkWidth ?? 2;
  if (cfg.edgeWeightThickness && lane.edges.length > 1) {
    trunkWidth *= Math.sqrt(lane.edges.length);
  }
  let trunkAlpha = cfg.cableTrunkAlpha ?? 0.85;

  // Highlight logic (unchanged)...
  if (cfg.highlightedNodeId) {
    let laneHit = false;
    for (const e of lane.edges) {
      const sid = edgeSourceId(e);
      const tid = edgeTargetId(e);
      if (cfg.highlightSet.has(sid) || cfg.highlightSet.has(tid)) {
        laneHit = true;
        break;
      }
    }
    if (laneHit) {
      trunkAlpha = cfg.highlightEdgeAlpha ?? 1.0;
      trunkWidth = HIGHLIGHT_CABLE_TRUNK_WIDTH;
    } else {
      trunkAlpha = cfg.highlightEdgeNonMatchAlpha ?? FADE_BY_DEGREE_MIN_ALPHA;
    }
  }

  // NEW: Route trunk via road network if enabled
  let trunkWaypoints: { x: number; y: number }[];
  if (cfg.enableRoadRouting && cfg.roadNetwork) {
    trunkWaypoints = routeWaypoints(cfg.roadNetwork, ts, te);
    // Fallback to direct line if routing failed
    if (trunkWaypoints.length === 0) {
      trunkWaypoints = [ts, te];
    }
  } else {
    trunkWaypoints = [ts, te];
  }

  // Draw trunk via waypoints
  g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha * densityScale, native: true });
  drawEdgeViaWaypoints(g, trunkWaypoints);

  // --- Fan lines: unchanged ---
  const fanWidth = cfg.cableFanWidth ?? 1;
  // ... rest of fan drawing code (no changes) ...
}
```

### 2.7 drawEdges() 関数修正 — 通常エッジループ (行972-991)

**変更前**:
```typescript
for (const e of edges) {
  // Skip edges handled by cable bundling
  if (cabledEdgeIds.has(e.id)) continue;
  if (shouldSkipEdge(e, cfg)) continue;

  const src = resolvePos(e.source);
  const tgt = resolvePos(e.target);
  if (!src || !tgt) continue;

  const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
  const { alpha, lineThick } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);

  g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
  const hasDash = applyDashPattern(g, e, lineThick);

  drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength);
  drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);

  if (hasDash) g.setLineDash([]);
}
```

**変更後** (road routing 条件を統合):
```typescript
for (const e of edges) {
  // Skip edges handled by cable bundling
  if (cabledEdgeIds.has(e.id)) continue;
  if (shouldSkipEdge(e, cfg)) continue;

  const src = resolvePos(e.source);
  const tgt = resolvePos(e.target);
  if (!src || !tgt) continue;

  const lineColor = resolveEdgeColor(e, useRelColor, cfg.relationColors, cfg.isDark);
  const { alpha, lineThick } = resolveEdgeStyle(e, src, tgt, cfg, densityScale, pairCount);

  g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
  const hasDash = applyDashPattern(g, e, lineThick);

  // NEW: Determine routing mode (priority: arc > bundle > road > straight)
  const useRoadRouting = cfg.enableRoadRouting
    && cfg.roadNetwork
    && !isArcLayout
    && !(bundles && e.type !== EDGE_TYPE_SIMILAR);

  if (useRoadRouting) {
    // Road network routing
    const cacheKey = e.id;
    let waypoints = _roadNetworkRouteCache.get(cacheKey);
    if (!waypoints) {
      waypoints = routeEdge(cfg.roadNetwork!, e.source, e.target);
      if (!waypoints || waypoints.length === 0) {
        waypoints = [];  // mark as "no route"
      }
      _roadNetworkRouteCache.set(cacheKey, waypoints);
    }

    if (waypoints.length > 0) {
      // Draw via waypoints
      drawEdgeViaWaypoints(g, waypoints);
    } else {
      // Fallback to straight line if routing failed
      g.moveTo(src.x, src.y);
      g.lineTo(tgt.x, tgt.y);
    }
  } else {
    // Existing routing (arc/bundle/straight)
    drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength);
  }

  // Decorations use original src/tgt positions (arrows point at node edges)
  drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);

  if (hasDash) g.setLineDash([]);
}
```

---

## 3. GraphViewContainer.ts への追加・修正

### 3.1 Import 追加 (行1-30付近)

**変更前**:
```typescript
import { buildRoadNetwork, type RoadNetwork } from "../layouts/road-network";
```

**変更後** (invalidateRoadNetworkCache import を追加):
```typescript
import { buildRoadNetwork, type RoadNetwork } from "../layouts/road-network";
import { invalidateRoadNetworkCache } from "./EdgeRenderer";
```

※ 注: EdgeRenderer.ts で `invalidateRoadNetworkCache` をエクスポート必須

### 3.2 buildRoadNetwork() メソッド修正 (行2334-2417)

**変更前**:
```typescript
private buildRoadNetwork() {
  const meta = this.coordinateEngineData;
  if (!meta) { this.roadNetworkData = null; return; }

  // ... road network build logic ...

  this.roadNetworkData = buildRoadNetwork({
    system: cfg.system,
    axis1Lines: ax1,
    axis2Lines: ax2,
    axis1Shape: meta.axis1Shape,
    axis2Shape: meta.axis2Shape,
    cx: meta.cx,
    cy: meta.cy,
    bounds,
    nodes: allNodes,
  });
}
```

**変更後** (末尾にキャッシュ無効化を追加):
```typescript
private buildRoadNetwork() {
  const meta = this.coordinateEngineData;
  if (!meta) { this.roadNetworkData = null; return; }

  // ... road network build logic (unchanged) ...

  this.roadNetworkData = buildRoadNetwork({
    system: cfg.system,
    axis1Lines: ax1,
    axis2Lines: ax2,
    axis1Shape: meta.axis1Shape,
    axis2Shape: meta.axis2Shape,
    cx: meta.cx,
    cy: meta.cy,
    bounds,
    nodes: allNodes,
  });

  // NEW: Invalidate road routing cache when network changes
  invalidateRoadNetworkCache();
}
```

### 3.3 drawEdges() メソッド修正 (行1698-1797)

**変更前** (行1781-1782):
```typescript
  cfg.cardinalityRenderConfig = this.panel.cardinalityRenderConfig;
  cfg.edgeWeightThickness = this.panel.edgeWeightThickness;

  drawEdgesImpl(
    this.edgeGraphics,
    this.graphEdges,
    this._resolveEdgePos,
    cfg,
    this.arrowGraphics,
  );
```

**変更後** (新规フィールドを追加):
```typescript
  cfg.cardinalityRenderConfig = this.panel.cardinalityRenderConfig;
  cfg.edgeWeightThickness = this.panel.edgeWeightThickness;

  // NEW: Road network routing config
  cfg.roadNetwork = this.roadNetworkData;
  cfg.enableRoadRouting = this.panel.enableRoadRouting ?? false;

  drawEdgesImpl(
    this.edgeGraphics,
    this.graphEdges,
    this._resolveEdgePos,
    cfg,
    this.arrowGraphics,
  );
```

### 3.4 レイアウト変更時のキャッシュ無効化

**場所**: layout 変更メソッド内 (`setLayout()`, `onLayoutChange()` など)

```typescript
private setLayout(layoutName: string, animate: boolean = true) {
  // ... existing logic ...
  this.currentLayout = layoutName;
  this.buildLayout();  // triggers recalculation

  // NEW: Invalidate road network cache on layout change
  invalidateRoadNetworkCache();

  this.requestAnimationFrame();
}
```

---

## 4. Panel Settings への追加

### 場所: `src/types.ts` の `PanelSettings` interface

**変更前** (ケーブル関連フィールド付近):
```typescript
export interface PanelSettings {
  // ... existing fields ...
  cableBundleMode?: "auto" | "always" | "never";
  cableTrunkWidth?: number;
  cableTrunkAlpha?: number;
  cableSpacing?: number;
  cableFanWidth?: number;
  cableFanAlpha?: number;
  // ... more fields ...
}
```

**変更後** (新规フィールドを追加):
```typescript
export interface PanelSettings {
  // ... existing fields ...
  cableBundleMode?: "auto" | "always" | "never";
  cableTrunkWidth?: number;
  cableTrunkAlpha?: number;
  cableSpacing?: number;
  cableFanWidth?: number;
  cableFanAlpha?: number;

  /** Enable road network-based edge routing.
   *  When true, edges (and cable trunks) route via coordinate system intersections.
   *  Requires valid road network. Disabled by default. */
  enableRoadRouting?: boolean;

  // ... more fields ...
}
```

### UI Control 追加

**場所**: `src/ui/SettingsPanel.tsx` (or equivalent UI component)

```tsx
// Where cable settings are rendered:
<SettingsPanel>
  {/* Cable bundling settings... */}

  {/* NEW: Road routing toggle */}
  <SettingItem
    name="Road Network Routing"
    description="Route edges along coordinate system intersections"
  >
    <Toggle
      value={this.settings.enableRoadRouting ?? false}
      onChange={(v) => {
        this.settings.enableRoadRouting = v;
        this.onSettingsChange();
      }}
    />
  </SettingItem>
</SettingsPanel>
```

---

## 5. 統合テスト用 E2E シナリオ

### テストケース 1: Road routing disabled (デフォルト)
```typescript
// GIVEN: enableRoadRouting = false, roadNetwork available
// WHEN: drawEdges() called
// THEN: all edges drawn via existing paths (arc/bundle/straight)
// VERIFY: no change from current behavior
```

### テストケース 2: Road routing enabled, roadNetwork = null
```typescript
// GIVEN: enableRoadRouting = true, roadNetwork = null
// WHEN: drawEdges() called
// THEN: fallback to straight lines (routeEdge returns [])
// VERIFY: edges render as direct lines
```

### テストケース 3: Cable trunk routing
```typescript
// GIVEN: enableRoadRouting = true, clusters exist, roadNetwork valid
// WHEN: drawEdges() called with cable-bundled edges
// THEN: cable trunks route via intersections (not straight)
// VERIFY: trunk path follows grid lines
```

### テストケース 4: Priority: arc > road
```typescript
// GIVEN: enableRoadRouting = true, isArcLayout = true
// WHEN: drawEdges() called
// THEN: arc layout takes priority, road routing ignored
// VERIFY: edges use arc control points, not road paths
```

### テストケース 5: Priority: bundle > road
```typescript
// GIVEN: enableRoadRouting = true, bundleStrength > 0, similar edge
// WHEN: drawEdges() called
// THEN: bundle routing takes priority (except for similar edges)
// VERIFY: non-similar edges use bundle centroid, similar use straight
```

---

## 6. デバッグ・検証用スクリプト

### road-network-debug.ts

```typescript
// Diagnostic: log road network stats and test routing
export function debugRoadNetwork(host: GraphViewContainer) {
  const network = host.getRoadNetwork();
  if (!network) {
    console.warn("No road network available");
    return;
  }

  console.log(`Road Network Stats:
    Intersections: ${network.intersections.length}
    Segments: ${network.segments.length}
    System: ${network.system}
    Center: (${network.cx}, ${network.cy})
  `);

  // Test routing on a few edges
  const edges = host.graphEdges.slice(0, 5);
  for (const edge of edges) {
    const wp = routeEdge(network, edge.source, edge.target);
    console.log(`Edge ${edge.source} → ${edge.target}: ${wp.length} waypoints`);
  }
}

// Call from console: debugRoadNetwork(window.__graphView)
```

---

## 7. パフォーマンス計測

### EdgeRenderer に計測を追加

```typescript
export function drawEdges(..., cfg: EdgeDrawConfig, ...): void {
  const t0 = performance.now();

  // ... draw logic ...

  const t1 = performance.now();
  if (cfg.enableRoadRouting) {
    console.debug(`Draw edges (road routing): ${(t1 - t0).toFixed(2)}ms, cache hit rate: ${cacheHitRate.toFixed(2)}%`);
  }
}
```

---

## 要点まとめ

| 项目 | 追加/修正内容 | 行数 |
|------|----------|------|
| road-network.ts | routeWaypoints() 関数 | +40 lines |
| EdgeRenderer.ts | import, config, cache, helpers | +80 lines |
| EdgeRenderer.ts | drawCables() 修正 | ~20 lines |
| EdgeRenderer.ts | drawEdges() 修正 | ~30 lines |
| GraphViewContainer.ts | cfg 設定, キャッシュ無効化 | +5 lines |
| types.ts | PanelSettings 拡張 | +3 lines |
| UI | SettingsPanel toggle | +10 lines |
| **総計** | | **~188 lines** |

