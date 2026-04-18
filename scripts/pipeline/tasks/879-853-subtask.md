---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 853-845-subtask
depends: none
summary: subtask
---

## Description (subtask of 853-845-subtask)

`★ Insight ─────────────────────────────────────`
- このタスクは既に最小単位（単一 bash コマンド + 検証）まで分解済みなので、さらに分割すると overhead が価値を上回ります
- タスク ID をパスに埋め込むパターン (`/tmp/git-status-853-before.txt`) は cron 並列実行時のファイル衝突を防ぐ防衛的設計で、autonomous-improve.sh が 3h 毎に走る本プロジェクトでは必須
- 分解結果は 1 subtask に留め、`depends: none` で即実行可能にします
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
