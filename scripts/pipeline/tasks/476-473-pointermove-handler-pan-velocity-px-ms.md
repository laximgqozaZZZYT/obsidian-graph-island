---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 473-469-graphviewcontainer-wheel-pointer-handler
depends: none
summary: pointermove handler で pan velocity (px/ms) を算出・保持
---

## Description (subtask of 473-469-graphviewcontainer-wheel-pointer-handler)

src/views/GraphViewContainer.ts の pointermove ハンドラ内で、直近2サンプル (timestamp, x, y) から velocity (px/ms) を算出して保持する処理を追加する。
  - 既存フィールドに velocity 保持に使えるものがあればそれを再利用
  - 無ければ最小限のフィールド (_lastPanSample: {t, x, y} と _panVelocity: {vx, vy}) のみ追加
  - 新規メソッド禁止 — ハンドラ内インライン実装
  - pointerdown 時にフィールドをリセットする1-2行を追加
  - 行数増加は最小限 (目安 +10行以内)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
