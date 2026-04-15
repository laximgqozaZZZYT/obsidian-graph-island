---
priority: high
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 267-248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: none
summary: 空の .autonomous-worktrees/ ディレクトリを削除し、issueチェーンを完了マークする
---

## Description (subtask of 267-248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

1. 空の `.autonomous-worktrees/` ディレクトリを `rmdir` で削除
  2. `.gitignore` に `.autonomous-worktrees/` エントリがあれば削除
  3. 親issueチェーン (248-225-...) の status を `done` に更新
  4. このissue自身の status を `done` に更新
  5. コミット: "chore: remove empty .autonomous-worktrees/ dir, close stale-worktrees issue chain"

---

タスクは1つだけです。元issue自体が「既に解決済み」と明記しており、残りは空ディレクトリの削除とissueクローズのみで、1セッションで十分完了できます。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
