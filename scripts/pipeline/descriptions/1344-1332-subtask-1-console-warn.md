## Description (subtask of 1332-loading-perf-regression)

subtask-1 で挿入したフェーズ計測ログを残したまま、各フェーズ計測の直後に「subtask-2 完了時点の実測値 × 1.5」を閾値とする `if (duration > threshold) console.warn('[graph-island load] slow phase', phaseName, duration)` を入れる。
  閾値は実測値の定数として `const LOAD_PHASE_BUDGETS = { ... }` を main.ts 冒頭に置く。
  本番ビルドは esbuild が console.warn も drop するため、開発時の regression 検知用ガードとして機能する。
  値は subtask-1, subtask-2 完了直後に取得した実測値ベース (推測値で埋めない)。
  `pnpm test`, `pnpm lint`, `pnpm build` PASS を確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
