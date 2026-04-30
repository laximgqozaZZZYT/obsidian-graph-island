## Description (subtask of 1473-dead-exports)

`pnpm dlx knip` で dead exports を再列挙し、src/views/ 配下に絞って処理:
  - GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts は
    CLAUDE.md GOD OBJECT Policy により行数を増やさず、未使用 export を削除 or unexport
  - その他の views/ ファイル (renderer-factory.ts 等) も同様に削除 or unexport
  削除した関数が他で使われていないか `grep -r "<symbol>" src/ tests/` で確認すること。
  作業後に `pnpm build` `pnpm test` を通すこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
