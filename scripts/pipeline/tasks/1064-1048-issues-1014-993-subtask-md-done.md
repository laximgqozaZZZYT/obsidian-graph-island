---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 1048-1020-1014-993-subtask-issue-done
depends: none
summary: issues/1014-993-subtask.md を done に遷移しコミット
---

## Description (subtask of 1048-1020-1014-993-subtask-issue-done)

`issues/1014-993-subtask.md` に対し以下の編集を行う:

  1. フロントマター `status: decomposed` を `status: done` に書き換え (Edit tool)
  2. Acceptance criteria セクションのチェックボックス `- [ ]` を `- [x]` に全置換 (Edit tool, replace_all)
  3. `git mv` は使わず、ファイルパスは据え置き
  4. 変更範囲は `issues/1014-993-subtask.md` の1ファイルのみ (他ファイル編集禁止)
  5. `git add issues/1014-993-subtask.md && git commit -m "chore: done 1014-993-subtask.md"` で単独コミット
  6. テスト・ビルド・デプロイは不要 (ドキュメント変更のみで CLAUDE.md の品質ゲートに影響しない)

  完了判定: 当該ファイルの frontmatter が `status: done` になり、Acceptance criteria が全て `[x]` になり、コミットが作成されていること。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
