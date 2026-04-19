---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1089-1068-639-626-subtask-status-in-progress-done
depends: none
summary: 対象ファイルを特定し frontmatter を検証
---

## Description (subtask of 1089-1068-639-626-subtask-status-in-progress-done)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを検索
     - 0件/2件以上ならエラー報告して中断（コミットしない）
  2. 特定した1ファイルを Read し、先頭30行の frontmatter を検証:
     - `status: cancelled` 行が1行だけ存在することを確認
     - 既に `status: done` なら no-op で正常終了（コミットしない）
     - `status:` 行が無い or 他の値なら中断して報告
  3. 対象ファイル名を

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
