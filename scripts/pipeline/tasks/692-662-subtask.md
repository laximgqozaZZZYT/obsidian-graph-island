---
priority: medium
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 662-658-subtask-issue-done-git-mv
depends: none
summary: subtask
---

## Description (subtask of 662-658-subtask-issue-done-git-mv)

で特定したファイル名を `<filename>` とする。
  2. `git mv issues/pending/<filename>.md issues/done/<filename>.md` を実行。
  3. `git status` で pending 側 delete + done 側 add + status フィールド変更のみになっていることを確認。src/** ほか実装コードへの差分が混入していないことを必須確認。
  4. `git add -A` 後、`git commit -m "chore: done <filename> — GVC test report appended"` でコミット。HEREDOC は不要 (1 行メッセージ)。
  5. 検証: `git status` がクリーン、`git log -1 --pretty=%s` が期待メッセージと一致、`git log -1 --stat` で変更ファイルが issues/pending/<filename>.md と issues/done/<filename>.md の 2 件のみ。
  6. lint / test / build は実行不要 (ドキュメント変更のみ、GOD OBJECT・カバレッジ・bundle size いずれにも影響なし)。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
