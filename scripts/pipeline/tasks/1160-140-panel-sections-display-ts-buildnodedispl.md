---
priority: high
reported: 2026-04-19
status: in-progress
source: decomposed
parent: 140-giant-functions
depends: subtask-2
summary: panel-sections-display.ts の buildNodeDisplaySection (270行) を分割
---

## Description (subtask of 140-giant-functions)

src/views/panel-sections-display.ts:335-605 の `buildNodeDisplaySection`
  (270 行) を、新規ファイル `src/views/panel-sections-node-display.ts` に
  以下として抽出:
    - buildNodeSizeControls(body, panel, cb)
    - buildNodeShapeControls(body, panel, cb)
    - buildNodeLabelControls(body, panel, cb)
    - buildNodeThumbnailControls(body, panel, cb)
  元関数はラッパー (<50 行) に縮小。
  `subtask-2` 完了後に行う (panel-sections-display.ts の編集競合回避)。
  tests/views/panel-sections-node-display.test.ts を追加。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
