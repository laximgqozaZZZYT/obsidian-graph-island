---
priority: high
reported: 2026-04-25
status: blocked
source: decomposed
parent: 1243-1238-node-decorations-ts-11
depends: none
summary: node-decorations.ts から 11 個のインライン数値リテラルを特定し TODO コメントとして記録する
---

## Description (subtask of 1243-1238-node-decorations-ts-11)

`src/views/node-decorations.ts` を Read ツールで全文読み、バッジ/リング/ラベル/アイコン/ハロー描画で使われるインライン数値リテラル (半径, 太さ, オフセット, パディング, フォントサイズ, alpha) を列挙する。`1 / zoom`, `lodLevel`, `density` 由来の乗数は除外する。

  11 個に絞り込み、`src/views/node-decorations.ts` の import 直下に以下形式の TODO コメントを 11 行追加する:

  ```
  // TODO(NODE_DECO): <定数候補名> = <値>  // <描画要素の説明>
  ```

  例: `// TODO(NODE_DECO): BADGE_RADIUS_PX = 6  // バッジ半径`

  制約:
  - 既存の数値リテラル本体・描画ロジックは変更しない (コメント追加のみ)
  - `src/constants.ts`, `src/views/EdgeRenderer.ts`, `src/views/RenderPipeline.ts`, `src/views/pathfinder-overlay.ts` は変更しない
  - `src/views/node-decorations.ts` 以外のファイルは変更しない

  完了条件:
  - `pnpm build` が型エラーなく成功する
  - 11 行の TODO コメントが import 直下に追加されている
  - 変更を 1 コミットにまとめる (コミットメッセージ例: `chore(node-decorations): add TODO markers for 11 inline literals`)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
