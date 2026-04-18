---
priority: medium
reported: 2026-04-18
completed: 2026-04-19
status: done
source: decomposed
parent: 704-694-graphviewcontainer-claude-md-ratchet-dow
depends: none
summary: subtask
---

## Description (subtask of 704-694-graphviewcontainer-claude-md-ratchet-dow)

の検証が通った前提で実施。
  1. `wc -l src/views/GraphViewContainer.ts` で N を取得 (src/ は一切編集しない)
  2. CLAUDE.md の GOD OBJECT Policy 表 GraphViewContainer.ts 行を確認:
     - N < 8597: Edit で 2箇所(現在行数, Max Allowed)を N に更新 (ratchet down)
     - N >= 8597: CLAUDE.md は編集しない (増加方向は絶対禁止)
  3. `ls issues/pending/617-593-594-585-done-*.md` で対象ファイル特定
  4. Edit で frontmatter を更新: status: decomposed → done、completed: 2026-04-18 を追加
  5. `git mv issues/pending/<file>.md issues/done/<file>.md`
  6. 単一コミット:
     - ratchet あり: "chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)"
     - ratchet なし: "chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)"
  7. 検証: `git diff HEAD~1 -- src/ tests/` が空、`git log -1 --stat` の変更ファイルが CLAUDE.md と issues/ のみ

  禁止: src/views/GraphViewContainer.ts 本体編集、src/・tests/ 配下編集、pnpm test/lint/build 実行、Max Allowed 増加更新、複数コミット分割

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
