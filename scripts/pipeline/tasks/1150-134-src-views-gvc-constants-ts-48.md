---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 134-dead-exports
depends: none
summary: `src/views/gvc-constants.ts` から未使用定数を削除 (48個)
---

## Description (subtask of 134-dead-exports)

`npx ts-prune` の結果で `src/views/gvc-constants.ts` にある 48個の未参照 `export const` を削除する。
  手順:
  1. `npx ts-prune 2>/dev/null | grep -v "used in module" | grep "src/views/gvc-constants.ts"` で対象行を列挙
  2. 各定数について `grep -rn --include="*.ts" "<CONST_NAME>" src/ tests/` で実使用を再確認(テストからの参照も含めて)
  3. 完全に未使用のものだけ `export` 行を削除
  4. `pnpm lint && pnpm build && pnpm test` が通ることを確認
  5. bundle size 800KB 以下を維持
  God Object 対象外ファイルなので削除OK。この1タスクで acceptance criteria (<=50) は達成可能。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
