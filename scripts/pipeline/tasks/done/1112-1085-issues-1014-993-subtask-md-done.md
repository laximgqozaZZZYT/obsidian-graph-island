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

1. Read tool で `issues/1014-993-subtask.md` を読み、現状の frontmatter と Acceptance criteria を確認する
  2. Edit tool で frontmatter の `status: cancelled` を `status: done` に書き換える (単一マッチ)
  3. Edit tool で `- [ ]` を `- [x]` に `replace_all: true` で全置換する
  4. ファイル名・パスは変更しない (`git mv` 不使用)。他ファイルは一切編集しない
  5. Bash tool で順次実行:
     - `git status` で差分が `issues/1014-993-subtask.md` のみであることを確認
     - `git add issues/1014-993-subtask.md`
     - `git commit -m "chore: done 1014-993-subtask.md"`
     - `git status` がクリーンであることを確認
  6. テスト・ビルド・デプロイは不要 (ドキュメント変更のみ、品質ゲート非該当)

  完了判定:
  - frontmatter が `status: done`
  - Acceptance criteria の全チェックボックスが `[x]`
  - 単独コミット `chore: done 1014-993-subtask.md` が作成されている
  - 他ファイルの差分なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
