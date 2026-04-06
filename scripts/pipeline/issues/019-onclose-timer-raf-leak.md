---
priority: high
reported: 2026-04-06
status: pending
source: kaizen
summary: onClose()で_saveTimer/_zoomAnimId/autoSnapTimerが未クリア — 破棄後にコールバック発火
---

## Description

`src/views/GraphViewContainer.ts` の `onClose()` (line 1977) は `_autoFitTimer`、`_doRenderDebounceTimer`、`_pendingTimers` を正しくクリアしているが、以下の3つのタイマー/rAFが漏れている:

### 1. `_saveTimer` (line 883, set at line 915)
`requestSave()` で設定されるデバウンスタイマー。`onClose()` にクリア処理がない。
ビューを閉じた直後に `this.app.workspace.requestSaveLayout()` が破棄済みコンテキストで呼ばれる。

### 2. `_zoomAnimId` (line 890, set at lines 6155/8276)
`zoomBy()` / `focusZoomToNode()` のアニメーションRAF。`onClose()` に `cancelAnimationFrame` がない。
アニメーション中にビューを閉じると、RAF コールバックが `this.pixiApp!.stage` (line 6147) にアクセスし、
`this.pixiApp` は `destroyPixi()` で null に設定済みのため **TypeError** が発生する。

### 3. `autoSnapTimer` (line 1701付近、`_registerWorkspaceEvents` 内のローカル変数)
ワークスペースイベントのデバウンスタイマー。ブロックスコープ変数のため `onClose()` からアクセスできない構造になっている。
発火時に `this.pixiNodes`、`this.plugin.settings` にアクセスする。

**再現手順**: ズームアニメーション中 or パネル変更直後にタブを閉じる。

## Acceptance criteria

- [ ] `onClose()` で `clearTimeout(this._saveTimer)` を追加
- [ ] `onClose()` で `cancelAnimationFrame(this._zoomAnimId)` を追加
- [ ] `autoSnapTimer` を `_pendingTimers` で管理するか、インスタンスフィールドに昇格して `onClose()` でクリア
- [ ] `zoomBy` の RAF コールバック冒頭に `if (!this.pixiApp) return` ガードを追加
