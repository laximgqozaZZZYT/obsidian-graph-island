---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1172-1167-buildedgedisplaysection-4
depends: none
summary: buildEdgeDisplaySection を4ヘルパー呼び出しの薄いラッパーに置換
---

## Description (subtask of 1172-1167-buildedgedisplaysection-4)

`src/views/panel-sections-display.ts` の `buildEdgeDisplaySection` (L19-330) を
  薄いラッパー (<50行) に置換する。

  手順:
  1. ファイル冒頭に import を追加:
     ```ts
     import {
         buildEdgeStyleControls,
         buildEdgeLabelControls,
         buildEdgeColorControls,
         buildEdgeVisibilityControls,
     } from "./panel-sections-edge-display";
     ```

  2. `buildEdgeDisplaySection` の本体 (L19-330) を完全に以下に置換:
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

  3. 元の buildEdgeDisplaySection 内ロジック (L19-330 の旧実装) は完全削除。
     4ヘルパーに移譲済みのため、重複コードを残さない。

  4. Basic/Advanced 配置ルール厳守:
     - Basic (buildSection 直下): `buildEdgeStyleControls` のみ
     - Advanced (addAdvancedGroup 内): Color → Label → Visibility の順
     - buildEdgeLabelControls は showEdgeLabels トグル単体
     - スライダー類は Style 側に含まれる (subtask-1 完了済み前提)

  5. 使わなくなった import や helper 関数 (もし旧実装専用のものがあれば) を削除。
     ただし 4ヘルパー側で使用されている可能性があるので、削除前に grep で他参照を確認。

  検証:
  - `pnpm build` 成功
  - `pnpm lint` パス
  - `pnpm test -- panel` で panel 関連テスト全パス
  - 行数確認: buildEdgeDisplaySection は <50行

  GOD OBJECT Policy 遵守:
  - `panel-sections-display.ts` の行数は純減する (約310行削減)
  - 新規ファイル作成なし (4ヘルパーは既存の panel-sections-edge-display.ts)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
