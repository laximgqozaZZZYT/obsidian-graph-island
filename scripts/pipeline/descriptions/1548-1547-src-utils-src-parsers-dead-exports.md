## Description (subtask of 1547-dead-exports)

`pnpm dlx ts-prune` (または同等の検出ツール) を実行し、dead exports の一覧を生成する。
  そのうち src/utils/ と src/parsers/ 配下のファイルにある未使用 export のみを対象とし、以下のいずれかで対処する:
  - 完全に未使用な関数/型/定数: 該当 export 行および定義そのものを削除
  - テストからのみ参照されている: そのまま (used とみなす)
  - 内部利用のみの export: `export` キーワードを外して module-private 化
  作業後に `pnpm lint` `pnpm test` `pnpm build` を実行し、すべてグリーンになることを確認してコミット。
  CLAUDE.md の GOD OBJECT 4ファイル (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は本タスクの対象外。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
