---
priority: high
reported: 2026-04-06
status: in-progress
source: decomposed
parent: 015-autofit-viewport-broken
depends: subtask-1
summary: computeAutoFitTransformの偏在ノード対応強化
---

## Description (subtask of 015-autofit-viewport-broken)

`computeAutoFitTransform` が極端に偏在したノード配置で不適切なスケールを返す問題を修正。
  
  1. `computeAutoFitBounds` で外れ値ノード (bbox全体の95%ile外) を検出し、
     外れ値を除外したbbox + 外れ値ありbbox の両方でフィットを計算、
     より多くのノードが表示される方を採用する
  
  2. `computeVisibleFraction` の閾値 0.8 を見直し:
     - 2000+ノードでは 0.95 に引き上げ (ほぼ全ノード表示を優先)
     - ノード数に応じた動的閾値にする
  
  3. テスト追加 (graph-helpers-kaizen.test.ts):
     - 外れ値ノードがある場合のフィット結果
     - 2000ノードの偏在分布でvisibleFraction >= 0.95 を検証
  
  すべて純粋関数のみの変更。GVCには触らない。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
