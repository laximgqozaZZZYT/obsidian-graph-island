---
priority: medium
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 506-492-pnpm-build
depends: none
summary: subtask
---

## Description (subtask of 506-492-pnpm-build)

`★ Insight ─────────────────────────────────────`
- 元issueは「ビルド実行 → 計測 → 予算検証 → 記録」の一連フローで、本質的に1つのアトミックタスク
- 超過時の分岐は親タスク（492-483）のスコープなので、このサブタスクでは「計測と検証」に閉じるのが正しい
- CLAUDE.md の「Bundle size budget: 800KB (main.js, current: 759KB)」と一致しており、既存の品質ゲート検証と同等
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
