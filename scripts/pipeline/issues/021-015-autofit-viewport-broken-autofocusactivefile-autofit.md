---
priority: high
reported: 2026-04-06
status: pending
source: decomposed
parent: 015-autofit-viewport-broken
depends: subtask-1
summary: _autoFocusActiveFileの初回autoFit上書き問題を修正
---

## Description (subtask of 015-autofit-viewport-broken)

simulation end ハンドラ内で `_autoFocusActiveFile()` が `autoFitView` の直後に
  呼ばれ、大グラフでは `doRender()` を再起動してフィット結果を即座に上書きする問題を修正。
  
  修正方針:
  - `_autoFocusActiveFile()` 内の localGraphCenter 自動設定ロジック (L8130-8137) を
    simulation end ではなく、初回 autoFitView 完了後に遅延実行するように変更
  - または、localGraphCenter 自動設定時にも autoFitView を確実に実行するガード追加
  - `_suppressAutoFit = false` の解除を `requestAnimationFrame` コールバック内の
    autoFitView より前に移動 (L7602 → L7585 付近)
  
  注意: GraphViewContainer.ts は God Object (9947行上限)。行数を増やさないこと。
  新ロジック追加分は既存コードのリファクタ(冗長なautoFitView呼び出しの統合)で相殺する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
