---
priority: high
reported: 2026-04-24
status: pending
source: decomposed
parent: 1170-1164-buildnodestab-ctx-4-40
depends: subtask-1
summary: _buildNodesTab 本体を ctx + 4関数呼び出しに置換
---

## Description (subtask of 1170-1164-buildnodestab-ctx-4-40)

PanelBuilder.ts:1624-1942 の _buildNodesTab メソッド本体を以下の構造に完全置換する。

  1. メソッドの先頭で NodesTabContext オブジェクトを構築:
     const ctx: NodesTabContext = {
       panel,
       handlers: {
         onXxx: this._onXxx.bind(this),
         ... (subtask-1で定義された全 handler を bind)
       },
       t,
       settings: this.plugin.settings,
     };
  2. 既存の inline コード(約300行、filter/degree/label/visual の4領域) を完全削除。
  3. 代わりに以下4関数を順に呼び出す:
     - buildNodesFilterSection(tabEl, panel, ctx)
     - buildNodesDegreeSection(tabEl, panel, ctx)
     - buildNodesLabelSection(tabEl, panel, ctx)
     - buildNodesVisualSection(tabEl, panel, ctx)
  4. メソッド本体(波括弧内)は **<40行を厳守**。
  5. 置換後 `pnpm build` が成功すること、`pnpm test` がグリーンであることを確認。
  6. God Object ポリシーに従い、PanelBuilder.ts の総行数が 2216 を超えないこと。`wc -l src/views/PanelBuilder.ts` で検証。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
