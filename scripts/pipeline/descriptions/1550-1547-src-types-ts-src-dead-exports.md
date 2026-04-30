## Description (subtask of 1547-dead-exports)

subtask-1, 2 と同じ手順で dead exports を再検出する。残った未使用 export のうち src/ ルート直下 (types.ts, i18n.ts, main.ts, settings.ts 等) のものを削除または unexport する。
  作業完了後、再度検出ツールを走らせて dead exports の総数を計測し、Acceptance criteria の「50個以下」を満たしていることを確認する。
  満たしていない場合は、God Object 4ファイルを除いた範囲でさらに対処する。
  `pnpm lint` `pnpm test` `pnpm build` がグリーンであること、および `main.js` のサイズが 800KB バジェット内であることを確認してコミット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
