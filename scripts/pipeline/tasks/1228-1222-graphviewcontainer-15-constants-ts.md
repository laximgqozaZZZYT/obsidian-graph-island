---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1222-143-graphviewcontainer-constants-ts-god-obje
depends: subtask-1
summary: GraphViewContainer定数の中盤15個を constants.ts へ移動
---

## Description (subtask of 1222-143-graphviewcontainer-constants-ts-god-obje)

1. subtask-1 完了後、`src/views/GraphViewContainer.ts` に残っている SCREAMING_CASE 定数を Grep で再確認。出現順で次の15個を対象とする。
  2. `src/constants.ts` の既存 `// ---- GraphViewContainer constants ----` セクション（subtask-1 で新設済み）に、`GVC_` プレフィクス付きで追記。
  3. `src/views/GraphViewContainer.ts` 側:
     - 該当 const 行 15 本を削除
     - 既存 import ブロック（subtask-1 で確立済み）に `GVC_*` を追記
     - 定数の参照箇所を全て `GVC_` プレフィクス版に置換
  4. `pnpm test && pnpm lint && pnpm build` 全通過を確認。
  5. コミットメッセージ: `refactor(GVC): move 15 constants to constants.ts with GVC_ prefix (batch 2/3)`
  禁止: GraphViewContainer.ts にコードを追加しない。挙動変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
