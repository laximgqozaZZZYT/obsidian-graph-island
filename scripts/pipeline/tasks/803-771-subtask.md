---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 771-760-
depends: none
summary: subtask
---

## Description (subtask of 771-760-)

`★ Insight ─────────────────────────────────────`
- このissueは「git status の M マーク検証」パイプラインの最終段（subtask-3）で、実際のコード変更ではなく **レポート整形とステータス出力**が責務
- parent task (760-730) は「git 操作を勝手にしない」safety gate パターンを実装しており、このsubtaskは検証結果の構造化出力のみを担う
- subtask-2 の分類結果（target_file / unexpected_changes / warnings）を JSON 風の構造化形式に整えて stdout に出すだけなので、1セッションで完結可能な粒度
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
