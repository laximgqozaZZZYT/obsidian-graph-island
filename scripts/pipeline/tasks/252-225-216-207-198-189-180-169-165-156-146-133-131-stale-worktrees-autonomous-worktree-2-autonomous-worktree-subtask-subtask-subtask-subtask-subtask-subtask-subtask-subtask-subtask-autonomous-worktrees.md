---
priority: low
reported: 2026-04-16
status: in-progress
source: decomposed
parent: 225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask
depends: subtask-3
summary: .autonomous-worktreesディレクトリ削除と最終確認
---

## Description (subtask of 225-216-207-198-189-180-169-165-156-146-133-131-stale-worktrees-autonomous-worktree-2-autonomous-worktree-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask-subtask)

1. `rm -rf .autonomous-worktrees/` で空ディレクトリを削除
  2. .gitignore に `.autonomous-worktrees/` が含まれていることを確認（なければ追加）
  3. 最終検証:
     - `git worktree list` → 本体1件のみ
     - `git branch -a | grep -E 'worktree|autonomous'` → 該当なし
     - `pnpm test` → 全テストパス
  4. コミット: "chore: clean up stale worktrees and orphaned branches"
```

---

`★ Insight ─────────────────────────────────────`
- 元issueの description が「You've hit your limit」となっているのは、自律パイプラインが API レート制限に当たってタスク内容を生成できなかった痕跡です。親issue #131 を遡ることで実際の作業内容を復元しました。
- `worktree-agent-a862fdb4` の GVC リファクタコミットは God Object 削減に関連するため、cherry-pick の価値が高いです。
`─────────────────────────────────────────────────`

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
