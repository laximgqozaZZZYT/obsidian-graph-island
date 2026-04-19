---
priority: high
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 139-e2e-smoke-fail
depends: none
summary: baseline node countフィルタ経路を計測して2000未満の原因を特定
---

## Description (subtask of 139-e2e-smoke-fail)

`e2e/smoke.spec.ts:82` が `baseline node count > 2000` で落ちている。
  test vault は 2232 md files。`getGraphData()` の各段階 (rawData → showOrphans → existingOnly → tag filter → search → group collapse) での node count を一時的にトレースし、どの段階で2000未満に減っているかを特定する。
  調査結果を `tmp-debug-nodecount.md` もしくは issueコメントに記録。
  実際の修正は

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
