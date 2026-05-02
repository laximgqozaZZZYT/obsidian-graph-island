## Description (subtask of 1593-dead-exports)

subtask-1 で生成した dead-export リストの残りのうち、
  src/layouts/, src/parsers/, src/utils/ 配下のシンボルを処理する。
  処理方針は subtask-1 と同じ (削除 / export外し / type化)。
  特に純粋関数として export してテスト用に公開しているものは
  tests/ 側で実際に import されているか確認し、テストにも参照がなければ削除対象。
  処理後 `pnpm build` `pnpm test` `pnpm lint` で回帰確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
