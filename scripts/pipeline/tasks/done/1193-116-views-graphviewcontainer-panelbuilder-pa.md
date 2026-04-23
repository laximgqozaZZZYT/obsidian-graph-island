---
priority: medium
reported: 2026-04-24
status: done
source: decomposed
parent: 116-scattered-constants
depends: subtask-2
summary: Views系 (GraphViewContainer, PanelBuilder, panel-sections) のSCREAMING_CASE定数を集約
---

## Description (subtask of 116-scattered-constants)

GraphViewContainer.ts (God Object 8580行) と PanelBuilder.ts (2216行) および
  panel-sections/ 配下の SCREAMING_CASE 定数を constants.ts の
  `// === View & Panel Constants ===` セクションに集約。
  最低80個以上を移動。God Object は import 追加で増えない分、
  定数定義削除分だけ行数が減ることを確認 (Max Allowed 遵守)。
  ESLint/Prettier チェックも通すこと。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
