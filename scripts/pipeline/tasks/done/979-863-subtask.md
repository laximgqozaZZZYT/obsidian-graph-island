---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 863-740-issue-status-done
depends: none
summary: subtask
---

## Description (subtask of 863-740-issue-status-done)

`★ Insight ─────────────────────────────────────`
- このissueは「コード変更なしのメタ操作」で、git rename類似度を保つため **frontmatter編集と mv を必ず同一コミット** にする必要がある
- `.claude/issues/` の pending/done/in-progress などのサブディレクトリ構成は実行時点で確認が必要（慣習に依存）
- 単一アトミック操作のため分解粒度は小さめで十分。調査→実行の2ステップが最小構成
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
