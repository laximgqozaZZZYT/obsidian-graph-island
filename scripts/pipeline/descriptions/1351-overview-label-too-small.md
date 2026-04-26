---
priority: high
reported: 2026-04-26
status: pending
source: user
summary: 全体図 (zoom-out / autoFit 状態) のときラベルフォントが小さすぎて読めない
---

## Description

ユーザー報告 (2026-04-26 20:38 JST):
> 「全体図のときのフォントが小さすぎて読めません。」

「全体図」= 全ノードが表示されるレベルまで zoom-out した状態 (典型は autoFit / zoom-to-fit 直後)。
このときに描画されるラベルがフォント小さすぎて読めない問題。

### 関連コード/設定 (調査の起点)

- **`src/views/LabelManager.ts`**
  - `selectLabelMode()` — zoom level からラベル表示モード選択
  - `smartTruncateLabel()` — 文字数省略
  - `computePriorityScores()` — 表示優先度

- **`src/views/RenderPipeline.ts`** — LOD logic, label culling
- **`src/types.ts` の `RenderThresholds`**
  - `labelMinNonSuper` (default ~0.2) — 非ズーム時の最小値
  - `labelMaxChars` (default 0) — 最大文字数
  - `labelFadeRate` (default 0.15)
  - `gridLabelFontSizeMin/Max/Base` = 7 / 13 / 11
  - `timelineAxisLabelFontSize` = 9
  - `edgeLabelFontSize` = 10

- **autoFit 周辺** (`src/types.ts` 916–930)
  - `autoFitMinScale`、`autoFitBasePadding`、`autoFitVisibleSmall/Large`

### 過去の関連作業
- task `#1279-1276-zoom-aware-labelminnonsuper-zoom-out` (done)
- task `#1280-1276-zoom-aware-diversity-guarantee` (done)
- task `#1275-1260-labelmanager-priority-n` (done)
- memory: `project_lod_spec_v21.md` — LOD ティア仕様

→ 過去に zoom-aware の調整を行ったが、全体図時のフォントサイズ自体が小さすぎる症状が残存。

### 仮説 (autonomous decompose の起点)

1. **静的フォントサイズ × 描画 scale** で zoom-out 時に **screen-pixel ベースで小さくなりすぎる** 可能性
   → 解決方向: zoom 倍率の逆数を fontSize に乗じて screen-px 一定に保つ
2. **labelMinNonSuper = 0.2** が低すぎ、超ズーム時に殆どのラベル alpha=0 → 表示数自体が減る
   → 解決方向: 全体図時は最低 N 個 (super-only) でも 12-14px で描画
3. **labelMaxChars 制限** で長文が切られ、結果として読みづらいだけ (本質はサイズではない可能性)

## Acceptance criteria

- [ ] 全体図 (autoFit 直後) で **ラベルが screen px で 12 以上** 描画されること (super node のみで OK)
- [ ] zoom level に応じて fontSize が動的に決まる (RenderThresholds 経由、ハードコード禁止)
- [ ] 既存の LOD ティア (`project_lod_spec_v21.md`) と整合
- [ ] CDP 計測で zoom=fit 状態のラベル平均 px サイズを記録 (regression テスト用)
- [ ] memory `project_lod_spec_v21.md` に「全体図時の最低読取性ティア」を追記

## Notes

- ユーザー issue → priority=high
- 旧 task 1279/1280 で対応済のはずが症状残存 → 別箇所 (autoFit / fontSize 計算) の問題
- 1 task = 1 仮説 で decompose 可能
