---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 134-dead-exports
depends: none
summary: gvc-constants.ts から未使用エクスポート48個を削除
---

## Description (subtask of 134-dead-exports)

`npx ts-prune | grep gvc-constants.ts | grep -v "used in module"` で特定される48個の純dead exportsを対象とする。
  手順:
  1. `npx ts-prune 2>/dev/null | grep "src/views/gvc-constants.ts" | grep -v "used in module"` で一覧取得
  2. 各定数について `grep -rn "定数名" src/ tests/` でプロジェクト内使用の最終確認
  3. 完全に未使用なら宣言ごと削除、他ファイル未使用だがモジュール内使用なら `export` キーワードのみ削除
  4. `pnpm build` `pnpm test` `pnpm lint` 全PASS確認
  期待: dead exports 182→約134、バンドルサイズ縮小

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
