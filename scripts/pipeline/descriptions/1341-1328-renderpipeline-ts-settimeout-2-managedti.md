## Description (subtask of 1328-settimeout-leaks)

src/views/RenderPipeline.ts は setTimeout 7個 vs clearTimeout 2個でギャップ +5。
  内訳調査の結果、未クリアは以下の生 setTimeout 2箇所:
    - L1488: setTimeout(() => this.host.onAllPixiNodesCreated?.(), 0)
    - L1786: setTimeout(() => this.enrichLabelsDeferred(), 2500)
  (L1828/L1834/L1845 は既に this._enrichmentCancelId / this.deferredBatchId に
  保存されており clearTimeout の対象になっている)
  対応:
    - host から渡される ManagedTimers 参照(または既存の TimerRegistry)を使い、
      この 2 つを管理対象タイマーに移す。
    - L1488 はハンドルを `this._allNodesCreatedCancelId` に保持し、
      destroy()/cancelDeferredBatch() 系で clearTimeout する。
    - L1786 はハンドルを `this._enrichKickoffCancelId` に保持し、同様にクリア。
  既存の cancelDeferredBatch() の実装パターンに合わせること。
  完了条件:
    - RenderPipeline.ts に「保存されない」setTimeout が残っていない
    - destroy() 経由で全 timeout が clearTimeout される
    - pnpm build / pnpm test が PASS
    - RenderPipeline.ts の行数が CLAUDE.md の Max Allowed (2476) を超えない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
