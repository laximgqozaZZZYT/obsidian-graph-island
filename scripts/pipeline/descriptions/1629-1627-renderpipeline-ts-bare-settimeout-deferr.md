## Description (subtask of 1627-settimeout-leaks)

src/views/RenderPipeline.ts の lines 1814, 1820, 1831 にある bare `setTimeout(processNext, 0)` /
  `setTimeout(this.processDeferredBatch, 0)` を `this.host.timers.setTimeout(...)` に置換する。

  - 既に `this.host.timers.setTimeout(...)` を使っている既存呼び出し (line 1474, 1772) と同じパターンに揃える
  - `_enrichmentCancelId` と `deferredBatchId` の型 `ReturnType<typeof setTimeout>` を
    timer-registry が返す型に合わせて調整 (キャストが必要な場合は既存の line 1836 と同じ書式)
  - line 1786, 1836 の `clearTimeout(...)` も対応する `this.host.timers.clear(...)` に置換
  - 行数が増えないよう注意 (RenderPipeline.ts は 2657 行 / Max 2657 — 増加禁止)
  - 既存テスト (tests/views/RenderPipeline.test.ts) を実行して回帰がないことを確認

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
