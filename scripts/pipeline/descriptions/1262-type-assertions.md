## Description
as キャストが228箇所。コンパイラの型チェックをバイパスしている。\n可能な限り型ガードや正しい型定義に置換すべき。

### Baseline (2026-04-27, via `scripts/count-type-assertions.sh`)

`grep " as [A-Z]"` の素朴な集計には `import { X as Y }` の named-import alias、`import * as X` の namespace import、多行 import ブロック内の alias 行が混入する。これらを除外した純粋な型アサーション (`expr as Type`) の正確な数:

- **Total: 184**
- Top 10 files:
  - 27 `src/views/GraphViewContainer.ts`
  - 19 `src/views/panel-defaults.ts`
  - 13 `src/views/panel-sections.ts`
  - 8 `src/i18n.ts`
  - 7 `src/views/RenderPipeline.ts`
  - 7 `src/views/ExportManager.ts`
  - 6 `src/views/panel-sections-edge-display.ts`
  - 6 `src/views/edge-draw-config.ts`
  - 6 `src/views/NodeDetailView.ts`
  - 6 `src/views/LayoutController.ts`

再計測: `bash scripts/count-type-assertions.sh` (Top 件数指定: `--top 20`、全件リスト: `--list`)。受け入れ基準 (80 個以下) はこの "純粋カウント" で評価する。

## Acceptance criteria
- [ ] 型アサーションを 80 個以下に
