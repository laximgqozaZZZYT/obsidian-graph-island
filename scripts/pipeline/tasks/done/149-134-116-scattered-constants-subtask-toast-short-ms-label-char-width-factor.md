---
priority: high
reported: 2026-04-15
status: done
source: decomposed
parent: 134-116-scattered-constants-subtask
depends: subtask-1
summary: 重複定数の統一（TOAST_SHORT_MS, LABEL_CHAR_WIDTH_FACTOR, AUTO_SNAP）
---

## Description (subtask of 134-116-scattered-constants-subtask)

3つの重複定数を constants.ts に統一する:
  
  1. TOAST_SHORT_MS = 2000
     - 現在: GVC, StatsRenderer, ExportManager に各々定義
     - → constants.ts に export、3ファイルで import に置換
     - TOAST_LONG_MS (5000), TOAST_MEDIUM_MS (3000) も同時に移動
  
  2. LABEL_CHAR_WIDTH_FACTOR = 0.6
     - 現在: RenderPipeline, cluster-force に各々定義
     - → constants.ts に export、2ファイルで import に置換
  
  3. AUTO_SNAP_PREFIX = "[auto] ", AUTO_SNAP_MAX = 10
     - 現在: SnapshotManager (export) + GVC (ローカル重複)
     - → GVC側を削除し SnapshotManager から import
     （SnapshotManager が正規の定義元として適切）
  
  subtask-1 で GVC 定数が gvc-constants.ts に移動済みの前提。
  TOAST_SHORT_MS は gvc-constants.ts から constants.ts へ再移動。
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
