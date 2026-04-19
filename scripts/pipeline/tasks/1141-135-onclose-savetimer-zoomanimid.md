---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 135-onclose-timer-leak
depends: none
summary: onClose() に _saveTimer と _zoomAnimId のクリーンアップを追加
---

## Description (subtask of 135-onclose-timer-leak)

`src/views/GraphViewContainer.ts` の `onClose()` メソッド (line 1853-1891) に以下2行を追加:

  1. `clearTimeout(this._saveTimer)` — requestSave() のdebounceタイマー解放
  2. `cancelAnimationFrame(this._zoomAnimId)` — focusZoomToNode/setZoom の rAF 解放

  既存の `clearTimeout(this._autoFitTimer)` と `clearTimeout(this._doRenderDebounceTimer)` と
  同じパターンで追加する。null/undefined チェック不要（clearTimeout/cancelAnimationFrame は
  無効な引数を無視する）。

  追加後の `_saveTimer` と `_zoomAnimId` は念のため `undefined` 代入してもよい
  (既存パターンに合わせる)。

  GOD OBJECT ポリシー遵守: GraphViewContainer.ts の行数増加を最小限 (+2〜+4行) に抑える。
  新規メソッド抽出は不要。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
