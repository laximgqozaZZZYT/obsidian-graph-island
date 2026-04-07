---
priority: medium
reported: 2026-04-07
status: pending
source: decomposed
parent: 041-panelbuilder-decompose
depends: none
summary: subtask
---

## Description (subtask of 041-panelbuilder-decompose)

パターンが分かりました。各セクションの行数を整理します。

**セクション別行数の整理：**

| 関数 | 行範囲 | 行数 | 依存の深さ |
|------|--------|------|-----------|
| `_buildEdgeDisplaySection` | 1700-2007 | ~307行 | 浅い (panel + cb.markDirty) |
| `_buildSettingsActionButtons` | 2124-2265 | ~141行 | 浅い (preset import/export) |
| `_buildNodesTab` | 2270-2585 | ~315行 | やや深い (ローカル型DirNode, Menu) |
| `_buildNodeDisplaySection` + helpers | 1367-1698 | ~331行 | 浅い |
| `buildFilterTab` | 1244-1366 | ~122行 | 浅い |

---

`★ Insight ─────────────────────────────────────`
- **God Object 分解の優先順位**: 行数が大きく依存が浅いものから抽出するのが最も安全。`_buildEdgeDisplaySection` (307行) と `_buildNodesTab` (315行) が最大の削減効果を持つ
- **既存パターン**: `panel-sections-filter.ts` が `PanelBuilder.ts` から型を import し、`buildSection`/`ensureRT` をre-importする形式。この慣例に従えば型変更不要
- **自律パイプラインの制約**: max-turns 30 で1セクション抽出+テスト追加が現実的な上限。2セクション以上は別タスクに分ける
`─────────────────────────────────────────────────`

---

以下がタスク分解結果です：

---

**

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
