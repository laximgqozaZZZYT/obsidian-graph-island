---
priority: medium
reported: 2026-04-19
status: done
source: decomposed
parent: 134-dead-exports
depends: none
summary: バレルファイル webgl/index.ts と canvas2d/index.ts の不要再export削除
---

## Description (subtask of 134-dead-exports)

webgl/index.ts(18件) + canvas2d/index.ts(11件) = 計29件の再exportを対象。
  手順:
  1. 各 `export { X } from "..."` や `export * from "..."` について、`grep -rn "from.*webgl\"" src/` / `grep -rn "from.*canvas2d\"" src/` でバレル経由のimport有無を確認
  2. バレル経由で使われていない再exportを削除
  3. 一部のみバレル経由で使われている場合は、named exportを最小化
  4. `pnpm build` `pnpm test` 全PASS確認
  期待: dead exports 115→86

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
