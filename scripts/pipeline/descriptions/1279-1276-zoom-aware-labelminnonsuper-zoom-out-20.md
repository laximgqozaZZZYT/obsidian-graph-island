## Description (subtask of 1276-visual-regression)

visual-report.ts の LOD-aware スコアと整合させる。
  
  1. src/types.ts の `RenderThresholds` インターフェースに以下のフィールドを追加し、`DEFAULT_RENDER_THRESHOLDS` に既定値を入れる:
     - `labelMinNonSuperZoomedOut?: number` (default: 20) — zoom < `labelMinNonSuperZoomThreshold` のときに使う最低 non-super ラベル数
     - `labelMinNonSuperZoomThreshold?: number` (default: 0.2) — この zoom 未満で「拡大版の最低数」を適用
  2. src/views/LabelManager.ts の `_promoteDiversityNodes` を以下のロジックに変更:
     ```
     const zoom = this.host.getWorldScale();
     const baseMin = rt.labelMinNonSuper ?? 5;
     const zoomedOutMin = rt.labelMinNonSuperZoomedOut ?? 20;
     const threshold = rt.labelMinNonSuperZoomThreshold ?? 0.2;
     const effectiveMin = zoom < threshold ? Math.max(baseMin, zoomedOutMin) : baseMin;
     const targetRegulars = Math.max(effectiveMin, Math.ceil(eligibleSuper * 0.5));
     ```
  3. `_promoteDiversityNodes` 内の hardcoded `5` を取り除き、上記 `effectiveMin` を使用する。
  
  CLAUDE.md ポリシーに従い、20 や 0.2 等の数値はすべて `RenderThresholds` 経由で取得すること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
