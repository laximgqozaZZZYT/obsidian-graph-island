---
priority: medium
reported: 2026-04-24
status: done
source: decomposed
parent: 116-scattered-constants
depends: subtask-1
summary: Parser/Utils系のSCREAMING_CASE定数を集約
---

## Description (subtask of 116-scattered-constants)

src/parsers/ と src/utils/ 配下のファイルから SCREAMING_CASE 定数を抽出し、
  constants.ts の `// === Parser & Utility Constants ===` セクションに集約。
  最低60個以上を移動。各ファイルで import に置き換え、既存の
  ユニットテスト (graph-filter, query-expr, edge-geometry 等) がすべてPASSすることを確認。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
