## Description (subtask of 1593-dead-exports)

pnpm exec knip --include exports または pnpm exec ts-prune を実行し、
  dead exports の完全リストを取得する (current: 146件)。
  リストのうち src/views/ 配下のものを対象に、以下のいずれかで処理:
  (a) シンボルがファイル内のどこからも参照されていない → 関数/定数/型ごと削除
  (b) シンボルが同一ファイル内で使われている → `export` キーワードのみ除去
  (c) 型エイリアス/interfaceで再導入が必要 → 内部 type に変更
  処理後 `pnpm build` `pnpm test` `pnpm lint` を実行して回帰がないことを確認。
  GOD OBJECT (GraphViewContainer.ts/PanelBuilder.ts/EdgeRenderer.ts/RenderPipeline.ts)
  については export を外すだけで内部使用は維持する方針で、行数を増やさないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
