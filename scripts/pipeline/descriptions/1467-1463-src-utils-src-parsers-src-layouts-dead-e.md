## Description (subtask of 1463-dead-exports)

1. `npx ts-prune` または `npx knip` を実行し、現在の dead exports 全リストを取得する
  2. 出力結果のうち `src/utils/`, `src/parsers/`, `src/layouts/` 配下のものを抽出
  3. 各 dead export について以下のいずれかを実施:
     - 同ファイル内のみで使われている → `export` キーワードを削除
     - どこからも使われていない関数/型/定数 → 関数本体を削除
     - テストでのみ使われている場合は dead ではないので skip
  4. `pnpm build` と `pnpm test` を実行して破壊がないことを確認
  5. 削減件数を commit message に明記する (例: "chore: remove N dead exports in utils/parsers/layouts")
  注意: GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts は触らない (God Object policy)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
