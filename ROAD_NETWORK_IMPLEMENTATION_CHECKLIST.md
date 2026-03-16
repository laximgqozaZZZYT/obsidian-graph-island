# Road Network EdgeRenderer 統合 — 実装チェックリスト

**進捗**: Design Phase (2026-03-15)
**想定実装期間**: 5-7 days

---

## Pre-Implementation (準備)

- [ ] **PR作成**: `feat/road-network-edge-routing` ブランチ
- [ ] **コードレビュー**: 設計ドキュメント(`ROAD_NETWORK_EDGE_RENDERER_DESIGN.md`)を チームで確認
- [ ] **テスト vault**: `/home/ubuntu/obsidian-plugins/開発/` で動作確認環境を確認

---

## Phase 1: Core Integration (1–2 days)

### 1.1 road-network.ts 修正

- [ ] **routeWaypoints() 関数追加** (行310+)
  - [ ] 最近接交差点探索ロジック (startPos)
  - [ ] 最近接交差点探索ロジック (endPos)
  - [ ] findShortestPath() 呼び出し
  - [ ] pathToWaypoints() 呼び出し
  - [ ] エッジケース: empty intersections, same start/end

- [ ] **単体テスト** (if applicable)
  - [ ] Happy path: valid positions, valid route
  - [ ] Edge case: positions at same intersection
  - [ ] Edge case: disconnected network
  - [ ] Performance: 1000 calls per frame < 50ms

### 1.2 EdgeRenderer.ts 修正

#### Imports & Type extensions
- [ ] RoadNetwork import 追加 (行2)
- [ ] routeWaypoints import 追加 (行2)
- [ ] EdgeDrawConfig に roadNetwork フィールド追加 (行64+)
- [ ] EdgeDrawConfig に enableRoadRouting フィールド追加 (行67+)

#### Cache infrastructure
- [ ] `_roadNetworkRouteCache` 変数追加 (module scope)
- [ ] `invalidateRoadNetworkCache()` エクスポート関数追加 (行650+)

#### Helper functions
- [ ] `drawEdgeViaWaypoints()` 関数追加 (行740+)
  - [ ] 空のwaypoints チェック
  - [ ] moveTo + lineTo ループ

#### drawCables() 修正
- [ ] ケーブル lane ループ内でトランク座標 (ts, te) 計算（既存）
- [ ] IF enableRoadRouting && roadNetwork: routeWaypoints(ts, te) 呼び出し
- [ ] Fallback: empty waypoints → [ts, te]
- [ ] drawEdgeViaWaypoints() でトランク描画
- [ ] ファン描画は無変更

#### drawEdges() 修正
- [ ] useRoadRouting 条件式の定義
  - [ ] cfg.enableRoadRouting チェック
  - [ ] cfg.roadNetwork チェック
  - [ ] !isArcLayout チェック
  - [ ] !(bundles && !isSimilar) チェック

- [ ] Road routing パス実装
  - [ ] キャッシュ lookup (`_roadNetworkRouteCache.get(e.id)`)
  - [ ] キャッシュ miss → routeEdge() 呼び出し → cache.set()
  - [ ] waypoints.length > 0 → drawEdgeViaWaypoints()
  - [ ] fallback → straight line (moveTo + lineTo)

- [ ] Existing routing path を else ブロックへ移動
  - [ ] drawEdgeSegment() はそのまま

- [ ] drawEdgeDecorations() は両パスで呼び出し
  - [ ] src/tgt は変わらず（オリジナル座標）

### 1.3 GraphViewContainer.ts 修正

#### Imports
- [ ] invalidateRoadNetworkCache import 追加 (行15-30)

#### buildRoadNetwork() メソッド
- [ ] メソッド末尾で `invalidateRoadNetworkCache()` 呼び出し追加

#### drawEdges() メソッド
- [ ] cfg.roadNetwork = this.roadNetworkData 追加 (行1781+)
- [ ] cfg.enableRoadRouting = this.panel.enableRoadRouting ?? false 追加 (行1782+)

#### Layout change handlers
- [ ] `setLayout()` or equivalent で invalidateRoadNetworkCache() 呼び出し追加

---

## Phase 2: Panel Settings Integration (1–2 days)

### 2.1 types.ts 修正

- [ ] PanelSettings interface に enableRoadRouting フィールド追加
  - [ ] Type: `boolean | undefined`
  - [ ] Default: false
  - [ ] JSDoc: purpose, dependencies説明

### 2.2 UI Component (SettingsPanel / etc)

- [ ] Road routing toggle control 追加
  - [ ] Label: "Road Network Routing"
  - [ ] Description: "Route edges along coordinate system intersections"
  - [ ] onChange handler: settings update + onSettingsChange()

- [ ] UI placement: Cable bundling settings の直後

### 2.3 Settings persistence

- [ ] Panel settings save/load: enableRoadRouting フィールドが persistされることを確認
- [ ] Default settings: `PanelSettingsDefaults` に enableRoadRouting: false を追加

---

## Phase 3: Integration Testing (2–3 days)

### 3.1 単体テスト (if framework available)

- [ ] routeWaypoints() テスト
  - [ ] Various grid configurations (polar, cartesian)
  - [ ] Edge cases (empty network, same positions)

- [ ] invalidateRoadNetworkCache() テスト
  - [ ] キャッシュクリア確認

- [ ] drawEdgeViaWaypoints() テスト (ピクセルパーフェクト)
  - [ ] Single waypoint (degenerate)
  - [ ] Multiple waypoints (normal path)

### 3.2 E2E テスト (Playwright)

#### Basic routing
- [ ] `cdp-e2e-road-routing-basic.spec.ts`
  - [ ] enableRoadRouting = false → 既存挙動と同一 ✓
  - [ ] enableRoadRouting = true, roadNetwork = null → fallback to straight ✓
  - [ ] enableRoadRouting = true, roadNetwork available → roads followed ✓

#### Cable routing
- [ ] `cdp-e2e-road-routing-cables.spec.ts`
  - [ ] Cable trunk: road routing vs. direct line ✓
  - [ ] Fan lines: unchanged (direct) ✓
  - [ ] Parallel cables: each routes independently ✓

#### Priority tests
- [ ] `cdp-e2e-road-routing-priority.spec.ts`
  - [ ] Arc layout active → road ignored ✓
  - [ ] Bundle mode active → road ignored (except similar) ✓
  - [ ] Road mode + similar edge → straight (expected) ✓

#### Performance
- [ ] `cdp-e2e-road-routing-performance.spec.ts`
  - [ ] 3000 edges, road routing enabled → < 100ms draw time ✓
  - [ ] Cache hit rate > 90% on stable layout ✓
  - [ ] Memory usage: cache < 500KB ✓

#### Visual verification
- [ ] Manual screenshot comparison: road vs. non-road
  - [ ] Force layout + road routing
  - [ ] Polar layout + road routing
  - [ ] Cartesian layout + road routing

### 3.3 Integration test coverage

- [ ] Settings save/load: enableRoadRouting persists ✓
- [ ] Multiple layout switches: cache properly invalidated ✓
- [ ] Theme change: no regressions ✓
- [ ] Zoom in/out: road routing maintained ✓
- [ ] Pan/drag: consistent behavior ✓

---

## Phase 4: Performance & Optimization (1–2 days)

### 4.1 Profiling

- [ ] Chrome DevTools Performance tab
  - [ ] With road routing: time breakdown
  - [ ] Cache behavior: hits vs. misses
  - [ ] Memory allocation patterns

- [ ] Playwright trace (if available)
  - [ ] 60 FPS maintenance check
  - [ ] Long-frame detection (> 16ms)

### 4.2 Optimization targets

- [ ] routeWaypoints() の最近接探索
  - [ ] If > 100 intersections: spatial hashing考慮？
  - [ ] Or: accept O(n) search, rely on cache

- [ ] Cache eviction policy
  - [ ] LRU? or simple clear-on-layout-change?
  - [ ] Current: clear-on-change (simple)

- [ ] Waypoint simplification
  - [ ] Collinear point removal?
  - [ ] Tolerance-based simplification (Douglas-Peucker)?

---

## Phase 5: Documentation & Cleanup (1 day)

### 5.1 Code documentation

- [ ] JSDoc comments on all public functions
  - [ ] routeWaypoints()
  - [ ] invalidateRoadNetworkCache()
  - [ ] drawEdgeViaWaypoints()

- [ ] EdgeDrawConfig フィールドのコメント更新
  - [ ] enableRoadRouting, roadNetwork

- [ ] PanelSettings フィールドのコメント

### 5.2 User documentation (if applicable)

- [ ] README or in-app help: Road routing feature explanation
- [ ] Settings page: toggle説明
- [ ] Performance implications

### 5.3 Code cleanup

- [ ] Unused imports 削除
- [ ] Trailing whitespace 削除
- [ ] Formatting pass (prettier/eslint)

### 5.4 Design doc updates

- [ ] ROAD_NETWORK_EDGE_RENDERER_DESIGN.md: 実装ノート追加
- [ ] ROAD_NETWORK_INTEGRATION_CODE_SNIPPETS.md: final確認

---

## Verification Checklist (Pre-Merge)

### Functional verification
- [ ] enableRoadRouting = false → exactly same visual as before
- [ ] enableRoadRouting = true, no roadNetwork → fallback graceful
- [ ] enableRoadRouting = true, roadNetwork valid → edges follow roads
- [ ] Cable trunks: visible routing via intersections
- [ ] All decorations (arrows, markers): correctly positioned at endpoints

### Code quality
- [ ] No console errors or warnings
- [ ] TypeScript: no `any` types, strict mode pass
- [ ] ESLint: no violations
- [ ] Code review: 1+ reviewer approval

### Performance
- [ ] 3000+ edges: < 100ms frame time
- [ ] Memory: no leaks (DevTools heap check)
- [ ] 60 FPS: consistent on stable layout

### Test coverage
- [ ] Unit tests: > 80% of new functions
- [ ] E2E scenarios: all 5+ test specs passing
- [ ] No regression: existing tests still pass

### Documentation
- [ ] Design doc complete & reviewable
- [ ] Code comments: all public APIs documented
- [ ] CHANGELOG entry (if applicable)

---

## Known Risks & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| O(n) intersection search is slow | Medium | Medium | Cache routing results, consider spatial index if > 1000 isects |
| Road network unavailable at initialization | Low | Low | Fallback to straight lines, handle null gracefully |
| Arc layout + road routing confusion | Low | Medium | Priority hierarchy clear, prefer arc |
| Memory bloat from cached waypoints | Low | Low | Clear on layout change, max ~500KB for 5000 edges |
| Parallel cables misrouting | Low | High | Test cable-specific scenarios (E2E) |

---

## Timeline Estimate

| Phase | Days | Notes |
|-------|------|-------|
| Phase 1: Core integration | 1–2 | Largest code changes |
| Phase 2: Panel settings | 1–2 | UI + persistence |
| Phase 3: Integration testing | 2–3 | E2E + manual |
| Phase 4: Performance | 1–2 | Profiling + optimization |
| Phase 5: Documentation | 1 | Cleanup + writeup |
| **Total** | **6–10 days** | Estimate with buffer |

---

## Post-Implementation (Maintenance)

### Monitoring
- [ ] Edge routing cache hit rate > 90%
- [ ] No performance regressions on existing layouts
- [ ] User feedback on visual quality

### Potential follow-ups
- [ ] Waypoint simplification (Douglas-Peucker) for smoother visual
- [ ] Spatial hashing for large networks (> 1000 intersections)
- [ ] Road network visualization mode (debug)
- [ ] Advanced routing: avoid node regions?

---

## Appendix: File Locations Quick Reference

| File | Lines | Change Type |
|------|-------|-------------|
| `src/layouts/road-network.ts` | 310+ | Add routeWaypoints() |
| `src/views/EdgeRenderer.ts` | 1–2 | Add imports |
| `src/views/EdgeRenderer.ts` | 64+ | Extend EdgeDrawConfig |
| `src/views/EdgeRenderer.ts` | 640+ | Add module cache var |
| `src/views/EdgeRenderer.ts` | 650+ | Add invalidateRoadNetworkCache() |
| `src/views/EdgeRenderer.ts` | 740+ | Add drawEdgeViaWaypoints() |
| `src/views/EdgeRenderer.ts` | 519–629 | Modify drawCables() |
| `src/views/EdgeRenderer.ts` | 905–992 | Modify drawEdges() |
| `src/views/GraphViewContainer.ts` | 15–30 | Add import |
| `src/views/GraphViewContainer.ts` | 2334–2417 | Modify buildRoadNetwork() |
| `src/views/GraphViewContainer.ts` | 1698–1797 | Modify drawEdges() |
| `src/types.ts` | PanelSettings | Add enableRoadRouting field |
| `src/ui/SettingsPanel.tsx` | ? | Add UI toggle |

---

## Sign-off

- **Design Review**: [ ] Approved by tech lead
- **Implementation Start**: [ ] Date: ________
- **Code Review**: [ ] Approved by peer reviewer
- **Merge to main**: [ ] Date: ________

