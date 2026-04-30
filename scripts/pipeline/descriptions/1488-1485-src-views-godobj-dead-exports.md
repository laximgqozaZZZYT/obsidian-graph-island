## Description (subtask of 1485-dead-exports)

`pnpm knip` または `pnpm ts-prune` を実行し、src/views/ 配下のうち
  GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts
  (god object 4ファイル) を除く .ts ファイルでの dead exports を抽出する。

  対象ファイル群 (renderer-factory, CanvasGraphics, CanvasText, LabelManager,
  view-mode-map, view-mode-sections など) で、プロジェクト内から import されていない
  export について以下のいずれかを実施:
  - export 修飾子を削除しモジュール内 private にする
  - 完全に未使用なら関数/定数/型ごと削除する
  - tests からのみ使用されているものは export を維持

  god object 4ファイルは触らない (CLAUDE.md GOD OBJECT Policy 厳守)。
  変更後 `pnpm build && pnpm test && pnpm lint` がグリーンであることを確認。
  どの export を何件削除/unexport したかを件数で commit message に記録する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
