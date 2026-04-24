---
priority: high
reported: 2026-04-24
status: in-progress
source: decomposed
parent: 1222-143-graphviewcontainer-constants-ts-god-obje
depends: none
summary: GraphViewContainer定数の棚卸しと最初の15個を constants.ts へ移動
---

## Description (subtask of 1222-143-graphviewcontainer-constants-ts-god-obje)

1. `src/views/GraphViewContainer.ts` 冒頭で `^const\s+[A-Z][A-Z0-9_]+` を Grep し、SCREAMING_CASE 定数を全リストアップ（約45個想定）。完全な名前リストを取得したら、ファイル内での出現順に並べ、前半15個を対象とする。
  2. `src/constants.ts` の末尾に新セクション `// ---- GraphViewContainer constants ----` を新設。前半15個を `GVC_` プレフィクス付きで移動（例: `const DEFAULT_ZOOM` → `export const GVC_DEFAULT_ZOOM`）。元の値・型注釈・コメントはそのまま保持。
  3. `src/views/GraphViewContainer.ts` 側:
     - 該当 const 行 15 本を削除
     - 既存の `import { ... } from "../constants"` ブロック（または `../../constants`）に `GVC_*` を追記。新規 import 行は作らない。既存 import が無い場合のみ 1 本新設可。
     - 定数の参照箇所を `Grep` で検索し、すべて `GVC_` プレフィクス版に置換。
  4. `pnpm test && pnpm lint && pnpm build` 全通過を確認。
  5. コミットメッセージ: `refactor(GVC): move 15 constants to constants.ts with GVC_ prefix (batch 1/3)`
  禁止: GraphViewContainer.ts にコードを追加しない（削除と import 追記のみ）。挙動変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
