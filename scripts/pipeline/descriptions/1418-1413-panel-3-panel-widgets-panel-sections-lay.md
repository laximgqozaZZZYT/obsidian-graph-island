## Description (subtask of 1413-settimeout-leaks)

src/views/panel-widgets.ts (setTimeout=5, clearTimeout=0)、
  src/views/panel-sections-layout.ts (setTimeout=7, clearTimeout=3)、
  src/views/coord-panel.ts (setTimeout=2, clearTimeout=0) の各ファイルで
  使われている生の setTimeout を src/utils/timer-registry.ts の
  TimerRegistry もしくは src/utils/managed-timers.ts の ManagedTimers
  経由に置き換える。
  手順:
  1) 各ファイルの全 setTimeout 呼び出しを Read して、それぞれが
     (a) destroy/teardown が必要な遅延処理か (b) microtask 代用の即時 0ms か
     を分類する。
  2) (a) の呼び出しを既存 TimerRegistry / ManagedTimers のメンバに登録し、
     対応する onClose / destroy / detach 系のフックで clearAll を呼ぶ。
     既にレジストリがあれば再利用。無ければ panel 側の親 (View / GVC) から
     注入する。
  3) (b) の microtask 代用は queueMicrotask への置換、または明示コメント
     "// fire-and-forget by design" を残す。
  4) tests/views もしくは tests/utils に追加の単体テストとして
     "destroy 後に保留中の setTimeout コールバックが呼ばれない" 旨を
     既存パターン (TimerRegistry.clearAll の挙動) で1ケース足す。
  制約: God Object ファイル(GraphViewContainer/PanelBuilder/EdgeRenderer
  /RenderPipeline) は触らない。pnpm test と pnpm lint がグリーンに
  なること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
