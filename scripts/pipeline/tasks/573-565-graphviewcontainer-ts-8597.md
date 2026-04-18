---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 565-561-graphviewcontainer-ts-verify-lint-test
depends: none
summary: GraphViewContainer.ts の行数を計測し 8597 以下を確認
---

## Description (subtask of 565-561-graphviewcontainer-ts-verify-lint-test)

1. `wc -l src/views/GraphViewContainer.ts` を実行
  2. CLAUDE.md GOD OBJECT Policy の Max Allowed = 8597 と比較
  3. 判定結果をレポート:
     - 8597 超過 → fail-fast: 超過行数と増加が疑われるセクション(上位関数/メソッド)を報告、

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
