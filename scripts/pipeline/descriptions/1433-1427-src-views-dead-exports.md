## Description (subtask of 1427-dead-exports)

subtask-1 と同じ手順 (ts-prune で再計測 → src/views/ 配下のみ抽出 → export 解除/削除) を実行。
  特に GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts は
  GOD OBJECT 指定ファイルなので、行数を増やす変更 (export を維持してラッパーを足す等) は禁止。
  export 解除のみ許可、追加コードは書かないこと。
  作業後に `pnpm build` `pnpm test` `pnpm lint` が通ることを確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
