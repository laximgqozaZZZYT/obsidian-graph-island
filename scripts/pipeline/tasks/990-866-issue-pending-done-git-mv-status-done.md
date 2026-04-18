---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 866-752-subtask
depends: none
summary: 親issueを pending→done へ git mv + status:done 化 + コミット
---

## Description (subtask of 866-752-subtask)

1. `git mv .claude/issues/pending/752-712-639-626-subtask-issue-status-done-git-mv.md .claude/issues/done/752-712-639-626-subtask-issue-status-done-git-mv.md` でファイルを移動
  2. 移動先ファイルの frontmatter `status: in-progress` を `status: done` に書き換え (Edit ツール使用、1行のみ)
  3. `git status` で pending 削除 + done 追加 + frontmatter 変更が1コミットに収まることを確認
  4. `git add` + `git commit -m "chore: done 752-712-639-626-subtask-issue-status-done-git-mv.md"` で1コミット
  5. CLAUDE.md ルール遵守: コード変更なし、テスト追加不要、God Object 非対象
  注意事項:
  - 他の issue ファイルは触らない
  - frontmatter の他フィールド (priority/reported/parent/depends/summary) は変更しない
  - コミットメッセージ末尾に Co-Authored-By 行を追加

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
