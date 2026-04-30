## Description (subtask of 1406-dead-exports)

まず `npx ts-prune` または `npx knip` を実行して、111 個の dead exports
  を全件リストアップし、ディレクトリ別に分類する (調査結果は標準出力で確認、
  ファイルとして残す必要はない)。

  そのうえで src/utils/ 配下のファイルに含まれる dead exports について、
  以下の手順で対処する:
  - 関数/定数/型の宣言から `export` キーワードを削除する (内部利用がある場合)
  - そもそも内部からも参照されていない場合は宣言ごと削除する
  - 型が public API として再エクスポートされている場合は削除しない

  対応後に `pnpm build` と `pnpm test` が緑であること、
  `pnpm lint` が pass することを確認してコミット。
  God Object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts /
  RenderPipeline.ts) には触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
