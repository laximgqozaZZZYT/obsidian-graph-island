---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1064-1048-issues-1014-993-subtask-md-done
depends: none
summary: issues/1014-993-subtask.md を done 状態に遷移してコミット
---

## Description (subtask of 1064-1048-issues-1014-993-subtask-md-done)

`issues/1014-993-subtask.md` に対して以下の編集を1セッション内で完了する:

  1. Read tool で `issues/1014-993-subtask.md` を読み、現在の内容を確認する
  2. Edit tool でフロントマター内の `status: in-progress` を `status: done` に書き換える (単一マッチ想定)
  3. Edit tool で `- [ ]` を `- [x]` に `replace_all: true` で全置換する (Acceptance criteria のチェックボックス)
  4. `git mv` は使用せず、ファイル名・パスは変更しない
  5. 他ファイル (コード・テスト・設定等) は一切編集しない
  6. Bash tool で以下を順次実行:
     - `git add issues/1014-993-subtask.md`
     - `git commit -m "chore: done 1014-993-subtask.md"`
  7. テスト・ビルド・デプロイは不要 (ドキュメント変更のみ、CLAUDE.md の品質ゲートには非該当)

  完了判定:
  - ファイルの frontmatter が `status: done` になっている
  - Acceptance criteria セクションの全チェックボックスが `[x]` になっている
  - 単独コミット `chore: done 1014-993-subtask.md` が作成されている
  - 他ファイルの差分が存在しない (`git status` でクリーン)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
