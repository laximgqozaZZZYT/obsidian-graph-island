---
priority: medium
reported: 2026-04-24
status: done
source: decomposed
parent: 1220-143-constants-ts
depends: subtask-2
summary: tree.ts の定数(5個)を constants.ts へ TREE_ プレフィクスで集約
---

## Description (subtask of 1220-143-constants-ts)

1. `src/constants.ts` に `// ---- Layout constants: Tree ----` サブセクションを追加
  2. `src/layouts/tree.ts` から SCREAMING_CASE 定数(5個)を `TREE_` プレフィクス付きで移動
  3. tree.ts 内部の参照箇所を新名称に置換
  4. `tests/layouts/tree*.test.ts` の import 文を更新
  5. 純ローカル定数は残す
  6. `pnpm test` と `pnpm lint` が通ることを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
