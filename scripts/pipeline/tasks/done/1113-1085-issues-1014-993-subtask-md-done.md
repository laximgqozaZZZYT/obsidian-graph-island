---
priority: medium
reported: 2026-04-19
status: cancelled
source: decomposed
parent: 1085-1064-issues-1014-993-subtask-md-done
depends: none
summary: issues/1014-993-subtask.md を done 状態に遷移して単独コミット
---

## Description (subtask of 1085-1064-issues-1014-993-subtask-md-done)

`issues/1014-993-subtask.md` のみを対象とした1セッション完結タスク。

  手順:
  1. Read tool で `issues/1014-993-subtask.md` を読み、frontmatter と Acceptance criteria の現状を確認
  2. Edit tool で frontmatter の `status: cancelled` を `status: done` に書き換える (単一マッチ)
  3. Edit tool で `- [ ]` を `- [x]` に `replace_all: true` で全置換
  4. Bash tool で以下を順次実行:
     - `git add issues/1014-993-subtask.md`
     - `git commit -m "chore: done 1014-993-subtask.md"`
  5. Bash tool で `git status` を実行し、他ファイル差分がないことを確認

  制約:
  - `git mv` は使わず、ファイル名・パスは変更しない
  - 他ファイル (コード・テスト・設定) は一切編集しない
  - テスト・ビルド・デプロイは不要 (ドキュメント変更のみ)
  - `--no-verify` や `--amend` は使用しない (新規コミット作成)

  完了判定:
  - frontmatter が `status: done`
  - Acceptance criteria の全チェックボックスが `[x]`
  - 単独コミット `chore: done 1014-993-subtask.md` が存在
  - `git status` がクリーン (他ファイル差分なし)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
