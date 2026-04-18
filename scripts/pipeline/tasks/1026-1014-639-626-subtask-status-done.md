---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1014-992-issues-pending-639-626-subtask-md-status
depends: none
summary: 639-626 subtask ファイルの status を done に置換
---

## Description (subtask of 1014-992-issues-pending-639-626-subtask-md-status)

1. Glob で `issues/pending/*639-626*subtask*.md` を検索し、対象ファイルを1つ特定する
  2. Read でフロントマター先頭を確認し、`status: in-progress` が1行のみ存在することを検証
  3. Edit (replace_all=false) で `status: in-progress` → `status: done` に置換
  4. Bash `git status --short` で変更が当該1ファイルのみであることを確認
  5. Bash `git diff <file>` で frontmatter の status 行のみが変更されていること、priority/reported/source/parent/depends/summary と Description 本文が完全一致で保持されていることを確認

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object 4ファイルは触らない
  - git mv / ファイルリネームは行わない (別 issue)
  - issues/ 配下の当該1ファイルのみ編集

  受け入れ基準:
  - 対象ファイルの status が `done`
  - 他フィールド・本文が完全一致で保持
  - ソースコード無変更のため pnpm test / pnpm lint は影響なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
