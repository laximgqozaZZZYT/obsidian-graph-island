## Description (subtask of 1420-dead-exports)

`pnpm dlx ts-prune` (または `pnpm dlx knip --exports`) を実行して
  111個のdead exportsの完全リストを取得し、リスト全体をサブタスク2/3に
  引き継げるようコミットメッセージまたは一時ファイルに記録する。
  そのうえで src/utils/ と src/parsers/ 配下に該当する dead exports を
  対象として、以下のいずれかを実施する:
  - 完全に未使用な関数/定数/型は関数定義ごと削除
  - 内部利用のみで export が不要なものは export キーワードを除去
  godobj ファイル (GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts,
  RenderPipeline.ts) は本サブタスクでは触らない。
  実施後 `pnpm build && pnpm test && pnpm lint` で回帰がないことを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
