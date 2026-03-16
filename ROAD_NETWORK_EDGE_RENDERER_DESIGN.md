# Road Network を EdgeRenderer に統合する設計書

**作成日**: 2026-03-15
**対象バージョン**: obsidian-graph-island (feat/panel-tab-ui)
**ステータス**: 設計フェーズ

---

## 1. 現況分析

### 1.1 EdgeRenderer の全体構造

#### ファイル構成
- **src/views/EdgeRenderer.ts**: 1340行
  - 公開API: `drawEdges()` (行905), `drawEdgeLabels()` (行1279), `invalidateBundleCache()` (行646)
  - 内部ヘルパー: `drawCables()`, `drawEdgeSegment()`, `drawBundledSegment()` など

#### 主要な描画戦略（行905-992のdrawEdges関数）
```
drawEdges(g, edges, resolvePos, cfg, arrowGfx)
│
├─ 1. キャッシュ準備 (行920-944)
│  ├─ densityScale 計算
│  ├─ edgeWeightThickness の pairCount 計算
│  └─ direction×color bundling プリコンピュート
│
├─ 2. ケーブル描画 (行946-970)
│  ├─ hasClusters 判定
│  ├─ buildCables() キャッシュ
│  └─ drawCables(g, cables, ...) → トランク + ファン
│
└─ 3. 通常エッジ描画ループ (行972-991)
   FOR each edge:
   ├─ cabledEdgeIds チェック → skip
   ├─ shouldSkipEdge() チェック → continue
   ├─ resolvePos(source, target)
   ├─ drawEdgeSegment() → 描画実行
   └─ drawEdgeDecorations() → 矢印等
```

### 1.2 エッジ描画の3つの経路

#### A. ケーブル (行519-629: drawCables)
```
トランク直線:
  g.lineStyle(...)
  g.moveTo(ts.x, ts.y)        // ts = trunkStart + offset
  g.lineTo(te.x, te.y)        // te = trunkEnd + offset

ファン直線 (行619-625):
  FOR each edge in lane.edges:
    src → nearEnd (trunk endpoint)
    farEnd (trunk endpoint) → tgt
```

**現状**: トランク/ファンは**直線のみ**

#### B. 通常エッジ (行750-779: drawEdgeSegment)
4つの描画モード:
```
1. Similar エッジ:
   g.moveTo(src) → g.lineTo(tgt)          // 直線

2. Bundle + !isArcLayout:
   drawBundledSegment(g, src, tgt, ...)   // 二次曲線（グリッド中心点経由）

3. isArcLayout:
   g.quadraticCurveTo(mx, cpY, tgt)       // 二次曲線（固定制御点）

4. デフォルト:
   g.moveTo(src) → g.lineTo(tgt)          // 直線
```

#### C. グリッド方向バンドル (行782-820: drawBundledSegment)
```
同方向・同色・近接 エッジをグループ化
→ グループの中心点計算
→ 中心点経由で二次曲線描画
```

### 1.3 EdgeDrawConfig (行14-83)

現在のフィールド（抜粋）:
```typescript
export interface EdgeDrawConfig {
  // visibility toggles
  showLinks: boolean;
  showTagEdges: boolean;
  // ... other edge type toggles

  // clustering & cable bundling
  nodeClusterMap: Map<string, string> | null;
  clusterCentroids: Map<string, { x: number; y: number }> | null;
  clusterRadii: Map<string, number> | null;

  // bundle settings
  bundleStrength: number;
  cableBundleMode?: "auto" | "always" | "never";
  cableTrunkWidth?: number;
  cableTrunkAlpha?: number;
  cableSpacing?: number;

  // layout info
  isArcLayout: boolean;

  // ... other fields
}
```

### 1.4 GraphViewContainer での統合

**行134**: `private roadNetworkData: RoadNetwork | null = null`

**行2334-2417**: `buildRoadNetwork()`
- 座標エンジン (coordinateEngineData) から grid lines 抽出
- buildRoadNetwork() で RoadNetwork インスタンス化

**行2476-2477**: `getRoadNetwork(): RoadNetwork | null`
- パブリック getter

**行1698-1797**: `drawEdges()`
- EdgeDrawConfig 構築
- `drawEdgesImpl()` 呼び出し（= EdgeRenderer.drawEdges のインポート）

**現状**: EdgeRenderer は road network にアクセスできない

---

## 2. 統合戦略

### 2.1 設計パターン選択: **戦略 A（推奨）**

#### 理由
1. **結合度が低い**: EdgeRenderer が GraphViewContainer に非依存
2. **テスト容易**: road network 有無で動作検証可能
3. **段階的統合**: routing の on/off を 動的に切り替え可能

#### パターン
```
GraphViewContainer
  ├─ buildRoadNetwork() → roadNetworkData
  ├─ drawEdges()
  │  └─ cfg.roadNetwork = this.roadNetworkData  ← 新規
  │  └─ cfg.enableRoadRouting = ...             ← 新規
  │  └─ drawEdgesImpl() 呼び出し
  │
EdgeRenderer.drawEdges()
  ├─ IF cfg.enableRoadRouting && cfg.roadNetwork:
  │  └─ routeEdge() / routeWaypoints() で waypoints 計算
  └─ 既存の arc/bundle 優先 (road routing は低優先度)
```

### 2.2 代替案との比較

#### 戦略 B: GraphViewContainer.host メソッド経由
**欠点**:
- EdgeRenderer が GraphViewContainer 型に依存 → 結合度が高い
- host オブジェクトのライフサイクル管理が複雑

#### 戦略 C: グローバル状態（event emitter など）
**欠点**:
- デバッグが困難
- 複数インスタンスで競合可能性

---

## 3. 詳細設計

### 3.1 road-network.ts への追加

#### 新関数: routeWaypoints()
```typescript
/**
 * Route between two arbitrary world coordinates using the road network.
 * Finds the nearest intersection to each position, then computes shortest path.
 */
export function routeWaypoints(
  network: RoadNetwork,
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
): { x: number; y: number }[] {
  // 1. startPos に最近接交差点を探索 (O(n) where n = |intersections|)
  let startIsectId = 0;
  let startDist = Infinity;
  for (const isect of network.intersections) {
    const dx = startPos.x - isect.x;
    const dy = startPos.y - isect.y;
    const d = dx * dx + dy * dy;
    if (d < startDist) {
      startDist = d;
      startIsectId = isect.id;
    }
  }

  // 2. endPos に最近接交差点を探索
  let endIsectId = 0;
  let endDist = Infinity;
  for (const isect of network.intersections) {
    const dx = endPos.x - isect.x;
    const dy = endPos.y - isect.y;
    const d = dx * dx + dy * dy;
    if (d < endDist) {
      endDist = d;
      endIsectId = isect.id;
    }
  }

  // 3. 最短経路計算
  const path = findShortestPath(network, startIsectId, endIsectId);

  // 4. 経路をwaypoints に変換
  return pathToWaypoints(network, path);
}
```

**時間計算量**:
- 最近接探索: O(2n) = O(n)
- Dijkstra: O(m log m) where m = edges count
- **総計**: O(n + m log m) per edge
- **キャッシュ必須**: 同一エッジペアは複数フレーム同じ経路

#### 最適化: ノードベース routeEdge() との違い
- 既存 `routeEdge(network, sourceNodeId, targetNodeId)` (行296-309):
  - nodeAccess Map で O(1) 交差点ルックアップ
- 新 `routeWaypoints(network, startPos, endPos)`:
  - 座標→交差点で O(n) 探索
  - トランク計算で使用（数本のケーブル）

### 3.2 EdgeRenderer.ts への拡張

#### Step 1: RoadNetwork インポート追加 (行1)
```typescript
import { buildRoadNetwork, type RoadNetwork, routeWaypoints } from "../layouts/road-network";
```

#### Step 2: EdgeDrawConfig 拡張 (行64以降)
```typescript
export interface EdgeDrawConfig {
  // ... existing fields ...

  /** Road network for waypoint routing. Only used if enableRoadRouting is true. */
  roadNetwork?: RoadNetwork | null;

  /** Enable waypoint-based edge routing through road network.
   *  When true, overrides arc layout and bundling for non-similar edges.
   *  ケーブルトランクにも適用 */
  enableRoadRouting?: boolean;
}
```

#### Step 3: drawEdges() 関数修正 (行905-992)

##### 3.3.1 ケーブルトランク描画パスの変更

**現在** (行582-584):
```typescript
g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha * densityScale, native: true });
g.moveTo(ts.x, ts.y);
g.lineTo(te.x, te.y);
```

**修正案** (行582-600 付近):
```typescript
const { trunkStart, trunkEnd, offsetX, offsetY } = layout;
const ts = { x: trunkStart.x + lox, y: trunkStart.y + loy };
const te = { x: trunkEnd.x + lox, y: trunkEnd.y + loy };

// NEW: Road routing for cable trunk
let trunkPath: { x: number; y: number }[];
if (cfg.enableRoadRouting && cfg.roadNetwork) {
  trunkPath = routeWaypoints(cfg.roadNetwork, ts, te);
} else {
  trunkPath = [ts, te];  // fallback: direct line
}

g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha * densityScale, native: true });
if (trunkPath.length > 0) {
  g.moveTo(trunkPath[0].x, trunkPath[0].y);
  for (let pi = 1; pi < trunkPath.length; pi++) {
    g.lineTo(trunkPath[pi].x, trunkPath[pi].y);
  }
}
```

##### 3.3.2 通常エッジのroad routing パス

**現在** (行972-991):
```typescript
for (const e of edges) {
  if (cabledEdgeIds.has(e.id)) continue;
  if (shouldSkipEdge(e, cfg)) continue;

  const src = resolvePos(e.source);
  const tgt = resolvePos(e.target);
  if (!src || !tgt) continue;

  const lineColor = resolveEdgeColor(...);
  const { alpha, lineThick } = resolveEdgeStyle(...);

  g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
  const hasDash = applyDashPattern(g, e, lineThick);

  drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength);
  drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);

  if (hasDash) g.setLineDash([]);
}
```

**修正案**:
```typescript
for (const e of edges) {
  if (cabledEdgeIds.has(e.id)) continue;
  if (shouldSkipEdge(e, cfg)) continue;

  const src = resolvePos(e.source);
  const tgt = resolvePos(e.target);
  if (!src || !tgt) continue;

  const lineColor = resolveEdgeColor(...);
  const { alpha, lineThick } = resolveEdgeStyle(...);

  g.lineStyle({ width: lineThick, color: lineColor, alpha, native: true });
  const hasDash = applyDashPattern(g, e, lineThick);

  // NEW: Road routing condition
  // Priority: arc > bundle > road > straight
  const useRoadRouting = cfg.enableRoadRouting && cfg.roadNetwork
    && !isArcLayout && !(bundles && e.type !== EDGE_TYPE_SIMILAR);

  if (useRoadRouting) {
    const waypoints = routeEdge(cfg.roadNetwork!, e.source, e.target);
    if (waypoints.length > 0) {
      drawEdgeViaWaypoints(g, waypoints);
    } else {
      // Fallback: straight line if routing failed
      g.moveTo(src.x, src.y);
      g.lineTo(tgt.x, tgt.y);
    }
    // Use src/tgt for decorations (arrows, markers at original endpoints)
    drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);
  } else {
    // Existing path (arc / bundle / straight)
    drawEdgeSegment(g, src, tgt, e, lineColor, isArcLayout, bundles, bundleStrength);
    drawEdgeDecorations(g, e, src, tgt, lineColor, alpha, cfg, arrowGfx);
  }

  if (hasDash) g.setLineDash([]);
}
```

#### Step 4: 新規ヘルパー関数 drawEdgeViaWaypoints()

```typescript
/**
 * Draw an edge as a polyline through the given waypoints.
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

### 3.3 GraphViewContainer.ts への拡張 (行1698-1797)

**drawEdges() メソッド内の cfg 構築部分に追加**:

```typescript
// Around line 1780, after edgeWeightThickness setting:
cfg.roadNetwork = this.roadNetworkData;
cfg.enableRoadRouting = this.panel.enableRoadRouting ?? false;
```

**完全な変更**:
```typescript
drawEdges() {
  // ... existing validation & pre-compute code (lines 1699-1781) ...

  cfg.edgeWeightThickness = this.panel.edgeWeightThickness;

  // NEW: Road network routing config
  cfg.roadNetwork = this.roadNetworkData;
  cfg.enableRoadRouting = this.panel.enableRoadRouting ?? false;

  drawEdgesImpl(...);
  // ... rest unchanged ...
}
```

---

## 4. キャッシュ戦略

### 4.1 캐시 계층
Edge routing の計算コストが高い (O(n + m log m) per edge) ため、캐싱 必須。

#### 案1: edge ID ベースのキャッシュ（推奨）

```typescript
// In EdgeRenderer.ts module scope
let _roadNetworkRouteCache = new Map<string, { x: number; y: number }[]>();

/** Called when road network or layout changes significantly */
export function invalidateRoadNetworkCache(): void {
  _roadNetworkRouteCache.clear();
}

// In drawEdges(), when enableRoadRouting:
if (useRoadRouting) {
  const cacheKey = e.id;
  let waypoints = _roadNetworkRouteCache.get(cacheKey);
  if (!waypoints) {
    waypoints = routeEdge(cfg.roadNetwork!, e.source, e.target);
    _roadNetworkRouteCache.set(cacheKey, waypoints);
  }
  if (waypoints.length > 0) {
    drawEdgeViaWaypoints(g, waypoints);
  } else {
    // fallback
  }
}
```

#### キャッシュ無効化条件
- `GraphViewContainer.buildRoadNetwork()` 実行後
- layout 変更時
- `panel.enableRoadRouting` トグル変更

**GraphViewContainer での実装**:
```typescript
// In buildRoadNetwork() (line 2334), after this.roadNetworkData = ...
invalidateRoadNetworkCache();

// In layout change handlers
invalidateRoadNetworkCache();
```

### 4.2 メモリ管理
- キャッシュキー: edge.id (unique)
- キャッシュサイズ: |edges| entries, 典型 ~3000–5000 edges
- 1 entry: ~5 waypoints × 2 floats = ~40 bytes → 総 ~200KB
- **許容**: 問題なし

---

## 5. ケーブルの「大型道路」生成設計

### 5.1 要件
```
ケーブルの場合:
  1. トランク（cluster A → cluster B 直線）→ road routing で経路化
  2. ファン（各エッジ node → trunk endpoint 直線）→ **そのまま直線**
```

**理由**: ファンは極めて短い（node から trunk edge まで）距離なため、curved routing が視覚的メリット が少ない。

### 5.2 実装
drawCables() (行519-629) での修正:

```typescript
// Around line 552-554
const ts = { x: trunkStart.x + lox, y: trunkStart.y + loy };
const te = { x: trunkEnd.x + lox, y: trunkEnd.y + loy };

// NEW: Trunk routing via road network
let trunkWaypoints: { x: number; y: number }[] = [ts, te];
if (cfg.enableRoadRouting && cfg.roadNetwork) {
  trunkWaypoints = routeWaypoints(cfg.roadNetwork, ts, te);
}

// Draw trunk via waypoints
g.lineStyle({ width: trunkWidth, color: lane.color, alpha: trunkAlpha * densityScale, native: true });
if (trunkWaypoints.length > 0) {
  g.moveTo(trunkWaypoints[0].x, trunkWaypoints[0].y);
  for (let pi = 1; pi < trunkWaypoints.length; pi++) {
    g.lineTo(trunkWaypoints[pi].x, trunkWaypoints[pi].y);
  }
}

// Fan lines: remain as-is (direct lines)
// ... existing fan drawing code (lines 593-626) ...
```

### 5.3 「大型道路」の視覚的構成
```
[Cluster A] ───────── ROAD NETWORK ─────────── [Cluster B]
              |
            (trunk: polyline via intersections)
              |
              └─ [Node1, Node2, ...] → trunk endpoint [via fan lines]
              └─ [Node3, Node4, ...] → trunk endpoint [via fan lines]
```

---

## 6. 実装順序

### Phase 1: Core Integration (1–2 days)
1. **road-network.ts**: `routeWaypoints()` 関数追加
   - ファイル: `/home/ubuntu/obsidian-plugins/obsidian-graph-island/src/layouts/road-network.ts`
   - 追加行数: ~40 lines

2. **EdgeRenderer.ts**:
   - RoadNetwork import 追加 (行1)
   - EdgeDrawConfig 拡張: `roadNetwork`, `enableRoadRouting` フィールド追加 (行80以降)
   - `drawEdgeViaWaypoints()` 新規関数追加 (750行前後)
   - `invalidateRoadNetworkCache()` 新規エクスポート関数 (646行付近)
   - drawEdges() 内: ケーブル + 通常エッジの road routing 条件追加 (行972–991)

3. **GraphViewContainer.ts**:
   - drawEdges() メソッドで cfg.roadNetwork, cfg.enableRoadRouting 設定 (行1781以降)
   - buildRoadNetwork() 呼び出し後に `invalidateRoadNetworkCache()` 追加

### Phase 2: UI Integration (1–2 days)
4. **panel settings**: `enableRoadRouting: boolean` フラグ追加
   - PanelSettings interface 修正
   - SettingsPanel UI に toggle control 追加

### Phase 3: Testing & Refinement (2–3 days)
5. E2E test: road routing on/off, cable routing, arc layout 優先度検証
6. Performance profiling: cache effectiveness

---

## 7. パラメータ設定

### 7.1 EdgeDrawConfig 完全版

```typescript
export interface EdgeDrawConfig {
  // ... existing 60+ fields ...

  /** Road network for waypoint-based routing. null if no network available. */
  roadNetwork?: RoadNetwork | null;

  /** Enable road network routing for edges (cable trunks + regular edges).
   *  Disabled by default. Requires non-null roadNetwork.
   *  Note: arc layout and bundling have higher priority. */
  enableRoadRouting?: boolean;
}
```

### 7.2 Panel Settings フィールド

```typescript
// In PanelSettings interface
enableRoadRouting?: boolean;  // default: false
```

---

## 8. エッジ描画の優先度（最終版）

```
drawEdges() フロー:

FOR each edge:
  1. Cable bundling? → drawCables() [トランク: road routing optional]
  2. Skip edge? → continue

  3. isArcLayout? → drawEdgeSegment (arc path)
  4. bundles && !Similar? → drawEdgeSegment (bundled path)
  5. enableRoadRouting && roadNetwork? → drawEdgeViaWaypoints (road path)
  6. default → drawEdgeSegment (straight path)

  7. drawEdgeDecorations() [矢印など]
```

**優先度**: arc > bundle > road > straight

---

## 9. 変更ファイル一覧

| ファイル | 行番号 | 変更内容 | 追加/削除/修正 |
|---------|--------|---------|--------|
| `src/layouts/road-network.ts` | 310+ | `routeWaypoints()` 関数 | 追加 ~40 lines |
| `src/views/EdgeRenderer.ts` | 1 | RoadNetwork import | 修正 |
| `src/views/EdgeRenderer.ts` | 64+ | EdgeDrawConfig.roadNetwork, enableRoadRouting | 追加 2 fields |
| `src/views/EdgeRenderer.ts` | 646 | `invalidateRoadNetworkCache()` | 追加 1 function |
| `src/views/EdgeRenderer.ts` | 750+ | `drawEdgeViaWaypoints()` | 追加 ~10 lines |
| `src/views/EdgeRenderer.ts` | 519–629 | drawCables() road routing 統合 | 修正 ~20 lines |
| `src/views/EdgeRenderer.ts` | 905–992 | drawEdges() road routing 統合 | 修正 ~30 lines |
| `src/views/EdgeRenderer.ts` | module scope | `_roadNetworkRouteCache` | 追加 1 variable |
| `src/views/GraphViewContainer.ts` | 1781+ | cfg.roadNetwork, cfg.enableRoadRouting 設定 | 追加 2 lines |
| `src/views/GraphViewContainer.ts` | buildRoadNetwork 内 | キャッシュ無効化呼び出し | 追加 1 line |
| `src/types.ts` | PanelSettings | enableRoadRouting フィールド | 追加 1 field |
| `src/ui/SettingsPanel.tsx` | ? | Road routing toggle control | 追加 UI |

**総変更**: ~120 lines 追加, 50 lines 修正

---

## 10. 検証チェックリスト

### 機能検証
- [ ] enableRoadRouting = false → 既存動作と同一
- [ ] enableRoadRouting = true, roadNetwork = null → fallback to straight
- [ ] ケーブルトランク routing: parallel cables 各本が road に沿う
- [ ] 通常エッジ routing: isArcLayout=true → arc優先（road ignored）
- [ ] bundleStrength > 0 && !arc → bundle 優先（road ignored）
- [ ] edge type = similar →常に直線（road routing non-applicable）

### パフォーマンス
- [ ] 無route キャッシュ → 3000 edges で < 50ms draw time
- [ ] route キャッシュ hit → < 1ms per frame

### エッジケース
- [ ] 同一始終点エッジ: routeEdge() → [] 返却 → fallback to straight
- [ ] 小さなグラフ (< 10 intersections): road routing disabled gracefully
- [ ] zoom out (worldScale < 0.1): road routing 保持 or disable?

---

## 11. 参考実装フロー（疑似コード）

```typescript
// ============ road-network.ts ============
export function routeWaypoints(
  network: RoadNetwork,
  startPos: { x: number; y: number },
  endPos: { x: number; y: number },
): { x: number; y: number }[] {
  const startIsect = findNearestIntersection(network, startPos);
  const endIsect = findNearestIntersection(network, endPos);
  if (startIsect < 0 || endIsect < 0) return [startPos, endPos];

  const path = findShortestPath(network, startIsect, endIsect);
  return pathToWaypoints(network, path);
}

// ============ EdgeRenderer.ts ============
let _roadNetworkRouteCache = new Map<string, { x: number; y: number }[]>();

export function invalidateRoadNetworkCache(): void {
  _roadNetworkRouteCache.clear();
}

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

export function drawEdges(
  g: CanvasGraphics,
  edges: GraphEdge[],
  resolvePos: ...,
  cfg: EdgeDrawConfig,
  arrowGfx?: ...,
): void {
  // ... existing setup code ...

  // Cable drawing with road routing
  if (cables.length > 0) {
    for (const cable of cables) {
      const layout = computeCableLayout(...);
      // ... trunk offset compute ...

      // NEW: Road routing for trunk
      let trunkWaypoints = [ts, te];
      if (cfg.enableRoadRouting && cfg.roadNetwork) {
        trunkWaypoints = routeWaypoints(cfg.roadNetwork, ts, te);
      }

      // Draw trunk via waypoints
      g.lineStyle(...);
      if (trunkWaypoints.length > 0) {
        drawEdgeViaWaypoints(g, trunkWaypoints);
      }

      // Draw fan (unchanged)
      // ...
    }
  }

  // Regular edges with road routing
  for (const e of edges) {
    // ... skip checks ...

    const useRoadRouting = cfg.enableRoadRouting
      && cfg.roadNetwork
      && !isArcLayout
      && !(bundles && e.type !== EDGE_TYPE_SIMILAR);

    if (useRoadRouting) {
      const cacheKey = e.id;
      let waypoints = _roadNetworkRouteCache.get(cacheKey);
      if (!waypoints) {
        waypoints = routeEdge(cfg.roadNetwork, e.source, e.target) ?? [];
        _roadNetworkRouteCache.set(cacheKey, waypoints);
      }

      g.lineStyle(...);
      if (waypoints.length > 0) {
        drawEdgeViaWaypoints(g, waypoints);
      } else {
        g.moveTo(src.x, src.y);
        g.lineTo(tgt.x, tgt.y);
      }
    } else {
      drawEdgeSegment(g, src, tgt, e, ...);
    }

    drawEdgeDecorations(g, e, src, tgt, ...);
  }
}

// ============ GraphViewContainer.ts ============
drawEdges() {
  // ... cfg build ...
  cfg.roadNetwork = this.roadNetworkData;
  cfg.enableRoadRouting = this.panel.enableRoadRouting ?? false;

  drawEdgesImpl(this.edgeGraphics, ..., cfg, ...);
}

buildRoadNetwork() {
  // ... build logic ...
  this.roadNetworkData = buildRoadNetwork(...);
  invalidateRoadNetworkCache();  // ← NEW
}
```

---

## 12. 推奨スケジュール

| 項目 | 期間 | 優先度 |
|------|------|--------|
| routeWaypoints() 実装 & 単体テスト | 0.5 日 | P0 |
| EdgeRenderer 統合 & キャッシュ | 1 日 | P0 |
| GraphViewContainer cfg 設定 | 0.5 日 | P0 |
| Panel settings UI 追加 | 0.5 日 | P0 |
| E2E テスト & デバッグ | 2 日 | P0 |
| パフォーマンス最適化 | 1 日 | P1 |
| ドキュメント作成 | 0.5 日 | P1 |
| **総計** | **~6 日** | |

---

## 参考資料

- **road-network.ts**: 路網生成、Dijkstra 実装
- **EdgeRenderer.ts**: ケーブル描画、edge bundling
- **GraphViewContainer.ts**: road network ビルド、edge drawing integration
- **types.ts**: PanelSettings, EdgeDrawConfig interface

