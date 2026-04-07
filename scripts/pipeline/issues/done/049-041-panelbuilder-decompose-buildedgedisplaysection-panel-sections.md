---
priority: high
reported: 2026-04-07
status: done
source: decomposed
parent: 041-panelbuilder-decompose
depends: none
summary: _buildEdgeDisplaySection を panel-sections-display.ts に抽出
---

## Description (subtask of 041-panelbuilder-decompose)

1. src/views/panel-sections-display.ts を新規作成
  2. PanelBuilder.ts の _buildEdgeDisplaySection (L1700-L2007, ~307行) を移動
  3. 既存パターン (panel-sections-filter.ts) に倣い:
     - PanelState, PanelCallbacks, PanelContext 型を PanelBuilder.ts から import
     - ensureRT, buildSection を PanelBuilder.ts から import
     - mergeRenderThresholds を types.ts から import
     - addSlider, addToggle, addSelect, addAdvancedGroup を panel-widgets.ts から import
     - t, tHelp を i18n.ts から import
  4. PanelBuilder.ts に import 文を追加し、buildDisplayTab 内の呼び出しを維持
  5. export function buildEdgeDisplaySection(...) にリネーム (private prefix 除去)
  6. pnpm test && pnpm lint で全グリーン確認
  7. tests/views/panel-sections-display.test.ts を新規作成:
     - buildEdgeDisplaySection が container 内にエッジ設定スライダーを生成することを検証 (最低3ケース)
     - arrows toggle / edge opacity slider / fade toggle の存在確認
```

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
