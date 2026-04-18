---
priority: medium
reported: 2026-04-19
status: pending
source: decomposed
parent: 874-749-graphviewcontainer-ts-claude-md-ratchet
depends: none
summary: GraphViewContainer.ts 行数測定→CLAUDE.md ratchet→parent issue done化を単一コミットで実施
---

## Description (subtask of 874-749-graphviewcontainer-ts-claude-md-ratchet)

単一セッション・単一コミットで完結（分解禁止）。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在行数 N を測定
  2. N > 8597 なら ratchet 違反として CLAUDE.md を変更せず中断し、issue に違反記録
  3. N <= 8597 なら CLAUDE.md の "GOD OBJECT Policy" テーブルの
     `src/views/GraphViewContainer.ts` 行の "Lines" と "Max Allowed" 両方を N に更新
  4. `issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md` の
     frontmatter `status: in-progress` → `status: done` に変更
  5. `git mv` で `issues/done/727-715-graphviewcontainer-ratchet-issue-done.md` に移動
  6. 単一コミット: `chore: ratchet GraphViewContainer max-allowed to <N> lines`

  制約:
  - src/ tests/ には一切触れない
  - Max Allowed を増やす変更は禁止
  - 複数コミット禁止

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
