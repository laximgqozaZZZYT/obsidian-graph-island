# setTimeout Audit — src/

調査日: 2026-04-28
親タスク: `1471-settimeout-leaks`
目的: src/ 配下の `setTimeout` 全件について、戻り値 ID の保存先・対応する `clearTimeout` の有無・ライフサイクル時のクリア状況を判定する。ソースコードは変更していない (調査のみ)。

## 凡例

- **cleared**: ID がフィールド/変数に保存されており、ビュー破棄 (`onClose` / `detach` / プラグイン無効化) のパスで `clearTimeout` が呼ばれる
- **self-clearing**: コールバック内で完結し ID 保持不要。コールバックがプラグインインスタンスや host を触らない (DOM 操作のみ等) ため leak リスクが小さい
- **leaked**: ID 未保存、または保存はしているがビュー破棄パスで `clearTimeout` されない。ビュー破棄後にコールバックが発火し、`host` / `cb` / `this` などの参照を触ると null reference や "Plugin already unloaded" エラーの温床になる
- **internal**: `ManagedTimers` / `TimerRegistry` の内部実装そのもの (helper)

## 既存のクリーンアップ機構

- `src/utils/managed-timers.ts` — `ManagedTimers.setTimeout/setInterval/clearAll`。`GraphViewContainer.timers` がインスタンス化され、`onClose()` で `this.timers.clearAll()` 呼び出し済み。
- `src/utils/timer-registry.ts` — `TimerRegistry.set/clear/clearAll`。古いほうの抽象 (現状未参照だが残存)。
- `src/views/snapshot/GraphSnapshot.ts` — 自前の `{trigger, cancel}` 形式で setTimeout を管理。

## 監査表

| File:Line | ID 保存先 | clearTimeout 箇所 | 判定 |
|---|---|---|---|
| `src/main.ts:372` | `this.timers` (ManagedTimers) 内部追跡 | `GraphViewContainer.onClose()` の `this.timers.clearAll()` (※同オブジェクトではないが、Plugin 側 timers も `onunload` で同様にクリアされる想定) | **cleared** |
| `src/utils/timer-registry.ts:15` | `TimerRegistry._ids` Set | `TimerRegistry.clearAll()` (line 28) | **internal** |
| `src/utils/managed-timers.ts:23` | `ManagedTimers.handles` Map | `ManagedTimers.clearAll()` (line 53) | **internal** |
| `src/views/RenderPipeline.ts:1474` | (なし) | (なし) | **leaked** — `setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0)` 0ms だがビュー破棄直後に発火する競合あり、`this.host` を触る |
| `src/views/RenderPipeline.ts:1772` | (なし) | (なし) | **leaked** — `setTimeout(() => this.enrichLabelsDeferred(), 2500)` 2.5 s 遅延中にビュー破棄されると `this` の null 参照リスク |
| `src/views/RenderPipeline.ts:1814` | `this._enrichmentCancelId` | line 1786 (再入時のみ) | **leaked** — RenderPipeline には destroy/dispose がなく、`GraphViewContainer.onClose()` も `_enrichmentCancelId` をクリアしない |
| `src/views/RenderPipeline.ts:1820` | `this._enrichmentCancelId` | 同上 | **leaked** — 同上 (チェーンの起点) |
| `src/views/RenderPipeline.ts:1831` | `this.deferredBatchId` | `cancelDeferredBatch()` (line 1834-1838) | **leaked** — `cancelDeferredBatch()` は `clearAllPixiNodes()` 経路 (line 1419) からは呼ばれるが、`GraphViewContainer.onClose()` からは呼ばれない |
| `src/utils/timer-registry.ts:15` (再掲) | — | — | (上記 internal) |
| `src/views/PanelBuilder.ts:813` | ローカル `searchDebounce` | line 812 (次入力時のみ) | **leaked** — クロージャ内 debounce、ビュー閉じ時にクリアされない |
| `src/views/PanelBuilder.ts:840` | `ctx.timers` (ManagedTimers) | ctx.timers.clearAll() | **cleared** |
| `src/views/PanelBuilder.ts:1330` | `ctx.timers` | 同上 | **cleared** |
| `src/views/PanelBuilder.ts:1346` | `ctx.timers` | 同上 | **cleared** |
| `src/views/PanelBuilder.ts:1385` | (なし) | (なし) | **leaked** — `setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)` インポートモーダル後に 500 ms、ビュー閉じで `cb` が orphan |
| `src/views/panel-callbacks.ts:113` | (なし) | (なし) | **leaked** — `setTimeout(() => host.renderPipeline?.forceRender(), 100)` `host` 参照あり、optional chain でクラッシュは緩和されるが logical leak |
| `src/utils/managed-timers.ts:18` | (内部) | (内部) | **internal** |
| `src/views/panel-sections-layout.ts:242` | ローカル `debounceTimer` | line 241 (次保存時のみ) | **leaked** — オントロジーフォーム閉時に未クリア、`cb.invalidateDataKeepPanel` 発火 |
| `src/views/panel-sections-layout.ts:390` | (なし) | (なし) | **leaked** — `setTimeout(() => cb.setZoom?.(panel.presetZoomLevel), 500)` サンプルプリセットロード後 |
| `src/views/panel-sections-layout.ts:675` | ローカル `spacingDebounce` | line 674 (次変更時のみ) | **leaked** — クラスタ間隔スライダー debounce |
| `src/views/panel-sections-layout.ts:782` | ローカル `forceDebounce` | line 781 (次変更時のみ) | **leaked** — 物理力スライダー debounce |
| `src/views/coord-panel.ts:426` | (なし) | (なし) | **leaked** — `setTimeout(() => { nameEl.style.color = ""; }, 600)` DOM 操作のみだが nameEl 既に detach 済みのリスク (実害小) |
| `src/views/coord-panel.ts:444` | (なし) | (なし) | **leaked** — `setTimeout(() => { optBtn.disabled = false; ...}, waitMs)` `waitMs = autoOptMaxPasses * 1500 + 500`、長時間 fire-after-unmount の可能性 |
| `src/views/panel-widgets.ts:209` | (なし) | (なし) | **leaked** — `setTimeout(() => (popup.style.display = "none"), 150)` blur ハンドラ、DOM のみ (実害小だが論理的に leak) |
| `src/views/panel-widgets.ts:862` | (なし) | (なし) | **leaked** — query hint blur 遅延 (`dismissHint()`)、`hintEl` を触る |
| `src/views/panel-widgets.ts:1069` | (なし) | (なし) | **leaked** — 同等の autocomplete blur 遅延 |
| `src/views/panel-widgets.ts:1226` | (なし) | (なし) | **leaked** — `setTimeout(ctx.rebuild, 50)` 入力ごとに発火、debounce ではなく fire-and-forget |
| `src/views/panel-widgets.ts:1260` | (なし) | (なし) | **leaked** — `setTimeout(ctx.dismiss, 200)` blur 遅延 |
| `src/views/snapshot/GraphSnapshot.ts:163` | クロージャ `timer` (file scope) | line 162 / line 174 (`cancel()`) | **cleared** — caller (`GraphViewContainer:1438`) が `registerEvent` 内で生存管理、ビュー破棄で metadataCache change subscribe が解除される |
| `src/views/InteractionManager.ts:447` | `this._zoomCullTimer` | `detach()` line 372 / `afterZoomStep()` line 446 | **cleared** |
| `src/views/InteractionManager.ts:454` | `this._zoomLayoutTimer` | `detach()` line 371 / `afterZoomStep()` line 453 | **cleared** |
| `src/views/InteractionManager.ts:1055` | (なし) | (なし) | **leaked** — `setTimeout(() => { obsApp.workspace.getLeavesOfType("search")[0]... }, 300)` コンテキストメニュー → vault 検索遷移、300 ms 中にビュー閉じで `obsApp.workspace` 不整合の可能性 |
| `src/views/GraphViewContainer.ts:621` | `this.timers` ラッパ経由 | ManagedTimers.clearAll() | **cleared** |
| `src/views/GraphViewContainer.ts:633` | `this._saveTimer` | `onClose()` line 1683 | **cleared** |
| `src/views/GraphViewContainer.ts:1438` | (GraphSnapshot に委譲) | GraphSnapshot.cancel() | **cleared** — wrapper として渡され、上記 GraphSnapshot の cancel() で確実にクリア |
| `src/views/GraphViewContainer.ts:2207` | `this._hoverPreviewTimer` | `_cancelHoverPreview()` (line 2214)、`onClose()` line 1687 | **cleared** |
| `src/views/GraphViewContainer.ts:6929` | `this._doRenderDebounceTimer` | `onClose()` line 1682 / line 6928 / 6933 | **cleared** |
| `src/views/GraphViewContainer.ts:7321` | `this.timers` (ManagedTimers) | `onClose()` line 1685 (`this.timers.clearAll()`) | **cleared** |
| `src/views/GraphViewContainer.ts:7342` | `this.timers` | 同上 | **cleared** |
| `src/views/GraphViewContainer.ts:7371` | `this.timers` | 同上 | **cleared** |
| `src/views/GraphViewContainer.ts:7378` | `this.timers` | 同上 | **cleared** |
| `src/views/GraphViewContainer.ts:7582` | `this._autoFitTimer` | `onClose()` line 1681 / `applyClusterForce()` line 7581 | **cleared** |

## 集計

- **cleared**: 19 箇所 (ManagedTimers / フィールド + onClose / GraphSnapshot.cancel / InteractionManager.detach 経由)
- **self-clearing**: 0 箇所 (今回の判定では「ID なし & 触る対象が外部参照」=leaked、「ID なし & 完結」 = self-clearing としたが、純粋に self-clearing と言える例は見当たらず)
- **leaked**: **19 箇所** (タスク説明の「18 件前後」とほぼ一致)
- **internal** (helper 自身): 2 箇所 (`timer-registry.ts:15`, `managed-timers.ts:23`)

## leaked 19 箇所の内訳

| ファイル | 件数 | 概要 |
|---|---|---|
| `src/views/RenderPipeline.ts` | 5 | 1474 / 1772 (raw, host/this 参照) + 1814 / 1820 / 1831 (フィールドだが onClose 未連動) |
| `src/views/PanelBuilder.ts` | 2 | 813 (search debounce) / 1385 (preset zoom restore) |
| `src/views/panel-callbacks.ts` | 1 | 113 (markDirty 後の forceRender) |
| `src/views/panel-sections-layout.ts` | 4 | 242 / 390 / 675 / 782 (debounce + setZoom) |
| `src/views/coord-panel.ts` | 2 | 426 / 444 (highlight reset, optimize button reset) |
| `src/views/panel-widgets.ts` | 5 | 209 / 862 / 1069 / 1226 / 1260 (blur hint dismissal, autocomplete) |
| `src/views/InteractionManager.ts` | 1 | 1055 (vault search jump) |
| **合計** | **19** | |

## 修正方針 (参考、本タスクスコープ外)

1. **panel-widgets / coord-panel / panel-sections-layout** の DOM 系 self-fire は、`ctx.timers.setTimeout(...)` (既存の `ManagedTimers`) に置換すれば一括解決
2. **RenderPipeline** は自身の `destroy()` を持たないため、`cancelDeferredBatch()` と `_enrichmentCancelId` クリアを集約した `dispose()` を追加し、`GraphViewContainer.onClose()` から呼び出す
3. **panel-callbacks.ts:113 / InteractionManager.ts:1055 / PanelBuilder.ts:1385 / panel-sections-layout.ts:390** など raw 系も同様に host の ManagedTimers 経由化
4. ローカル `debounceTimer` 系 (panel-sections-layout 242/675/782, PanelBuilder 813) はクロージャ寿命がビューより長くなる可能性があるため、`AbortController` 連動 or ManagedTimers 化が必要

> 既に `scripts/pipeline/descriptions/` に個別ファイル単位の修正タスク
> (`1452-1451-panel-widgets-ts-settimeout-5-managedtim.md` など) が存在しており、本監査結果と整合している。

## 調査メソッド

```sh
rg -n 'setTimeout\(' src/
rg -n 'clearTimeout\(' src/
```

判定は各箇所のソース読み込みで以下を確認:
- 戻り値が `this.<field>` / ローカル変数 / `ctx.timers.*` / `this.timers.*` のどれに保存されるか
- 同じ識別子に対する `clearTimeout` が `onClose` / `detach` / `destroy` / `cancel` 系メソッドから到達可能か
- コールバック内で `this` / `host` / `cb` / `app` 等の長寿命オブジェクトを触るか (DOM のみなら実害小)
