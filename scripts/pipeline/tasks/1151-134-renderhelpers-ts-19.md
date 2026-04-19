---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 134-dead-exports
depends: none
summary: RenderHelpers.ts から未使用エクスポート19個を削除
---

## Description (subtask of 134-dead-exports)

`npx ts-prune 2>/dev/null | grep "src/views/RenderHelpers.ts" | grep -v "used in module"` の19件を対象。
  手順:
  1. 各関数/型について `grep -rn "名前" src/ tests/` で使用箇所確認
  2. 真deadは宣言削除、自己参照のみなら `export` キーワード外し
  3. RenderHelpers.ts は God Object ではないが、削除対象関数がテストされていないことを確認(テストがあれば一緒に削除)
  4. `pnpm build` `pnpm test` 全PASS確認
  期待: dead exports 134→115

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
