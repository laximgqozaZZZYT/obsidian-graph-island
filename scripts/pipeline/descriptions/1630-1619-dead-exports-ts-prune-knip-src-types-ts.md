## Description (subtask of 1619-dead-exports)

まず `pnpm dlx ts-prune` または `pnpm dlx knip` を実行して dead exports 146件のリストを取得し、
  `.autonomous-worktrees/<branch>/dead-exports.txt` に保存する（このファイルは src/ ではないがリスト用一時メモ）。
  そのうち src/types.ts と src/i18n.ts に存在する未使用 export（型エイリアス、interface、定数）を削除する。
  注意: 他ファイルから import されているものは触らない。リストのうち used in module は無視する。
  削除後、`pnpm build` と `pnpm test` がパスすることを確認する。
  完了基準: dead-exports.txt に列挙された types.ts/i18n.ts 由来の項目を全て解決し、
  該当ファイルの未使用 export 数が 0 になる。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
