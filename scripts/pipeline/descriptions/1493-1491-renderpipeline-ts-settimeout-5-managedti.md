## Description (subtask of 1491-settimeout-leaks)

対象: `src/views/RenderPipeline.ts` の `setTimeout` 7件のうち、`clearTimeout` でペアになっていない 5件を ManagedTimers に移行する。
  手順:
  1. ファイル内の 7箇所すべての `setTimeout` 呼び出しと、対応する `clearTimeout` を精読し、未ペアの 5件を特定する。
  2. RenderPipeline クラスに `private readonly timers = new ManagedTimers();` を保持(既にあれば再利用)。
  3. 未ペアの 5件を `this.timers.setTimeout(fn, ms)` に置換。手動 clear が必要な箇所は `this.timers.clear(handle)` を使う。
  4. RenderPipeline の destroy/teardown メソッド(なければ既存の cleanup hook)で `this.timers.clearAll()` を呼ぶ。
  5. 行数は Max 2657 を超えないこと(置換中心で増加は数行に収まる想定)。
  6. `pnpm test` と `pnpm build` を通す。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
