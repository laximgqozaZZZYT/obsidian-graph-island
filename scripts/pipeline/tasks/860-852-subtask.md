---
priority: medium
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 852-840-704-694-ratchet-claude-md-issue
depends: none
summary: subtask
---

## Description (subtask of 852-840-704-694-ratchet-claude-md-issue)

`★ Insight ─────────────────────────────────────`
- 元issueに「単一コミットで完了。分割禁止」と明記されているため、複数SUBTASKへの機械的分解は親タスクの意図（ratchet測定値・CLAUDE.md更新・issue移動の原子性）を破壊します。
- God Object Policyの"ratchet down only"は、測定→判定→反映が同一コミット内にあることで一貫性が担保されます。分割すると中間状態で実測値とCLAUDE.md記述の不整合が発生。
- 検証ゲート（test/lint/format）→コミットの順序は、1セッション内で完結させるべき「失敗時ロールバック可能な単位」です。
`─────────────────────────────────────────────────`

元issueは分割禁止制約があるため、1サブタスクに集約します。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
