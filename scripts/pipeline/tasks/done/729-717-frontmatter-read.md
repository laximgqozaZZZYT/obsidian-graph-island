---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 717-691-status-done-edit
depends: none
summary: 対象ファイルの frontmatter 現状を Read で確認
---

## Description (subtask of 717-691-status-done-edit)

subtask-1 の出力ログから対象ファイルパスを取得し、
  Read ツールで frontmatter 全体を読み取る。
  以下を確認してログに記録する:
  - 現在の `status:` 行の値 (pending または in-progress)
  - priority / reported / parent / depends / summary / source 各フィールドの現在値 (後続の差分比較用)
  - 本文セクションの冒頭行 (## Description, ## Acceptance criteria)
  この段階では編集は行わない。確認のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
