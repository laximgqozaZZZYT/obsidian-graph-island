---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1159-140-panel-sections-display-ts-buildedgedispl
depends: subtask-2
summary: panel-sections-edge-display のユニットテスト追加
---

## Description (subtask of 1159-140-panel-sections-display-ts-buildedgedispl)

新規テスト `tests/views/panel-sections-edge-display.test.ts` を作成し、
  subtask-1 で抽出した4関数の基本挙動を固定する。

  テスト方針 (既存の `tests/views/panel-sections-*.test.ts` のパターンに合わせる):
  - jsdom 環境で `document.createElement("div")` を body として渡す
  - モック `PanelState` (最小限のフィールド)、モック `cb: PanelCallbacks`
    (`markDirty`, `rebuildPanel`, `announceA11y`, `invalidateDataKeepPanel` を jest.fn)
  - 各関数呼び出し後に:
    - body.children.length が 0 より大きいことを検証
    - 特定トグル/スライダーのクリックで `cb.markDirty` が呼ばれることを検証

  最低テストケース (計 8 件程度):
  1. buildEdgeStyleControls: 要素が追加される
  2. buildEdgeStyleControls: showArrows トグルで markDirty が呼ばれる
  3. buildEdgeLabelControls: showEdgeLabels トグルで markDirty が呼ばれる
  4. buildEdgeColorControls: colorEdgesByRelation トグルで rebuildPanel が呼ばれる
  5. buildEdgeColorControls: edgeDirectionFilter セレクトで markDirty が呼ばれる
  6. buildEdgeVisibilityControls: edgeTypeCounts={link:5} で link トグルが表示される
  7. buildEdgeVisibilityControls: count=0 の edge type は非表示 (similar以外)
  8. buildEdgeVisibilityControls: Solo ボタンクリックで markDirty + rebuildPanel

  既存 mock (`tests/__mocks__/obsidian.ts`) と i18n の `t()` 挙動を利用。
  カバレッジ閾値を下げないこと (現状 S28.67% 以上)。

  検証:
  - `pnpm test tests/views/panel-sections-edge-display.test.ts` が全てPASS
  - `pnpm test` 全体で regression なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
