---
priority: high
reported: 2026-04-20
status: pending
source: decomposed
parent: 1167-1159-buildedgedisplaysection
depends: subtask-1 (parent: 1159-140)
summary: buildEdgeDisplaySection を4ヘルパー呼び出しの薄いラッパーに置換
---

## Description (subtask of 1167-1159-buildedgedisplaysection)

`src/views/panel-sections-display.ts` の `buildEdgeDisplaySection`
  (L19-330) を以下の薄いラッパー実装 (<50行) に置き換える。

  1. ファイル冒頭に import を追加:
     ```ts
     import {
         buildEdgeStyleControls,
         buildEdgeLabelControls,
         buildEdgeColorControls,
         buildEdgeVisibilityControls,
     } from "./panel-sections-edge-display";
     ```

  2. `buildEdgeDisplaySection` の本体を以下に置換:
     ```ts
     export function buildEdgeDisplaySection(
         tabEl: HTMLElement,
         panel: PanelState,
         _ctx: PanelContext,
         cb: PanelCallbacks,
     ): void {
         buildSection(
             tabEl,
             t("section.displayEdges"),
             (body) => {
                 buildEdgeStyleControls(body, panel, cb);
                 addAdvancedGroup(body, (adv) => {
                     buildEdgeColorControls(adv, panel, cb);
                     buildEdgeLabelControls(adv, panel, cb);
                     buildEdgeVisibilityControls(adv, panel, cb, _ctx);
                 });
             },
             tHelp("help.displayEdges"),
             false,
             "git-branch",
         );
     }
     ```

  3. Basic/Advanced 配置ルール厳守:
     - Basic 部分 (buildSection 直下): `buildEdgeStyleControls` のみ
       → ラベル系スライダーもここに含める (subtask-1 の方針)
     - Advanced 部分 (addAdvancedGroup 内): 色/ラベルトグル/可視性 の順
     - `buildEdgeLabelControls` は showEdgeLabels トグル単体 (スライダーは Style 側)

  4. 元の buildEdgeDisplaySection 内のロジックはすべて削除 (4ヘルパーに完全移譲済み)

  検証:
  - `pnpm build` が成功
  - `pnpm lint` パス
  - `pnpm test -- panel` で panel 関連テスト全パス

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
