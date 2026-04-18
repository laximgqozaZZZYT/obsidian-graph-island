---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1026-1014-639-626-subtask-status-done
depends: none
summary: 639-626 subtask ファイルの status を in-progress → done に置換
---

## Description (subtask of 1026-1014-639-626-subtask-status-done)

1. Glob `issues/pending/*639-626*subtask*.md` で対象ファイルを1件特定。
     - 0件 or 2件以上ならエラー報告して中断。
  2. Read で先頭 30 行程度を読み、フロントマター内に `status: in-progress` が1行だけ存在することを確認。
     - 既に `status: done` なら no-op で正常終了 (親 issue へ完了報告)。
     - `status:` 行が無い、または他の値の場合は中断しユーザーへ報告。
  3. Edit (replace_all=false) で `status: in-progress` → `status: done` に置換。
  4. `git status --short` で変更が当該1ファイルのみか確認。他に変更があれば中断。
  5. `git diff -- <file>` で以下を検証:
     - frontmatter の `status:` 行のみが変更
     - priority / reported / source / parent / depends / summary / Description 本文が完全一致で保持
  6. 検証通過後にコミット。メッセージ例: `chore: done 1026-1014-639-626-subtask-status-done`

  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は触らない
  - God Object 4ファイルは触らない (src/views/GraphViewContainer.ts 他)
  - git mv / ファイルリネームは行わない (別 issue 1015 系)
  - issues/ 配下の当該1ファイルのみ編集

  受け入れ基準:
  - 対象ファイルの status が `done`
  - 他フィールド・本文が完全一致で保持
  - `git diff` が status 行1行のみの差分

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
