---
priority: high
reported: 2026-04-16
status: pending
source: kaizen
summary: onClose()で_saveTimerと_zoomAnimIdが未クリア — view破棄後にコールバック実行
---
## Description

`GraphViewContainer.onClose()` (src/views/GraphViewContainer.ts:1853-1891) は
`_autoFitTimer` と `_doRenderDebounceTimer` を clearTimeout するが、以下の2つが漏れている:

### 1. `_saveTimer` (line 760)
- `requestSave()` (line 792) で設定される debounce タイマー
- onClose() に `clearTimeout(this._saveTimer)` がない
- view 閉鎖直前に設定変更すると、タイマーが破棄後の view 上で
  `this.app.workspace.requestSaveLayout()` を呼ぶ

### 2. `_zoomAnimId` (line 768)
- `focusZoomToNode()` (line 7783) と `setZoom()` で設定される rAF ID
- onClose() に `cancelAnimationFrame(this._zoomAnimId)` がない
- ズームアニメーション中に view を閉じると、rAF コールバックが
  破棄済みの `world` コンテナに `world.x`, `world.scale.set()` を書き込む
- `destroyPixi()` 後の world アクセスで例外の可能性

## Acceptance criteria
- [ ] `onClose()` に `clearTimeout(this._saveTimer)` を追加
- [ ] `onClose()` に `cancelAnimationFrame(this._zoomAnimId)` を追加
- [ ] 既存テストが全パス
