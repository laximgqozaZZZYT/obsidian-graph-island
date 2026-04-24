---
priority: high
reported: 2026-04-25
status: in-progress
source: decomposed
parent: 147-god-object-violation
depends: none
summary: GraphViewContainer.ts から小型純粋関数を1つ抽出し 8424 行以下に削減
---

## Description (subtask of 147-god-object-violation)

src/views/GraphViewContainer.ts は現在 8427 行で CLAUDE.md の Max Allowed (8424) を 3 行超過している。
  以下の手順で 8424 行以下まで削減する。

  1. src/views/GraphViewContainer.ts を精読し、`this` への依存が少ない自己完結的な private ヘルパー関数を 1 つ選定する
     (候補: 座標計算/文字列整形/数値クランプ/配列ユーティリティなど、10〜40 行程度の純粋関数寄りのもの)。
  2. 選定した関数を src/views/helpers/ 配下の新規ファイルに export 付きで抽出する
     (ディレクトリが存在しない場合は作成)。引数経由で必要な値を受け取るシグネチャにする。
  3. GraphViewContainer.ts 側の元メソッドを削除し、呼び出し箇所を import した関数呼び出しに置き換える。
  4. tests/views/helpers/ 配下に vitest の単体テストを追加し、抽出関数の境界値/通常系を検証する
     (最低 3 ケース)。
  5. `pnpm build` と `pnpm test` が通ることを確認する。
  6. GraphViewContainer.ts の新しい行数を `wc -l` で計測し、
     CLAUDE.md の GOD OBJECT Policy 表の `src/views/GraphViewContainer.ts` の行数と Max Allowed を
     新しい行数に更新する (ratchet down only ルールに従う)。

  禁止事項:
  - 新規 API の追加や仕様変更は行わない。純粋な抽出のみ。
  - GraphViewContainer.ts に新たな行を追加しない
    (import 文の追加で行数が増える場合は、抽出元の行数差分でそれを上回るようにする)。
  - 他の God Object ファイル (PanelBuilder/EdgeRenderer/RenderPipeline) には触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
