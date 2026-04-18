---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 595-582-subtask
depends: none
summary: GraphViewContainer.ts の行数が 8597 以下か確認
---

## Description (subtask of 595-582-subtask)

`wc -l src/views/GraphViewContainer.ts` を実行し、行数が CLAUDE.md の God Object Policy の上限 8597 行以下であることを確認する。
  - 8597 を超える場合: 違反として報告し、該当箇所の特定まで行う (修正は別タスク)
  - 8597 以下の場合: 現在の行数を記録
  他の God Object (PanelBuilder.ts 2216, EdgeRenderer.ts 2702, RenderPipeline.ts 2321) も同時にチェックし、全ファイルの現状行数を報告する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
