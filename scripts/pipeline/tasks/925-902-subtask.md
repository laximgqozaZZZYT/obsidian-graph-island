---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 902-895-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: subtask
---

## Description (subtask of 902-895-graphviewcontainer-ts-claude-md-ratchet)

元のissueに「単一セッション・単一コミットで完結（再分解禁止）」と明記されているため、分解せず単一タスクとして出力します。

`★ Insight ─────────────────────────────────────`
- Ratchet down only ポリシー: Max Allowed を増やす変更は禁止されており、測定値 N が現上限 8597 を超えた場合は CLAUDE.md を変更せず違反記録のみ残す
- メタデータのみの変更なので `pnpm build`/`pnpm test` 不要 — コード変更ゼロだからこそ単一コミットで完結できる
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
