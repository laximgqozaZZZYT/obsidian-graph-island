---
priority: medium
reported: 2026-04-10
status: pending
source: decomposed
parent: 064-comprehensive-perf-regression
depends: none
summary: ズーム時のD3シミュレーション再起動を抑制
---

## Description (subtask of 064-comprehensive-perf-regression)

ズーム操作時に onZoomLayoutUpdate が simulation.alpha(0.8).restart() を
  呼ぶため、2000+ノードでフレームレートが低下する。

  1. InteractionManager の onZoomLayoutUpdate 内で、simulation restart を
     条件付きにする。ズーム倍率の変化が閾値（例: 前回から20%以上変化）
     未満の場合は restart をスキップ。閾値は RenderThresholds に追加。

  2. applyClusterForce(false) の呼び出しも同条件でスキップ。
     ノード位置は変わらないのでクラスタ力の再計算は不要。

  3. handleWheel() 内の applyTextFade() を markDirty() に統合。
     現在は別途 O(N) パスを走らせているが、次の dirty frame の
     redrawNodeBatch 内でテキストアルファ更新すれば十分。

  テスト: ズーム変化率が閾値未満の場合にsimulationが再起動しないことの
         ユニットテスト。applyTextFade統合後もテキスト透明度が正しく
         更新されることの検証。
```

##

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
