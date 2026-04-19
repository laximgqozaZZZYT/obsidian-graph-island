---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 1159-140-panel-sections-display-ts-buildedgedispl
depends: none
summary: panel-sections-edge-display.ts を新規作成し、4つのヘルパー関数を抽出
---

## Description (subtask of 1159-140-panel-sections-display-ts-buildedgedispl)

新規ファイル `src/views/panel-sections-edge-display.ts` を作成し、以下4つの
  エクスポート関数を実装する。各関数は `body: HTMLElement`, `panel: PanelState`,
  `cb: PanelCallbacks`, `ctx?: PanelContext` を受け取り、該当するUI要素を body に追加する。

  抽出元は `src/views/panel-sections-display.ts` の `buildEdgeDisplaySection`
  (L19-330) 内のロジックで、内容を改変せずそのまま移送する:

  1. `buildEdgeStyleControls(body, panel, cb)` — L29-177 のうち:
     - showArrows / fadeEdgesByDegree トグル (L30-49)
     - globalEdgeAlpha / edgeMinZoom / edgeZoomFadeThreshold /
       edgeFadeMinAlpha / edgeDensityFloor / hoverEdgeFalloff スライダー
     - 注意: edgeLabel系スライダー(L94-121, 138-149) は除外 → ラベル関数へ

  2. `buildEdgeLabelControls(body, panel, cb)` — ラベル関連のみ:
     - edgeLabelZoomHide / edgeLabelZoomFade スライダー (L94-121)
     - edgeLabelFontSize スライダー (L138-149)
     - showEdgeLabels トグル (L192-202)

  3. `buildEdgeColorControls(body, panel, cb)` — advanced内の非トグル系:
     - colorEdgesByRelation トグル (L180-190)
     - edgeLayerMode トグル (L203-212)
     - edgeDirectionFilter セレクト (L213-227)

  4. `buildEdgeVisibilityControls(body, panel, cb, ctx)` — edge-type系:
     - `_edgeToggle` ヘルパ (L229-233)
     - edge type toggle 配列と `edgeTypeCounts` ループ (L234-284)
     - Solo ボタンと `EDGE_TYPE_KEYS` 配列 (L287-323)

  import は元ファイルと同じ (`mergeRenderThresholds`, `t`, `tHelp`, `addSlider` 等)。
  型 `PanelState`, `PanelCallbacks`, `PanelContext` も `./PanelBuilder` からimport。
  `ensureRT` も同様にimport。

  この時点では `panel-sections-display.ts` は変更しない (重複定義状態になるが次のサブタスクで置き換える)。

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
