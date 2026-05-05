---
priority: high
reported: 2026-04-10
status: pending
source: auto-discovered
summary: visual-regression — labelReadability 3/100 と screenshotReadability 65/100 を回復
---

## Description

`scripts/pipeline/visual-report.json` (force ビュー / nodeCount=238) で 2 軸が基準値を下回っている:

1. **labelReadability = 3 / 100 (critical)**
   - visibleLabels = 6 / 238 (labelRatio = 2.5%)
   - avgFontScale = 6.5 (= labelScaleMax 上限近傍)
   - issue: "Low label visibility"

2. **screenshotReadability = 65 / 100 (warning)**
   - zoomLevel = 0.087 (極端に縮小)
   - emptyRatio = 0.859 (画面 86% が空白)
   - isZoomedToFit = false (auto-fit 効いていない)
   - issue: "86% empty — zoom-to-fit may not be working"

overallScore = 78 だが、上記 2 つの critical/warning を 50 以上に引き上げる必要あり。

## Root cause hypothesis

### labelReadability
`src/types.ts:1624` で `labelMinVisibleFloor: 20` と定義されている。
`src/views/LabelManager.ts:509` で `const minFloor = rt.labelMinVisibleFloor ?? 0;` を読み取り、
最低 20 ラベルが visible になるよう底上げするはず。にも関わらず 6 件しか出ていない →
フロア適用が他のゲート (例: `labelMinNonSuper=40`, `labelMinNonSuperZoomedOut=20` at types.ts:1597-1599) より
**後段** で評価されており、先行フィルタが 6 件まで絞り込んだ後にフロア適用が無効化されている可能性。

### screenshotReadability (zoom=0.087)
`src/views/GraphViewContainer.ts:5560 autoFitOnce()` → `autoFitView(w, h)` が呼ばれているが、
L878-883 周りで `autoFitMinScale` を一時 0 化 → 復元するロジックがあり、その復元が
他の suppress 経路 (L389 "Suppress autoFitView after user-initiated zoom") と競合して
最終 zoom が極端値で固定されている疑い。

## Acceptance criteria

- [ ] `scripts/pipeline/visual-report.json` の `scores[].score` 全項目が 50 以上
- [ ] `overallScore` が 60 以上 (現状 78 を維持または改善)
- [ ] labelReadability: visibleLabels >= 20 (= labelMinVisibleFloor 設計値) を満たす
- [ ] screenshotReadability: emptyRatio < 0.7 もしくは isZoomedToFit = true
- [ ] 既存ユニットテスト全 PASS (`pnpm test`)
- [ ] godobj/coverage/bundle ratchet を破らない

## Suggested decomposition

タスク分解の例 (decompose-issue.sh が同様の粒度で割ること推奨):

1. **task-A: LabelManager フロア適用順序の修正**
   - 対象: `src/views/LabelManager.ts:499-560` (`_applyTruncation` 周辺) と関連 `selectLabelMode` (L789)
   - 変更: `labelMinVisibleFloor` 適用を最後に持っていき、先行ゲート通過後にも floor まで詰め直す
   - 検証: visual-report 再実行で visibleLabels >= 20

2. **task-B: autoFit 復元順序の調整**
   - 対象: `src/views/GraphViewContainer.ts:878-883, 5060-5080, 5557-5570`
   - 変更: `autoFitMinScale` 復元のタイミングと "user-initiated zoom suppress" フラグの干渉を解消
   - 検証: nodeCount=238 で zoom が `autoFitMinScale` (現値) 以上に保たれる

3. **task-C: しきい値再調整 (補助、A/B で改善しない場合のみ)**
   - 対象: `src/types.ts:1597-1624`
   - 変更: `labelMinNonSuperZoomedOut` (現 20) や `labelScalePower` (現 0.4) を再キャリブレーション
   - 注意: ratchet を緩めない範囲で

## References
- 既存 visual-report: `scripts/pipeline/visual-report.json` (timestamp 2026-04-10T12:00:13)
- 計測スクリプト: `scripts/pipeline/visual-analyze.sh`, `e2e/pipeline-screenshots/`
- 関連 RenderThresholds 定義: `src/types.ts:1084-1167, 1597-1624`
