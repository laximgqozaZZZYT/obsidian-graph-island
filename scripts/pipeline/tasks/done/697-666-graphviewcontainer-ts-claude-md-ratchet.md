---
priority: medium
reported: 2026-04-18
status: done
source: decomposed
parent: 666-649-claude-md-ratchet-down-issue-done-git-mv
depends: none
summary: GraphViewContainer.ts 行数測定 → CLAUDE.md ratchet + status:done + git mv + 1コミット
---

## Description (subtask of 666-649-claude-md-ratchet-down-issue-done-git-mv)

write-only タスク。全操作を1コミットに集約するため分割不可（分割すると「1コミット集約」要件に違反）。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で行数 N を取得（src/編集禁止、測定のみ）。
  2. N < 8597 の場合のみ CLAUDE.md の GOD OBJECT Policy 表
     `| src/views/GraphViewContainer.ts | 8597 | 8597 |` 行の
     Max Allowed 列（3列目）を 8597 → N に Edit。N >= 8597 なら skip。
     増加方向への更新は禁止（ratchet down only）。
  3. `scripts/pipeline/tasks/666-649-claude-md-ratchet-down-issue-done-git-mv.md` の
     frontmatter `status:` 行を `status: done` に Edit（本文中の説明文字列は置換しない、
     frontmatter の `---` で囲まれた最上部のみ対象）。
  4. `git mv scripts/pipeline/tasks/666-649-claude-md-ratchet-down-issue-done-git-mv.md scripts/pipeline/tasks/done/666-649-claude-md-ratchet-down-issue-done-git-mv.md`
  5. `git add -A && git commit -m "chore: done 666-649-subtask — ratchet GraphViewContainer.ts (lines: N/8597)"`
     （N は手順1の実測値に置換）。

  禁止:
  - src/ および tests/ 配下の編集（`git diff --name-only HEAD~1 HEAD` で確認）
  - GraphViewContainer.ts 本体の編集
  - Max Allowed の増加方向更新
  - pnpm build / pnpm test 実行（write-only）

  受け入れ基準:
  - [ ] N < 8597 なら CLAUDE.md 更新、N >= 8597 なら CLAUDE.md 無変更
  - [ ] タスクファイル frontmatter `status: done`
  - [ ] pending → done への git mv 完了
  - [ ] 1コミット、メッセージに `lines: N/8597` 形式を含む
  - [ ] src/ tests/ 配下に差分なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
