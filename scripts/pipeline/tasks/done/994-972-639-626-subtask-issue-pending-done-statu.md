---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 972-956-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を pending→done に移動し status を書き換える
---

## Description (subtask of 972-956-639-626-subtask-issue-pending-done-git-m)

1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイルを特定
     - 0件 → `Glob issues/done/*639-626*subtask*.md` で確認。既に移動済みなら no-op (exit 0)
     - 2件以上 → 中止してユーザーに報告
  2. Read で対象ファイルを開き、現在の status 値 (`pending` または `in-progress`) を確認
  3. Edit で frontmatter の `status:` 行のみを `status: done` に置換
     - 他の frontmatter フィールド (priority/reported/source/parent/depends/summary) は一切変更しない
     - Description 本文も変更しない
  4. Bash で `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行
  
  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs, God Object 4ファイルは触らない
  - 対象は issues/ 配下のみ
  - lint / test / build は実行不要

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
