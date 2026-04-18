---
priority: high
reported: 2026-04-18
status: pending
source: decomposed
parent: 595-582-subtask
depends: none
summary: pnpm lint と format:check で GraphViewContainer.ts の静的解析エラーを検証
---

## Description (subtask of 595-582-subtask)

以下を並列実行し、GraphViewContainer.ts に関するエラー/警告を抽出する:
  - `pnpm lint` → ESLint エラー/警告
  - `pnpm format:check` → Prettier 差分
  両方ともエラー 0 件が期待値。エラーがある場合はファイル名・行番号・ルール名を報告し、修正は別タスクとして切り出す (このタスクでは検証のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
