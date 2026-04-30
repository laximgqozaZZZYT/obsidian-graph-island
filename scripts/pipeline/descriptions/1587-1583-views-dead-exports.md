## Description (subtask of 1583-dead-exports)

`src/views/` 配下に対して dead export 検出を行い、未使用 export を削除する。
  God Object ファイル (GraphViewContainer.ts / EdgeRenderer.ts / RenderPipeline.ts /
  PanelBuilder.ts) については、削除によって行数が減るのは許容される
  ("ratchet down only" のルールに合致)。ただし、テストファイル
  (tests/views/*.ts) からの import で使われている export は維持する。
  subtask-1, subtask-2 完了後に残る dead exports 件数を測定し、
  Acceptance criteria の「50個以下」を満たすように削除を進める。
  `pnpm test` `pnpm lint` `pnpm build` をすべて通すこと。
  CLAUDE.md の Max Allowed 行数を超えないことを確認する (削減方向のみ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
