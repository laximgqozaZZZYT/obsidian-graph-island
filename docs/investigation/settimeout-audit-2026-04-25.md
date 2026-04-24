# setTimeout / clearTimeout Audit — 2026-04-25

Parent task: `148-settimeout-leaks`
Scope: `src/**/*.ts` (non-test).

## 目的

Obsidian プラグインでは `setTimeout` が `onClose`/`onunload` を跨いで残ると、view 破棄後に stale な `this` 参照を触って例外または silent 副作用を起こす。このドキュメントは **各呼び出しの寿命管理状況**を一覧化し、後続の修正タスク (148 系) で「触る対象」を確定するための出発点とする。

本ドキュメントはコード変更を伴わない。

## 判定ラベル

- **PROPERLY MANAGED** — id が保存され、cleanup (detach/onClose) で clearTimeout されている
- **FIRE-AND-FORGET (benign)** — id 保存なし。ただし寿命が短く (< 数百 ms)、コールバック内で host を optional chaining するなどして view 破棄時の副作用が実害なし
- **LEAK CANDIDATE** — id が無保存 or cleanup 時に clear されず、view 破棄後にコールバックが走り得る
- **NON-CALL** — 型定義や comment で実呼び出しではない

「推奨アクション」列:
- `放置可` — そのままでよい
- `_scheduleTimer 移行` — `GraphViewContainer._scheduleTimer()` (src/views/GraphViewContainer.ts:618) のような中央管理 helper 経由に
- `保存+clear` — 個別プロパティに保存し、cleanup で clear
- `cancel() 呼び出し追加` — モジュール側に cancel API があり、呼び忘れの解消のみ

## 監査表

### src/main.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 371 | `openSubgraphInNewTab`: 新規 leaf 作成後の panel 初期化遅延 (100ms) | ✗ | ✗ | FIRE-AND-FORGET (benign) — 直後の leaf は新規生成で caller 自体が終わらない | 放置可 |

### src/views/RenderPipeline.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 461 | `deferredBatchId` プロパティ宣言 | — | — | NON-CALL | — |
| 1398 | コメント中の "setTimeout" | — | — | NON-CALL | — |
| 1422 | `onAllPixiNodesCreated?.()` を 0ms で deferralして同期 host setup との race 回避 | ✗ | ✗ | LEAK CANDIDATE — optional chaining あるが小さな leak | `_scheduleTimer 移行` or detach() で guard |
| 1675 | createPixiNodes 完了から 2500ms 後に `enrichLabelsDeferred()` を起動 | ✗ | ✗ | **LEAK CANDIDATE** — 2.5s 以内に view unmount されると stale pipeline メソッド呼び出し | **保存+clear** (detach() で解除) |
| 1686 | `_enrichmentCancelId` プロパティ宣言 | — | — | NON-CALL | — |
| 1689 | `_enrichmentCancelId` を re-entrance で clear | ✓ | ✓ (部分的) | LEAK CANDIDATE — `detach()` (RenderPipeline.ts:601) で clear されない | **detach() で clearTimeout 追加** |
| 1717 | enrichment chunk の次バッチ予約 | ✓ (`_enrichmentCancelId`) | 上と同じ | 同上 | 同上 |
| 1723 | enrichment 起動 setTimeout | ✓ (`_enrichmentCancelId`) | 上と同じ | 同上 | 同上 |
| 1728/1731 | コメント内の "setTimeout" | — | — | NON-CALL | — |
| 1734 | `deferredBatchId = setTimeout(processDeferredBatch, 0)` | ✓ | ✓ `cancelDeferredBatch()` @ 1737 → `detach()` @ 602 で呼ばれる | PROPERLY MANAGED | 放置可 |
| 1739 | `cancelDeferredBatch` 内の clearTimeout | ✓ | ✓ | PROPERLY MANAGED | 放置可 |

### src/views/InteractionManager.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 371 | `detach()` 内の `_zoomLayoutTimer` clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 372 | `detach()` 内の `_zoomCullTimer` clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 446 | `_zoomCullTimer` を毎 zoom step で事前 clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 447 | `_zoomCullTimer = window.setTimeout(..., 50)` — zoom 終了後の label cull | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 453 | `_zoomLayoutTimer` 事前 clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 454 | `_zoomLayoutTimer = window.setTimeout(..., ZOOM_LAYOUT_DEBOUNCE_MS)` | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 1055 | コンテキストメニュー "Search in vault" の 300ms 遅延検索発火 | ✗ | ✗ | FIRE-AND-FORGET (benign) — Obsidian グローバル command に対して 1 回実行 | 放置可 |

### src/views/PanelBuilder.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 805 | `searchDebounce` 宣言 (closure-scope) | — | — | NON-CALL | — |
| 809 | 次 input で前の debounce を clear | ✓ (closure) | ✓ (次入力時のみ) | **LEAK CANDIDATE** — panel 再構築時に古い closure の pending timer が残り、rebuild 済み state で `cb.invalidateDataKeepPanel()` 発火 | `_scheduleTimer 移行` or panel destroy 時に clear |
| 810 | `searchDebounce = setTimeout(..., 400)` — 検索クエリ確定の debounce | 同上 | 同上 | 同上 | 同上 |
| 837 | `searchBar` blur 時の history dropdown 非表示 (150ms) | ✗ | ✗ | FIRE-AND-FORGET (benign) — DOM element への style 代入のみ、detached なら no-op | 放置可 |
| 1327 | `exportBtn` text を 2000ms 後に元に戻す (toast) | ✗ | ✗ | FIRE-AND-FORGET (benign) | 放置可 |
| 1343 | `diffExportBtn` text を 2000ms 後に元に戻す | ✗ | ✗ | FIRE-AND-FORGET (benign) | 放置可 |
| 1382 | preset import 後の zoom 復元 (500ms) | ✗ | ✗ | FIRE-AND-FORGET (benign) — `cb.setZoom?.` で guard | 放置可 |

### src/views/coord-panel.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 426 | Coord entry クリック時の一瞬ハイライト (600ms) | ✗ | ✗ | FIRE-AND-FORGET (benign) — DOM style 代入のみ | 放置可 |
| 444 | Auto-optimize ボタン disable 解除 (waitMs = passes*1500+500, 最大数秒〜) | ✗ | ✗ | LEAK CANDIDATE (軽微) — 数秒後に detached element にプロパティ代入、実害は small | `_scheduleTimer 移行` (low priority) |

### src/views/GraphViewContainer.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 603 | `_saveTimer` プロパティ宣言 | — | — | NON-CALL | — |
| 615 | `_pendingTimers: Set<ReturnType<typeof setTimeout>>` — **中央管理 Set** | — | — | NON-CALL | — |
| 618 | `_scheduleTimer()` helper: 生成 id を Set 登録し、完了時に自動 remove | ✓ | ✓ (onClose で Set 全 clear @ 1688) | **PROPERLY MANAGED** (このパターンに他を寄せるべき) | — |
| 619 | `setTimeout` 本体 (helper 内部) | ✓ | ✓ | 同上 | — |
| 635 | `_saveTimer` 事前 clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 636 | `_saveTimer = setTimeout(..., SAVE_DEBOUNCE_MS)` | ✓ | ✓ (onClose @ 1686) | PROPERLY MANAGED | 放置可 |
| 1441 | autoSnap への timer hook 注入 (`window.setTimeout`) | — | — | NON-CALL (hook 渡し) | — |
| 1442 | autoSnap への timer hook 注入 (`window.clearTimeout`) | — | — | NON-CALL (hook 渡し) | — |
| 1445 | `metadataCache.on("changed", autoSnap.trigger)` 登録 (イベントは `registerEvent` で自動解除されるが、**発火済みの debounce timer は別物**) | — | ✗ (`autoSnap.cancel()` 未呼び出し) | **LEAK CANDIDATE** — view を閉じた瞬間に内部 timer が pending 状態だと、`host.getGraphData()` 等が detached view 上で実行される | **onClose で `autoSnap.cancel()` を呼ぶ** (または `this.register(autoSnap.cancel)`) |
| 1684 | `clearTimeout(this._autoFitTimer)` in onClose | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 1685 | `clearTimeout(this._doRenderDebounceTimer)` in onClose | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 1686 | `clearTimeout(this._saveTimer)` in onClose | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 1688 | `_pendingTimers` Set ループ clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 2211 | `_hoverPreviewTimer = window.setTimeout(..., HOVER_PREVIEW_DELAY_MS)` | ✓ | ✓ (`_cancelHoverPreview` @ onClose L1691) | PROPERLY MANAGED | 放置可 |
| 2218 | `_cancelHoverPreview` 内 clearTimeout | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 6931 | `_doRenderDebounceTimer` 事前 clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 6932 | `_doRenderDebounceTimer = window.setTimeout(() => this.doRender(), 50)` | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 6936 | 同 timer の 0 リセット clear | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 7312 | コメント内の "setTimeout" | — | — | NON-CALL | — |
| 7324 | sim-end PHASE B (0ms): a11y announce + stats 更新 | ✗ | ✗ | LEAK CANDIDATE (軽微) — 0ms fire であり onClose は async なので実際にはレース稀。ただし規律として unsaved | `_scheduleTimer 移行` |
| 7345 | sim-end PHASE C (0ms): viewport fit + road network | ✗ | ✗ | LEAK CANDIDATE (軽微) | `_scheduleTimer 移行` |
| 7374 | sim-end PHASE D (0ms): label cull + radius recalc | ✗ | ✗ | LEAK CANDIDATE (軽微) | `_scheduleTimer 移行` |
| 7381 | sim-end PHASE E (0ms): auto focus + position persist | ✗ | ✗ | LEAK CANDIDATE (軽微) | `_scheduleTimer 移行` |
| 7584 | `clearTimeout(this._autoFitTimer)` 事前 | ✓ | ✓ | PROPERLY MANAGED | 放置可 |
| 7585 | `_autoFitTimer = window.setTimeout(..., AUTOFIT_DELAY_MS)` | ✓ | ✓ (onClose @ 1684) | PROPERLY MANAGED | 放置可 |

### src/views/panel-callbacks.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 113 | `markDirty` 後の 100ms 遅延 `renderPipeline?.forceRender()` | ✗ | ✗ | FIRE-AND-FORGET (benign) — optional chaining guard | 放置可 |

### src/views/panel-sections-layout.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 230 | `debounceTimer` 宣言 (ontology rules save debounce, closure-scope) | — | — | NON-CALL | — |
| 235 | 次 save で 事前 clear | ✓ (closure) | ✓ (再入時のみ) | **LEAK CANDIDATE** — panel 再構築時に stale pending timer 残留 | `_scheduleTimer 移行` |
| 236 | `debounceTimer = setTimeout(..., 2000)` → `cb.invalidateDataKeepPanel()` | 同上 | 同上 | 同上 | 同上 |
| 384 | sample preset import 後の zoom 復元 (500ms) | ✗ | ✗ | FIRE-AND-FORGET (benign) — `cb.setZoom?.` で guard | 放置可 |
| 784 | `spacingDebounce` 宣言 (closure-scope) | — | — | NON-CALL | — |
| 786 | spacing change ごとの事前 clear | ✓ (closure) | ✓ (再入時のみ) | **LEAK CANDIDATE** — panel 再構築時 stale | `_scheduleTimer 移行` |
| 787 | `spacingDebounce = setTimeout(..., 100)` | 同上 | 同上 | 同上 | 同上 |
| 921 | `forceDebounce` 宣言 (closure-scope) | — | — | NON-CALL | — |
| 923 | force slider change 事前 clear | ✓ (closure) | ✓ (再入時のみ) | **LEAK CANDIDATE** — panel 再構築時 stale | `_scheduleTimer 移行` |
| 924 | `forceDebounce = setTimeout(..., 150)` | 同上 | 同上 | 同上 | 同上 |

### src/views/snapshot/GraphSnapshot.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 135 / 137 / 138 | `TimerHooks` 型定義 | — | — | NON-CALL | — |
| 162 | auto snapshot debounce の事前 clear | ✓ (closure `timer`) | ✓ | PROPERLY MANAGED (モジュール内) | — (呼び出し側 GraphViewContainer.ts:1445 で `cancel()` 未呼び出し — 上記参照) |
| 163 | `timer = timers.setTimeout(..., debounceMs)` | ✓ | ✓ | PROPERLY MANAGED (モジュール内) | — |
| 174 | `cancel()` 内の clearTimeout | ✓ | ✓ | PROPERLY MANAGED (モジュール内) | — |

### src/views/panel-widgets.ts

| 行 | 用途 | 保存 | clear | 判定 | 推奨 |
|---|---|---|---|---|---|
| 209 | autocomplete popup の blur 時 150ms 非表示 | ✗ | ✗ | FIRE-AND-FORGET (benign) — style 代入のみ | 放置可 |
| 862 | query hint の blur 時 150ms dismiss (ただし `input === document.activeElement` guard) | ✗ | ✗ | FIRE-AND-FORGET (benign) | 放置可 |
| 1069 | select dropdown の blur 時 150ms dismiss | ✗ | ✗ | FIRE-AND-FORGET (benign) | 放置可 |
| 1226 | input event 後 50ms で `ctx.rebuild` (attachQueryHint 処理の後走) | ✗ | ✗ | FIRE-AND-FORGET (benign) — 短命 | 放置可 |
| 1260 | blur 後 200ms で `ctx.dismiss` | ✗ | ✗ | FIRE-AND-FORGET (benign) | 放置可 |

### src/constants.ts

| 行 | 用途 | 判定 |
|---|---|---|
| 323 / 334 | コメント内の "setTimeout" | NON-CALL |

## サマリー

**総呼び出し数 (非 NON-CALL)**: 39 箇所
  - PROPERLY MANAGED: 19
  - FIRE-AND-FORGET (benign): 13
  - **LEAK CANDIDATE: 7**

### 優先度付き修正対象 (後続タスクで着手すべき)

| 優先度 | ファイル:行 | 内容 | 推奨アクション |
|---|---|---|---|
| **HIGH** | src/views/GraphViewContainer.ts:1445 | autoSnap.cancel() 未呼び出し | `onClose()` で `autoSnap.cancel()` を呼ぶ。`autoSnap` を instance field 化 or `this.register(() => autoSnap.cancel())` |
| **HIGH** | src/views/RenderPipeline.ts:1675 | `enrichLabelsDeferred` 起動 2.5s タイマーが detach で解除されない | id を field に保存し `detach()` で clearTimeout |
| **HIGH** | src/views/RenderPipeline.ts:1689 (enrichment chain) | `_enrichmentCancelId` が detach() で clear されない | `detach()` 内で `clearTimeout(_enrichmentCancelId)` 追加 |
| **MED** | src/views/PanelBuilder.ts:810 | searchDebounce が panel 再構築で残留 | panel destroy / rebuild フックで clear or GVC._scheduleTimer 経由 |
| **MED** | src/views/panel-sections-layout.ts:236/787/924 | 3つの debounce timer がいずれも panel 再構築で残留 | 同上 |
| **LOW** | src/views/RenderPipeline.ts:1422 | `onAllPixiNodesCreated` 0ms deferral unsaved | 保存+clear (現状 optional chaining で保護) |
| **LOW** | src/views/GraphViewContainer.ts:7324-7381 | sim-end PHASE B/C/D/E の 0ms chain unsaved | `_scheduleTimer` 経由に統一 |
| **LOW** | src/views/coord-panel.ts:444 | auto-optimize ボタンの数秒後 disable 解除 | `_scheduleTimer` 経由 (非必須) |

## 中央管理パターンの再利用可能性

`GraphViewContainer._pendingTimers` + `_scheduleTimer()` (src/views/GraphViewContainer.ts:615-625) は既に存在し、`onClose()` で一括 clear される理想形。上記 MED/LOW のうち **GraphViewContainer 内部の sim-end chunks** (行 7324-7381) は最小差分で `this._scheduleTimer(..., 0)` に置換可能。

Panel 系 (PanelBuilder.ts, panel-sections-layout.ts) は GVC インスタンスに直接アクセスできないが、`PanelCallbacks` 経由で `cb.scheduleTimer(cb, ms)` を公開するのが素直 (panel 再構築サイクルと view unmount の両方で clear 可能)。

RenderPipeline.ts は `host` 経由で同等の helper を呼ぶか、RenderPipeline 自身に `_pendingTimers` Set を持たせて `detach()` で clear する。

## 後続タスクへの引き継ぎ

- **Task A (HIGH)**: `autoSnap.cancel()` 配線修正 — 最小限の差分で真のリークを除去
- **Task B (HIGH)**: RenderPipeline enrichment/label タイマーの detach 連動
- **Task C (MED)**: Panel 系 3 ファイルの closure debounce を central-manage パターンに変換
- **Task D (LOW)**: GraphViewContainer sim-end chain の `_scheduleTimer` 化 (stylistic)

本監査はコード変更を含まない。修正は上記 Task A-D として separate に進める。
