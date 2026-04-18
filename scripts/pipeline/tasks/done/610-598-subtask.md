---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 598-582-pnpm-lint-pnpm-format-check
depends: none
summary: subtask
---

## Description (subtask of 598-582-pnpm-lint-pnpm-format-check)

`★ Insight ─────────────────────────────────────`
- 検証専用タスク (lint/format:check) は自動修正禁止なので、実行と記録の2ステップに分解するのが最小構成
- `pnpm format:check` は違反があると non-zero exit。ログを完全にキャプチャしないと違反箇所を見逃す
- God Object ポリシー違反ではないので、既存ファイルの修正は発生しない (レポート追記のみ)
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
