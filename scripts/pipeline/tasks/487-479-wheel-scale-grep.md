---
priority: high
reported: 2026-04-17
status: in-progress
source: decomposed
parent: 479-475-wheel-handler-scale
depends: none
summary: wheel ハンドラと scale 代入箇所を grep で特定
---

## Description (subtask of 479-475-wheel-handler-scale)

src/views/GraphViewContainer.ts を対象に以下を調査（コード変更なし）:
  - `registerDomEvent.*wheel` / `addEventListener.*wheel` / `'wheel'` を Grep で検索し、wheel ハンドラの開始・終了行番号を特定
  - ハンドラ内の `deltaY` 使用箇所と、`this.scale` / `this.zoom` / `ws` 等ズーム相当フィールドへの代入式を抽出（例: `this.scale *= Math.exp(-e.deltaY * k)`）
  - 既存のクランプ処理（`Math.max` / `Math.min` / `RenderThresholds.MIN_ZOOM` / `MAX_ZOOM` 等）の有無と式を抽出
  - 結果を tasks/ 配下の report ファイル（例: `tasks/wheel-scale-investigation.md`）に以下形式で記録:
    - ハンドラ位置: `src/views/GraphViewContainer.ts:開始行-終了行`
    - 現在の scale 更新式（コード抜粋付き）
    - 既存クランプ処理の有無と式
    - computeZoomStep への置き換え時に注意すべき副作用候補（ズーム中心補正、カーソル位置補正など）

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
