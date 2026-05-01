## Description (subtask of 1650-dead-exports)

`pnpm exec ts-prune | grep "src/layouts/"` で src/layouts/ 配下の dead exports を列挙する。
  各エントリについて以下を判定して対応する:
  - プロジェクト内のどこからも import されていない関数/定数/型 → 関数本体ごと削除
  - 同一ファイル内のみで使用されている → `export` キーワードを外して private 化
  テストや型を破壊しないことを `pnpm test` と `pnpm build` で確認する。
  GOD OBJECT (GraphViewContainer/PanelBuilder/EdgeRenderer/RenderPipeline) には触れない。
  他サブタスクと file isolation するため変更対象は src/layouts/ のみに限定する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
