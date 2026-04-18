---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 650-630-claude-md-ratchet-down-issue-done-1
depends: none
summary: subtask
---

## Description (subtask of 650-630-claude-md-ratchet-down-issue-done-1)

`★ Insight ─────────────────────────────────────`
- このissueは設計上「1コミット集約」が必須要件。分解せず単一サブタスクとして扱うのが正しい判断
- ratchet-down ポリシー（Max Allowed は減少方向のみ更新）は God Object 抑制の核心メカニズム
- subtask-1 の検証結果を信頼し pnpm test/lint を再実行しないことで、CIサイクル節約と結果の一貫性を担保
`─────────────────────────────────────────────────`

このissueは「1コミットに集約」が明示要件のため、分解せず単一サブタスクとして出力します。

```

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
