
## Description (subtask of 834-823-head-50)

1. `git status --short > /tmp/git-status-before.txt` を実行しベースライン保存
  2. `head -50 /tmp/git-status-short.txt` を実行し、stdout を `/tmp/git-status-head50.log` に追記保存
  3. 実行結果 (先頭数行/行数) を標準出力にエコーして証跡化
  4. この時点ではコミット不要 (作業ツリー変更なし想定)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
