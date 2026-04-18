---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 885-874-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: subtask
---

## Description (subtask of 885-874-graphviewcontainer-ts-claude-md-ratchet)

`★ Insight ─────────────────────────────────────`
- 元issueに「単一セッション・単一コミットで完結（分解禁止）」と明記されているため、複数SUBTASKへの分解はissue自体の制約に違反します
- ratchet操作（行数測定→閾値更新→issue done化）は原子的でなければ整合性が壊れる典型例（測定値と閾値の不一致リスク）
- このケースでは「分解しない」=「1 SUBTASK のまま渡す」が正解
`─────────────────────────────────────────────────`

元issueは明示的に分解禁止です。原子性を保つため、単一SUBTASKとして出力します。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
