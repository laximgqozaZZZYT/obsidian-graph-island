---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 483-475-god-object
depends: subtask-2
summary: GOD OBJECT 行数上限確認 (GraphViewContainer.ts ≤ 8612)
---

## Description (subtask of 483-475-god-object)

`wc -l src/views/GraphViewContainer.ts` を実行し、行数が 8612 以下で
  あることを確認。8612 を超えた場合は CLAUDE.md の GOD OBJECT Policy
  違反のため、subtask-2 の wheel handler 修正で追加された行を別ファイル
  (例: src/views/wheel-handler.ts) に抽出してリファクタする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
