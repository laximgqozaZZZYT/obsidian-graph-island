---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 675-627-subtask
depends: none
summary: subtask
---

## Description (subtask of 675-627-subtask)

のレポートで +1pt 超過と判定された指標のみ、
  vitest.config.ts 内の thresholds を現在値-1pt（floor整数）まで引き上げる。
  超過していない指標は変更しない。閾値の引き下げは絶対禁止。
  引き上げ後に `pnpm test:coverage` を再実行し、全閾値を PASS することを確認。
  独立コミットで行い、ロールバック可能性を保つ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
