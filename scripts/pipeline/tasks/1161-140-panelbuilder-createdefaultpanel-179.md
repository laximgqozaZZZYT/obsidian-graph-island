---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 140-giant-functions
depends: none
summary: PanelBuilder.createDefaultPanel (179行) を既定値テーブルに分離
---

## Description (subtask of 140-giant-functions)

src/views/PanelBuilder.ts:398-577 の `createDefaultPanel` (179 行) を、
  新規 `src/views/panel-defaults.ts` に以下の純粋な定数/ファクトリに分割:
    - DEFAULT_FILTER_STATE
    - DEFAULT_DISPLAY_STATE
    - DEFAULT_LAYOUT_STATE
    - DEFAULT_TOOLBAR_STATE
    - createDefaultPanelState()  // 上記を結合した純粋関数
  元 `createDefaultPanel` は `createDefaultPanelState()` を返すだけに縮小
  (<20 行)。GOD OBJECT Policy により PanelBuilder.ts の行数を増やさないこと。
  tests/views/panel-defaults.test.ts で各 DEFAULT_* の shape をスナップショット。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
