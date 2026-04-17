---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 473-469-graphviewcontainer-wheel-pointer-handler
depends: none
summary: wheel handler の scale 直接代入を computeZoomStep 呼び出しに置換
---

## Description (subtask of 473-469-graphviewcontainer-wheel-pointer-handler)

src/views/GraphViewContainer.ts の wheel イベントハンドラ内で、event.deltaY から直接 this.scale (またはズーム相当フィールド) を書き換えている箇所を特定し、subtask-2 で export された computeZoomStep(currentScale, deltaY, ...) の戻り値を代入する形に置換する。
  - 新規メソッドは追加しない (GOD OBJECT Policy: GraphViewContainer.ts 8612行上限)
  - 既存の置換のみで行数を増やさないこと (import 1行追加は許容)
  - 既存のズームクランプ処理が computeZoomStep 内に含まれる場合はハンドラ側から削除
  - scheduleRender の呼び出しソースキーは既存のままでよい

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
