## Description (subtask of 1602-dead-exports)

knip または ts-prune の出力から src/layouts/ と src/parsers/ 配下の
  dead exports を抽出する。
  layouts/ は純粋関数が多いので削除しやすいが、テストファイル
  (tests/layouts/) からの参照を必ず grep で確認すること。
  parsers/metadata-parser.ts は data pipeline の中核なので、
  使われていなくても将来使う予定の API は export を解除するのみ
  (内部関数化) で削除はしない方針。
  pnpm test と pnpm lint が通ることを確認してコミットする。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
