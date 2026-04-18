---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 627-609-subtask
depends: none
summary: subtask
---

## Description (subtask of 627-609-subtask)

`★ Insight ─────────────────────────────────────`
- このissueは「測定→比較→報告」型で、コード変更ではなく検証タスク。GOD OBJECT ポリシーで本体編集禁止のため、変更対象は閾値定義側 (CLAUDE.md / vitest.config.ts) のみ
- カバレッジラチェット文化: 閾値は下げず、+1pt 超過時のみ引き上げ。1サイクルに測定と引き上げを分けると、引き上げ判断時に独立コミットでき、後でロールバックしやすい
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
