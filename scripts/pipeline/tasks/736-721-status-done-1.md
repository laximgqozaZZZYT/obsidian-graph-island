---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 721-702-subtask
depends: subtask-1
summary: status フィールドが done に1箇所のみ存在することを検証
---

## Description (subtask of 721-702-subtask)

subtask-1 で取得した frontmatter に対して以下を検証:
  1. `status: done` が frontmatter 内にちょうど1回出現
  2. `status: in-progress` が frontmatter 内に残存しない
  3. `status: in-progress` が frontmatter 内に残存しない
  Grep ツールで `^status:` を対象ファイルに対して実行し、件数と値を確認。
  失敗時は実際の行内容と期待値を diff 形式で報告する。
  Acceptance:
  - 3条件すべて満たせば PASS
  - 1つでも不成立なら具体的な差分を出力

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
