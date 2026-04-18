---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 649-630-claude-md-ratchet-down-issue-done-git-mv
depends: none
summary: CLAUDE.md ratchet down + issue done遷移 + git mv + 1コミット
---

## Description (subtask of 649-630-claude-md-ratchet-down-issue-done-git-mv)

write操作のみ。subtask-1 (594-585 verify) が緑で完了していることが前提。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得し、変数として保持する。
  2. N < 8597 の場合のみ、CLAUDE.md の GOD OBJECT Policy 表中の
     `src/views/GraphViewContainer.ts` 行の Max Allowed 列を `8597` → `N` に Edit する
     (ratchet down only、N >= 8597 なら CLAUDE.md は無変更で skip)。
  3. 本タスクファイル `scripts/pipeline/tasks/666-649-claude-md-ratchet-down-issue-done-git-mv.md` の
     frontmatter を `status: decomposed` または `status: in-progress` から `status: done` に Edit する
     (frontmatter 行のみ対象、本文中の説明文字列は置換しない)。
  4. `git mv scripts/pipeline/tasks/666-649-claude-md-ratchet-down-issue-done-git-mv.md scripts/pipeline/tasks/done/666-649-claude-md-ratchet-down-issue-done-git-mv.md`
     でファイル移動。
  5. 1コミットに集約:
     `git add -A && git commit -m "chore: done 666-649-subtask — ratchet GraphViewContainer.ts (lines: N/8597)"`
     (N は手順1で取得した実数値に置換)。

  禁止事項:
  - GraphViewContainer.ts 本体の編集禁止
  - src/配下、tests/配下の編集禁止
  - Max Allowed の増加方向更新禁止 (ratchet down only)
  - pnpm build / pnpm test 実行不要 (write-only task)

  受け入れ基準:
  - [ ] N < 8597 なら CLAUDE.md 更新、N >= 8597 なら CLAUDE.md 無変更
  - [ ] 対象issueファイル frontmatter が status: done
  - [ ] git mv で pending → done 移動完了
  - [ ] 1コミットに集約、メッセージに N/8597 形式で行数を含む
  - [ ] `git diff --name-only HEAD~1 HEAD` で src/ と tests/ 配下に変更なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
