## Description (subtask of 1684-dead-exports)

knip / ts-prune で src/layouts/ と src/parsers/ 配下の未使用 export を特定し削除する。
  既に done タスク 1683 で対応済みのものは knip 結果から消えているはずなので、
  残存する dead exports のみを対象とする。
  テストファイルからのみ参照されている export は維持 (テスト用 public API)。
  変更後に pnpm test, pnpm lint, pnpm build が通ること。
  削除した export 名を commit message に列挙すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
