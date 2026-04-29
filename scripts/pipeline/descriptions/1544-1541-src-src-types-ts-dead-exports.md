## Description (subtask of 1541-dead-exports)

subtask-1, 2 完了後に `pnpm exec ts-prune` を再実行して残った dead exports を集計する。
  src 直下のファイル (main.ts, types.ts, i18n.ts, settings.ts など) を中心に未使用 export を削除。
  acceptance criteria の「50個以下」を達成できているか ts-prune の出力件数で確認する。
  達成していなければ更にファイルを精読して削除候補を特定する。
  対応後、`pnpm test` と `pnpm build` が通ることを確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
