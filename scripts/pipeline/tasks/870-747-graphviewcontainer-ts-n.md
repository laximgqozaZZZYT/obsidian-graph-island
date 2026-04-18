---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 747-725-claude-md-god-object-policy-ratchet-down
depends: none
summary: GraphViewContainer.ts の現在行数 N を測定し、判定結果を確定
---

## Description (subtask of 747-725-claude-md-god-object-policy-ratchet-down)

`wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得する。
  subtask-2 の測定結果が既にある場合はそれを再検証するために再測定する。
  判定ロジック:
  - N < 8597 →

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
