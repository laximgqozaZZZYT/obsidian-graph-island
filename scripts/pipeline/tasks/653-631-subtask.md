---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: none
summary: subtask
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

, 2 の結果を集約し、以下のどちらかを実施:
  - 両方 pass → 親タスク (617-593-594-585-done) のverificationセクションを「緑」として更新
  - いずれか失敗 → 親タスク594のregressionとして失敗内容を記録 (lint errors / failed tests / coverage drop を明記)
  コード修正は一切行わない (修正は別issueに分離する方針)。
  報告フォーマット: `## Verification result (2026-04-18)` 見出し + lint結果 + test結果 + coverage数値 (S/B/F/L)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
