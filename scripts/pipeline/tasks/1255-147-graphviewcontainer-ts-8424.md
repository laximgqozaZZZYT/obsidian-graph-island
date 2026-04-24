---
priority: high
reported: 2026-04-25
status: pending
source: decomposed
parent: 147-god-object-violation
depends: none
summary: GraphViewContainer.ts から小さな自己完結ヘルパーを新ファイルへ抽出し 8424 行以下に戻す
---

## Description (subtask of 147-god-object-violation)

`src/views/GraphViewContainer.ts` は現在 8427 行で Max Allowed (8424) を +3 超過している。
  god object を更に肥大化させずに縮小するため、以下の手順で抽出する。

  1. `src/views/GraphViewContainer.ts` を精読し、以下の条件をすべて満たす
     「10〜40行程度の自己完結した private メソッドまたはユーティリティ関数」を1つ特定する:
     - `this` への副作用参照が無い、または引数として受け取る形に変換可能
     - Obsidian API に直接依存しない(純粋関数に近い)
     - decomposition priority にある snapshot / export / filter orchestration 周辺を優先
     - 例: フィルタ条件判定、スナップショット名整形、export 用のデータ正規化など

  2. 新ファイル `src/views/graph-view-helpers.ts` を作成し、特定した関数を
     純粋関数 (引数→戻り値) としてエクスポートする。
     既に `graph-view-helpers.ts` が存在する場合は追記する。

  3. `GraphViewContainer.ts` 側は該当メソッドを削除し、
     新ファイルからの import + 呼び出しに置き換える。
     呼び出し側の行数削減が、追加 import 行数を上回ることを確認する
     (純抽出で最低 4 行以上削減し、結果 8420 行以下を目標とする)。

  4. 変更後の行数を `wc -l src/views/GraphViewContainer.ts` で確認し、
     8424 以下であることをコミットメッセージに記載する。

  5. 抽出した関数の振る舞いを確認する単体テストを
     `tests/views/graph-view-helpers.test.ts` に追加する
     (新規作成または既存ファイルに追記)。最低 2 ケース(正常系 + 境界値)。

  6. 以下のコマンドをすべて通す:
     - `pnpm lint`
     - `pnpm test`
     - `pnpm build` (バンドルサイズが 800KB 以下であること)

  禁止事項:
  - GraphViewContainer.ts にコードを追加して行数を増やすこと
  - 既存テストのしきい値を下げること
  - CLAUDE.md の Max Allowed 値を書き換えること

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
