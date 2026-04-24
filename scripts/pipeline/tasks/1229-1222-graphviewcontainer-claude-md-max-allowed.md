---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1222-143-graphviewcontainer-constants-ts-god-obje
depends: subtask-2
summary: GraphViewContainer残り定数の移動 + CLAUDE.md の Max Allowed 更新
---

## Description (subtask of 1222-143-graphviewcontainer-constants-ts-god-obje)

1. subtask-2 完了後、`src/views/GraphViewContainer.ts` に残る全 SCREAMING_CASE 定数を Grep で洗い出す（約15個）。
  2. 全て `src/constants.ts` の既存セクションに `GVC_` プレフィクス付きで追記。
  3. `src/views/GraphViewContainer.ts` 側:
     - 残 const 行を全削除
     - 既存 import ブロックに `GVC_*` を追記
     - 参照箇所を全て `GVC_` プレフィクス版に置換
     - Grep `^const\s+[A-Z][A-Z0-9_]+` で 0 件になることを確認（移動完了の検証）
  4. `wc -l src/views/GraphViewContainer.ts` で新しい行数を計測。
  5. `CLAUDE.md` の GOD OBJECT テーブル行
     `| `src/views/GraphViewContainer.ts` | 8580 | 8580 | ... |`
     の両方の数値（現在行数 / Max Allowed）を新しい値に更新（ratchet down）。
  6. `pnpm test && pnpm lint && pnpm build` 全通過を確認。
  7. コミットメッセージ: `refactor(GVC): complete constant extraction + ratchet down Max Allowed (batch 3/3)`
  禁止: GraphViewContainer.ts にコードを追加しない。挙動変更なし。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
