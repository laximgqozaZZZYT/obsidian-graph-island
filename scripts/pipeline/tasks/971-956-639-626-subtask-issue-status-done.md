---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 956-928-639-626-subtask-issue-pending-done-git-m
depends: none
summary: 639-626 subtask issue を特定し status を done に書換
---

## Description (subtask of 956-928-639-626-subtask-issue-pending-done-git-m)

1. `Glob issues/pending/*639-626*subtask*.md` で対象ファイルを特定
     - 0件: `Glob issues/done/*639-626*subtask*.md` を確認、該当すれば no-op で exit 0
     - 複数件: 中止して報告
     - 1件: 次へ
  2. Read で対象ファイルを開く
  3. Edit で frontmatter の `status: in-progress` または `status: pending` の1行のみを `status: done` に置換
  4. 他の frontmatter / Description 本文は一切変更しない
  制約: src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs, God Object 4ファイルは触らない。issues/ 配下のみ。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
