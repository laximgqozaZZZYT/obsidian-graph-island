---
priority: high
reported: 2026-04-19
status: pending
source: decomposed
parent: 140-giant-functions
depends: none
summary: panel-sections-display.ts の buildEdgeDisplaySection (311行) を分割
---

## Description (subtask of 140-giant-functions)

src/views/panel-sections-display.ts:19-330 の `buildEdgeDisplaySection`
  (311 行) を、新規ファイル `src/views/panel-sections-edge-display.ts` に
  以下のヘルパー関数として抽出:
    - buildEdgeVisibilityControls(body, panel, cb)
    - buildEdgeStyleControls(body, panel, cb)
    - buildEdgeColorControls(body, panel, cb)
    - buildEdgeLabelControls(body, panel, cb)
  元 `buildEdgeDisplaySection` はこれらを呼ぶラッパーに縮小 (<50 行)。
  **注意**: `src/views/panel-sections.ts:382-685` にも同名関数があるため、
  panel-sections-display.ts 側のみ変更すること。
  tests/views/panel-sections-edge-display.test.ts を追加し既存挙動を固定。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
