## Description (subtask of 1314-settimeout-leaks)

src/views/RenderPipeline.ts (setTimeout 7箇所、clearTimeout 2箇所、未クリア5箇所) を対象。

  既存の RenderPipeline クラスに `private pendingTimers: Set<ReturnType<typeof setTimeout>>` を private field として追加し、
  既存の destroy/dispose/cleanup メソッド (なければ既存の clearTimeout を呼んでいる箇所と同じ場所) で
  pendingTimers 全要素に clearTimeout を実行 + clear する。

  各 setTimeout 呼び出し時に id を pendingTimers に add、コールバック内で delete する。

  GOD OBJECT 制約 (max 2476 行) の範囲内に収めること。新規ヘルパーの抽出が必要なら
  src/views/timer-tracker.ts のような新規ファイルに `class TimerTracker { schedule(fn, ms): void; clearAll(): void }` を切り出す
  (この場合 RenderPipeline.ts の行数増分はゼロに近い)。

  検証:
  - `pnpm build` 通過
  - `pnpm test` 通過
  - RenderPipeline.ts の行数が 2476 を超えないこと
  - 修正後、setTimeout 呼び出しと clearTimeout 呼び出しの差分が 0 になっていること

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
