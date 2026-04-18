---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 956-928-639-626-subtask-issue-pending-done-git-m
depends: subtask-1
summary: git mv で pending→done 移動し単一コミット作成
---

## Description (subtask of 956-928-639-626-subtask-issue-pending-done-git-m)

1. `git mv issues/pending/<filename>.md issues/done/<filename>.md`
  2. `git status` で差分検証:
     - pending削除 / done追加 / status 1行変更のみ
     - 他ファイル差分があれば中止
  3. `git add -A && git commit -m "chore: done <filename>"` (拡張子なしベース名)
  4. 検証:
     - `git status` が clean
     - `git log -1 --pretty=%s` がコミットメッセージと一致
     - `ls issues/done/<filename>.md` で存在確認
  制約: lint / test / build 実行不要。issues/ 配下のみ変更。

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
