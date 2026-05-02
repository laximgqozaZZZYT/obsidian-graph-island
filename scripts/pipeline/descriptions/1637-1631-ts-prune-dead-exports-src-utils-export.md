## Description (subtask of 1631-dead-exports)

`pnpm exec ts-prune` (または `npx ts-prune`) を実行して dead exports の完全な一覧を生成する。
  そのうち src/utils/ 配下のファイルに該当するものを精読し、以下の方針で処理する:
  - 完全に未使用の関数/定数/型 → 削除 (関連テストも調整)
  - `export` を外せば内部利用のみで足りるもの → `export` キーワードを除去
  - テストからのみ参照されているもの → "used in module" 扱いで残置可
  変更後 `pnpm test` と `pnpm build` を通し、再度 ts-prune を走らせて削減件数を記録する。
  god object (GraphViewContainer.ts / PanelBuilder.ts / EdgeRenderer.ts / RenderPipeline.ts) は本タスクでは触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
