# setTimeout / clearTimeout 対称性監査 — task 1479-settimeout-leaks (subtask)

- 監査日: 2026-04-28
- ブランチ: `auto-improve-auto-20260428-084001-812762`
- 対象: `src/` 配下全件
- 件数: **setTimeout 64箇所 / 13ファイル**, **clearTimeout 27箇所 / 8ファイル**
- 親タスク: `1479-settimeout-leaks`
- 区分:
  - **A** = ID 保持＋対応 clearTimeout あり (修正不要)
  - **B** = ID 捨て or 解放漏れ (リーク候補 — 修正対象)
  - **C** = ローカルクロージャ完結＋短時間 (リスク低、現状許容)

---

## 1. ファイル別分類

### `src/views/GraphViewContainer.ts` (setTimeout: 13, clearTimeout: 9)

| 行 | call | 区分 | ペア / 解放経路 |
|---|---|---|---|
| 605 | `_saveTimer` 宣言 | — | フィールド |
| 633 | `_saveTimer = setTimeout(...)` | A | L632 `clearTimeout(this._saveTimer)` + onClose L1683 |
| 611 | `_doRenderDebounceTimer` 宣言 | — | フィールド |
| 6929 | `_doRenderDebounceTimer = window.setTimeout(...)` | A | L6928, L6933, onClose L1682 |
| 617 | `timers = new ManagedTimers()` | — | 集中管理 |
| 7321 | `this.timers.setTimeout(...)` Phase B | A | onClose L1685 `timers.clearAll()` |
| 7342 | `this.timers.setTimeout(...)` Phase C | A | 同上 |
| 7371 | `this.timers.setTimeout(...)` Phase D | A | 同上 |
| 7378 | `this.timers.setTimeout(...)` Phase E | A | 同上 |
| 625 | `_hoverPreviewTimer` 宣言 | — | フィールド |
| 2207 | `_hoverPreviewTimer = window.setTimeout(...)` | A | L2214, onClose L1687 `_cancelHoverPreview()` |
| 7590 | `_autoFitTimer` 宣言 | — | フィールド |
| 7582 | `_autoFitTimer = window.setTimeout(...)` | A | L7581, onClose L1681 |
| 1438 | `setTimeout: (cb, ms) => window.setTimeout(...)` | **B** | autoSnapshot 注入用ファクトリ。`createAutoSnapshotHandler` は `cancel()` を返すが **GVC は autoSnap reference を保持しておらず、onClose で `cancel()` を呼べていない**。debounce (autoSnapshotIntervalMin × 60s デフォルト 5min) のタイマーが view 閉鎖後に発火し、`appendAutoSnapshot` → `persist` で plugin settings を書き込む可能性 |

**onClose に存在するクリア (L1680-1687):**

```ts
clearTimeout(this._autoFitTimer);
clearTimeout(this._doRenderDebounceTimer);
if (this._saveTimer) clearTimeout(this._saveTimer);
cancelAnimationFrame(this._zoomAnimId);
this.timers.clearAll();
this._cancelHoverPreview();
```

→ GVC 自身のフィールド系は対称。**抜け穴は autoSnap の cancel() 未呼び出しのみ**。

---

### `src/views/RenderPipeline.ts` (setTimeout: 12, clearTimeout: 2)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 479 | `deferredBatchId` 宣言 | — | フィールド |
| 1845 | `deferredBatchId = setTimeout(processDeferredBatch, 0)` | A | L1850 `cancelDeferredBatch()`, L620 `detach()` |
| 1488 | `setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0)` | **B** | 戻り値捨て。0ms だが view close 中の発火可能性。`?.` 防御はあるが downstream 副作用 (sim restart など) が dead view を触る |
| 1786 | `setTimeout(() => this.enrichLabelsDeferred(), 2500)` | **B (高)** | **戻り値捨て・2.5秒遅延**。最大の leak 影響源。view close 後に発火し `enrichLabelsDeferred()` → `host.getPixiNodes()` → `_createNodeLabel` が dead context で例外 |
| 1797 | `_enrichmentCancelId` 宣言 | — | フィールド |
| 1828 | `_enrichmentCancelId = setTimeout(processNext, 0)` | **B** | L1800 で次サイクル開始時に clear するが、**`detach()` (L619) では clear していない**。enrichment chunk 連鎖が view close 後も継続 |
| 1834 | `_enrichmentCancelId = setTimeout(processNext, 0)` | **B** | 同上、開始トリガ |

**`detach()` の実体 (L619-626):**

```ts
detach() {
    this.cancelDeferredBatch();         // ← deferredBatchId だけ
    // _enrichmentCancelId は未クリア
    const app = this.host.getPixiApp();
    if (this._tickerBound && app) { app.ticker.remove(...); }
}
```

---

### `src/views/InteractionManager.ts` (setTimeout: 3, clearTimeout: 4)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 447 | `_zoomCullTimer = window.setTimeout(...)` | A | L446, L372 `detach()` |
| 454 | `_zoomLayoutTimer = window.setTimeout(...)` | A | L453, L371 `detach()` |
| 1055 | `setTimeout(() => { searchLeaf.setQuery(...) }, 300)` | **B (低)** | 戻り値捨て。コンテキストメニューの「Search in vault」アクション。Obsidian 別 leaf への副作用なので IM 本体のリスクは低だが、原則違反 |

---

### `src/views/PanelBuilder.ts` (setTimeout: 6, clearTimeout: 1)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 808 | `let searchDebounce: ... = null` | — | クロージャローカル |
| 813 | `searchDebounce = setTimeout(...., 400)` | **B** | L812 でリセットはするが、view close 時のクリアパス無し。400ms の debounce |
| 840 | `ctx.timers.setTimeout(..., 150)` | A | GVC.timers 経由 (managed) |
| 1330 | `ctx.timers.setTimeout(..., 2000)` | A | preset.export 復元、managed |
| 1346 | `ctx.timers.setTimeout(..., 2000)` | A | preset.exportDiff 復元、managed |
| 1385 | `setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)` | **B** | 戻り値捨て。preset import 後の zoom 復元。500ms 後 |

---

### `src/views/panel-sections-layout.ts` (setTimeout: 7, clearTimeout: 3)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 236 | `let debounceTimer: ... = undefined` | — | ontology rule save 用クロージャローカル |
| 242 | `debounceTimer = setTimeout(() => cb.invalidateDataKeepPanel(), 2000)` | **B** | クロージャ内で L241 clearTimeout はあるが、**view close 時にクリアされない**。2秒後に `cb.invalidateDataKeepPanel()` が dead view を触る可能性 |
| 390 | `setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)` | **B** | 戻り値捨て。サンプルプリセット読込時 |
| 672/675 | `spacingDebounce` (closure) | **B (低)** | 100ms。クロージャローカル管理だが view close 時の clear 無し |
| 779/782 | `forceDebounce` (closure) | **B (低)** | 150ms、同上 |

---

### `src/views/panel-widgets.ts` (setTimeout: 5, clearTimeout: 0)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 209 | `setTimeout(() => (popup.style.display = "none"), 150)` | **C** | input.blur 直後の popup 隠蔽。短時間 DOM-only |
| 862 | `setTimeout(() => { ... dismissHint(); }, 150)` | **C** | 同上 |
| 1069 | `setTimeout(() => { ... dismissHint(); }, 150)` | **C** | 同上 |
| 1226 | `setTimeout(ctx.rebuild, 50)` | **C** | 50ms 後 rebuild。idempotent |
| 1260 | `setTimeout(ctx.dismiss, 200)` | **C** | dismiss は idempotent |

---

### `src/views/coord-panel.ts` (setTimeout: 2, clearTimeout: 0)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 426 | `setTimeout(() => { nameEl.style.color = ""; }, 600)` | **C** | 名前要素の color reset。view close 後も DOM-only で無害 |
| 444 | `setTimeout(() => { optBtn.disabled = false; ... }, waitMs)` | **B** | `waitMs = rt.autoOptMaxPasses * 1500 + 500` (デフォルトで数秒〜10秒級)。**長時間タイマー**。view close 後に発火すると optBtn が dead DOM、無害だが原則違反 |

---

### `src/views/panel-callbacks.ts` (setTimeout: 1, clearTimeout: 0)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 113 | `setTimeout(() => host.renderPipeline?.forceRender(), 100)` | **B (低)** | 100ms 後 forceRender。`?.` 防御あり。短時間だが原則違反 |

---

### `src/views/snapshot/GraphSnapshot.ts` (setTimeout: 3, clearTimeout: 4)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 137-138 | `TimerHooks` interface | — | DI型 |
| 162 | `timers.clearTimeout(timer)` | A | クロージャローカル `timer` 変数 |
| 163 | `timer = timers.setTimeout(..., debounceMs)` | A | `cancel()` 関数で解放可能 |
| 174 | `timers.clearTimeout(timer)` | A | `cancel()` 内 |

→ **このモジュール自体は完結**。問題は **caller (GVC L1442) が `autoSnap.cancel()` を呼んでいない** こと。

---

### `src/main.ts` (setTimeout: 1, clearTimeout: 0)

| 行 | call | 区分 | 備考 |
|---|---|---|---|
| 17 | `private timers = new ManagedTimers()` | — | プラグインレベル |
| 240 | `onunload() { this.timers.clearAll(); }` | A | 一括解放 |
| 372 | `this.timers.setTimeout(...)` | A | 上記 timers 経由 |

---

### `src/utils/managed-timers.ts`, `src/utils/timer-registry.ts`

ラッパー実装そのもの。内部で `globalThis.setTimeout/clearTimeout` を完全に対称管理 → 監査対象外 (Aパターンの基盤)。

---

### `src/constants.ts`

L323/L334 はコメント参照のみ — 監査対象外。

---

## 2. リスク順サマリ (Bパターン)

| 優先 | ファイル / 行 | 内容 | 推定影響 |
|---|---|---|---|
| **P0** | `RenderPipeline.ts:1786` | `setTimeout(enrichLabelsDeferred, 2500)` 戻り値捨て | view close 後 2.5秒で dead-view を操作。最大インパクト |
| **P0** | `RenderPipeline.ts:1797/1828/1834` | `_enrichmentCancelId` を `detach()` で clear せず | enrichment chunk 連鎖が継続 |
| **P0** | `GraphViewContainer.ts:1438` | autoSnap が `cancel()` を持つが **GVC が呼んでいない** | metadataCache 改変で着火された autoSnap タイマー (デフォルト 5min) が view close 後も生存。settings 書き込みでデータ汚染リスク |
| **P1** | `RenderPipeline.ts:1488` | `setTimeout(onAllPixiNodesCreated, 0)` 戻り値捨て | 0ms だが下流で sim restart などのキック |
| **P1** | `panel-sections-layout.ts:236-242` | `debounceTimer` (ontology save) view close 時にクリア無し | 2秒後に dead view 操作 |
| **P1** | `PanelBuilder.ts:808-813` | `searchDebounce` view close 時にクリア無し | 400ms 後 |
| **P1** | `panel-sections-layout.ts:390` | `setTimeout(setZoom, 500)` | 500ms 後 dead view 操作 |
| **P1** | `PanelBuilder.ts:1385` | `setTimeout(setZoom, 500)` | 同上 |
| **P2** | `coord-panel.ts:444` | `setTimeout(..., waitMs)` 数秒〜10秒級 | DOM 操作のみで無害だが原則違反 |
| **P2** | `panel-callbacks.ts:113` | `setTimeout(forceRender, 100)` | 100ms、`?.` 防御あり |
| **P2** | `InteractionManager.ts:1055` | `setTimeout(setQuery, 300)` Obsidian 別 leaf 副作用 | 別 view への操作 |
| **P2** | `panel-sections-layout.ts:672/779` | slider debounce (closure) | 100ms / 150ms |

---

## 3. 推奨対処の方向性 (親タスク 1479 への引き継ぎ)

### 3.1 既存ラッパー活用パターン (推奨)

`PanelBuilder` は既に `ctx.timers: ManagedTimers` を引数で受け取っている (使用例: L840/1330/1346)。
`panel-sections-layout` / `panel-callbacks` / `panel-widgets` も同じ ctx に手を入れて managed 経由に揃えるのが最小修正。

```ts
// before
setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500);
// after (panel-sections-layout 内で ctx.timers を受け取る形に)
ctx.timers.setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500);
```

### 3.2 `RenderPipeline.detach()` の補強

```ts
detach() {
    this.cancelDeferredBatch();
    if (this._enrichmentCancelId !== null) {
        clearTimeout(this._enrichmentCancelId);
        this._enrichmentCancelId = null;
    }
    // ...
}
```

L1488 / L1786 の戻り値捨て setTimeout は、`host.timers.setTimeout` (RenderHost に timers を expose) もしくは新フィールド (`_finalizeId`, `_enrichKickoffId`) で同様に管理。

### 3.3 GVC autoSnap cleanup

```ts
// 1418
const autoSnap = createAutoSnapshotHandler(...);
this._autoSnapCancel = autoSnap.cancel;   // 保持
this.registerEvent(this.app.metadataCache.on("changed", autoSnap.trigger));

// onClose
this._autoSnapCancel?.();
```

または `this.timers` を `TimerHooks` として注入し、ManagedTimers.clearAll() で巻き取る。

### 3.4 closure-local debouncer

`searchDebounce` / `debounceTimer` (ontology) / `spacingDebounce` / `forceDebounce` は
クロージャ内で完結するが view ライフサイクル横断で leak る。
`ctx.timers.setTimeout` 経由に置き換えれば onClose の `clearAll()` で巻き取れる。

---

## 4. 結論

- **A (修正不要)**: 約 50箇所 (managed-timers / timer-registry / フィールド管理 / closure-paired)
- **B (修正対象)**: **12 site (上表)**
- **C (許容)**: 5箇所 (短時間 DOM-only popup 制御)

**最優先 fix 対象 3つ:**
1. `RenderPipeline.detach()` で `_enrichmentCancelId` をクリア
2. `RenderPipeline.ts:1786` の 2500ms enrich-kickoff を managed 化
3. `GraphViewContainer.onClose()` で autoSnap.cancel() を呼ぶ

これらを潰せば「view 閉鎖後に dead view を操作するタイマー」起因のリーク・例外は実用上ゼロになる見込み。
残り B (P1/P2) は順次 ctx.timers 経由化で巻き取り可能。
