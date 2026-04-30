## Description (subtask of 1427-dead-exports)

まず `pnpm exec ts-prune` (または knip) を実行して dead exports の完全リストを取得し、
  src/utils/ と src/parsers/ 配下に存在するエントリのみを対象とする。
  各エントリについて以下の判定を行う:
    - export を削除しても他ファイルでビルドエラーが出ないか確認
    - テストファイル (tests/**) で参照されている場合は対象外
    - public API として残す必要がある場合 (型定義・将来の使用予定が明記された JSDoc あり) は除外
  対象にする export は `export` キーワードを外して file-local にするか、
  関数自体が完全に未使用なら削除する。
  作業後に `pnpm build` と `pnpm test` が通ることを確認する。
  CLAUDE.md の Forbidden Patterns (Godobject 肥大化, console.*, location.reload) に
  該当する変更は入れないこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
