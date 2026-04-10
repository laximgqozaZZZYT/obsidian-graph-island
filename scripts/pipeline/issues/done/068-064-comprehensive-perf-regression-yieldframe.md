---
priority: high
reported: 2026-04-10
status: done
source: decomposed
parent: 064-comprehensive-perf-regression
depends: none
summary: レイアウト再計算のメインスレッドブロック軽減（yieldFrame挿入）
---

## Description (subtask of 064-comprehensive-perf-regression)

レイアウト切替時のメインスレッドブロックを軽減する。

  1. cluster-force.ts の analyzeOverlap()（O(N²)、最大500ノード）に
     yieldFrame() を挿入し、async化する。500ノード×500比較を
     100ノードずつのチャンクに分割し、チャンク間で await yieldFrame()。
     ※ analyzeOverlap のシグネチャを async に変更、呼び出し元も更新。

  2. GraphViewContainer._computeStaticLayout() 内の重いレイアウト計算
     （coordinateOffsets, timelineOffsetsV2）の前後に yieldFrame() を挿入。
     既に async 関数のため、await を追加するのみ。

  3. doRender() 内の buildGraphFromVault() 呼び出し前後に
     performance.mark を追加（DEV_PERFガード付き）し、
     実測値をコンソールに出力可能にする。

  テスト: analyzeOverlap の async 版が同じ結果を返すことのユニットテスト。
         チャンク分割が正しく動作することの検証。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
