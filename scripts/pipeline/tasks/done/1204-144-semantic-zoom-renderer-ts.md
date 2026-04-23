---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 144-coverage-drop
depends: none
summary: semantic-zoom-renderer.ts のヘルパー関数テスト追加
---

## Description (subtask of 144-coverage-drop)

src/views/semantic-zoom-renderer.ts (213行・未テスト) を Read し、
  純関数 (LOD閾値判定、スクリーンサイズ計算、ティア分類など) を抽出。
  
  tests/views/semantic-zoom-renderer.test.ts を新規作成し、tests/canvas-graphics.test.ts や
  tests/render-pipeline.test.ts のモックパターンを参考に CanvasGraphics と RenderHost のモックを構築。
  
  最低 8 件のテスト:
  - dotPx / compactPx / fullPx 各境界値で Tier 1-4 が正しく選択される (4件)
  - screenPx 計算 (worldScale x radius) の正しさ (2件)
  - 空 pixiNodes / 単一ノードのスモーク (2件)
  
  ヘルパーが non-export の場合は、メイン renderer 関数の挙動を gfx.clear/drawCircle 等の vi.fn() 呼び出し回数で検証。
  
  期待: 関数 ~4件 + statements ~100行カバー

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
