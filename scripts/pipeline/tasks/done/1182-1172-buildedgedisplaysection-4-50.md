---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1172-1167-buildedgedisplaysection-4
depends: none
summary: buildEdgeDisplaySection を4ヘルパー呼び出しの薄いラッパー (<50行) に置換
---

## Description (subtask of 1172-1167-buildedgedisplaysection-4)

`src/views/panel-sections-display.ts` の `buildEdgeDisplaySection` (L19-330) を
  以下の手順で薄いラッパー実装に置換する。

  **手順 1**: ファイル冒頭に import を追加
  ```ts
  import {
      buildEdgeStyleControls,
      buildEdgeLabelControls,
      buildEdgeColorControls,
      buildEdgeVisibilityControls,
  } from "./panel-sections-edge-display";
  ```

  **手順 2**: `buildEdgeDisplaySection` 本体を以下に完全置換 (既存の L19-330 のロジックは全削除)
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

  **配置ルール厳守**:
  - Basic 部分 (buildSection 直下): `buildEdgeStyleControls` のみ (ラベル系スライダー含む)
  - Advanced 部分 (addAdvancedGroup 内): 色 → ラベルトグル → 可視性 の順
  - `buildEdgeLabelControls` は showEdgeLabels トグル単体 (スライダーは Style 側)

  **不要になる import の削除**:
  置換後に未使用になる import (Setting, 個別の定数/ヘルパー等) を削除する。
  ESLint の `no-unused-vars` が検出するので `pnpm lint` で確認。

  **検証** (全て必須):
  1. `pnpm build` — esbuild 成功、main.js 生成
  2. `pnpm lint` — ESLint エラーなし
  3. `pnpm test -- panel` — panel 関連テスト全パス
  4. 新規 buildEdgeDisplaySection 関数が 50 行未満であること

  **受入基準**:
  - [ ] buildEdgeDisplaySection が <50行 の薄いラッパーになっている
  - [ ] 4ヘルパー (`buildEdgeStyleControls`/`Label`/`Color`/`Visibility`) が正しい順序で呼ばれている
  - [ ] Basic/Advanced 配置ルールが守られている
  - [ ] 元のロジック (L19-330) が完全に削除されている
  - [ ] `pnpm build` / `pnpm lint` / `pnpm test -- panel` が全てパス
  - [ ] God Object ファイル (`PanelBuilder.ts` 等) の行数は増えていない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
