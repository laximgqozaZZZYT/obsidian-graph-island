---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 554-536-graphviewcontainer-ts
depends: none
summary: subtask
---

## Description (subtask of 554-536-graphviewcontainer-ts)

`★ Insight ─────────────────────────────────────`
- このissueは既に最小単位のverify-onlyタスク (wc -l + 空コミット) で、これ以上の分解は人工的になります
- CLAUDE.md の GOD OBJECT Policy に従い `GraphViewContainer.ts` は不可侵 — 検証コミットだけで ratchet 履歴を残す設計です
- 想定外ケース (8612超過) のフォールバックを別サブタスクに分けず本タスク内で「報告して中断」とすることで、パイプライン分岐を最小化しています
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
