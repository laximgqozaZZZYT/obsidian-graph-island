---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 928-911-639-626-subtask-issue-pending-done-git-m
depends: none
summary: subtask
---

## Description (subtask of 928-911-639-626-subtask-issue-pending-done-git-m)

★ Insight ─────────────────────────────────────
元 issue は既に「1 セッション完結の原子的 operation」として記述されており、手順 1–6 が線形依存。これ以上分解すると git mv とコミットが別セッションになり、中間状態（pending 削除済みだが done 未コミット）でパイプラインが停止するリスクがある。
したがって追加分解は行わず、元 issue をそのまま単一 SUBTASK として出力するのが正解。
─────────────────────────────────────────────────

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
