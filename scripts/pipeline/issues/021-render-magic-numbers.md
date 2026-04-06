---
priority: medium
reported: 2026-04-06
status: in-progress
source: kaizen
summary: render/layout内に50+のインラインマジックナンバー — Forbidden Patterns違反
---

## Description

CLAUDE.md の Forbidden Patterns に明記されている:
> - Hardcoded magic numbers in render/layout logic
> - Bypassing `RenderThresholds` with inline numeric assignments

既存 issue 014 は「SCREAMING_CASE定数がconstants.ts外に散在」だが、本issueは **定数名すら付けられていないインライン数値リテラル** であり、別種の問題。

### 最悪の違反箇所 (優先度順)

**1. Pathfinder overlay** — `GraphViewContainer.ts` lines 4934-4990
- `0.06` (パルス速度), `0.1` (振幅), `0.45`/`0.85` (アルファ範囲)
- ストローク幅 `8`/`3`, ドット半径 `5`, フォントサイズ `11`
- ラベルオフセット `6`/`-14`, ハードコード色 `"#00CED1"`
- → 1メソッド内に **8+個の無名数値**。RenderThresholds カバレッジ **ゼロ**

**2. Group label manager** — `group-label-manager.ts` lines 387-534
- 背景色 `0x2a2a3e`/`0x3a3a5e`/`0x4a4a8e` (ホバー3状態)
- アルファ `0.85`/`0.92`/`0.95`, パディング `10`-`16`, ストローク `3`-`6`
- フォントサイズ `14`, クラスタ塗りアルファ `0.15`, 輪郭アルファ `0.5`
- → グループラベルの全ビジュアルプロパティがハードコード

**3. Link preview** — `GraphViewContainer.ts` lines 2630-2636
- 色 `0x00cccc`, 線幅 `2`/`1.5`, アルファ `0.9`/`0.7`, 円半径 `8`

**4. Node decorations** — `node-decorations.ts` lines 326-492
- ontology backbone: `4`, `0x6366f1`, `0.25` (line 492)
- entropy halo: 彩度 `0.7`, 明度 `0.5`, アルファ `0.15`+`0.2` (lines 421-425)
- recency transition色 `0xf59e0b` (line 341) — RenderThresholdsにない色

**影響**: 視覚調整が必要な場合、開発者はgrepで数値リテラルを探す必要がある。
テーマ対応・ユーザーカスタマイズ・高コントラストモードとの整合性が保証できない。

## Acceptance criteria

- [ ] Pathfinder overlay の数値を名前付き定数に抽出 (最低限ファイルレベル const)
- [ ] group-label-manager の色・アルファ・パディングを定数化
- [ ] node-decorations の `0xf59e0b`, `0x6366f1` 等のハードコード色を RenderThresholds または定数に移行
