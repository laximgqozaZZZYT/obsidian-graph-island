---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 134-dead-exports
depends: none
summary: SearchOrchestrator と panel-sections 系の未使用export削除
---

## Description (subtask of 134-dead-exports)

SearchOrchestrator(10) + panel-sections-layout(6) + panel-sections-filter(6) + panel-sections(3) = 25件。
  手順:
  1. `npx ts-prune 2>/dev/null | grep -E "SearchOrchestrator|panel-sections" | grep -v "used in module"` で全件特定
  2. 各シンボルを `grep -rn "シンボル名" src/ tests/` で確認
  3. 完全未使用なら宣言削除、ファイル内参照のみなら export 外し
  4. PanelBuilder.ts は God Object なので、そこから逆にコード移動しないこと
  5. `pnpm build` `pnpm test` `pnpm lint` 全PASS確認
  期待: dead exports 86→61

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
