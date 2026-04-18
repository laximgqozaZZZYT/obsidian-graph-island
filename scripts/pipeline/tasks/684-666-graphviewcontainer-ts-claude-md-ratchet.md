---
priority: medium
reported: 2026-04-18
status: pending
source: decomposed
parent: 666-649-claude-md-ratchet-down-issue-done-git-mv
depends: none
summary: GraphViewContainer.ts行数測定→CLAUDE.md ratchet down→issue done遷移→git mv→1コミット
---

## Description (subtask of 666-649-claude-md-ratchet-down-issue-done-git-mv)

write-onlyタスク。src/配下・tests/配下は一切編集しない。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を取得。
  2. N < 8597 の場合のみ、CLAUDE.md の GOD OBJECT Policy 表の
     `src/views/GraphViewContainer.ts` 行の Max Allowed を `8597` → `N` に Edit。
     N >= 8597 なら CLAUDE.md は無変更でskip (ratchet down only)。
  3. `issues/pending/617-593-594-585-done-subtask-2.md` の frontmatter
     `status:` を `done` に Edit。
  4. `git mv issues/pending/617-593-594-585-done-subtask-2.md issues/done/617-593-594-585-done-subtask-2.md`。
  5. `git add -A && git commit -m "chore: done 593-585-subtask — verified 594-585 (lines: N/8597)"`
     (N は手順1の実数値に置換)。

  禁止事項:
  - GraphViewContainer.ts 本体の編集禁止
  - src/配下、tests/配下の編集禁止
  - Max Allowed の増加方向更新禁止
  - pnpm build / pnpm test 実行不要

  受け入れ基準:
  - [ ] N < 8597 なら CLAUDE.md 更新、N >= 8597 なら無変更
  - [ ] issueファイル frontmatter が status: done
  - [ ] git mv で pending → done 移動完了
  - [ ] 1コミット、メッセージに N/8597 形式で行数を含む
  - [ ] `git diff --name-only HEAD~1 HEAD` で src/ と tests/ に変更なし

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
