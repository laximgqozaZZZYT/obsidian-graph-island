---
priority: medium
reported: 2026-04-19
status: decomposed
source: decomposed
parent: 749-727-subtask
depends: none
summary: GraphViewContainer.ts 行数測定してCLAUDE.md ratchetし、parent issueをdone化する単一コミット
---

## Description (subtask of 749-727-subtask)

単一セッション・単一コミットで完結させる。分解禁止。

  手順:
  1. `wc -l src/views/GraphViewContainer.ts` で現在の行数を測定
  2. CLAUDE.md の "GOD OBJECT Policy" テーブルで
     `src/views/GraphViewContainer.ts` の "Lines" 列と "Max Allowed" 列を
     測定値に更新 (ratchet down のみ、絶対に増やさない)
  3. 測定値が現在の "Max Allowed" (8597) より大きい場合は、
     ratchet 違反のため CLAUDE.md を変更せず、issue に違反を記録して中断
  4. 測定値が現在の "Max Allowed" 以下の場合のみ更新実施
  5. 親 issue `issues/in-progress/727-715-graphviewcontainer-ratchet-issue-done.md`
     の frontmatter `status: decomposed` → `status: done` に変更し、
     `git mv` で `issues/done/` に移動
  6. 上記すべてを1コミットで実施
     (例: `chore: ratchet GraphViewContainer max-allowed to <N> lines`)

  制約:
  - src/ および tests/ には一切触れない
  - コード変更なし、測定とルール更新とissue done化のみ
  - God Object の "Max Allowed" を上げる変更は禁止 (CLAUDE.md ポリシー違反)
  - 複数コミット禁止 (requirements違反)

## Acceptance criteria
- [ ] 実装が完了し、テストが通ること
- [ ] CLAUDE.md のルールに違反しないこと
