---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 1085-1064-issues-1014-993-subtask-md-status-done
depends: none
summary: issues/1014-993-subtask.md を status: done に遷移して単独コミット
---

## Description (subtask of 1085-1064-issues-1014-993-subtask-md-status-done)

`issues/1014-993-subtask.md` の1ファイルのみを編集する。

  手順:
  1. Read tool で `issues/1014-993-subtask.md` を読み、現在の frontmatter と Acceptance criteria セクションを確認する
  2. Edit tool で frontmatter の `status: in-progress` を `status: done` に書き換える (1箇所のみ)
  3. Edit tool (replace_all=true) で Acceptance criteria セクションの `- [ ]` を `- [x]` に全置換する
  4. `git mv` は禁止、ファイルパスは据え置き
  5. `issues/1014-993-subtask.md` 以外のファイル編集は禁止
  6. `git add issues/1014-993-subtask.md && git commit -m "chore: done 1014-993-subtask.md"` で単独コミットを作成

  完了条件:
  - frontmatter が `status: done` になっている
  - Acceptance criteria のチェックボックスが全て `[x]` になっている
  - 単独コミットが作成されている (他ファイルを巻き込まない)

  注意:
  - ドキュメントのみの変更につき、テスト/ビルド/デプロイは不要
  - God Object には影響しない (issues/ 配下のみ)
  - CLAUDE.md の禁止パターン (location.reload, console.* 等) には該当しない

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
