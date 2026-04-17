---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 475-473-wheel-handler-scale-computezoomstep
depends: none
summary: wheel handler 内の scale 直接代入箇所を特定・記録
---

## Description (subtask of 475-473-wheel-handler-scale-computezoomstep)

src/views/GraphViewContainer.ts の wheel イベントハンドラ (registerDomEvent or addEventListener で 'wheel' を拾う箇所) を grep で特定する。
  - 検索パターン: `'wheel'`, `deltaY`, `this.scale =` (または `this.zoom =`, `ws =` 等ズーム相当フィールド)
  - 該当ハンドラの開始/終了行番号、現在の scale 更新式 (例: `this.scale *= Math.exp(-e.deltaY * k)`)、既存のクランプ処理 (Math.max/Math.min or RenderThresholds.MIN_ZOOM など) を抽出
  - 調査結果のみ (コード変更なし)。出力は次の

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
