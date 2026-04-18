---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 865-744-git-mv-pending-done
depends: none
summary: subtask
---

## Description (subtask of 865-744-git-mv-pending-done)

`★ Insight ─────────────────────────────────────`
- この issue は既に subtask-2 (744-690 の子) で、操作が「git mv → verify → commit → verify」と直線的。さらに細分化すると checkpoint のオーバーヘッドが処理本体を超えるため、1-2 タスクに留めるのが適切。
- git mv + verify を 1 タスクに統合する理由: 失敗時のロールバック境界を明確にするため、コミット前に必ず staging を検証する安全チェックポイントを 1 セッション内に閉じ込める。
- commit を独立タスクにする理由: heredoc でなく 1 行メッセージ、`--no-verify` 禁止、`git reset HEAD~1` 禁止という制約が明示されており、万一失敗した場合に subtask-1/2 の成果を破壊せず停止させる必要があるため。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
