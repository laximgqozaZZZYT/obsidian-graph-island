---
priority: high
reported: 2026-04-06
status: done
source: decomposed
parent: 015-autofit-viewport-broken
depends: none
summary: autoFitView競合原因の調査とテスト追加
---

## Description (subtask of 015-autofit-viewport-broken)

バグの根本原因を特定し、再現テストを作成する。
  
  1. `computeAutoFitTransform` の純粋関数テストを追加:
     - 2000+ノードが一方向に偏在するケース (x: 0-10000, y: 0-100 のような極端な分布)
     - ノード座標にNaN/Infinityが混入するケース
     - bounding boxが画面比率と極端に異なるケース (幅>>高さ)
  
  2. `ensureViewportUtilization` のテスト追加:
     - _spreadDegenerateAxis が細長い分布を修正するケース
     - scaleFactor 計算が極端な偏りで正しく動作するケース
  
  3. `_autoFocusActiveFile` → `doRender` → autoFitView の再帰的呼び出しパスを
     テストで記録し、autoFitView が最終的に適切に呼ばれることを検証するテスト
  
  テストファイル: tests/autofit-viewport.test.ts (新規)
  既存テスト: tests/graph-helpers-kaizen.test.ts に追加も可

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
