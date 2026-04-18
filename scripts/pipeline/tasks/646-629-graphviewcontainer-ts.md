---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 629-617-594-done-graphviewcontainer-ts
depends: subtask-1
summary: GraphViewContainer.ts の現在行数を取得
---

## Description (subtask of 629-617-594-done-graphviewcontainer-ts)

Bash で `wc -l src/views/GraphViewContainer.ts` を実行し、現在の行数を取得する。
  結果を標準出力に `CURRENT_LOC=<n>` の形式で記録。
  GraphViewContainer.ts 本体の編集・ロジック変更は禁止。Read/Bash (wc) のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
