---
priority: medium
reported: 2026-04-07
status: in-progress
source: decomposed
parent: 041-panelbuilder-decompose
depends: subtask-2
summary: _buildSettingsActionButtons を panel-sections-settings.ts に抽出
---

## Description (subtask of 041-panelbuilder-decompose)

1. src/views/panel-sections-settings.ts を新規作成
  2. PanelBuilder.ts の _buildSettingsActionButtons (L2124-L2265, ~141行) を移動
  3. 依存:
     - PanelState, PanelCallbacks, PanelContext 型を import
     - createDefaultPanel を PanelBuilder.ts から import
     - exportPreset, importPreset, exportPresetDiff, applyPreset, PresetMigrationInfo を preset 関連モジュールから import
     - t を i18n.ts から import
     - showToast, asObsidianWindow を適切なモジュールから import
  4. export function buildSettingsActionButtons(...) としてエクスポート
  5. buildSettingsTab 内の呼び出しを更新
  6. pnpm test && pnpm lint で全グリーン確認
  7. tests/views/panel-sections-settings.test.ts を新規作成 (最低3ケース):
     - Save/Reset ボタンの生成
     - Export/Import ボタンの生成
     - テンプレートセクションの条件付き表示
```

---

**依存グラフ:**
```
subtask-1 (edge display, 307行削減)
    ↓
subtask-2 (nodes tab, 315行削減)  
    ↓
subtask-3 (settings actions, 141行削減)
```

**依存を直列にした理由**: 各タスクが PanelBuilder.ts の import 文とファイル構造を変更するため、マージコンフリクト回避のために順序実行。ただし subtask-1 が完了すれば subtask-2 と subtask-3 は並列実行も可能（変更範囲が重複しないため）。

**合計削減見込み**: ~763行 (2945 → ~2182行)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
