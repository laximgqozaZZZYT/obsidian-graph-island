---
priority: high
reported: 2026-04-18
status: done
source: decomposed
parent: 758-730-status-done-edit
depends: none
summary: subtask-1 の対象ファイルリストと現在の status 値を読み取る
---

## Description (subtask of 758-730-status-done-edit)

parent タスク 730-717-status-done-edit の subtask-1 成果物
  (対象ファイルパス + 現在の frontmatter status 値のリスト) を読み取る。
  以下を確認:
  - 各ファイルの絶対パス
  - 現在の status 値 (decomposed / in-progress のいずれか)
  - status 行周辺の frontmatter 2-3 行 (priority, reported, source)
  出力は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
