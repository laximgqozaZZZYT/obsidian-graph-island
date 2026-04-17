---
priority: high
reported: 2026-04-17
status: pending
source: decomposed
parent: 483-475-god-object
depends: subtask-1
summary: pnpm lint と pnpm format:check 実行
---

## Description (subtask of 483-475-god-object)

`pnpm lint` と `pnpm format:check` を順に実行し、警告・エラーが
  ないことを確認。Lint エラーが出た場合は `pnpm lint:fix`、Format
  違反は `pnpm format` で修正してから再実行する。
  自動修正で解決しない違反は手動修正対象として記録。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
