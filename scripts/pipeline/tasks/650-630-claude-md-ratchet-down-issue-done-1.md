---
priority: medium
reported: 2026-04-18
status: decomposed
source: decomposed
parent: 630-617-claude-md-max-allowed-ratchet-down-issue
depends: subtask-1 (親issueの594-585検証サブタスク)
summary: 行数を再確認しCLAUDE.md ratchet-down + issue done遷移を1コミット
---

## Description (subtask of 630-617-claude-md-max-allowed-ratchet-down-issue)

前提: 親issue 617-593-594-585-done の subtask-1 で `pnpm test` / `pnpm lint` / `pnpm format:check` がすべて緑、
  カバレッジが未低下であることが検証済みであること。未検証の場合は本タスクを実行せず失敗終了。

  手順:
  1. 現在行数を再取得(read-only):
     `wc -l src/views/GraphViewContainer.ts` を実行し N を取得。
  2. CLAUDE.md の GOD OBJECT Policy 表を読み取り、GraphViewContainer.ts の行を確認:
     - N < 8597 の場合のみ `| src/views/GraphViewContainer.ts | 8597 | 8597 | ...` の
       `現在行数` と `Max Allowed` を N に更新 (両方を N に揃える、ratchet down only)。
     - N >= 8597 の場合は CLAUDE.md を一切変更しない(増加方向更新は絶対禁止)。
  3. 本プレースホルダーissueファイル(issues/pending/ 配下の 617-593-594-585-done-*.md)の
     frontmatter `status:` を `done` に更新。`completed: 2026-04-18` 行を追加。
  4. `git mv issues/pending/<該当ファイル>.md issues/done/<該当ファイル>.md` で移動。
  5. 変更を1コミットに集約:
     - ratchet-down あり: `chore: done 593-585-subtask — ratchet GraphViewContainer 8597→N (verified 594-585)`
     - ratchet-down なし(同値): `chore: done 593-585-subtask — verified 594-585 (lines: 8597/8597, no ratchet)`

  禁止事項:
  - src/views/GraphViewContainer.ts 本体の編集
  - src/ 配下、tests/ 配下の一切の編集
  - pnpm test / pnpm lint の再実行 (subtask-1の結果を信頼)
  - Max Allowed を増加方向に更新すること
  - 複数コミットへの分割

  Acceptance:
  - [ ] CLAUDE.md の GOD OBJECT Policy 表が現行行数と整合(または同値で無変更)
  - [ ] issueファイルが issues/done/ 配下に移動済み
  - [ ] 変更が1コミットに集約されている
  - [ ] src/ と tests/ の diff が空であること(`git diff HEAD~1 -- src/ tests/` で確認)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
