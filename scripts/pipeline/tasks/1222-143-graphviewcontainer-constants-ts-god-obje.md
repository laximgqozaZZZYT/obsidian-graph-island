---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 143-scattered-constants
depends: none
summary: GraphViewContainer の定数を constants.ts に抽出（GOD OBJECT 縮小）
---

## Description (subtask of 143-scattered-constants)

`GraphViewContainer.ts`（8580行, GOD OBJECT）内に定義された 45 個の SCREAMING_CASE 定数を `constants.ts` に完全移動する。これは「Max Allowed」減少（ラチェット下方）にも貢献する。
  手順:
  1. `GraphViewContainer.ts` 冒頭で Grep `^const\s+[A-Z][A-Z0-9_]+` し、全定数をリストアップ。
  2. `constants.ts` に `// ---- GraphViewContainer constants ----` セクション新設。プレフィクス `GVC_` を付与して移動。
  3. `GraphViewContainer.ts` 側は該当 const 行を削除し、ファイル先頭の既存 `import` ブロックに追加（新規 import 行は作らず既存のものを拡張）。
  4. `pnpm test`, `pnpm lint`, `pnpm build` 全通過を確認。
  5. 移動後 `GraphViewContainer.ts` の行数を `wc -l` で計測し、CLAUDE.md の `Max Allowed` を新しい値に更新（ratchet down）。
  禁止: 本ファイルに **コードを追加しない**。定数削除のみ。挙動変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
