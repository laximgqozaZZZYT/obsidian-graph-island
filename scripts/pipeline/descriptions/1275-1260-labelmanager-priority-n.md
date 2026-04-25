## Description (subtask of 1260-visual-regression)

visibleLabels が極端ズームアウト時に 6/238 程度になり labelReadability が 50 未満に
  落ちる問題を修正する。

  変更内容:
  1. src/types.ts の RenderThresholds に新フィールドを追加:
       labelMinVisibleFloor: number;  // 0 = 無効, デフォルト 20
     DEFAULT_RENDER_THRESHOLDS にも 20 を設定。コメントで
     「visual-report の labelReadability 50 達成のための priority 上位ラベル下限」と明記。
  2. src/views/LabelManager.ts の _applyDiversityAndCap (line 440 付近) を修正:
     - 既存の visCount カウントロジックは温存。
     - 関数末尾で「visCount < labelMinVisibleFloor かつ candidates が priority 降順
       ソート済み」の場合、未表示 candidate を上から順に
       (label.alpha = baseOpacity, label.visible = true) で点灯させて
       labelMinVisibleFloor 件まで埋める。
     - ただし zoom が rt.labelHardHideZoom 未満（極端ズームアウト）の場合のみ
       適用。通常ズームでは現状維持。
  3. ハードコード値は禁止。すべて RenderThresholds 経由。

  受入条件:
  - visibleLabels が 238 ノード/zoom 0.087 で 20 件以上になる（ロジック上）。
  - 既存テスト (pnpm test) がすべて緑。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
