---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1064-1048-issues-1014-993-subtask-md-done
depends: none
summary: issues/1014-993-subtask.md を status: done に遷移してコミット
---

## Description (subtask of 1064-1048-issues-1014-993-subtask-md-done)

`issues/1014-993-subtask.md` の1ファイルのみを編集する。

  1. Edit tool で frontmatter の `status: decomposed` を `status: done` に書き換える
  2. Edit tool (replace_all=true) で Acceptance criteria セクションの `- [ ]` を `- [x]` に全置換する
  3. ファイルパスは据え置き (`git mv` 禁止)
  4. 他ファイル編集禁止
  5. `git add issues/1014-993-subtask.md && git commit -m "chore: done 1014-993-subtask.md"` で単独コミット
  6. テスト/ビルド/デプロイ不要 (ドキュメントのみの変更で品質ゲートに影響しない)

  完了条件:
  - frontmatter が `status: done` になっている
  - Acceptance criteria のチェックボックスが全て `[x]` になっている
  - 単独コミットが作成されている

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
