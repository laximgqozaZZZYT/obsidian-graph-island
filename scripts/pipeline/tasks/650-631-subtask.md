---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 631-617-pnpm-lint-pnpm-test
depends: none
summary: subtask
---

## Description (subtask of 631-617-pnpm-lint-pnpm-test)

`★ Insight ─────────────────────────────────────`
- 検証専用タスク（コード変更なし）なので、分解は「lint」「test」「結果集約」の3段で十分
- `pnpm test` はカバレッジしきい値を `vitest.config.ts` で enforce しているため、別途しきい値チェックは不要（test が失敗すればしきい値割れも自動検出）
- 親タスク594のregressionとして報告のみ＝done条件は「検証完了」であり「全部pass」ではない点に注意
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
