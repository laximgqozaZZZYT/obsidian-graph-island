---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 868-743-639-626-subtask-issue-status-done
depends: none
summary: subtask
---

## Description (subtask of 868-743-639-626-subtask-issue-status-done)

`★ Insight ─────────────────────────────────────`
- このissueは既に1アトミック単位（ファイル特定→frontmatter編集→コミット）で、過分解は不要
- `issues/pending/` と `issues/done/` の両方をチェックする冪等設計がポイント（再実行安全）
- `lint/test/build` を明示的にスキップしているのは、frontmatter更新のみの軽微変更だから
`─────────────────────────────────────────────────`

元issueはすでに単一 claude -p セッションで完結するサイズなので、1タスクに集約します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
