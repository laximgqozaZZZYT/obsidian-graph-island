---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 1023-1015-pending-done-git-mv-frontmatter-status
depends: subtask-2
summary: この subtask 自身 (1022-1009-issue-...) を done へ移動して status 更新しコミット
---

## Description (subtask of 1023-1015-pending-done-git-mv-frontmatter-status)

この subtask ファイル自身を以下の通り移動:
  1. `git mv .claude/issues/pending/1022-1009-issue-status-done-pending-done-git-mv.md .claude/issues/done/1022-1009-issue-status-done-pending-done-git-mv.md`
  2. frontmatter `status:` を `status: done` に更新（1行のみ Edit）
  3. `git add` + コミット: `chore: mark 1022-1009-issue-status-done-pending-done-git-mv as done`
  制約:
  - `src/` 不変更、lint/test/build 不要
  - CLAUDE.md Forbidden Patterns に該当する変更なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
