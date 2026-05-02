## Description (subtask of 1574-dead-exports)

subtask-1 の手順を `src/views/` 配下の小ファイルに適用する。
  CLAUDE.md の GOD OBJECT 4ファイル
  (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts)
  は触らない (ratchet 行数を上げないため、export 削除は別タスクで慎重に)。
  `src/i18n.ts` の `t()` 関数は必ず保持。未使用の翻訳キー定数のみ削除可。
  最終的に `npx ts-prune` の出力件数を確認し、全 subtask 完了時点で
  50件以下になっているかを記録 (Acceptance criteria の検証)。
  作業後 `pnpm test` `pnpm build` `pnpm lint` が成功することを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
