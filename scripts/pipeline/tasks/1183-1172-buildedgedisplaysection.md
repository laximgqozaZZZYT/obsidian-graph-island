---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1172-1167-buildedgedisplaysection-4
depends: none
summary: buildEdgeDisplaySection を薄いラッパー実装に置換
---

## Description (subtask of 1172-1167-buildedgedisplaysection-4)

`src/views/panel-sections-display.ts` の `buildEdgeDisplaySection` (L19-330 の約310行) を、
  4ヘルパー (buildEdgeStyleControls / buildEdgeLabelControls / buildEdgeColorControls /
  buildEdgeVisibilityControls) 呼び出しのみの <50 行ラッパー実装に置換する。

  具体手順:
  1. ファイル冒頭に import を追加:
     ```ts
     import {
         buildEdgeStyleControls,
         buildEdgeLabelControls,
         buildEdgeColorControls,
         buildEdgeVisibilityControls,
     } from "./panel-sections-edge-display";
     ```
  2. `buildEdgeDisplaySection` 本体を以下に置換 (既存 L19-330 の実装を全削除):
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
     - Basic (buildSection 直下): buildEdgeStyleControls のみ (ラベル系スライダー含む)
     - Advanced (addAdvancedGroup 内): 色 → ラベルトグル → 可視性 の順
  4. 元の buildEdgeDisplaySection 内ロジックはすべて削除 (4ヘルパーに完全移譲済み)。

  検証:
  - `pnpm build` が成功
  - `pnpm lint` パス

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
