## Description (subtask of 1574-dead-exports)

subtask-1 と同じ手順を `src/layouts/` と `src/constants.ts` に適用する。
  layout 系は純粋関数が多くテストから呼ばれるケースがあるため、
  `Grep` で `tests/` 以下も含めて使用箇所を必ず確認する。
  RenderThresholds を経由する定数は、たとえ未 import に見えても
  RenderThresholds の値供給源として使われている可能性があるため
  `RenderThresholds` を含むファイルを必ず検索してから削除判断すること。
  作業後 `pnpm test` と `pnpm build` が成功することを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
