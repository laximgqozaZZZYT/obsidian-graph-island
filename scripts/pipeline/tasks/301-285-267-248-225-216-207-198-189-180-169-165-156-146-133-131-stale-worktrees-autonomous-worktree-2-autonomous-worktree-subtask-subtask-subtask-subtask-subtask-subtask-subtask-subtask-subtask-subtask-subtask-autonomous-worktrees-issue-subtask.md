---
priority: medium
reported: 2026-04-16
status: pending
source: decomposed
parent: 285-267-248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-autonomous-worktrees-issue
depends: none
summary: subtask
---

## Description (subtask of 285-267-248-225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-autonomous-worktrees-issue)

重要な発見: `.autonomous-worktrees/` は**空ではなく**、2つのアクティブな git worktree が存在します。`rmdir` では削除できません。`git worktree remove` で適切に削除する必要があります。

issueの前提（空ディレクトリ）と実態が異なるため、タスクを修正して分解します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
