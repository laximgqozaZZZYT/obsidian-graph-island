---
priority: high
reported: 2026-04-16
status: decomposed
source: kaizen
summary: panToNode/_animateToNode/_fadeNodeAlphaのrAFチェーンがキャンセル不可能 — view破棄後も実行継続
---
## Description

以下の3メソッドは `requestAnimationFrame` のチェーンを開始するが、
rAF IDをインスタンス変数に保存しないため、キャンセルが不可能。

### 1. `panToNode` (src/views/GraphViewContainer.ts:7744-7753)
- 匿名 `animate` 関数を rAF チェーンで呼び出し
- rAF ID をどこにも保存しない
- view 閉鎖後も `world.x`, `world.y` への書き込みと `this.markDirty()` を継続
- `world` は `destroyPixi()` で破棄済み → 例外の可能性

### 2. `_animateToNode` (src/views/GraphViewContainer.ts:7950-7964)
- `panToNode` と同じパターン
- さらに `this.setHighlightedNodeId()` と `this.applyHover()` を
  破棄済みの view 上で呼ぶ

### 3. `_fadeNodeAlpha` (src/views/GraphViewContainer.ts:7968-7981)
- **各ノードごと**に独立した rAF チェーンを起動
- 検索フィルタ適用時、全ノード（数百〜数千）に対して呼ばれる
- 同じノードに対して複数の fade が同時進行すると `pn.gfx.alpha` が競合
- rAF ID が保存されないため、進行中の fade をキャンセルして
  新しい fade を開始することができない

### 影響
- view 閉鎖後の rAF コールバックが破棄済みオブジェクトにアクセス
- `_fadeNodeAlpha` の競合で alpha 値が不安定に振動
- 大量ノードでの検索フィルタ変更時、古い fade と新しい fade が混在

## Acceptance criteria
- [ ] `panToNode` / `_animateToNode`: rAF ID をインスタンス変数に保存し、onClose() でキャンセル
- [ ] `_fadeNodeAlpha`: PixiNode ごとに進行中の rAF ID を保持し、再呼び出し時に前回をキャンセル
- [ ] onClose() で全 fade アニメーションをキャンセル
- [ ] 既存テストが全パス
