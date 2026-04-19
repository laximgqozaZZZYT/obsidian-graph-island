---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 134-dead-exports
depends: none
summary: barrel export `views/webgl/index.ts` と `views/canvas2d/index.ts` から未使用 re-export を削除 (29個)
---

## Description (subtask of 134-dead-exports)

barrel (index.ts) に並んでいる `export { X } from "./mod"` のうち、他ファイルから import されていないものを削除。
  1. 両 index.ts の各 re-export について `grep -rn "from.*views/webgl\"" src/` 等で参照有無を確認
  2. renderer-factory.ts 経由でしか使われないものは残す
  3. 該当 re-export 行を削除
  4. `pnpm build` でバンドル失敗ないことを確認、bundle size 減少を確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
