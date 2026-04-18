---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 667-663-subtask
depends: none
summary: subtask
---

## Description (subtask of 667-663-subtask)

`★ Insight ─────────────────────────────────────`
- 元issueが「1コミット原子性」を明示的に要求している場合、無理に分解するとパイプラインが各サブタスクで個別コミットを作り、ratchet down ルール(CLAUDE.md の Max Allowed 更新)が途中状態でコミットされる可能性がある
- wc -l 測定 → CLAUDE.md 更新 → git mv は「測定値と構造が一致した状態」が保証されるべき一貫性単位であり、分割はatomicity違反リスクを増やす
- このissueは decomposition の例外パターン(単一原子タスク)として、そのまま単一SUBTASKとして出力するのが正しい
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
