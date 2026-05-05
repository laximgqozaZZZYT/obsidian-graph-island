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
`src/types.ts:1624` で `labelMinVisibleFloor` が定義されている (現値は同所参照)。
`src/views/LabelManager.ts:509` で `const minFloor = rt.labelMinVisibleFloor ?? 0;` を読み取り、
そのフロア値ぶんは visible になるよう底上げするはず。にも関わらず 6 件しか出ていない →
フロア適用が `labelMinNonSuper` / `labelMinNonSuperZoomedOut` (types.ts:1597-1599) より
**後段** で評価されており、先行フィルタで絞り込んだ後にフロア適用が無効化されている可能性。

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

## Candidate files
- `src/views/LabelManager.ts:499-560, 789` (`_applyTruncation` / `selectLabelMode`)
- `src/views/GraphViewContainer.ts:878-883, 5060-5080, 5557-5570` (`autoFitOnce` / `autoFitMinScale` 復元)
- `src/types.ts:1084-1167, 1597-1624` (RenderThresholds: label* / autoFitMinScale 既定値)
- 計測スクリプト: `scripts/pipeline/visual-analyze.sh`, `e2e/pipeline-screenshots/`
