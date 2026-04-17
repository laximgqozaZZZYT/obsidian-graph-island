---
priority: high
reported: 2026-04-17
status: decomposed
source: decomposed
parent: 473-469-graphviewcontainer-wheel-pointer-handler
depends: subtask-2
summary: pointerup handler で applyPanInertia rAF ループを起動
---

## Description (subtask of 473-469-graphviewcontainer-wheel-pointer-handler)

src/views/GraphViewContainer.ts の pointerup ハンドラで、subtask-2 の velocity が PAN_INERTIA_MIN_VELOCITY を超える場合に requestAnimationFrame ループを起動し、各フレームで applyPanInertia を呼んで pan 位置を更新、scheduleRender("pan-inertia") を発行する。
  - applyPanInertia が返す settled===true でループ停止 (cancelAnimationFrame)
  - 次の pointerdown で現行ループをキャンセル (重複起動防止)
  - rAF ID 保持用フィールド (_panInertiaRafId) のみ追加許容
  - 新規メソッド禁止 — ハンドラ内インライン実装

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
