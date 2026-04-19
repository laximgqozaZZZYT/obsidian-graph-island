---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 740-723-subtask
depends: none
summary: issue status=done への更新とファイル移動を単一コミットで実施
---

## Description (subtask of 740-723-subtask)

対象issueファイルに対し、以下を**単一コミット**で実行する:

  1. frontmatter の `status:` を現在値から `done` に変更
  2. `git mv` で `.claude/issues/pending/<file>.md` → `.claude/issues/done/<file>.md` に移動
     (実際のディレクトリ構成はリポジトリの慣習に従う — pending/done 以外に in-progress/closed など別名の場合はそれに合わせる)
  3. `git add` 済みの状態で 1コミットにまとめる
     (frontmatter編集と mv を別コミットにすると rename類似度が閾値を下回り、履歴上は delete+add となって追跡が切れる)

  Acceptance:
  - `git log --follow --name-status` で rename (R) として検出される
  - frontmatter の status が done になっている
  - `pnpm test` が通る (テスト変更は不要、コード変更なしのため基本影響なし)
  - CLAUDE.md の GOD OBJECT / forbidden patterns に抵触しない (コード変更なし)

  注意:
  - 対象issueファイルのパスは、パイプライン実行時の実パスを確認してから実施
  - 本タスクはコード変更を含まないため lint / coverage 閾値には影響しない
  - commit message 例: `chore(issue): mark 723-712-639-626 subtask as done and move to done/`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
