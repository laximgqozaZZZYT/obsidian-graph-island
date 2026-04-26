## Description (subtask of 1332-loading-perf-regression)

以下のコミットを `git show` で精読する:
  - 4d3a86c3 chore: decompose 1328-settimeout-leaks into tasks
  - 8b597d17 chore: start task 1340-1328-panel-widgets-ts-settimeout-5-ctx-timers
  - ae0d3317 chore: done 1340-1328-panel-widgets-ts-settimeout-5-ctx-timers
  - 87cb936c chore: start task 1341-1328-renderpipeline-ts-settimeout-2-managedti
  ManagedTimer / ctx-timers 移行で、以前は view オープン時や render 時に発火していた setTimeout / setInterval が、import 時または onload() 経路で eager に登録/起動されていないかを確認する。
  該当箇所が見つかった場合は、初回 view open のタイミングまで遅延させる、または register 自体を `app.workspace.onLayoutReady()` 内に移動する。
  GOD OBJECT 制約: GraphViewContainer.ts 8655行 / RenderPipeline.ts 2476行 / panel-widgets.ts も既存サイズを越えないこと。
  完了条件: `pnpm test` 全 PASS、`pnpm lint` PASS、`pnpm build` PASS、subtask-1 のログで onload 合計時間が改善していることを CDP の console から確認する。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
