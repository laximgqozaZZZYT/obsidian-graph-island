---
priority: high
reported: 2026-04-10
status: pending
source: decomposed
parent: 064-comprehensive-perf-regression
depends: none
summary: doRender() の軽量パス導入 — Canvas破棄なしの再描画経路
---

## Description (subtask of 064-comprehensive-perf-regression)

doRender() の40+呼び出しサイトの大半は、Canvas破棄不要な軽量更新。
  現在の doRender() を分割して軽量再描画パスを作る。

  1. GraphViewContainer に softRender() メソッドを新規追加（God Object行数
     増加を避けるため、既存の doRender 内の initPixi() 以降を呼ばない
     短縮パス）。softRender() は:
     - getGraphData() でデータ再取得
     - 既存PixiノードのPosition/色/サイズを更新（Canvas破棄なし）
     - markDirty(true) で再描画トリガ
     ※ 新メソッドは20行以内に収める

  2. 以下の doRender() 呼び出しを softRender() に置換:
     - フィルタ変更（searchQuery, showOrphans, showTagNodes等）
     - ノード色/サイズ設定変更
     - highContrastMode トグル
     ※ レイアウト変更・viewMode変更・初回描画は doRender() のまま

  3. LayoutController に needsFullRebuild(changeType: string): boolean を
     追加し、変更種別に応じて doRender/softRender を判別するヘルパーとする。

  テスト: softRender() がCanvas再生成せずにノードデータを更新できることの
         ユニットテスト。needsFullRebuild の判別ロジックテスト。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
