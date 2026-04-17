---
priority: medium
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 475-473-wheel-handler-scale-computezoomstep
depends: none
summary: subtask
---

## Description (subtask of 475-473-wheel-handler-scale-computezoomstep)

で特定した wheel ハンドラ内の scale 直接代入を computeZoomStep の戻り値代入に置換する。
  - import 文を 1 行追加: `import { computeZoomStep } from '...'` (parent issue 473 の subtask-2 で export された場所から)
  - 置換例: `this.scale *= factor; this.scale = Math.max(MIN, Math.min(MAX, this.scale));` → `this.scale = computeZoomStep(this.scale, e.deltaY, ...);`
  - computeZoomStep 内にクランプが含まれる場合、ハンドラ側の Math.max/Math.min クランプ行を削除
  - 新規メソッド追加禁止、既存行の置換のみ (import 1 行追加は許容)
  - scheduleRender の呼び出しソースキーは既存のまま維持
  - GraphViewContainer.ts 行数が 8612 を超えないこと (超える場合はクランプ削除で相殺)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
