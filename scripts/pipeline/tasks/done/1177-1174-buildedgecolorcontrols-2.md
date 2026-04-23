---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1174-1168-buildedgelabelcontrols-buildedgecolorcon
depends: subtask-1
summary: buildEdgeColorControls の2テストを追加
---

## Description (subtask of 1174-1168-buildedgelabelcontrols-buildedgecolorcon)

subtask-1 と同じファイルに `describe("buildEdgeColorControls")` ブロックを追加。

  テストケース:
  - "colorEdgesByRelation トグル → cb.rebuildPanel が呼ばれる"
    - toggle を切り替え後 `expect(callbacks.rebuildPanel).toHaveBeenCalled()`
    - markDirty は呼ばれていても良いが rebuildPanel が主検証
  - "edgeDirectionFilter セレクト変更 → cb.markDirty が呼ばれる"
    - select 要素の value を変更し change イベント発火
    - `expect(callbacks.markDirty).toHaveBeenCalled()`

  subtask-1 で作ったヘルパー (mock container / mock callbacks factory) を再利用すること。新規ヘルパーは作らない。

  検証:
    `pnpm test tests/views/panel-sections-edge-display.test.ts` が全 PASS (subtask-1 の1件 + 本subtaskの2件 = 計3件以上)
    `pnpm test:coverage` で S28.67% を下回らない
    `pnpm lint` PASS

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
