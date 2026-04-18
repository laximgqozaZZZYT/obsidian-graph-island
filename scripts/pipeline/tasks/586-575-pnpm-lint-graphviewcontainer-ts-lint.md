---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 575-565-subtask
depends: subtask-1
summary: pnpm lint で GraphViewContainer.ts にlintエラーがないことを検証
---

## Description (subtask of 575-565-subtask)

read-only verify: `pnpm lint 2>&1 | grep -E "GraphViewContainer"` を実行。
  GraphViewContainer.ts 関連のエラー・警告を抽出しログ出力のみ。
  ESLint flat config + typescript-eslint ルール違反を確認。
  ファイル変更・コミット禁止 (lint:fix も実行しない)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
