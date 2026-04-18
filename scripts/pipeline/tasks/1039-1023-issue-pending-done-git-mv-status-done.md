---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1023-1015-pending-done-git-mv-frontmatter-status
depends: subtask-1
summary: 対象issueを pending → done へ git mv し status を done に更新して単一コミット
---

## Description (subtask of 1023-1015-pending-done-git-mv-frontmatter-status)

subtask-1 で特定した対象ファイルに対して以下を原子的に実施:
  1. `git mv .claude/issues/pending/<target>.md .claude/issues/done/<target>.md`
  2. 移動後ファイルの frontmatter `status:` 行のみを `status: done` に書き換え（Edit で1行のみ変更）
  3. `git add .claude/issues/done/<target>.md .claude/issues/pending/<target>.md`
  4. コミット: `chore: mark <target> as done`
  制約:
  - `src/` には触れない
  - lint/test/build 実行不要
  - frontmatter の他フィールドは触らない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
