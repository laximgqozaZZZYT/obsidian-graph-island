---
priority: high
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 041-panelbuilder-decompose
depends: subtask-1
summary: _buildNodesTab を panel-sections-nodes.ts に抽出
---

## Description (subtask of 041-panelbuilder-decompose)

1. src/views/panel-sections-nodes.ts を新規作成
  2. PanelBuilder.ts の _buildNodesTab (L2270-L2585, ~315行) を移動
     - 内部の DirNode インターフェース、renderDir, countFiles, collectDirIds もまとめて移動
  3. 依存:
     - PanelState, PanelCallbacks, PanelContext, NodeTreeEntry 型を import
     - _getNodeDirStates, _saveNodeDirStates を PanelBuilder.ts から import
     - Menu を obsidian から import
     - t を i18n.ts から import
     - asObsidianWindow を適切なモジュールから import
  4. export function buildNodesTab(...) としてエクスポート
  5. PanelBuilder.ts の TAB_DEFS 内 nodes タブのビルダー参照を更新
  6. pnpm test && pnpm lint で全グリーン確認
  7. tests/views/panel-sections-nodes.test.ts を新規作成 (最低3ケース):
     - ディレクトリツリー構築の検証
     - フィルタ入力の動作
     - CSV export ボタンの存在確認
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
