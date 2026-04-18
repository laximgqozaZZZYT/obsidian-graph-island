---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 723-712-639-626-subtask-issue-status-done-git-mv
depends: none
summary: 639-626 subtask issue を status:done 化して git mv で単一コミット
---

## Description (subtask of 723-712-639-626-subtask-issue-status-done-git-mv)

1. Glob `issues/pending/*639-626*subtask*.md` で対象を特定。
     - 0件なら `issues/done/*639-626*subtask*.md` を Glob して done 済みなら no-op (exit 0)。
     - 複数件なら frontmatter summary が「subtask issueのstatusをdoneに更新しコミット」系のものを選ぶ。曖昧なら中止してユーザー報告。
  2. Read で frontmatter 確認 → Edit で `status: pending` または `status: pending` を `status: done` に書換。他フィールド (priority/reported/parent/depends/summary/source) と本文は変更禁止。
  3. `git mv issues/pending/<filename>.md issues/done/<filename>.md` (edit 済み状態で mv する順序を守る)。
  4. `git status` で差分が「pending 側 delete + done 側 add (= rename) + status フィールドの modify」のみであることを確認。他ファイルに差分があれば即中止。
  5. `git add -A && git commit -m "chore: done <filename>"` (拡張子なしベース名)。
  6. 検証:
     - `git status` がクリーン
     - `git log -1 --pretty=%s` が commit message と一致
     - `ls issues/done/<filename>.md` が存在
  制約:
  - src/**, tests/**, package.json, vitest.config.ts, esbuild.config.mjs は変更禁止
  - lint/test/build 実行不要
  - God Object ファイルに触れない
  - 作業対象は issues/ のみ

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
