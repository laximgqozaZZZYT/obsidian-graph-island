---
priority: high
reported: 2026-04-18
status: in-progress
source: decomposed
parent: 809-785-717-691-status-done
depends: none
summary: git log --grep で 717-691 関連コミットの tasks/*.md 変更を特定
---

## Description (subtask of 809-785-717-691-status-done)

1. `git log --all --oneline --grep="717-691"` を実行して候補コミットを列挙
  2. 候補が空なら `git log --all --oneline --grep="691"` で再試行 (ヒットを tasks/ 絡みに絞る)
  3. 各候補コミットに `git show <hash> --stat` を実行し、`tasks/*.md` の変更ファイル一覧を抽出
  4. `git show <hash> -- tasks/<file>.md` で差分を確認し、`-status: ...` / `+status: done` の
     フィールド変更を含むファイルのみ選別
  5. 該当ファイルが 1 件以上見つかれば、最も新しいコミットのファイルを採用し、
     標準出力に以下を明示:
     ```
     TARGET_FILE: /home/ubuntu/obsidian-plugins/obsidian-graph-island/tasks/<filename>.md
     ```
     複数候補がある場合は全候補を併記 (TARGET_FILE は最新 1 件、残りは CANDIDATE: として併記)
  6. 候補が 1 件も見つからなければ標準出力に `NO_COMMIT_MATCH` を出し、

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
