## Description (subtask of 1619-dead-exports)

subtask-1 完了後、再度 `pnpm exec ts-prune` を実行し、残った dead exports のうち
  `src/views/`, `src/layouts/`, `src/parsers/` 配下のものを約50件処理する。
  注意: GOD OBJECT ファイル(GraphViewContainer.ts, PanelBuilder.ts, EdgeRenderer.ts,
  RenderPipeline.ts)では削除/unexport は許容(行数が減るため CLAUDE.md ratchet と整合)、
  ただしロジックの抽出や追記は禁止。
  処理方針はsubtask-1と同じ:
  - 未使用の export → 削除
  - module-private で十分なもの → export を外す
  - 動的参照(文字列でのアクセス等)がないか念のため `Grep` で確認してから削除する
  完了条件:
  - 累計 100件以上の dead export を削除/unexport(残り 50件未満を目指す)
  - `pnpm test` PASS
  - `pnpm build` PASS
  - `pnpm format:check` PASS
  - GOD OBJECT ファイルの行数が増えていないこと(ratchet遵守)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
