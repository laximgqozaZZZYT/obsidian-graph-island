## Description (subtask of 1438-dead-exports)

`pnpm exec ts-prune` を実行して `src/views/` および `src/layouts/` 配下の
  dead exports を抽出する。
  god object 4ファイル (GraphViewContainer.ts, PanelBuilder.ts,
  EdgeRenderer.ts, RenderPipeline.ts) は **行数を増やさない** こと。
  export 削除のみで、関数本体の移動・抽出は行わない (別タスクの範疇)。
  各 export について subtask-1 と同じ手順で参照確認 → export 削除 or 関数削除。
  作業後 `pnpm test` と `pnpm build` を通すこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
