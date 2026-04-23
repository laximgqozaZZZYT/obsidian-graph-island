---
priority: high
reported: 2026-04-24
status: done
source: decomposed
parent: 1161-140-panelbuilder-createdefaultpanel-179
depends: none
summary: panel-defaults.ts を新規作成し DEFAULT_* 定数と createDefaultPanelState を export
---

## Description (subtask of 1161-140-panelbuilder-createdefaultpanel-179)

src/views/PanelBuilder.ts:398-577 の createDefaultPanel 関数本体を読み取り、
  以下を新規ファイル src/views/panel-defaults.ts に純粋な定数/ファクトリとして抽出する:
    - DEFAULT_FILTER_STATE: フィルター関連の初期値オブジェクト
    - DEFAULT_DISPLAY_STATE: 表示関連の初期値オブジェクト
    - DEFAULT_LAYOUT_STATE: レイアウト関連の初期値オブジェクト
    - DEFAULT_TOOLBAR_STATE: ツールバー関連の初期値オブジェクト
    - createDefaultPanelState(): 上記4つを spread して1つの PanelState を返す純粋関数
  型は既存の src/types.ts の PanelState (または関連型) を再利用する。
  副作用なし・Obsidian API 依存なしの純粋モジュールにすること。
  このサブタスクでは PanelBuilder.ts は変更しない (読むだけ)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
