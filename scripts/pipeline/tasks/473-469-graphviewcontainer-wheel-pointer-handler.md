---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 469-138-
depends: subtask-2
summary: GraphViewContainerのwheel/pointer handlerを新関数呼び出しに置換
---

## Description (subtask of 469-138-)

src/views/GraphViewContainer.ts の wheel / pointermove / pointerup ハンドラ内で、既存のズーム直接代入とパン停止処理を subtask-2 の computeZoomStep / applyPanInertia 呼び出しに置換。
  - wheel handler: 生のdeltaYで scale を直接書き換えている箇所を computeZoomStep の戻り値適用に差替
  - pointermove: 直近2サンプルから velocity (px/ms) を算出して保持 (this内の既存フィールド or 最小追加)
  - pointerup: velocity が PAN_INERTIA_MIN_VELOCITY 超なら requestAnimationFrame ループで applyPanInertia を回し、frame毎に scheduleRender("pan-inertia") (subtask-2 の scheduler) を発行。settled=trueで停止。
  **新規メソッド追加は避け、既存ハンドラ内で置換のみ**(GOD OBJECT Policy: GraphViewContainer.ts 8612行を肥大化させない)。
  scheduleRenderのソースキー"pan-inertia"は既存スケジューラに対応済前提 (親issueのsubtask-2完了後)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
