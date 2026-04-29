## Description (subtask of 1541-dead-exports)

`pnpm exec ts-prune` を実行して src/layouts/ と src/parsers/ 配下の dead exports を列挙する。
  各 export について:
  - プロジェクト内で全く使われていない: 関数ごと削除
  - 同一ファイル内でのみ使用: `export` キーワードを外す
  - テストからのみ参照: 残す (used in module 警告は別カテゴリ)
  対応後、`pnpm test` と `pnpm build` が通ることを確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
