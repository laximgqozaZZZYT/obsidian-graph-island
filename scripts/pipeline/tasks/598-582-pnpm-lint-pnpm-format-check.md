---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 582-570-graphviewcontainer-ts-verify-only
depends: none
summary: pnpm lint および pnpm format:check が通ることを検証
---

## Description (subtask of 582-570-graphviewcontainer-ts-verify-only)

`pnpm lint` を実行しエラー0件であることを確認。
  続けて `pnpm format:check` を実行し全ファイルが Prettier 準拠であることを確認。
  違反があればファイル名・ルール名・行番号をレポートに記録。
  コード変更・自動修正 (`lint:fix` / `format`) は禁止。検証結果のみ記録。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
