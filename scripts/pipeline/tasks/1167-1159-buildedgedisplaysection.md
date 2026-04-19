---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 1159-140-panel-sections-display-ts-buildedgedispl
depends: subtask-1
summary: buildEdgeDisplaySection を縮小ラッパーに置き換え
---

## Description (subtask of 1159-140-panel-sections-display-ts-buildedgedispl)

`src/views/panel-sections-display.ts` の `buildEdgeDisplaySection`
  (L19-330) を、subtask-1 で作った4ヘルパーを順番に呼ぶ薄いラッパーに書き換える。

  新しい実装 (<50行):
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

  注意事項:
  - 元の L178 で `addAdvancedGroup(body, (adv) => {...})` で囲まれていたロジックと
    Basic部分の順序を保つ。subtask-1 の `buildEdgeLabelControls` は Basic の一部
    (スライダー) と Advanced の一部 (toggle) を含むため、Basic部分のみ
    `buildEdgeStyleControls` 側で呼び、Advanced部分は別に呼ぶ構成で分離する。
    **より安全な案**: ラベル系Basicスライダーは `buildEdgeStyleControls` に残し、
    `buildEdgeLabelControls` は showEdgeLabels トグル単独にする。
    subtask-1 実装時にこの方針で再構成すること (= ラベル関数はトグルのみ、
    スライダー系はすべてStyle側)。

  - 不要になった import (`addSlider`, `addToggle`, `addSelect`, etc.) が他関数で
    まだ使われていれば残す。未使用になれば削除。
  - 新ヘルパーを冒頭で import 追加:
    `import { buildEdgeStyleControls, buildEdgeLabelControls, buildEdgeColorControls, buildEdgeVisibilityControls } from "./panel-sections-edge-display";`

  検証:
  - `pnpm build` が成功
  - `pnpm lint` パス
  - `pnpm test` で panel 関連テストが全てパス

---

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
