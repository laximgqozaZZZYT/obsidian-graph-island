## Description (subtask of 1693-dead-exports)

`pnpm dlx knip --include exports` または `pnpm dlx ts-prune` を実行し、
  `src/utils/` 配下の dead exports を抽出する。
  各 export について以下のいずれかの対応を取る:
    - 同ファイル内で使用されている → `export` キーワードを外す
    - プロジェクトのどこからも使用されていない → 関数/定数/型ごと削除
    - テストからのみ使用されている → そのまま維持(テスト用APIとして残す)
  対応後の確認:
    - `pnpm test` がグリーンであること
    - `pnpm lint` がグリーンであること
    - `pnpm build` が成功し、bundle が 800KB 以下であること
  src/views/ 配下の GOD object (GraphViewContainer.ts, PanelBuilder.ts,
  EdgeRenderer.ts, RenderPipeline.ts) には触れない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
